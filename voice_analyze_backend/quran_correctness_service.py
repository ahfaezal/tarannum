"""Quran correctness checks for post-recording score gating.

This module intentionally runs after the existing audio similarity score. It does
not modify audio, pitch extraction, segment scoring, or raw scoring data.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from rapidfuzz import fuzz

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - handled at runtime when dependency is absent
    OpenAI = None  # type: ignore


ARABIC_DIACRITICS_RE = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
ARABIC_LETTER_RE = re.compile(r"[\u0621-\u064A]")
TATWEEL = "\u0640"

# Critical Quran letter families. These are intentionally conservative: only
# single-character substitutions inside the same family are flagged.
CRITICAL_LETTER_GROUPS: Tuple[Tuple[str, ...], ...] = (
    ("ح", "ه"),
    ("ع", "أ", "ا", "ء"),
    ("ق", "ك"),
    ("ص", "س"),
    ("ض", "د", "ظ"),
    ("ط", "ت"),
    ("ث", "س"),
    ("ذ", "ز"),
)


def _critical_pair_lookup() -> set[Tuple[str, str]]:
    pairs: set[Tuple[str, str]] = set()
    for group in CRITICAL_LETTER_GROUPS:
        for left in group:
            for right in group:
                if left != right:
                    pairs.add((left, right))
    return pairs


CRITICAL_LETTER_PAIRS = _critical_pair_lookup()


@dataclass
class QuranCorrectnessResult:
    enabled: bool
    status: str
    expected_text: str = ""
    transcript: str = ""
    normalized_expected: str = ""
    normalized_transcript: str = ""
    match_score: Optional[float] = None
    critical_letter_errors: Optional[List[Dict[str, Any]]] = None
    score_cap: Optional[float] = None
    original_score: Optional[float] = None
    adjusted_score: Optional[float] = None
    applied: bool = False
    message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "status": self.status,
            "expectedText": self.expected_text,
            "transcript": self.transcript,
            "normalizedExpected": self.normalized_expected,
            "normalizedTranscript": self.normalized_transcript,
            "matchScore": self.match_score,
            "criticalLetterErrors": self.critical_letter_errors or [],
            "scoreCap": self.score_cap,
            "originalScore": self.original_score,
            "adjustedScore": self.adjusted_score,
            "applied": self.applied,
            "message": self.message,
        }


def is_quran_correctness_enabled() -> bool:
    if os.getenv("QURAN_CORRECTNESS_ENABLED", "true").strip().lower() in {"0", "false", "no", "off"}:
        return False
    return bool(os.getenv("OPENAI_API_KEY"))


def should_apply_score_cap() -> bool:
    return os.getenv("QURAN_CORRECTNESS_APPLY_CAP", "true").strip().lower() not in {"0", "false", "no", "off"}


def get_quran_correctness_timeout_seconds() -> float:
    try:
        return max(5.0, float(os.getenv("QURAN_CORRECTNESS_TIMEOUT_SECONDS", "20")))
    except ValueError:
        return 20.0


def get_transcription_model_candidates() -> List[str]:
    primary_model = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-transcribe").strip()
    fallback_models = os.getenv(
        "OPENAI_TRANSCRIPTION_FALLBACK_MODELS",
        "gpt-4o-mini-transcribe,whisper-1",
    )
    candidates = [primary_model]
    candidates.extend(model.strip() for model in fallback_models.split(",") if model.strip())

    unique_candidates: List[str] = []
    for model in candidates:
        if model and model not in unique_candidates:
            unique_candidates.append(model)
    return unique_candidates


def build_expected_text(text_segments: Optional[Sequence[Dict[str, Any]]]) -> str:
    if not text_segments:
        return ""
    parts: List[str] = []
    for segment in text_segments:
        text = str(segment.get("text", "")).strip()
        if text:
            parts.append(text)
    return " ".join(parts).strip()


def normalize_arabic_text(text: str) -> str:
    text = text or ""
    text = text.replace(TATWEEL, "")
    text = ARABIC_DIACRITICS_RE.sub("", text)
    # Normalize common alif/hamza forms for broad ayah matching. The critical
    # letter check still operates on this normalized form, so hamza/alif family
    # detection is intentionally coarse in this first implementation.
    replacements = {
        "إ": "ا",
        "أ": "ا",
        "آ": "ا",
        "ٱ": "ا",
        "ى": "ي",
        "ة": "ه",
        "ؤ": "و",
        "ئ": "ي",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    letters = ARABIC_LETTER_RE.findall(text)
    return "".join(letters)


def transcribe_arabic_audio(audio_path: Path) -> str:
    if OpenAI is None:
        raise RuntimeError("openai package is not installed")

    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        timeout=get_quran_correctness_timeout_seconds(),
        max_retries=0,
    )
    prompt = (
        "This is Quran recitation in Arabic. Transcribe only the Arabic words "
        "that were recited. Do not translate. Do not add commentary."
    )

    last_error: Optional[Exception] = None
    for model in get_transcription_model_candidates():
        try:
            logger.info(
                "Starting Quran transcription with model=%s file_size=%s timeout=%ss",
                model,
                audio_path.stat().st_size if audio_path.exists() else "unknown",
                get_quran_correctness_timeout_seconds(),
            )
            with audio_path.open("rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model=model,
                    file=audio_file,
                    language="ar",
                    prompt=prompt,
                    response_format="text",
                )

            if isinstance(transcription, str):
                return transcription.strip()
            return str(transcription).strip()
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Quran transcription failed with model=%s: %s",
                model,
                exc,
                exc_info=True,
            )

    raise RuntimeError(f"OpenAI transcription failed for all configured models: {last_error}")


def detect_critical_letter_errors(expected: str, actual: str, limit: int = 12) -> List[Dict[str, Any]]:
    """Find conservative one-letter critical substitutions using alignment.

    This is not a tajwid engine. It only flags aligned replacement spans of the
    same length where each substituted character belongs to a known critical
    family. Insertions/deletions are left to the broader match score.
    """
    try:
        import difflib

        matcher = difflib.SequenceMatcher(a=expected, b=actual, autojunk=False)
        errors: List[Dict[str, Any]] = []
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag != "replace":
                continue
            expected_span = expected[i1:i2]
            actual_span = actual[j1:j2]
            if len(expected_span) != len(actual_span):
                continue
            for offset, (expected_char, actual_char) in enumerate(zip(expected_span, actual_span)):
                if (expected_char, actual_char) in CRITICAL_LETTER_PAIRS:
                    errors.append({
                        "expected": expected_char,
                        "actual": actual_char,
                        "expectedIndex": i1 + offset,
                        "actualIndex": j1 + offset,
                        "type": "critical_letter_substitution",
                    })
                    if len(errors) >= limit:
                        return errors
        return errors
    except Exception as exc:  # pragma: no cover - defensive; never break scoring
        logger.warning("Critical letter detection failed: %s", exc, exc_info=True)
        return []


def determine_score_cap(match_score: float, critical_errors: Sequence[Dict[str, Any]]) -> Tuple[Optional[float], str]:
    critical_count = len(critical_errors)

    if match_score < 45.0:
        return 15.0, "Ayah transcript is very different from the expected text."
    if match_score < 65.0:
        return 35.0, "Ayah transcript does not sufficiently match the expected text."
    if match_score < 80.0:
        return 60.0, "Ayah transcript partially matches, but there are important text differences."

    if critical_count >= 3:
        return 55.0, "Multiple critical Quran letter substitutions were detected."
    if critical_count >= 1:
        return 70.0, "A critical Quran letter substitution may be present."

    return None, "Ayah text check passed."


def build_ai_recitation_notes(
    quran_correctness: Dict[str, Any],
    score: float,
    score_breakdown: Optional[Dict[str, Any]] = None,
    segments: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Build student-facing guidance from scoring and Quran correctness data.

    This does not call the model again. It turns the AI transcription result,
    score breakdown, and segment scores into concise learning notes.
    """
    corrections: List[str] = []
    practice_advice: List[str] = []
    positives: List[str] = []

    status = quran_correctness.get("status")
    match_score = quran_correctness.get("matchScore")
    critical_errors = quran_correctness.get("criticalLetterErrors") or []
    cap_applied = bool(quran_correctness.get("applied"))

    if status == "checked":
        if isinstance(match_score, (int, float)) and match_score >= 90 and not critical_errors:
            summary = "Bacaan ayat kelihatan sepadan dengan teks rujukan. Teruskan memperhalusi alunan, timing dan kestabilan pitch."
            positives.append("Teks bacaan sepadan dengan ayat rujukan berdasarkan semakan AI.")
        elif cap_applied:
            summary = "Score telah diturunkan kerana semakan AI mengesan bacaan tidak cukup sepadan dengan ayat rujukan. Betulkan lafaz dahulu sebelum menilai alunan tarannum."
        else:
            summary = "Semakan AI mengesan beberapa perbezaan pada bacaan. Gunakan nota ini sebagai panduan awal sebelum ulang latihan."

        if isinstance(match_score, (int, float)) and match_score < 80:
            corrections.append("Pastikan ayat yang dibaca sama dengan ayat rujukan sebelum menekan Score Mimic.")
            practice_advice.append("Dengar reference audio sekali pada kelajuan perlahan, kemudian ulang ayat yang sama tanpa mengejar alunan dahulu.")

        if critical_errors:
            shown_errors = []
            for error in critical_errors[:4]:
                expected = error.get("expected", "?")
                actual = error.get("actual", "?")
                shown_errors.append(f"{expected}/{actual}")
            corrections.append("Semak kemungkinan pertukaran huruf kritikal: " + ", ".join(shown_errors) + ".")
            practice_advice.append("Latih makhraj huruf kritikal secara perlahan sebelum membaca dengan tarannum penuh.")
    elif status == "skipped":
        summary = "Nota AI belum lengkap kerana teks rujukan atau konfigurasi AI tidak tersedia untuk sesi ini. Feedback di bawah masih berdasarkan analisis audio biasa."
    elif status == "error":
        summary = "Nota AI tidak dapat dijana untuk sesi ini. Feedback di bawah masih berdasarkan analisis audio biasa."
    else:
        summary = "Nota bimbingan dijana berdasarkan score, segment dan semakan bacaan yang tersedia."

    if score >= 70:
        positives.append("Keseluruhan bacaan menunjukkan asas yang baik untuk diperhalusi.")
    elif score >= 40:
        positives.append("Ada bahagian yang mula mengikuti rujukan, tetapi masih perlu latihan berulang.")
    else:
        positives.append("Sesi ini boleh dijadikan baseline awal untuk mengenal pasti bahagian yang perlu diulang.")

    if score_breakdown:
        pitch = float(score_breakdown.get("pitch", 0) or 0)
        timing = float(score_breakdown.get("timing", 0) or 0)
        pronunciation = float(score_breakdown.get("pronunciation", 0) or 0)
        weakest = min((pitch, "pitch"), (timing, "timing"), (pronunciation, "pronunciation"), key=lambda item: item[0])
        if weakest[0] < 45:
            if weakest[1] == "pitch":
                corrections.append("Fokus pada naik turun pitch supaya lebih hampir dengan qari rujukan.")
            elif weakest[1] == "timing":
                corrections.append("Fokus pada tempo dan tempat berhenti supaya lebih selari dengan rujukan.")
            else:
                corrections.append("Fokus pada kejelasan sebutan sebelum memperhalusi lenggok.")

    if segments:
        low_segments = [
            (index + 1, float(segment.get("score", 0) or 0))
            for index, segment in enumerate(segments)
            if float(segment.get("score", 0) or 0) < 40
        ]
        if low_segments:
            first_items = ", ".join(f"Segment {index}" for index, _score in low_segments[:3])
            practice_advice.append(f"Ulang {first_items} secara berasingan kerana markahnya masih rendah.")

    if not corrections:
        corrections.append("Teruskan membandingkan bacaan dengan reference audio untuk memperhalusi pitch, timing dan lafaz.")
    if not practice_advice:
        practice_advice.append("Gunakan Repeat Ayah dan speed Slow untuk ulang ayat yang sama beberapa kali.")

    return {
        "title": "Nota Bimbingan AI",
        "summary": summary,
        "positives": positives[:3],
        "corrections": corrections[:4],
        "practiceAdvice": practice_advice[:4],
    }


