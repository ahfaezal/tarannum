import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from auth import get_current_student_user
from database import User
from iqra.config import is_azure_speech_configured, is_iqra_enabled
from iqra.azure_speech import AzureSpeechAssessmentError, assess_pronunciation
from iqra.samples import get_sample
from iqra.schemas import IqraAssessmentResponse, IqraStatusResponse


router = APIRouter(prefix="/api/kids/iqra", tags=["kids-iqra"])
MAX_IQRA_AUDIO_BYTES = 10 * 1024 * 1024


@router.get("/status", response_model=IqraStatusResponse)
async def get_iqra_status(
    _current_user: User = Depends(get_current_student_user),
) -> IqraStatusResponse:
    enabled = is_iqra_enabled()
    provider = "azure-speech" if enabled and is_azure_speech_configured() else None
    return IqraStatusResponse(
        enabled=enabled,
        assessment_provider=provider,
        sample_levels=[1, 3, 6],
    )


@router.post("/assess", response_model=IqraAssessmentResponse)
async def assess_iqra_sample(
    sample_id: str = Form(...),
    audio: UploadFile = File(...),
    _current_user: User = Depends(get_current_student_user),
) -> IqraAssessmentResponse:
    if not is_iqra_enabled():
        raise HTTPException(status_code=404, detail="IQRA assessment is not enabled.")
    if not is_azure_speech_configured():
        raise HTTPException(status_code=503, detail="IQRA speech assessment is unavailable.")

    sample = get_sample(sample_id)
    if sample is None:
        raise HTTPException(status_code=404, detail="Unknown IQRA sample.")
    if sample.level != 3:
        raise HTTPException(
            status_code=422,
            detail="Azure assessment is currently enabled only for the IQRA 3 sample.",
        )

    suffix = Path(audio.filename or "recording.m4a").suffix.lower() or ".m4a"
    if suffix not in {".m4a", ".mp4", ".wav", ".caf", ".mp3"}:
        raise HTTPException(status_code=415, detail="Unsupported audio format.")

    with tempfile.TemporaryDirectory(prefix="tarannum-iqra-upload-") as directory:
        source_path = Path(directory) / f"source{suffix}"
        total_bytes = 0
        with source_path.open("wb") as output:
            while chunk := audio.file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > MAX_IQRA_AUDIO_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="The audio recording is too large.",
                    )
                output.write(chunk)
        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="The audio recording is empty.")

        try:
            result = await run_in_threadpool(
                assess_pronunciation,
                source_path,
                sample.reference_text,
            )
        except AzureSpeechAssessmentError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return IqraAssessmentResponse(
        sample_id=sample.id,
        level=sample.level,
        reference_text=sample.reference_text,
        **result,
    )
