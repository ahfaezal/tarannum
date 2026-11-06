from typing import Optional

from pydantic import BaseModel


class IqraStatusResponse(BaseModel):
    enabled: bool
    assessment_provider: Optional[str] = None
    sample_levels: list[int]


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
