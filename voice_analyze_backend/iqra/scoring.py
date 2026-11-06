from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class IqraDecision:
    score: float
    passed: bool
    reason: str


def _value(score: Optional[float]) -> float:
    return max(0.0, min(float(score or 0), 100.0))


def decide_iqra_attempt(
    level: int,
    accuracy: Optional[float],
    completeness: Optional[float],
    fluency: Optional[float],
    word_scores: list[Optional[float]],
) -> IqraDecision:
    accuracy_value = _value(accuracy)
    completeness_value = _value(completeness)
    fluency_value = _value(fluency)
    if level == 3:
        total = 0.55 * accuracy_value + 0.30 * completeness_value + 0.15 * fluency_value
        detected_scores = [_value(score) for score in word_scores if score is not None]
        weakest = min(detected_scores) if detected_scores else 0.0
        passed = total >= 70 and completeness_value >= 80 and weakest >= 60
        reason = "Lulus unit IQRA 3." if passed else "Ulang perkataan lemah sehingga semua perkataan mencapai sekurang-kurangnya 60."
    elif level == 6:
        total = 0.50 * accuracy_value + 0.30 * completeness_value + 0.20 * fluency_value
        passed = total >= 65 and completeness_value >= 85
        reason = "Lulus ayat." if passed else "Ulang ayat dengan sebutan yang lebih lengkap dan jelas."
    else:
        total = accuracy_value
        passed = False
        reason = "Penilaian tahap ini belum diaktifkan."
    return IqraDecision(round(total, 2), passed, reason)
