"""Client and diagnostics for the isolated NVIDIA Arabic FastConformer endpoint.

Azure remains the pronunciation assessor. FastConformer independently verifies
that the connected IQRA 6 phrase was spoken, which makes Azure word-boundary
omissions less likely to be presented to a child as a missing word.
"""
import base64
import json
import os
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from iqra.config import is_fastconformer_shadow_enabled


MODEL_ID = "nvidia/stt_ar_fastconformer_hybrid_large_pcd_v1.0"


def _normalize_arabic(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    value = re.sub(r"[\u064b-\u065f\u0670\u06d6-\u06ed]", "", value)
    value = value.translate(str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي"}))
    return " ".join(re.sub(r"[^\u0621-\u063a\u0641-\u064a\s]", " ", value).split())


def _reference_word_coverage(reference_text: str, transcript: str) -> tuple[float, list[str]]:
    """Measure ordered reference-token coverage in an Arabic transcript."""
    reference_words = _normalize_arabic(reference_text).split()
    transcript_words = _normalize_arabic(transcript).split()
    if not reference_words or not transcript_words:
        return 0.0, []

    matched: list[str] = []
    cursor = 0
    for reference_word in reference_words:
        best_index = None
        best_ratio = 0.0
        for index in range(cursor, min(len(transcript_words), cursor + 3)):
            ratio = SequenceMatcher(None, reference_word, transcript_words[index]).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_index = index
        if best_index is not None and best_ratio >= 0.72:
            matched.append(reference_word)
            cursor = best_index + 1
    return round(100 * len(matched) / len(reference_words), 2), matched


def compare_transcription(audio_path: Path, reference_text: str) -> dict | None:
    """Return shadow diagnostics, or None when the experiment is disabled."""
    if not is_fastconformer_shadow_enabled():
        return None

    endpoint = os.getenv("IQRA_FASTCONFORMER_ENDPOINT", "").strip()
    token = os.getenv("IQRA_FASTCONFORMER_TOKEN", "").strip()
    timeout = float(os.getenv("IQRA_FASTCONFORMER_TIMEOUT_SECONDS", "25"))
    payload = json.dumps(
        {
            "inputs": {
            "model": MODEL_ID,
            "language": "ar",
            "filename": audio_path.name,
            "audio_base64": base64.b64encode(audio_path.read_bytes()).decode("ascii"),
            },
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(endpoint, data=payload, headers=headers, method="POST")

    try:
        with urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        diagnostic = {"status": "unavailable", "error": type(exc).__name__, "model": MODEL_ID}
        if isinstance(exc, HTTPError):
            diagnostic["http_status"] = exc.code
        return diagnostic

    transcript = str(body.get("text") or body.get("transcript") or body.get("generated_text") or "").strip()
    normalized_reference = _normalize_arabic(reference_text)
    normalized_transcript = _normalize_arabic(transcript)
    similarity = (
        round(100 * SequenceMatcher(None, normalized_reference, normalized_transcript).ratio(), 2)
        if normalized_transcript else 0.0
    )
    word_coverage, matched_reference_words = _reference_word_coverage(reference_text, transcript)
    confirms_reference = similarity >= 80 and word_coverage >= 75
    return {
        "status": "completed",
        "model": MODEL_ID,
        "transcript": transcript,
        "text_similarity": similarity,
        "word_coverage": word_coverage,
        "matched_reference_words": matched_reference_words,
        "confirms_reference": confirms_reference,
    }
