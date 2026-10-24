import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from langsmith import aevaluate
from langsmith.schemas import Example

from .pipeline import pipeline
from .text import segment_text

load_dotenv()


async def target(inputs: dict) -> dict:
    text = inputs["text"]
    analysis = await pipeline.analyze(text, segment_text(text))
    return analysis.model_dump()


def finding_recall(inputs: dict, outputs: dict, reference_outputs: dict) -> dict:
    expected = set(reference_outputs["expected_categories"])
    returned = {finding["category"] for finding in outputs["findings"]}
    recall = len(expected & returned) / max(len(expected), 1)
    return {"key": "finding_recall", "score": recall, "comment": f"Expected {sorted(expected)}; returned {sorted(returned)}"}


def citation_grounding(inputs: dict, outputs: dict, reference_outputs: dict) -> dict:
    text = inputs["text"]
    findings = outputs["findings"]
    verified = all(
        finding["citation"].get("status") == "verified"
        and bool(finding["citation"].get("excerpt", ""))
        and finding["citation"]["excerpt"] in text
        for finding in findings
    )
    return {"key": "citation_grounding", "score": 1.0 if verified else 0.0, "comment": f"Validated {len(findings)} finding citations"}


async def main() -> None:
    dataset_path = Path("tests/fixtures/policies/evaluation.json")
    data = json.loads(dataset_path.read_text(encoding="utf-8"))
    examples = [Example(id=uuid4(), inputs=item["inputs"], outputs=item["outputs"]) for index, item in enumerate(data)]
    results = await aevaluate(
        target,
        data=examples,
        evaluators=[finding_recall, citation_grounding],
        experiment_prefix="tos-decipher-grounding",
        description="Policy category recall and citation evidence checks",
        max_concurrency=2,
        upload_results=bool(os.getenv("LANGSMITH_API_KEY")),
    )
    if not os.getenv("LANGSMITH_API_KEY"):
        print(results)


if __name__ == "__main__":
    asyncio.run(main())
