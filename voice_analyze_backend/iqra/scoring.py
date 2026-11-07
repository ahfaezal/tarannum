from dataclasses import dataclass
from difflib import SequenceMatcher
import re
from typing import Optional


@dataclass(frozen=True)
class IqraDecision:
    score: float
    passed: bool
    reason: str


_ARABIC_MARKS = re.compile(r"[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed]")


def _normalise_arabic(value: str) -> str:
    normalized = _ARABIC_MARKS.sub("", value or "")
    normalized = normalized.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي"}))
    return normalized.strip(" .،؟؛")


def align_word_results(reference_text: str, words: list[dict]) -> list[dict]:
    """Align Azure output to the server-controlled reference word order.

    Azure may repeat or insert words. The child-facing result must always have
    exactly one card per expected word so feedback remains understandable.
    """
    expected = reference_text.split()
    available = list(words)
    aligned: list[dict] = []
    cursor = 0
    for reference_word in expected:
        best_index = None
        best_ratio = 0.0
        target = _normalise_arabic(reference_word)
        for index in range(cursor, min(len(available), cursor + 3)):
            candidate = _normalise_arabic(str(available[index].get("word") or ""))
            ratio = SequenceMatcher(None, target, candidate).ratio() if candidate else 0.0
            if ratio > best_ratio:
                best_ratio = ratio
                best_index = index
        if best_index is None or best_ratio < 0.55:
            aligned.append({"word": reference_word, "accuracy_score": None, "error_type": "Omission", "phonemes": []})
            continue
        selected = dict(available[best_index])
        selected["word"] = reference_word
        aligned.append(selected)
        cursor = best_index + 1
    return aligned


def _value(score: Optional[float]) -> float:
    return max(0.0, min(float(score or 0), 100.0))


def apply_level_word_diagnostics(level: int, words: list[dict]) -> list[dict]:
    """Expose a child-facing score that reflects weak phonemes in IQRA 6.

    Azure's word score can remain high even when one or more phonemes are
    clearly weak. Keep the raw word score for audit, but cap the displayed
    score at the average phoneme score for connected ayah reading.
    """
    if level != 6:
        return words
    diagnosed: list[dict] = []
    for item in words:
        word = dict(item)
        phoneme_scores = [
            _value(phoneme.get("accuracy_score"))
            for phoneme in word.get("phonemes") or []
            if phoneme.get("accuracy_score") is not None
        ]
        if phoneme_scores:
            phoneme_average = sum(phoneme_scores) / len(phoneme_scores)
            raw_word_score = word.get("accuracy_score")
            word["azure_accuracy_score"] = raw_word_score
            word["phoneme_average_score"] = round(phoneme_average, 2)
            if raw_word_score is not None:
                word["accuracy_score"] = round(min(_value(raw_word_score), phoneme_average), 2)
        diagnosed.append(word)
    return diagnosed


def reconcile_fastconformer_words(words: list[dict], fastconformer: Optional[dict]) -> list[dict]:
    """Clear false omission labels when independent ASR confirms the ayah.

    No pronunciation mark is invented here. Azure remains the source of marks;
    FastConformer only confirms that the spoken content was present.
    """
    if not fastconformer or not fastconformer.get("confirms_reference"):
        return words
    matched = set(fastconformer.get("matched_reference_words") or [])
    reconciled: list[dict] = []
    for item in words:
        word = dict(item)
        normalized = _normalise_arabic(str(word.get("word") or ""))
        if word.get("error_type") == "Omission" and normalized in matched:
            word["error_type"] = "ConfirmedByFastConformer"
            word["content_confirmed"] = True
        reconciled.append(word)
    return reconciled


def _word_phoneme_averages(words: list[dict]) -> list[float]:
    averages: list[float] = []
    for word in words:
        scores = [
            _value(phoneme.get("accuracy_score"))
            for phoneme in word.get("phonemes") or []
            if phoneme.get("accuracy_score") is not None
        ]
        if scores:
            averages.append(sum(scores) / len(scores))
    return averages


def decide_iqra_attempt(
    level: int,
    accuracy: Optional[float],
    completeness: Optional[float],
    fluency: Optional[float],
    word_scores: list[Optional[float]],
    words: Optional[list[dict]] = None,
    fastconformer: Optional[dict] = None,
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
        confirms_reference = bool(fastconformer and fastconformer.get("confirms_reference"))
        content_similarity = _value((fastconformer or {}).get("text_similarity"))
        content_coverage = _value((fastconformer or {}).get("word_coverage"))
        effective_completeness = max(completeness_value, content_coverage if confirms_reference else 0.0)
        if fastconformer and fastconformer.get("status") == "completed":
            total = (
                0.45 * accuracy_value
                + 0.25 * effective_completeness
                + 0.15 * fluency_value
                + 0.15 * content_similarity
            )
        else:
            total = 0.50 * accuracy_value + 0.30 * effective_completeness + 0.20 * fluency_value
        passed = (
            total >= 70
            and effective_completeness >= 85
            and accuracy_value >= 60
        )
        reason = (
            "Lulus ayat."
            if passed
            else (
                "Ayat dikesan lengkap; ulang untuk memperkemas sebutan dan baris."
                if confirms_reference
                else "Ulang ayat; baca secara bersambung, jelas dan lengkap."
            )
        )
    else:
        total = accuracy_value
        passed = False
        reason = "Penilaian tahap ini belum diaktifkan."
    return IqraDecision(round(total, 2), passed, reason)
