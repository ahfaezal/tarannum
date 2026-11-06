import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydub import AudioSegment
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from auth import get_current_student_user
from database import IqraAttempt, IqraProgress, User, get_db
from iqra.config import is_azure_speech_configured, is_iqra_enabled
from iqra.azure_speech import AzureSpeechAssessmentError, assess_pronunciation
from iqra.samples import SAMPLES, get_sample
from iqra.scoring import align_word_results, decide_iqra_attempt
from iqra.schemas import (
    IqraAssessmentResponse,
    IqraCatalogItem,
    IqraProgressItem,
    IqraProgressResponse,
    IqraStatusResponse,
)


router = APIRouter(prefix="/api/kids/iqra", tags=["kids-iqra"])
MAX_IQRA_AUDIO_BYTES = 10 * 1024 * 1024


def _required_sample_ids(level: int) -> set[str]:
    return {sample.id for sample in SAMPLES.values() if sample.level == level}


def _next_stage(passed_ids: set[str]) -> tuple[str, bool, bool]:
    iqra3_completed = _required_sample_ids(3).issubset(passed_ids)
    iqra6_completed = _required_sample_ids(6).issubset(passed_ids)
    if iqra3_completed and iqra6_completed:
        return "tarannum", True, True
    if iqra3_completed:
        return "iqra-6", True, False
    return "iqra-3", False, False


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


@router.get("/catalog", response_model=list[IqraCatalogItem])
async def get_iqra_catalog(
    _current_user: User = Depends(get_current_student_user),
) -> list[IqraCatalogItem]:
    unique_samples = {sample.id: sample for sample in SAMPLES.values()}
    return [
        IqraCatalogItem(
            id=sample.id,
            level=sample.level,
            title=sample.title,
            sequence=sample.sequence,
            unit_id=sample.unit_id,
            reference_text=sample.reference_text,
        )
        for sample in sorted(unique_samples.values(), key=lambda item: (item.level, item.sequence))
    ]


@router.get("/progress", response_model=IqraProgressResponse)
async def get_iqra_progress(
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db),
) -> IqraProgressResponse:
    rows = db.query(IqraProgress).filter(IqraProgress.student_id == current_user.id).all()
    passed_ids = {row.sample_id for row in rows if row.passed}
    next_stage, iqra3_completed, iqra6_completed = _next_stage(passed_ids)
    return IqraProgressResponse(
        next_stage=next_stage,
        iqra_3_completed=iqra3_completed,
        iqra_6_completed=iqra6_completed,
        tarannum_recommended=iqra3_completed and iqra6_completed,
        items=[
            IqraProgressItem(
                sample_id=row.sample_id,
                level=row.level,
                sequence=row.sequence,
                best_score=float(row.best_score or 0),
                passed=bool(row.passed),
                attempt_count=int(row.attempt_count or 0),
            )
            for row in sorted(rows, key=lambda item: (item.level, item.sequence))
        ],
    )


@router.post("/assess", response_model=IqraAssessmentResponse)
async def assess_iqra_sample(
    sample_id: str = Form(...),
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_student_user),
    db: Session = Depends(get_db),
) -> IqraAssessmentResponse:
    if not is_iqra_enabled():
        raise HTTPException(status_code=404, detail="IQRA assessment is not enabled.")
    if not is_azure_speech_configured():
        raise HTTPException(status_code=503, detail="IQRA speech assessment is unavailable.")

    sample = get_sample(sample_id)
    if sample is None:
        raise HTTPException(status_code=404, detail="Unknown IQRA sample.")
    if sample.level not in {3, 6}:
        raise HTTPException(
            status_code=422,
            detail="Azure assessment is currently enabled only for IQRA 3 and IQRA 6.",
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
            duration_seconds = round(len(AudioSegment.from_file(source_path)) / 1000.0, 2)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="The audio duration could not be read.") from exc

        try:
            result = await run_in_threadpool(
                assess_pronunciation,
                source_path,
                sample.reference_text,
            )
        except AzureSpeechAssessmentError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    result["words"] = align_word_results(sample.reference_text, result.get("words", []))
    word_scores = [word.get("accuracy_score") for word in result["words"]]
    decision = decide_iqra_attempt(
        sample.level,
        result.get("accuracy_score"),
        result.get("completeness_score"),
        result.get("fluency_score"),
        word_scores,
    )
    recognized_text = (result.get("recognized_text") or "").strip()
    valid_attempt = bool(recognized_text) and duration_seconds >= 0.5 and decision.score > 0
    credited_seconds = min(duration_seconds, 120.0) if valid_attempt else 0.0
    passed = valid_attempt and decision.passed

    attempt = IqraAttempt(
        student_id=current_user.id,
        sample_id=sample.id,
        unit_id=sample.unit_id,
        level=sample.level,
        sequence=sample.sequence,
        reference_text=sample.reference_text,
        recognized_text=recognized_text,
        accuracy_score=result.get("accuracy_score"),
        completeness_score=result.get("completeness_score"),
        fluency_score=result.get("fluency_score"),
        pronunciation_score=result.get("pronunciation_score"),
        unit_score=decision.score,
        passed=passed,
        valid_attempt=valid_attempt,
        duration_seconds=duration_seconds,
        credited_seconds=credited_seconds,
        word_results=result.get("words", []),
        provider=result.get("provider", "azure-speech"),
        decision_reason=decision.reason,
    )
    db.add(attempt)
    db.flush()
    progress = db.query(IqraProgress).filter(
        IqraProgress.student_id == current_user.id,
        IqraProgress.sample_id == sample.id,
    ).first()
    if progress is None:
        progress = IqraProgress(
            student_id=current_user.id,
            sample_id=sample.id,
            unit_id=sample.unit_id,
            level=sample.level,
            sequence=sample.sequence,
        )
        db.add(progress)
    progress.attempt_count = (progress.attempt_count or 0) + 1
    progress.best_score = max(float(progress.best_score or 0), decision.score)
    progress.last_attempt_id = attempt.id
    progress.updated_at = datetime.utcnow()
    if passed and not progress.passed:
        progress.passed = True
        progress.first_passed_at = datetime.utcnow()
    db.commit()

    passed_ids = {
        row.sample_id for row in db.query(IqraProgress).filter(
            IqraProgress.student_id == current_user.id,
            IqraProgress.passed.is_(True),
        ).all()
    }
    next_stage, _, _ = _next_stage(passed_ids)

    return IqraAssessmentResponse(
        sample_id=sample.id,
        level=sample.level,
        reference_text=sample.reference_text,
        **result,
        attempt_id=str(attempt.id),
        unit_score=decision.score,
        passed=passed,
        decision_reason=decision.reason,
        credited_seconds=credited_seconds,
        next_stage=next_stage,
    )
