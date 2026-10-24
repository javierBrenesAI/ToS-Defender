import json
import logging

from fastapi.testclient import TestClient

import apps.api.server as server_module
from apps.api.schemas import Analysis, Citation, Finding, Passage
from apps.api.server import app


def test_health_check():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_analysis_rejects_short_policy_without_model_call():
    response = TestClient(app).post("/api/analyze", json={"text": "too short"})
    assert response.status_code == 422


def test_analysis_rejects_oversized_policy_without_model_call():
    response = TestClient(app).post("/api/analyze", json={"text": "x" * 200001})
    assert response.status_code == 422


def test_analysis_logs_stage_timings_without_policy_contents(monkeypatch, caplog):
    async def fake_analyze(text, passages, metrics, language="en"):
        metrics.update({"classification_ms": 12.5, "mapping_ms": 37.2, "map_batch_count": 1, "map_batch_ms": [37.0], "map_max_in_flight": 1, "citation_validation_ms": 0.1, "claim_verification_ms": 0.3, "draft_findings": 2, "validated_findings": 2, "verified_findings": 1})
        return Analysis(title="Policy review", policyType="terms_of_service", overview="Reviewed policy.", findings=[], limitations=[], passages=passages)

    monkeypatch.setattr(server_module.pipeline, "analyze", fake_analyze)
    policy_text = "Sensitive policy text that must never appear in measurement logs. " * 2
    with caplog.at_level(logging.INFO):
        response = TestClient(app).post("/api/analyze", json={"text": policy_text})

    assert response.status_code == 200
    entry = next(record.getMessage() for record in caplog.records if "policy_analysis_timing" in record.getMessage())
    payload = json.loads(entry.split(" ", 1)[1])
    assert payload["status"] == "success"
    assert payload["classification_ms"] == 12.5
    assert payload["mapping_ms"] == 37.2
    assert payload["map_batch_ms"] == [37.0]
    assert payload["total_ms"] >= payload["segmentation_ms"]
    assert "request_id" in payload
    assert policy_text not in entry


