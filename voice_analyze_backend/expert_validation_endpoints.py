"""Blinded expert-validation workflow for the KNovasi 2026 evidence set."""
from __future__ import annotations

import random
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from auth import get_current_admin_user, get_current_qari_user
from database import (
    AnalysisResult,
    AuditLog,
    ExpertEvaluationAssignment,
    ExpertEvaluationBatch,
    ExpertEvaluationItem,
    ExpertEvaluationTask,
    ExpertRating,
    Reference,
    User,
    UserRole,
    UserSession,
    get_db,
)


router = APIRouter(prefix="/api/expert-validation", tags=["expert-validation"])
RUBRIC_VERSION = "KNOVASI-2026-v1"
RUBRIC = [
    {"key": "melodic_contour", "label": "Kontur dan bentuk melodi", "weight": 30},
    {"key": "pitch_control", "label": "Kedudukan dan kawalan nada", "weight": 20},
    {"key": "rhythm_continuity", "label": "Irama, tempo dan kesinambungan", "weight": 20},
    {"key": "voice_stability", "label": "Kestabilan suara dan kawalan nafas", "weight": 15},
    {"key": "tarannum_suitability", "label": "Kesesuaian tarannum keseluruhan", "weight": 15},
]
BASE_DIR = Path(__file__).resolve().parent


class CreateBatchPayload(BaseModel):
    name: str = Field(default="Validasi Pakar KNovasi 2026", min_length=3, max_length=160)
    description: Optional[str] = None
    evaluator_ids: List[uuid.UUID]
    cohort_start: Optional[datetime] = None
    cohort_end: Optional[datetime] = None
    target_reference_id: str = Field(min_length=1, max_length=255)
    target_count: int = Field(default=40, ge=10, le=200)
    duplicate_count: int = Field(default=5, ge=0, le=20)
    random_seed: int = Field(default=20260816, ge=1)
    minimum_evaluator_count: int = Field(default=2, ge=2, le=3)
    target_evaluator_count: int = Field(default=3, ge=2, le=3)
    consent_confirmed: bool

    @validator("evaluator_ids")
    def one_to_five_unique_evaluators(cls, value):
        if not 1 <= len(value) <= 5 or len(set(value)) != len(value):
            raise ValueError("Select between one and five different Qari evaluators")
        return value

    @validator("cohort_end")
    def end_after_start(cls, value, values):
        start = values.get("cohort_start")
        if start and value and value <= start:
            raise ValueError("cohort_end must be after cohort_start")
        return value

    @validator("consent_confirmed")
    def consent_must_be_confirmed(cls, value):
        if value is not True:
            raise ValueError("Participant audio-use consent must be confirmed before creating a batch")
        return value


class RatingPayload(BaseModel):
    melodic_contour: Optional[int] = Field(default=None, ge=1, le=5)
    pitch_control: Optional[int] = Field(default=None, ge=1, le=5)
    rhythm_continuity: Optional[int] = Field(default=None, ge=1, le=5)
    voice_stability: Optional[int] = Field(default=None, ge=1, le=5)
    tarannum_suitability: Optional[int] = Field(default=None, ge=1, le=5)
    audio_evaluable: bool = True
    tarannum_identifiable: str = "unsure"
    confidence: str = "medium"
    primary_issue: Optional[str] = Field(default=None, max_length=80)
    comments: Optional[str] = Field(default=None, max_length=2000)
    submit: bool = False

    @validator("tarannum_identifiable")
    def valid_identifiable(cls, value):
        if value not in {"yes", "no", "unsure"}:
            raise ValueError("tarannum_identifiable must be yes, no, or unsure")
        return value

    @validator("confidence")
    def valid_confidence(cls, value):
        if value not in {"low", "medium", "high"}:
            raise ValueError("confidence must be low, medium, or high")
        return value


class AddEvaluatorPayload(BaseModel):
    evaluator_id: uuid.UUID


class ReopenRatingPayload(BaseModel):
    scope: str
    reason: str = Field(min_length=5, max_length=500)

    @validator("scope")
    def valid_scope(cls, value):
        if value not in {"comments_only", "full"}:
            raise ValueError("scope must be comments_only or full")
        return value


