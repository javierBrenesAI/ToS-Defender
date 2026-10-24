import logging

import pytest
from fastapi.testclient import TestClient
from apps.api.server import app
from apps.api.extension_schemas import AnchorClassificationRequest, PolicyTypeClassificationRequest

def test_extension_anchor_contract_limits_batch():
    with pytest.raises(ValueError):
        AnchorClassificationRequest(anchors=[])

def test_extension_anchor_endpoint_returns_classifications(monkeypatch, caplog):
    async def fake_classify(anchors):
        return [
            {
                "id": anchor.id,
                "likelyPolicy": anchor.id == "current-page",
                "policyType": "other",
                "confidence": 0.9 if anchor.id == "current-page" else 0.1,
            }
            for anchor in anchors
        ]
    from apps.api import server
    monkeypatch.setattr(server.pipeline, "classify_anchors", fake_classify)
    with caplog.at_level(logging.INFO):
        response = TestClient(app).post("/api/extension/classify-anchors", json={"correlation_id": "tab7-classify42", "anchors": [
            {"id": "current-page", "label": "Privacy Policy", "url": "https://example.test/privacy"},
            {"id": "a-1", "label": "Home", "url": "https://example.test/"},
        ]})
    assert response.status_code == 200
    assert "extension_anchor_classification_started" in caplog.text
    completed = next(record.getMessage() for record in caplog.records if "extension_anchor_classification_completed" in record.getMessage())
    assert '"candidate_count": 2' in completed
    assert '"correlation_id": "tab7-classify42"' in completed
    assert '"likely_policy_count": 1' in completed
    assert [item["id"] for item in response.json()["classifications"]] == ["current-page", "a-1"]
    assert [item["likelyPolicy"] for item in response.json()["classifications"]] == [True, False]
    assert "policyType" not in response.json()["classifications"][0]


def test_extension_policy_type_endpoint_classifies_only_submitted_legal_links(monkeypatch, caplog):
    async def fake_classify_types(anchors):
        return [{"id": anchor.id, "policyType": "privacy_policy"} for anchor in anchors]

    from apps.api import server
    monkeypatch.setattr(server.pipeline, "classify_policy_types", fake_classify_types)
    with caplog.at_level(logging.INFO):
        response = TestClient(app).post("/api/extension/classify-policy-types", json={"correlation_id": "tab7-types42", "anchors": [
            {"id": "a-1", "label": "Privacy Policy", "url": "https://example.test/privacy"},
        ]})
    assert response.status_code == 200
    completed = next(record.getMessage() for record in caplog.records if "extension_policy_type_classification_completed" in record.getMessage())
    assert '"candidate_count": 1' in completed
    assert '"correlation_id": "tab7-types42"' in completed
    assert response.json()["classifications"] == [{"id": "a-1", "policyType": "privacy_policy"}]


def test_policy_type_contract_limits_batch():
    anchors = [{"id": f"a-{index}", "label": "Policy", "url": f"https://example.test/policy/{index}"} for index in range(101)]
    with pytest.raises(ValueError):
        PolicyTypeClassificationRequest(anchors=anchors)