def test_staged_analysis_streams_initial_then_full_and_logs_stages(monkeypatch, caplog):
    text = "The policy may change prices at renewal. This clause takes effect when the next subscription period begins."
    passage = Passage(id="P001", text=text, start=0, end=len(text))
    initial_finding = Finding(category="fees_or_price_changes", explanation="Prices may rise.", implication="You could pay more.", uncertainty="", citation=Citation(passageId="P001", excerpt=text))
    full_finding = Finding(category="fees_or_price_changes", explanation="Renewal prices may increase.", implication="Review prices before renewal.", uncertainty="", citation=Citation(passageId="P001", excerpt=text))

    async def fake_fast(policy_text, passages, metrics, language="en"):
        metrics["fast_model"] = "deepseek/deepseek-v4.1-flash"
        return Analysis(title="Initial policy scan", policyType="unknown", overview="Initial scan.", findings=[initial_finding], limitations=["Initial scan only."], passages=passages)

    async def fake_full(policy_text, passages, metrics, language="en"):
        metrics["mapping_ms"] = 25.0
        return Analysis(title="Policy review", policyType="terms_of_service", overview="Full review.", findings=[full_finding], limitations=[], passages=passages)

    monkeypatch.setattr(server_module.pipeline, "analyze_fast", fake_fast)
    monkeypatch.setattr(server_module.pipeline, "analyze", fake_full)
    with caplog.at_level(logging.INFO):
        response = TestClient(app).post("/api/analyze/staged", json={"text": text, "background": True, "correlation_id": "tab7-run42"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = [line for line in response.text.splitlines() if line.startswith("event:")]
    assert events == ["event: initial", "event: full", "event: done"]
    full_payload = next(json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data:") and '"policyType":"terms_of_service"' in line)
    assert full_payload["policyType"] == "terms_of_service"
    assert len(full_payload["findings"]) == 1
    assert full_payload["findings"][0]["explanation"] == full_finding.explanation
    log_line = next(record.getMessage() for record in caplog.records if "policy_staged_timing" in record.getMessage())
    assert '"status": "success"' in log_line
    assert '"correlation_id": "tab7-run42"' in log_line
    assert '"correlation_id": "tab7-run42"' in caplog.text
    assert '"fast_model": "deepseek/deepseek-v4.1-flash"' in log_line
    assert '"mapping_ms": 25.0' in log_line


def test_staged_endpoint_handles_background_failure_and_initial_only_mode(monkeypatch):
    text = "The policy may change prices at renewal. This clause takes effect when the next subscription period begins."
    initial_finding = Finding(category="fees_or_price_changes", explanation="Prices may rise.", implication="You could pay more.", uncertainty="", citation=Citation(passageId="P001", excerpt="The policy may change prices at renewal."))
    initial = Analysis(title="Initial policy scan", policyType="unknown", overview="Initial scan.", findings=[initial_finding], limitations=["Initial scan only."], passages=[])
    calls = {"fast": 0, "full": 0}

    async def fake_fast(policy_text, passages, metrics, language="en"):
        calls["fast"] += 1
        return initial.model_copy(update={"passages": passages})

    async def failing_full(policy_text, passages, metrics, language="en"):
        calls["full"] += 1
        raise RuntimeError("provider failed")

    monkeypatch.setattr(server_module.pipeline, "analyze_fast", fake_fast)
    monkeypatch.setattr(server_module.pipeline, "analyze", failing_full)
    failed = TestClient(app).post("/api/analyze/staged", json={"text": text, "background": True})
    assert failed.status_code == 200
    assert [line for line in failed.text.splitlines() if line.startswith("event:")] == ["event: initial", "event: error"]
    failed_events = [line[6:] for line in failed.text.splitlines() if line.startswith("data:")]
    assert json.loads(failed_events[0])["findings"][0]["explanation"] == initial_finding.explanation
    assert "Initial findings are still shown" in failed.text

    initial_only = TestClient(app).post("/api/analyze/staged", json={"text": text, "background": False})
    assert initial_only.status_code == 200
    assert [line for line in initial_only.text.splitlines() if line.startswith("event:")] == ["event: initial", "event: done"]
    initial_events = [line[6:] for line in initial_only.text.splitlines() if line.startswith("data:")]
    assert json.loads(initial_events[0])["findings"][0]["explanation"] == initial_finding.explanation
    assert calls == {"fast": 2, "full": 1}


def test_staged_analysis_forwards_language_and_localizes_partial_failure(monkeypatch):
    text = "The policy may change prices at renewal. This clause takes effect when the next subscription period begins."
    seen_languages = {}
    initial = Analysis(title="Initial policy scan", policyType="unknown", overview="Initial scan.", findings=[], limitations=[], passages=[])

    async def fake_fast(policy_text, passages, metrics, language="en"):
        seen_languages["fast"] = language
        return initial

    async def failing_full(policy_text, passages, metrics, language="en"):
        seen_languages["full"] = language
        raise RuntimeError("provider failed")

    monkeypatch.setattr(server_module.pipeline, "analyze_fast", fake_fast)
    monkeypatch.setattr(server_module.pipeline, "analyze", failing_full)
    response = TestClient(app).post("/api/analyze/staged", json={"text": text, "background": True, "language": "es"})

    assert response.status_code == 200
    assert seen_languages == {"fast": "es", "full": "es"}
    error_payload = json.loads(response.text.split("event: error\ndata: ", 1)[1].split("\n", 1)[0])
    assert error_payload["message"] == "La revisión completa de la política falló. Los hallazgos iniciales siguen visibles."


def test_analysis_rejects_unsupported_language_without_model_call():
    text = "The policy may change prices at renewal. This clause takes effect when the next subscription period begins."
    response = TestClient(app).post("/api/analyze/staged", json={"text": text, "language": "fr"})

    assert response.status_code == 422


def test_analysis_timing_log_is_emitted_on_failure(monkeypatch, caplog):
    async def failing_analyze(text, passages, metrics, language="en"):
        metrics["mapping_ms"] = 25.0
        raise RuntimeError("upstream failure")

    monkeypatch.setattr(server_module.pipeline, "analyze", failing_analyze)
    with caplog.at_level(logging.INFO):
        response = TestClient(app).post("/api/analyze", json={"text": "A sufficiently long policy document for a server timing failure test. " * 2})

    assert response.status_code == 502
    entry = next(record.getMessage() for record in caplog.records if "policy_analysis_timing" in record.getMessage())
    payload = json.loads(entry.split(" ", 1)[1])
    assert payload["status"] == "error"
    assert payload["mapping_ms"] == 25.0
    assert payload["total_ms"] >= payload["segmentation_ms"]