def _candidate_query(
    db: Session,
    start: Optional[datetime],
    end: Optional[datetime],
    reference_id: Optional[str] = None,
):
    query = (
        db.query(
            UserSession.id.label("session_id"),
            UserSession.user_id.label("user_id"),
            UserSession.reference_id.label("reference_id"),
            UserSession.created_at.label("created_at"),
            AnalysisResult.score.label("score"),
            Reference.title.label("reference_title"),
        )
        .join(AnalysisResult, AnalysisResult.user_session_id == UserSession.id)
        .outerjoin(Reference, Reference.id == UserSession.reference_id)
        .filter(
            UserSession.user_id.isnot(None),
            AnalysisResult.score.isnot(None),
            or_(UserSession.file_path.isnot(None), UserSession.cloud_storage_path.isnot(None)),
            UserSession.scoring_version == "V2.3",
            UserSession.integrity_status == "complete",
        )
    )
    if start:
        query = query.filter(UserSession.created_at >= start)
    if end:
        query = query.filter(UserSession.created_at < end)
    if reference_id:
        query = query.filter(UserSession.reference_id == reference_id)
    return query.order_by(AnalysisResult.score.asc(), UserSession.created_at.asc())


def _select_stratified(rows, target_count: int, seed: int):
    """Deterministically cover score thirds while limiting participant dominance."""
    if len(rows) < target_count:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(rows)} eligible recordings are available; {target_count} are required.",
        )

    sorted_rows = list(rows)
    low_end = (len(sorted_rows) + 2) // 3
    medium_end = low_end + (len(sorted_rows) // 3)
    strata = {
        "low": sorted_rows[:low_end],
        "medium": sorted_rows[low_end:medium_end],
        "high": sorted_rows[medium_end:],
    }
    quotas = {
        "low": (target_count + 2) // 3,
        "medium": target_count // 3,
        "high": target_count - ((target_count + 2) // 3) - (target_count // 3),
    }
    # Work on the most participant-constrained band first. Multiple deterministic
    # attempts avoid a greedy dead end while enforcing at most three recordings
    # from any participant.
    stratum_order = sorted(
        strata,
        key=lambda name: len({row.user_id for row in strata[name]}),
    )
    for attempt in range(250):
        attempt_rng = random.Random(seed + attempt * 7919)
        participant_counts = {}
        selected = []
        complete = True
        for stratum_name in stratum_order:
            pool = list(strata[stratum_name])
            attempt_rng.shuffle(pool)
            for _ in range(quotas[stratum_name]):
                eligible = [row for row in pool if participant_counts.get(row.user_id, 0) < 3]
                if not eligible:
                    complete = False
                    break
                lowest_count = min(participant_counts.get(row.user_id, 0) for row in eligible)
                balanced = [row for row in eligible if participant_counts.get(row.user_id, 0) == lowest_count]
                chosen = attempt_rng.choice(balanced)
                pool.remove(chosen)
                selected.append((stratum_name, chosen))
                participant_counts[chosen.user_id] = participant_counts.get(chosen.user_id, 0) + 1
            if not complete:
                break
        if complete and len(selected) == target_count:
            attempt_rng.shuffle(selected)
            return selected

    raise HTTPException(
        status_code=400,
        detail="Unable to construct a balanced sample with no more than three recordings per participant.",
    )


def _weighted_total(payload: RatingPayload) -> Optional[float]:
    values = [
        payload.melodic_contour,
        payload.pitch_control,
        payload.rhythm_continuity,
        payload.voice_stability,
        payload.tarannum_suitability,
    ]
    if not payload.audio_evaluable:
        return None
    if any(value is None for value in values):
        raise HTTPException(status_code=422, detail="All five rubric scores are required for an evaluable audio")
    return round(
        payload.melodic_contour * 6
        + payload.pitch_control * 4
        + payload.rhythm_continuity * 4
        + payload.voice_stability * 3
        + payload.tarannum_suitability * 3,
        2,
    )


def _create_evaluator_assignment(
    db: Session,
    batch: ExpertEvaluationBatch,
    evaluator: User,
    items: List[ExpertEvaluationItem],
    evaluator_index: int,
) -> ExpertEvaluationAssignment:
    """Grant one Qari access and create a randomized presentation of the frozen items."""
    assignment = ExpertEvaluationAssignment(batch_id=batch.id, evaluator_id=evaluator.id)
    db.add(assignment)
    db.flush()
    task_specs = [(item, False) for item in items]
    duplicate_rng = random.Random(batch.random_seed + evaluator_index * 1009)
    duplicates = duplicate_rng.sample(items, min(batch.duplicate_count, len(items)))
    task_specs.extend((item, True) for item in duplicates)
    duplicate_rng.shuffle(task_specs)
    for order, (item, is_duplicate) in enumerate(task_specs, start=1):
        db.add(ExpertEvaluationTask(
            assignment_id=assignment.id,
            item_id=item.id,
            presentation_code=f"KP-{uuid.uuid4().hex[:8].upper()}",
            display_order=order,
            is_hidden_duplicate=is_duplicate,
        ))
    return assignment


def _rating_payload(rating: Optional[ExpertRating]):
    if not rating:
        return None
    return {
        "melodic_contour": rating.melodic_contour,
        "pitch_control": rating.pitch_control,
        "rhythm_continuity": rating.rhythm_continuity,
        "voice_stability": rating.voice_stability,
        "tarannum_suitability": rating.tarannum_suitability,
        "audio_evaluable": rating.audio_evaluable,
        "tarannum_identifiable": rating.tarannum_identifiable,
        "confidence": rating.confidence,
        "primary_issue": rating.primary_issue,
        "comments": rating.comments,
        "weighted_total": rating.weighted_total,
        "status": rating.status,
        "revision_number": rating.revision_number or 1,
        "reopen_scope": rating.reopen_scope,
        "reopen_reason": rating.reopen_reason,
        "reopened_at": rating.reopened_at.isoformat() if rating.reopened_at else None,
        "submitted_at": rating.submitted_at.isoformat() if rating.submitted_at else None,
    }


def _get_authorized_task(db: Session, task_id: uuid.UUID, evaluator_id: uuid.UUID):
    row = (
        db.query(ExpertEvaluationTask, ExpertEvaluationAssignment, ExpertEvaluationItem, UserSession, Reference)
        .join(ExpertEvaluationAssignment, ExpertEvaluationAssignment.id == ExpertEvaluationTask.assignment_id)
        .join(ExpertEvaluationItem, ExpertEvaluationItem.id == ExpertEvaluationTask.item_id)
        .join(UserSession, UserSession.id == ExpertEvaluationItem.session_id)
        .outerjoin(Reference, Reference.id == UserSession.reference_id)
        .filter(
            ExpertEvaluationTask.id == task_id,
            ExpertEvaluationAssignment.evaluator_id == evaluator_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Evaluation task not found")
    return row


def _serve_audio(storage_path: Optional[str], fallback_path: Optional[str], filename: str):
    path_value = storage_path or fallback_path
    if not path_value:
        raise HTTPException(status_code=404, detail="Audio file is unavailable")

    suffix = Path(fallback_path or path_value).suffix or ".webm"
    media_types = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".ogg": "audio/ogg", ".webm": "audio/webm"}
    media_type = media_types.get(suffix.lower(), "audio/mpeg")
    if str(path_value).startswith("s3://"):
        from cloud_storage import cloud_storage

        temp = tempfile.NamedTemporaryFile(prefix="expert_validation_", suffix=suffix, delete=False)
        temp_path = Path(temp.name)
        temp.close()
        if not cloud_storage.download_file(str(path_value), temp_path) or not temp_path.exists():
            temp_path.unlink(missing_ok=True)
            raise HTTPException(status_code=404, detail="Audio file was not found in cloud storage")
        return FileResponse(
            str(temp_path),
            media_type=media_type,
            filename=filename,
            background=BackgroundTask(lambda p=temp_path: p.unlink(missing_ok=True)),
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    file_path = Path(str(path_value))
    if not file_path.is_absolute():
        options = [BASE_DIR / file_path, BASE_DIR / "uploads" / "temp_audio" / file_path.name, file_path]
        file_path = next((candidate for candidate in options if candidate.exists()), file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file was not found on the server")
    return FileResponse(
        str(file_path),
        media_type=media_type,
        filename=filename,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/admin/qari-options")
def admin_qari_options(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    qaris = (
        db.query(User)
        .filter(User.role == UserRole.QARI.value, User.is_active.is_(True), User.is_approved.is_(True))
        .order_by(User.full_name.asc(), User.email.asc())
        .all()
    )
    return {"qaris": [{"id": str(q.id), "name": q.full_name or q.email, "email": q.email} for q in qaris]}


@router.get("/admin/candidates")
def admin_candidate_summary(
    cohort_start: Optional[datetime] = None,
    cohort_end: Optional[datetime] = None,
    reference_id: Optional[str] = None,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    rows = _candidate_query(db, cohort_start, cohort_end, reference_id).all()
    participants = {str(row.user_id) for row in rows}
    references = {}
    for row in rows:
        key = str(row.reference_id or "unknown")
        entry = references.setdefault(key, {"reference_id": key, "title": row.reference_title or "Unknown reference", "count": 0})
        entry["count"] += 1
    return {
        "eligible_recordings": len(rows),
        "participants": len(participants),
        "references": sorted(references.values(), key=lambda item: item["count"], reverse=True),
        "filters": {
            "scoring_version": "V2.3",
            "integrity_status": "complete",
            "reference_id": reference_id,
        },
    }


@router.post("/admin/batches")
def create_batch(
    payload: CreateBatchPayload,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    if db.query(ExpertEvaluationBatch).filter(func.lower(ExpertEvaluationBatch.name) == payload.name.strip().lower()).first():
        raise HTTPException(status_code=409, detail="A validation batch with this name already exists")

    evaluators = db.query(User).filter(User.id.in_(payload.evaluator_ids)).all()
    if len(evaluators) != len(payload.evaluator_ids) or any(
        evaluator.role != UserRole.QARI.value or not evaluator.is_active or not evaluator.is_approved
        for evaluator in evaluators
    ):
        raise HTTPException(status_code=400, detail="All evaluators must be active, approved Qari accounts")
    if payload.minimum_evaluator_count > payload.target_evaluator_count:
        raise HTTPException(status_code=400, detail="The minimum evaluator count cannot exceed the target")

    target_reference = db.query(Reference).filter(Reference.id == payload.target_reference_id).first()
    if not target_reference:
        raise HTTPException(status_code=400, detail="The selected reference audio does not exist")
    rows = _candidate_query(
        db,
        payload.cohort_start,
        payload.cohort_end,
        payload.target_reference_id,
    ).all()
    selected = _select_stratified(rows, payload.target_count, payload.random_seed)
    batch = ExpertEvaluationBatch(
        name=payload.name.strip(),
        description=payload.description,
        status="active",
        rubric_version=RUBRIC_VERSION,
        target_count=payload.target_count,
        duplicate_count=payload.duplicate_count,
        random_seed=payload.random_seed,
        minimum_evaluator_count=payload.minimum_evaluator_count,
        target_evaluator_count=payload.target_evaluator_count,
        target_reference_id=payload.target_reference_id,
        cohort_start=payload.cohort_start,
        cohort_end=payload.cohort_end,
        consent_confirmed_at=datetime.utcnow(),
        consent_confirmed_by=current_user.id,
        created_by=current_user.id,
    )
    db.add(batch)
    db.flush()

    items = []
    for index, (stratum, row) in enumerate(selected, start=1):
        item = ExpertEvaluationItem(
            batch_id=batch.id,
            session_id=row.session_id,
            anonymous_code=f"KNV26-{index:03d}",
            selection_stratum=stratum,
            ai_score_snapshot=float(row.score),
        )
        db.add(item)
        items.append(item)
    db.flush()

    for evaluator_index, evaluator in enumerate(sorted(evaluators, key=lambda q: str(q.id)), start=1):
        _create_evaluator_assignment(db, batch, evaluator, items, evaluator_index)

    db.add(AuditLog(
        action="create",
        entity_type="expert_evaluation_batch",
        entity_id=str(batch.id),
        user_id=current_user.id,
        new_values={
            "name": batch.name,
            "target_count": payload.target_count,
            "duplicate_count": payload.duplicate_count,
            "random_seed": payload.random_seed,
            "target_reference_id": payload.target_reference_id,
            "target_reference_title": target_reference.title,
            "minimum_evaluator_count": payload.minimum_evaluator_count,
            "target_evaluator_count": payload.target_evaluator_count,
            "consent_confirmed": True,
            "evaluator_ids": [str(value) for value in payload.evaluator_ids],
        },
    ))
    db.commit()
    return {
        "success": True,
        "batch_id": str(batch.id),
        "recordings": len(items),
        "tasks_per_evaluator": len(items) + min(batch.duplicate_count, len(items)),
    }


@router.post("/admin/batches/{batch_id}/evaluators")
def add_batch_evaluator(
    batch_id: uuid.UUID,
    payload: AddEvaluatorPayload,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    batch = db.query(ExpertEvaluationBatch).filter(ExpertEvaluationBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Validation batch not found")
    assignments = db.query(ExpertEvaluationAssignment).filter(
        ExpertEvaluationAssignment.batch_id == batch.id,
    ).all()
    if len(assignments) >= 5:
        raise HTTPException(status_code=409, detail="This batch already has the maximum of five evaluators")
    if any(assignment.evaluator_id == payload.evaluator_id for assignment in assignments):
        raise HTTPException(status_code=409, detail="This Qari is already assigned to the batch")

    evaluator = db.query(User).filter(User.id == payload.evaluator_id).first()
    if not evaluator or evaluator.role != UserRole.QARI.value or not evaluator.is_active or not evaluator.is_approved:
        raise HTTPException(status_code=400, detail="The evaluator must be an active, approved Qari account")
    items = db.query(ExpertEvaluationItem).filter(
        ExpertEvaluationItem.batch_id == batch.id,
    ).order_by(ExpertEvaluationItem.anonymous_code).all()
    if not items:
        raise HTTPException(status_code=409, detail="The batch has no frozen evaluation items")

    assignment = _create_evaluator_assignment(db, batch, evaluator, items, len(assignments) + 1)
    completed_evaluators = sum(1 for existing in assignments if existing.status == "completed")
    batch.completed_at = None
    batch.status = (
        "target_met" if completed_evaluators >= batch.target_evaluator_count
        else "minimum_met" if completed_evaluators >= batch.minimum_evaluator_count
        else "active"
    )
    db.add(AuditLog(
        action="add_evaluator",
        entity_type="expert_evaluation_batch",
        entity_id=str(batch.id),
        user_id=current_user.id,
        new_values={
            "evaluator_id": str(evaluator.id),
            "evaluator_name": evaluator.full_name or evaluator.email,
            "assignment_id": str(assignment.id),
            "evaluator_count": len(assignments) + 1,
        },
    ))
    db.commit()
    return {
        "success": True,
        "assignment_id": str(assignment.id),
        "evaluator_count": len(assignments) + 1,
        "tasks": len(items) + min(batch.duplicate_count, len(items)),
    }


@router.get("/admin/batches")
def list_admin_batches(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    batches = db.query(ExpertEvaluationBatch).order_by(ExpertEvaluationBatch.created_at.desc()).all()
    result = []
    for batch in batches:
        assignments = db.query(ExpertEvaluationAssignment).filter(ExpertEvaluationAssignment.batch_id == batch.id).all()
        evaluator_users = {
            user.id: user for user in db.query(User).filter(
                User.id.in_([assignment.evaluator_id for assignment in assignments])
            ).all()
        } if assignments else {}
        completed_evaluators = sum(1 for assignment in assignments if assignment.status == "completed")
        submitted = (
            db.query(ExpertRating)
            .join(ExpertEvaluationTask, ExpertEvaluationTask.id == ExpertRating.task_id)
            .join(ExpertEvaluationAssignment, ExpertEvaluationAssignment.id == ExpertEvaluationTask.assignment_id)
            .filter(ExpertEvaluationAssignment.batch_id == batch.id, ExpertRating.status == "submitted")
            .count()
        )
        total_tasks = (
            db.query(ExpertEvaluationTask)
            .join(ExpertEvaluationAssignment, ExpertEvaluationAssignment.id == ExpertEvaluationTask.assignment_id)
            .filter(ExpertEvaluationAssignment.batch_id == batch.id)
            .count()
        )
        result.append({
            "id": str(batch.id), "name": batch.name, "status": batch.status,
            "rubric_version": batch.rubric_version, "recording_count": batch.target_count,
            "duplicate_count": batch.duplicate_count, "evaluator_count": len(assignments),
            "completed_evaluator_count": completed_evaluators,
            "evaluators": [{
                "id": str(assignment.evaluator_id),
                "name": (
                    evaluator_users[assignment.evaluator_id].full_name
                    or evaluator_users[assignment.evaluator_id].email
                ),
                "status": assignment.status,
            } for assignment in assignments if assignment.evaluator_id in evaluator_users],
            "minimum_evaluator_count": batch.minimum_evaluator_count,
            "target_evaluator_count": batch.target_evaluator_count,
            "readiness": (
                "target_met" if completed_evaluators >= batch.target_evaluator_count
                else "minimum_met" if completed_evaluators >= batch.minimum_evaluator_count
                else "insufficient"
            ),
            "target_reference_id": batch.target_reference_id,
            "target_reference_title": (
                db.query(Reference.title).filter(Reference.id == batch.target_reference_id).scalar()
                if batch.target_reference_id else None
            ),
            "submitted_tasks": submitted, "total_tasks": total_tasks,
            "created_at": batch.created_at.isoformat(),
        })
    return {"batches": result}


@router.get("/admin/batches/{batch_id}/results")
def admin_batch_results(
    batch_id: uuid.UUID,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    batch = db.query(ExpertEvaluationBatch).filter(ExpertEvaluationBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Validation batch not found")
    rows = (
        db.query(ExpertEvaluationItem, ExpertEvaluationTask, ExpertEvaluationAssignment, ExpertRating, User)
        .join(ExpertEvaluationTask, ExpertEvaluationTask.item_id == ExpertEvaluationItem.id)
        .join(ExpertEvaluationAssignment, ExpertEvaluationAssignment.id == ExpertEvaluationTask.assignment_id)
        .join(User, User.id == ExpertEvaluationAssignment.evaluator_id)
        .outerjoin(ExpertRating, ExpertRating.task_id == ExpertEvaluationTask.id)
        .filter(ExpertEvaluationItem.batch_id == batch_id)
        .order_by(ExpertEvaluationItem.anonymous_code, User.full_name, ExpertEvaluationTask.display_order)
        .all()
    )
    return {
        "batch": {"id": str(batch.id), "name": batch.name, "rubric_version": batch.rubric_version},
        "ratings": [{
            "item_code": item.anonymous_code,
            "presentation_code": task.presentation_code,
            "is_hidden_duplicate": task.is_hidden_duplicate,
            "evaluator_id": str(assignment.evaluator_id),
            "evaluator_name": evaluator.full_name or evaluator.email,
            "ai_score": item.ai_score_snapshot,
            "weighted_total": rating.weighted_total if rating else None,
            "opened_at": task.opened_at.isoformat() if task.opened_at else None,
            "reference_played_at": task.reference_played_at.isoformat() if task.reference_played_at else None,
            "participant_played_at": task.participant_played_at.isoformat() if task.participant_played_at else None,
            "rating": _rating_payload(rating),
        } for item, task, assignment, rating, evaluator in rows],
    }


@router.get("/admin/batches/{batch_id}/evaluators/{evaluator_id}/tasks")
def admin_evaluator_tasks(
    batch_id: uuid.UUID,
    evaluator_id: uuid.UUID,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    assignment = db.query(ExpertEvaluationAssignment).filter(
        ExpertEvaluationAssignment.batch_id == batch_id,
        ExpertEvaluationAssignment.evaluator_id == evaluator_id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Evaluator assignment not found")
    evaluator = db.query(User).filter(User.id == evaluator_id).first()
    rows = (
        db.query(ExpertEvaluationTask, ExpertRating)
        .outerjoin(ExpertRating, ExpertRating.task_id == ExpertEvaluationTask.id)
        .filter(ExpertEvaluationTask.assignment_id == assignment.id)
        .order_by(ExpertEvaluationTask.display_order)
        .all()
    )
    return {
        "evaluator": {
            "id": str(evaluator_id),
            "name": (evaluator.full_name or evaluator.email) if evaluator else "Qari",
            "status": assignment.status,
        },
        "tasks": [{
            "id": str(task.id),
            "code": task.presentation_code,
            "order": task.display_order,
            "status": rating.status if rating else "pending",
            "revision_number": (rating.revision_number or 1) if rating else 1,
            "comments": rating.comments if rating else None,
            "reopen_scope": rating.reopen_scope if rating else None,
            "reopen_reason": rating.reopen_reason if rating else None,
        } for task, rating in rows],
    }


@router.post("/admin/batches/{batch_id}/evaluators/{evaluator_id}/tasks/{task_id}/reopen")
def reopen_expert_rating(
    batch_id: uuid.UUID,
    evaluator_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: ReopenRatingPayload,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ExpertEvaluationTask, ExpertEvaluationAssignment, ExpertRating)
        .join(ExpertEvaluationAssignment, ExpertEvaluationAssignment.id == ExpertEvaluationTask.assignment_id)
        .join(ExpertRating, ExpertRating.task_id == ExpertEvaluationTask.id)
        .filter(
            ExpertEvaluationTask.id == task_id,
            ExpertEvaluationAssignment.batch_id == batch_id,
            ExpertEvaluationAssignment.evaluator_id == evaluator_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Submitted evaluation was not found")
    task, assignment, rating = row
    if rating.status != "submitted":
        raise HTTPException(status_code=409, detail="Only a submitted and locked evaluation can be reopened")

    old_values = _rating_payload(rating)
    rating.status = "reopened"
    rating.revision_number = (rating.revision_number or 1) + 1
    rating.reopen_scope = payload.scope
    rating.reopen_reason = payload.reason.strip()
    rating.reopened_at = datetime.utcnow()
    rating.reopened_by = current_user.id
    assignment.status = "in_progress"
    assignment.submitted_at = None

    batch = db.query(ExpertEvaluationBatch).filter(ExpertEvaluationBatch.id == batch_id).first()
    completed_evaluators = db.query(ExpertEvaluationAssignment).filter(
        ExpertEvaluationAssignment.batch_id == batch_id,
        ExpertEvaluationAssignment.status == "completed",
    ).count()
    if batch:
        batch.completed_at = None
        batch.status = (
            "target_met" if completed_evaluators >= batch.target_evaluator_count
            else "minimum_met" if completed_evaluators >= batch.minimum_evaluator_count
            else "active"
        )

    db.add(AuditLog(
        action="reopen",
        entity_type="expert_rating",
        entity_id=str(rating.id),
        user_id=current_user.id,
        old_values=old_values,
        new_values={
            **_rating_payload(rating),
            "task_code": task.presentation_code,
            "evaluator_id": str(evaluator_id),
        },
    ))
    db.commit()
    return {
        "success": True,
        "status": rating.status,
        "revision_number": rating.revision_number,
        "scope": rating.reopen_scope,
    }


@router.get("/qari/assignments")
def qari_assignments(
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db),
):
    assignments = (
        db.query(ExpertEvaluationAssignment, ExpertEvaluationBatch)
        .join(ExpertEvaluationBatch, ExpertEvaluationBatch.id == ExpertEvaluationAssignment.batch_id)
        .filter(ExpertEvaluationAssignment.evaluator_id == current_user.id)
        .order_by(ExpertEvaluationAssignment.assigned_at.desc())
        .all()
    )
    payload = []
    for assignment, batch in assignments:
        total = db.query(ExpertEvaluationTask).filter(ExpertEvaluationTask.assignment_id == assignment.id).count()
        submitted = (
            db.query(ExpertRating)
            .join(ExpertEvaluationTask, ExpertEvaluationTask.id == ExpertRating.task_id)
            .filter(ExpertEvaluationTask.assignment_id == assignment.id, ExpertRating.status == "submitted")
            .count()
        )
        payload.append({
            "id": str(assignment.id), "batch_id": str(batch.id), "name": batch.name,
            "description": batch.description, "status": assignment.status,
            "rubric_version": batch.rubric_version, "total_tasks": total,
            "submitted_tasks": submitted, "assigned_at": assignment.assigned_at.isoformat(),
        })
    return {"assignments": payload}


@router.get("/qari/assignments/{assignment_id}")
def qari_assignment_detail(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db),
):
    assignment = db.query(ExpertEvaluationAssignment).filter(
        ExpertEvaluationAssignment.id == assignment_id,
        ExpertEvaluationAssignment.evaluator_id == current_user.id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Evaluation assignment not found")
    batch = db.query(ExpertEvaluationBatch).filter(ExpertEvaluationBatch.id == assignment.batch_id).first()
    tasks = db.query(ExpertEvaluationTask).filter(ExpertEvaluationTask.assignment_id == assignment.id).order_by(ExpertEvaluationTask.display_order).all()
    rating_by_task = {
        rating.task_id: rating for rating in db.query(ExpertRating).filter(ExpertRating.task_id.in_([task.id for task in tasks])).all()
    }
    return {
        "assignment": {"id": str(assignment.id), "name": batch.name, "status": assignment.status, "rubric_version": batch.rubric_version},
        "rubric": RUBRIC,
        "tasks": [{
            "id": str(task.id), "code": task.presentation_code, "order": task.display_order,
            "status": rating_by_task[task.id].status if task.id in rating_by_task else "pending",
        } for task in tasks],
    }


@router.get("/qari/tasks/{task_id}")
def qari_task_detail(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db),
):
    task, assignment, item, session, reference = _get_authorized_task(db, task_id, current_user.id)
    rating = db.query(ExpertRating).filter(ExpertRating.task_id == task.id).first()
    if not task.opened_at:
        task.opened_at = datetime.utcnow()
    if not assignment.started_at:
        assignment.started_at = datetime.utcnow()
        assignment.status = "in_progress"
    db.commit()
    return {
        "id": str(task.id),
        "code": task.presentation_code,
        "order": task.display_order,
        "reference": {"title": reference.title if reference else "Rakaman rujukan", "maqam": reference.maqam if reference else None},
        "participant_audio_url": f"/api/expert-validation/qari/tasks/{task.id}/participant-audio",
        "reference_audio_url": f"/api/expert-validation/qari/tasks/{task.id}/reference-audio",
        "rating": _rating_payload(rating),
    }


@router.get("/qari/tasks/{task_id}/participant-audio")
def qari_participant_audio(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db),
):
    task, assignment, item, session, reference = _get_authorized_task(db, task_id, current_user.id)
    if not task.participant_played_at:
        task.participant_played_at = datetime.utcnow()
        db.commit()
    return _serve_audio(session.cloud_storage_path, session.file_path, f"{task.presentation_code}-participant{Path(session.file_path or '.webm').suffix or '.webm'}")


@router.get("/qari/tasks/{task_id}/reference-audio")
def qari_reference_audio(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db),
):
    task, assignment, item, session, reference = _get_authorized_task(db, task_id, current_user.id)
    if not reference:
        raise HTTPException(status_code=404, detail="Reference audio is unavailable")
    if not task.reference_played_at:
        task.reference_played_at = datetime.utcnow()
        db.commit()
    return _serve_audio(reference.cloud_storage_path, reference.file_path, reference.filename or "reference-audio")


@router.put("/qari/tasks/{task_id}/rating")
def save_qari_rating(
    task_id: uuid.UUID,
    payload: RatingPayload,
    current_user: User = Depends(get_current_qari_user),
    db: Session = Depends(get_db),
):
    task, assignment, item, session, reference = _get_authorized_task(db, task_id, current_user.id)
    existing = db.query(ExpertRating).filter(ExpertRating.task_id == task.id).first()
    if existing and existing.status == "submitted":
        raise HTTPException(status_code=409, detail="This evaluation has already been submitted and locked")
    is_comments_only_revision = bool(
        existing and existing.status == "reopened" and existing.reopen_scope == "comments_only"
    )
    if payload.submit and (not task.reference_played_at or not task.participant_played_at):
        raise HTTPException(status_code=422, detail="Play both the reference and participant audio before submitting")
    rating = existing or ExpertRating(task_id=task.id, evaluator_id=current_user.id)
    old_values = _rating_payload(existing) if existing else None
    if is_comments_only_revision:
        # The API, not merely the UI, protects the original rubric and metadata.
        rating.comments = payload.comments
    else:
        total = _weighted_total(payload)
        if payload.submit and payload.audio_evaluable and total is None:
            raise HTTPException(status_code=422, detail="A complete rubric is required before submission")
        for field in (
            "melodic_contour", "pitch_control", "rhythm_continuity", "voice_stability", "tarannum_suitability",
            "audio_evaluable", "tarannum_identifiable", "confidence", "primary_issue", "comments",
        ):
            setattr(rating, field, getattr(payload, field))
        rating.weighted_total = total
    rating.status = "submitted" if payload.submit else ("reopened" if existing and existing.status == "reopened" else "draft")
    rating.submitted_at = datetime.utcnow() if payload.submit else None
    if not existing:
        db.add(rating)
    db.flush()
    db.add(AuditLog(
        action="submit" if payload.submit else "save_draft",
        entity_type="expert_rating",
        entity_id=str(rating.id),
        user_id=current_user.id,
        old_values=old_values,
        new_values=_rating_payload(rating),
    ))

    total_tasks = db.query(ExpertEvaluationTask).filter(ExpertEvaluationTask.assignment_id == assignment.id).count()
    submitted_tasks = (
        db.query(ExpertRating)
        .join(ExpertEvaluationTask, ExpertEvaluationTask.id == ExpertRating.task_id)
        .filter(ExpertEvaluationTask.assignment_id == assignment.id, ExpertRating.status == "submitted")
        .count()
    )
    # The current rating is visible after flush; mark the whole assignment complete at the finish line.
    if submitted_tasks == total_tasks:
        assignment.status = "completed"
        assignment.submitted_at = datetime.utcnow()
        batch = db.query(ExpertEvaluationBatch).filter(ExpertEvaluationBatch.id == assignment.batch_id).first()
        if batch:
            completed_evaluators = db.query(ExpertEvaluationAssignment).filter(
                ExpertEvaluationAssignment.batch_id == assignment.batch_id,
                ExpertEvaluationAssignment.status == "completed",
            ).count()
            total_evaluators = db.query(ExpertEvaluationAssignment).filter(
                ExpertEvaluationAssignment.batch_id == assignment.batch_id,
            ).count()
            if completed_evaluators >= total_evaluators:
                batch.status = "completed"
                batch.completed_at = datetime.utcnow()
            elif completed_evaluators >= batch.target_evaluator_count:
                batch.status = "target_met"
            elif completed_evaluators >= batch.minimum_evaluator_count:
                batch.status = "minimum_met"
    db.commit()
    return {"success": True, "status": rating.status, "submitted_tasks": submitted_tasks, "total_tasks": total_tasks}
