from typing import Literal

from pydantic import BaseModel, Field, StringConstraints, computed_field
from typing_extensions import Annotated

Impact = Literal["favorable", "routine", "caution", "important"]
Language = Literal["en", "es"]


class Passage(BaseModel):
    id: str
    text: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)


class Citation(BaseModel):
    passageId: str
    excerpt: str
    status: Literal["verified", "unsupported", "contradicted", "fabricated", "uncertain"] = "verified"


class Finding(BaseModel):
    category: str
    explanation: str
    implication: str
    citation: Citation
    uncertainty: str
    impact: Impact | None = None
    impactScore: float | None = Field(default=None, ge=0.0, le=3.0)


class Analysis(BaseModel):
    title: str
    policyType: str
    overview: str
    findings: list[Finding]
    limitations: list[str]
    passages: list[Passage] = Field(default_factory=list)

    @computed_field
    @property
    def rating(self) -> Literal["clear", "caution", "warning", "unrated"]:
        impacts = {finding.impact for finding in self.findings if finding.impact is not None}
        if "important" in impacts:
            return "warning"
        if "caution" in impacts:
            return "caution"
        return "clear" if impacts else "unrated"


class AnalyzeRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=80, max_length=200000)]
    language: Language = "en"


class AskRequest(AnalyzeRequest):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=2000)]


class StagedAnalyzeRequest(AnalyzeRequest):
    background: bool = True
    correlation_id: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] = None


class AskCitation(BaseModel):
    passageId: str
    excerpt: str
    status: Literal["verified"] = "verified"


class AskResponse(BaseModel):
    answer: str
    citations: list[AskCitation]
    uncertainty: str
