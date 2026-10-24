from typing import Literal
from pydantic import BaseModel, Field, StringConstraints
from typing_extensions import Annotated

class AnchorCandidate(BaseModel):
    id: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    label: Annotated[str, StringConstraints(min_length=1, max_length=240)]
    url: Annotated[str, StringConstraints(min_length=1, max_length=4000)]

class LegalAnchorClassification(BaseModel):
    id: str
    likelyPolicy: bool
    confidence: float = Field(ge=0, le=1)

class LegalAnchorClassificationResponse(BaseModel):
    classifications: list[LegalAnchorClassification]

class AnchorClassificationRequest(BaseModel):
    anchors: list[AnchorCandidate] = Field(min_length=1, max_length=100)
    correlation_id: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] = None

class PolicyTypeClassification(BaseModel):
    id: str
    policyType: Literal["terms_of_service", "privacy_policy", "subscription_or_billing", "other"]

class PolicyTypeClassificationRequest(BaseModel):
    anchors: list[AnchorCandidate] = Field(min_length=1, max_length=100)
    correlation_id: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)] = None

class PolicyTypeClassificationResponse(BaseModel):
    classifications: list[PolicyTypeClassification]