def evaluate_quran_correctness(audio_path: Path, text_segments: Optional[Sequence[Dict[str, Any]]], original_score: float) -> Dict[str, Any]:
    expected_text = build_expected_text(text_segments)
    if not expected_text:
        return QuranCorrectnessResult(
            enabled=False,
            status="skipped",
            original_score=original_score,
            adjusted_score=original_score,
            message="No reference text segments available for Quran correctness check.",
        ).to_dict()

    if not is_quran_correctness_enabled():
        return QuranCorrectnessResult(
            enabled=False,
            status="skipped",
            expected_text=expected_text,
            original_score=original_score,
            adjusted_score=original_score,
            message="Quran correctness check is disabled or OPENAI_API_KEY is not configured.",
        ).to_dict()

    try:
        transcript = transcribe_arabic_audio(audio_path)
        normalized_expected = normalize_arabic_text(expected_text)
        normalized_transcript = normalize_arabic_text(transcript)

        if not normalized_transcript:
            match_score = 0.0
            critical_errors: List[Dict[str, Any]] = []
            cap = 10.0
            message = "No Arabic transcript was detected from the recording."
        else:
            match_score = float(fuzz.ratio(normalized_expected, normalized_transcript))
            critical_errors = detect_critical_letter_errors(normalized_expected, normalized_transcript)
            cap, message = determine_score_cap(match_score, critical_errors)

        adjusted_score = original_score
        applied = False
        if cap is not None and should_apply_score_cap() and original_score > cap:
            adjusted_score = cap
            applied = True

        return QuranCorrectnessResult(
            enabled=True,
            status="checked",
            expected_text=expected_text,
            transcript=transcript,
            normalized_expected=normalized_expected,
            normalized_transcript=normalized_transcript,
            match_score=round(match_score, 2),
            critical_letter_errors=critical_errors,
            score_cap=cap,
            original_score=round(float(original_score), 2),
            adjusted_score=round(float(adjusted_score), 2),
            applied=applied,
            message=message,
        ).to_dict()
    except Exception as exc:
        logger.warning("Quran correctness check unavailable: %s", exc, exc_info=True)
        return QuranCorrectnessResult(
            enabled=True,
            status="error",
            expected_text=expected_text,
            original_score=original_score,
            adjusted_score=original_score,
            message=f"Quran correctness check failed: {exc}",
        ).to_dict()
