"""Best-effort client for the isolated NVIDIA Arabic FastConformer endpoint.

This module never participates in the pass/fail decision.  It exists so IQRA 6
recordings can be compared with Azure while the model is being validated.
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


def compare_transcription(audio_path: Path, reference_text: str) -> dict | None:
    """Return shadow diagnostics, or None when the experiment is disabled."""
    if not is_fastconformer_shadow_enabled():
        return None

    endpoint = os.getenv("IQRA_FASTCONFORMER_ENDPOINT", "").strip()
    token = os.getenv("IQRA_FASTCONFORMER_TOKEN", "").strip()
    timeout = float(os.getenv("IQRA_FASTCONFORMER_TIMEOUT_SECONDS", "25"))
    payload = json.dumps(
        {
            "model": MODEL_ID,
            "language": "ar",
            "filename": audio_path.name,
            "audio_base64": base64.b64encode(audio_path.read_bytes()).decode("ascii"),
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
        return {"status": "unavailable", "error": type(exc).__name__, "model": MODEL_ID}

    transcript = str(body.get("text") or body.get("transcript") or body.get("generated_text") or "").strip()
    normalized_reference = _normalize_arabic(reference_text)
    normalized_transcript = _normalize_arabic(transcript)
    similarity = (
        round(100 * SequenceMatcher(None, normalized_reference, normalized_transcript).ratio(), 2)
        if normalized_transcript else 0.0
    )
    return {
        "status": "completed",
        "model": MODEL_ID,
        "transcript": transcript,
        "text_similarity": similarity,
    }
