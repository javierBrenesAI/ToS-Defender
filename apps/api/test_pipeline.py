import asyncio
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from apps.api.pipeline import DraftFastAnalysis, DraftFinding, DraftPassageAnalysis, PolicyPipeline
from apps.api.schemas import Analysis, Citation, Finding, Passage


def test_citation_must_belong_to_selected_passage():
    pipeline = PolicyPipeline.__new__(PolicyPipeline)
    passages = [Passage(id="P001", text="The company may change prices.", start=0, end=31)]
    assert pipeline._verified_citation("P001", "The company may change prices.", "The company may change prices.", passages) is not None
    assert pipeline._verified_citation("P001", "The company may change prices.", "Different source text.", passages) is None
    assert pipeline._verified_citation("P002", "The company may change prices.", "The company may change prices.", passages) is None


def test_untrusted_excerpt_cannot_be_mapped():
    pipeline = PolicyPipeline.__new__(PolicyPipeline)
    passages = [Passage(id="P001", text="Prices may change before renewal.", start=0, end=33)]
    assert pipeline._verified_citation("P001", "The company can change anything.", "Prices may change before renewal.", passages) is None


def test_retrieval_prefers_relevant_passage_and_returns_no_matches():
    pipeline = PolicyPipeline.__new__(PolicyPipeline)
    passages = [
        Passage(id="P001", text="Your subscription renews automatically every month.", start=0, end=50),
        Passage(id="P002", text="We use cookies to improve the website.", start=51, end=90),
    ]
    assert pipeline.retrieve(passages, "subscription renews") == [passages[0]]
    assert pipeline.retrieve(passages, "arbitration") == []


def test_question_citation_must_be_from_retrieved_passages():
    class AnswerChain:
        async def ainvoke(self, inputs):
            from apps.api.pipeline import DraftAnswer, DraftAnswerCitation
            return DraftAnswer(answerable=True, answer="The service shares data.", citations=[DraftAnswerCitation(passageId="P002", excerpt="We share data with partners.")], uncertainty="")

    pipeline = PolicyPipeline.__new__(PolicyPipeline)
    pipeline.answer_chain = AnswerChain()
    passages = [
        Passage(id="P001", text="This policy has terms for use.", start=0, end=32),
        Passage(id="P002", text="We share data with partners.", start=33, end=61),
    ]
    response = asyncio.run(pipeline.answer("This policy has terms for use. We share data with partners.", "terms conditions", passages))
    assert response.citations == []
    assert "does not provide" in response.answer


def test_full_review_retries_empty_first_pass_with_high_recall_across_batches():
    class AnalysisChain:
        def __init__(self, produce_findings):
            self.produce_findings = produce_findings
            self.contexts = []

        async def ainvoke(self, inputs):
            self.contexts.append(inputs["context"])
            if self.produce_findings and "P001" in inputs["context"]:
                return DraftPassageAnalysis(findings=[DraftFinding(category="usage_restrictions", explanation="Use is restricted.", implication="You cannot use outputs commercially.", citation={"passageId": "P001", "excerpt": "Outputs may not be used for commercial purposes"}, uncertainty="")])
            return DraftPassageAnalysis(findings=[])

    async def run():
        pipeline = PolicyPipeline.__new__(PolicyPipeline)
        pipeline.MAP_BATCH_SIZE = 12
        passages = [Passage(id=f"P{index + 1:03}", text=f"Clause number {index + 1}.", start=index * 20, end=index * 20 + 15) for index in range(25)]
        passages[0] = Passage(id="P001", text="Outputs may not be used for commercial purposes.", start=0, end=47)
        pipeline.analysis_chain = AnalysisChain(False)
        pipeline.recall_analysis_chain = AnalysisChain(True)
        pipeline.type_safe = object()
        async def classify(text):
            return "terms_of_service", 0.99
        async def verify(findings, passages_by_id):
            return {index: True for index in range(len(findings))}
        pipeline.classify_policy = classify
        pipeline.verify_claims = verify
        metrics = {}
        result = await pipeline.analyze("\n".join(passage.text for passage in passages), passages, metrics)
        assert len(result.findings) == 1
        assert result.findings[0].category == "usage_restrictions"
        assert result.findings[0].citation.status == "verified"
        assert len(pipeline.analysis_chain.contexts) == 3
        assert len(pipeline.recall_analysis_chain.contexts) == 3
        assert metrics["recall_pass_used"] is True
        assert metrics["recall_draft_findings"] == 1
        assert metrics["map_batch_count"] == 3
        assert len(metrics["map_batch_ms"]) == 3

    asyncio.run(run())


