"""Hugging Face Inference Endpoint handler for Arabic NVIDIA FastConformer."""
import base64
import binascii
import os
import tempfile
from pathlib import Path
from typing import Any


MODEL_ID = os.getenv(
    "FASTCONFORMER_MODEL_ID",
    "nvidia/stt_ar_fastconformer_hybrid_large_pcd_v1.0",
)
MAX_AUDIO_BYTES = 12 * 1024 * 1024


def decode_request(data: dict[str, Any]) -> tuple[bytes, str]:
    """Validate the stable JSON contract used by the Tarannum Kids backend."""
    payload = data.get("inputs", data)
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")

    encoded = payload.get("audio_base64")
    if not isinstance(encoded, str) or not encoded.strip():
        raise ValueError("audio_base64 is required.")
    try:
        audio_bytes = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("audio_base64 is invalid.") from exc
    if not audio_bytes:
        raise ValueError("Decoded audio is empty.")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise ValueError("Decoded audio exceeds the 12 MB limit.")

    filename = Path(str(payload.get("filename") or "audio.wav")).name
    if Path(filename).suffix.lower() != ".wav":
        raise ValueError("FastConformer endpoint accepts 16 kHz mono PCM WAV only.")
    return audio_bytes, filename


def transcription_text(output: Any) -> str:
    """Handle NeMo hypothesis and plain-string return variants."""
    item = output[0] if isinstance(output, (list, tuple)) and output else output
    if item is None:
        return ""
    if isinstance(item, str):
        return item.strip()
    return str(getattr(item, "text", "") or "").strip()


class EndpointHandler:
    def __init__(self, path: str = "") -> None:
        import nemo.collections.asr as nemo_asr

        self.model = nemo_asr.models.EncDecHybridRNNTCTCBPEModel.from_pretrained(
            model_name=MODEL_ID,
        )
        self.model.eval()

    def __call__(self, data: dict[str, Any]) -> dict[str, Any]:
        audio_bytes, filename = decode_request(data)
        with tempfile.TemporaryDirectory(prefix="tarannum-fastconformer-") as directory:
            audio_path = Path(directory) / filename
            audio_path.write_bytes(audio_bytes)
            output = self.model.transcribe([str(audio_path)])
        return {
            "text": transcription_text(output),
            "model": MODEL_ID,
            "language": "ar",
        }
