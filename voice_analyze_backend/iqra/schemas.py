from typing import Optional

from pydantic import BaseModel


class IqraStatusResponse(BaseModel):
    enabled: bool
    assessment_provider: Optional[str] = None
    sample_levels: list[int]


class IqraCatalogItem(BaseModel):
    id: str
    level: int
    title: str
    sequence: int
    unit_id: str
    reference_text: str


class IqraProgressItem(BaseModel):
    sample_id: str
    level: int
    sequence: int
    best_score: float
    passed: bool
    attempt_count: int


class IqraProgressResponse(BaseModel):
    next_stage: str
    iqra_3_completed: bool
    iqra_6_completed: bool
    tarannum_recommended: bool
    items: list[IqraProgressItem]


class IqraPhonemeResult(BaseModel):
    phoneme: Optional[str] = None
    accuracy_score: Optional[float] = None


class IqraWordResult(BaseModel):
    word: Optional[str] = None
    accuracy_score: Optional[float] = None
    error_type: str
    phonemes: list[IqraPhonemeResult]


class IqraAssessmentResponse(BaseModel):
    sample_id: str
    level: int
    reference_text: str
    recognized_text: str
    accuracy_score: Optional[float] = None
    fluency_score: Optional[float] = None
    completeness_score: Optional[float] = None
    pronunciation_score: Optional[float] = None
    words: list[IqraWordResult]
    provider: str
    locale: str
    attempt_id: Optional[str] = None
    unit_score: Optional[float] = None
    passed: bool = False
    decision_reason: Optional[str] = None
    credited_seconds: float = 0
    next_stage: Optional[str] = None
    fastconformer_shadow: Optional[dict] = None