def test_full_review_skips_high_recall_retry_when_first_pass_finds_terms():
    class AnalysisChain:
        async def ainvoke(self, inputs):
            return DraftPassageAnalysis(findings=[DraftFinding(category="other", explanation="Prices may change.", implication="You may pay more.", citation={"passageId": "P001", "excerpt": "Prices may change at any time"}, uncertainty="")])

    class RecallChain:
        def __init__(self):
            self.called = False

        async def ainvoke(self, inputs):
            self.called = True
            return DraftPassageAnalysis(findings=[])

    async def run():
        pipeline = PolicyPipeline.__new__(PolicyPipeline)
        pipeline.analysis_chain = AnalysisChain()
        pipeline.recall_analysis_chain = RecallChain()
        passage = Passage(id="P001", text="Prices may change at any time.", start=0, end=30)
        result = await pipeline._map_passages([passage])
        assert len(result) == 1
        assert not pipeline.recall_analysis_chain.called

    asyncio.run(run())


def test_claim_checks_are_bundled_into_one_typesafe_request():
    class TypeSafe:
        def __init__(self):
            self.calls = []

        async def ainvoke(self, request):
            self.calls.append(request)
            return SimpleNamespace(choices={key: SimpleNamespace(choice="supports", confidence=0.95) for key in request["questions"]})

    async def run():
        pipeline = PolicyPipeline.__new__(PolicyPipeline)
        pipeline.type_safe = TypeSafe()
        passage = Passage(id="P001", text="Prices may increase at renewal.", start=0, end=31)
        findings = [
            DraftFinding(category="fees_or_price_changes", explanation="The price can rise.", implication="You may pay more.", citation={"passageId": "P001", "excerpt": "Prices may increase"}, uncertainty=""),
            DraftFinding(category="renewal_or_cancellation", explanation="The change applies at renewal.", implication="Review your plan before then.", citation={"passageId": "P001", "excerpt": "at renewal"}, uncertainty=""),
        ]
        results = await pipeline.verify_claims(findings, {passage.id: passage})
        assert results == {0: True, 1: True}
        assert len(pipeline.type_safe.calls) == 1
        assert list(pipeline.type_safe.calls[0]["questions"]) == ["claim_0", "claim_1"]

    asyncio.run(run())


def test_finding_impacts_drive_document_rating_and_survive_rating_failure():
    def finding(text):
        return Finding(category="other", explanation=text, implication="It affects you.", citation=Citation(passageId="P001", excerpt=f"{text} in full"), uncertainty="")

    class TypeSafe:
        def __init__(self, scores):
            self.scores = scores

        async def ainvoke(self, request):
            if self.scores is None:
                raise RuntimeError("rating unavailable")
            return SimpleNamespace(scores={key: SimpleNamespace(score=score) for key, score in zip(request["questions"], self.scores)})

    def analysis(findings):
        return Analysis(title="Policy review", policyType="terms_of_service", overview="", findings=findings, limitations=[])

    async def run():
        pipeline = PolicyPipeline.__new__(PolicyPipeline)
        findings = [finding("Disputes go to arbitration"), finding("Ads use your activity"), finding("You can delete your data")]
        pipeline.type_safe = TypeSafe([2.9, 1.9, 0.1])
        rated = await pipeline.rate_findings(findings, "terms_of_service")
        assert [item.impact for item in rated] == ["important", "caution", "favorable"]
        assert analysis(rated).rating == "warning"
        assert analysis(rated[1:]).rating == "caution"
        assert analysis(rated[2:]).rating == "clear"
        pipeline.type_safe = TypeSafe(None)
        unrated = await pipeline.rate_findings(findings)
        assert [item.explanation for item in unrated] == [item.explanation for item in findings]
        assert analysis(unrated).rating == "unrated"

    asyncio.run(run())


def test_finding_text_fields_enforce_concise_limits():
    with pytest.raises(ValidationError):
        DraftFinding(category="other", explanation="x" * 221, implication="Short", citation={"passageId": "P001", "excerpt": "quote"}, uncertainty="")
    finding = DraftFinding(category="other", explanation="x" * 159, implication="Short", citation={"passageId": "P001", "excerpt": "quote"}, uncertainty="")
    assert not finding.is_concise()
    concise = DraftFinding(category="other", explanation="Prices may rise.", implication="Check notices.", citation={"passageId": "P001", "excerpt": "The company may change prices at renewal."}, uncertainty="")
    assert concise.is_concise()
    verbose_relative_to_source = DraftFinding(category="other", explanation="Prices can rise, which may mean you pay more at renewal.", implication="Check notices.", citation={"passageId": "P001", "excerpt": "Prices may change."}, uncertainty="")
    assert not verbose_relative_to_source.is_concise()


