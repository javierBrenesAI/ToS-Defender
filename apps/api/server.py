import asyncio
import json
import logging
import os
import time
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .pipeline import pipeline
from .schemas import Analysis, AnalyzeRequest, AskRequest, AskResponse, Finding, StagedAnalyzeRequest
from .extension_schemas import AnchorClassificationRequest, LegalAnchorClassificationResponse, PolicyTypeClassificationRequest, PolicyTypeClassificationResponse
from .text import segment_text

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="ToS Decipher API")
web_origin = os.getenv("WEB_ORIGIN", "http://localhost:5173")
app.add_middleware(CORSMiddleware, allow_origins=[web_origin], allow_origin_regex=r"chrome-extension://.*", allow_methods=["GET", "POST"], allow_headers=["content-type"])


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/extension/classify-anchors", response_model=LegalAnchorClassificationResponse)
async def classify_extension_anchors(request: AnchorClassificationRequest) -> LegalAnchorClassificationResponse:
    request_id = uuid.uuid4().hex[:12]
    correlation_id = request.correlation_id or request_id
    started = time.perf_counter()
    logging.info("extension_anchor_classification_started %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "candidate_count": len(request.anchors)}))
    try:
        classifications = await pipeline.classify_anchors(request.anchors)
        results = LegalAnchorClassificationResponse(classifications=classifications)
        logging.info("extension_anchor_classification_completed %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "candidate_count": len(request.anchors), "likely_policy_count": sum(item.likelyPolicy for item in results.classifications), "not_policy_count": sum(not item.likelyPolicy for item in results.classifications), "duration_ms": round((time.perf_counter() - started) * 1000, 2)}))
        return results
    except Exception as error:
        logging.exception("extension_anchor_classification_failed request_id=%s correlation_id=%s candidate_count=%s", request_id, correlation_id, len(request.anchors))
        raise HTTPException(status_code=502, detail="Anchor classification failed.") from error


@app.post("/api/extension/classify-policy-types", response_model=PolicyTypeClassificationResponse)
async def classify_extension_policy_types(request: PolicyTypeClassificationRequest) -> PolicyTypeClassificationResponse:
    request_id = uuid.uuid4().hex[:12]
    correlation_id = request.correlation_id or request_id
    started = time.perf_counter()
    logging.info("extension_policy_type_classification_started %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "candidate_count": len(request.anchors)}))
    try:
        classifications = await pipeline.classify_policy_types(request.anchors)
        results = PolicyTypeClassificationResponse(classifications=classifications)
        logging.info("extension_policy_type_classification_completed %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "candidate_count": len(request.anchors), "duration_ms": round((time.perf_counter() - started) * 1000, 2)}))
        return results
    except Exception as error:
        logging.exception("extension_policy_type_classification_failed request_id=%s correlation_id=%s candidate_count=%s", request_id, correlation_id, len(request.anchors))
        raise HTTPException(status_code=502, detail="Policy type classification failed.") from error


@app.post("/api/analyze", response_model=Analysis)
async def analyze(request: AnalyzeRequest) -> Analysis:
    request_id = uuid.uuid4().hex[:12]
    started = time.perf_counter()
    metrics: dict = {}
    status = "success"
    passages = segment_text(request.text)
    metrics["segmentation_ms"] = round((time.perf_counter() - started) * 1000, 2)
    metrics["passage_count"] = len(passages)
    try:
        return await pipeline.analyze(request.text, passages, metrics=metrics, language=request.language)
    except Exception as error:
        status = "error"
        logging.exception("Policy analysis failed request_id=%s", request_id)
        raise HTTPException(status_code=502, detail="The policy could not be analyzed. Check provider configuration and try again.") from error
    finally:
        metrics["total_ms"] = round((time.perf_counter() - started) * 1000, 2)
        metrics["status"] = status
        logging.info("policy_analysis_timing %s", json.dumps({"request_id": request_id, **metrics}, sort_keys=True))


STAGED_ERROR_MESSAGES = {
    "en": {
        "partial": "The full policy review failed. Initial findings are still shown.",
        "initial": "The initial AI scan failed. Check provider settings and try again.",
    },
    "es": {
        "partial": "La revisión completa de la política falló. Los hallazgos iniciales siguen visibles.",
        "initial": "El análisis inicial con IA falló. Revisa la configuración del proveedor e inténtalo de nuevo.",
    },
}


@app.post("/api/analyze/staged")
async def analyze_staged(request: StagedAnalyzeRequest) -> StreamingResponse:
    request_id = uuid.uuid4().hex[:12]
    correlation_id = request.correlation_id or request_id
    text = request.text
    passages = segment_text(text)
    messages = STAGED_ERROR_MESSAGES.get(request.language, STAGED_ERROR_MESSAGES["en"])

    async def events():
        metrics: dict = {"passage_count": len(passages), "status": "started"}
        logging.info("policy_staged_started %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "passage_count": len(passages), "text_chars": len(text)}))
        started = time.perf_counter()
        full_review_task = None
        initial_sent = False
        try:
            fast_started = time.perf_counter()
            logging.info("policy_staged_stage_started %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "stage": "fast_scan", "passage_count": len(passages)}))
            initial = await pipeline.analyze_fast(text, passages, metrics=metrics, language=request.language)
            metrics["time_to_initial_ms"] = round((time.perf_counter() - started) * 1000, 2)
            logging.info("policy_staged_stage_completed %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "stage": "fast_scan", "duration_ms": metrics["time_to_initial_ms"], "finding_count": len(initial.findings)}))
            yield f"event: initial\ndata: {initial.model_dump_json()}\n\n"
            initial_sent = True
            metrics["fast_stage_ms"] = round((time.perf_counter() - fast_started) * 1000, 2)
            if not request.background:
                metrics["status"] = "initial_only"
                yield "event: done\ndata: {\"stage\":\"initial_only\"}\n\n"
                return
            full_metrics: dict = {}
            full_review_task = asyncio.create_task(pipeline.analyze(text, passages, metrics=full_metrics, language=request.language))
            full_started = time.perf_counter()
            logging.info("policy_staged_stage_started %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "stage": "full_review", "passage_count": len(passages)}))
            full_result = await full_review_task
            metrics["full_review_ms"] = round((time.perf_counter() - full_started) * 1000, 2)
            metrics["full_pipeline"] = full_metrics
            logging.info("policy_staged_stage_completed %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, "stage": "full_review", "duration_ms": metrics["full_review_ms"], "finding_count": len(full_result.findings), "verified_findings": full_metrics.get("verified_findings")}))
            merged = _merge_staged_analysis(initial, full_result)
            metrics["status"] = "success"
            yield f"event: full\ndata: {merged.model_dump_json()}\n\n"
            yield "event: done\ndata: {\"stage\":\"complete\"}\n\n"
        except asyncio.CancelledError:
            metrics["status"] = "cancelled"
            if full_review_task is not None:
                full_review_task.cancel()
                await asyncio.gather(full_review_task, return_exceptions=True)
            raise
        except Exception as error:
            metrics["status"] = "error"
            logging.exception("Staged policy analysis failed request_id=%s correlation_id=%s", request_id, correlation_id)
            message = messages["partial"] if initial_sent else messages["initial"]
            yield f"event: error\ndata: {json.dumps({'message': message})}\n\n"
        finally:
            metrics["total_ms"] = round((time.perf_counter() - started) * 1000, 2)
            logging.info("policy_staged_timing %s", json.dumps({"request_id": request_id, "correlation_id": correlation_id, **metrics}, sort_keys=True))

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _merge_staged_analysis(initial: Analysis, full: Analysis) -> Analysis:
    verified: dict[tuple[str, str], Finding] = {}
    for finding in full.findings:
        verified.setdefault((finding.category, finding.citation.excerpt.casefold()), finding)
    return Analysis(
        title=full.title,
        policyType=full.policyType if full.policyType != "unknown" else initial.policyType,
        overview=full.overview,
        findings=list(verified.values()),
        limitations=full.limitations,
        passages=full.passages,
    )


@app.post("/api/ask", response_model=AskResponse)
async def ask(request: AskRequest) -> AskResponse:
    passages = segment_text(request.text)
    try:
        return await pipeline.answer(request.text, request.question, passages, language=request.language)
    except Exception as error:
        logging.exception("Policy question failed")
        raise HTTPException(status_code=502, detail="The question could not be answered.") from error