def test_map_stage_records_batch_durations_when_provider_fails():
    class AnalysisChain:
        async def ainvoke(self, inputs):
            raise RuntimeError("provider unavailable")

    async def run():
        pipeline = PolicyPipeline.__new__(PolicyPipeline)
        pipeline.analysis_chain = AnalysisChain()
        metrics = {}
        passages = [Passage(id="P001", text="Prices may change.", start=0, end=19)]
        with pytest.raises(RuntimeError):
            await pipeline._map_passages(passages, metrics)
        assert metrics["map_batch_count"] == 1
        assert len(metrics["map_batch_ms"]) == 1
        assert metrics["map_batch_ms"][0] >= 0
        assert metrics["map_max_in_flight"] == 1

    asyncio.run(run())


def test_analysis_records_provider_stage_timings():
    class AnalysisChain:
        async def ainvoke(self, inputs):
            return DraftPassageAnalysis(findings=[])

    class TypeSafe:
        async def ainvoke(self, request):
            return SimpleNamespace(choices={})

    async def run():
        pipeline = PolicyPipeline.__new__(PolicyPipeline)
        pipeline.analysis_chain = AnalysisChain()
        pipeline.type_safe = TypeSafe()
        async def classify(text):
            return "terms_of_service", 0.99
        pipeline.classify_policy = classify
        async def verify(findings, passages_by_id):
            return {}
        pipeline.verify_claims = verify
        passage = Passage(id="P001", text="Prices may change.", start=0, end=19)
        metrics = {}
        await pipeline.analyze(passage.text, [passage], metrics)
        assert metrics["classification_ms"] >= 0
        assert metrics["mapping_ms"] >= 0
        assert metrics["map_batch_ms"][0] >= 0
        assert metrics["citation_validation_ms"] >= 0
        assert metrics["claim_verification_ms"] >= 0
        assert metrics["draft_findings"] == 0
        assert metrics["verified_findings"] == 0

    asyncio.run(run())


def test_analysis_rejects_unsupported_metrics_argument():
    pipeline = PolicyPipeline.__new__(PolicyPipeline)
    with pytest.raises(TypeError):
        asyncio.run(pipeline.analyze("text", [], unexpected=True))


def test_fast_scan_passes_requested_output_language_to_prompt():
    seen_inputs = {}

    class FastChain:
        async def ainvoke(self, inputs):
            seen_inputs.update(inputs)
            return PolicyPipeline._parse_fast_analysis('{"findings": []}')

    async def run():
        pipeline = PolicyPipeline.__new__(PolicyPipeline)
        pipeline.fast_analysis_chain = FastChain()
        pipeline.fast_model_name = "deepseek/deepseek-v4.1-flash"
        text = "Prices may increase at renewal."
        passage = Passage(id="P001", text=text, start=0, end=len(text))
        await pipeline.analyze_fast(text, [passage], None, language="es")

    asyncio.run(run())
    assert seen_inputs["output_language"] == "Spanish"


def test_fast_scan_parses_provider_json_and_keeps_only_source_grounded_findings():
    payload = {
        "findings": [
            {"category": "fees_or_price_changes", "explanation": "Prices may increase.", "implication": "You may pay more.", "citation": {"passageId": "P001", "excerpt": "Prices may increase at renewal."}, "uncertainty": ""},
            {"category": "other", "explanation": "Accounts may be terminated.", "implication": "You could lose access.", "citation": {"passageId": "P001", "excerpt": "The provider may terminate access whenever it chooses."}, "uncertainty": ""},
            {"category": "usage_restrictions", "explanation": "Commercial use is prohibited.", "implication": "You cannot use it commercially.", "citation": {"passageId": "P001", "excerpt": "cannot be used for commercial purposes."}, "uncertainty": ""},
        ]
    }

    class FastChain:
        async def ainvoke(self, inputs):
            return PolicyPipeline._parse_fast_analysis(json.dumps(payload))

    async def run():
        pipeline = PolicyPipeline.__new__(PolicyPipeline)
        pipeline.fast_analysis_chain = FastChain()
        pipeline.fast_model_name = "deepseek/deepseek-v4.1-flash"
        text = "Prices may increase at renewal. The service cannot be used for commercial purposes."
        passage = Passage(id="P001", text=text, start=0, end=len(text))
        metrics = {}
        result = await pipeline.analyze_fast(text, [passage], metrics)
        assert len(result.findings) == 2
        assert result.findings[0].citation.status == "verified"
        assert result.findings[1].category == "usage_restrictions"
        assert metrics["fast_model"] == "deepseek/deepseek-v4.1-flash"
        assert metrics["fast_valid_findings"] == 2

    asyncio.run(run())
    for invalid in ["", "not json", "[]", '{"other":[]}']:
        with pytest.raises(ValueError):
            PolicyPipeline._parse_fast_analysis(invalid)
