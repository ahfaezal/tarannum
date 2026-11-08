"""Student API for executing assigned Tarannum Kids learning packages.

The client never decides whether a package is complete.  It only links an
existing, server-owned assessment attempt to a package unit; this module
derives the auditable result and evaluates the Admin-authored completion
rules on the server.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_student_user
from database import (
    IqraAttempt,
    KidsLearningPackage,
    KidsPackageAssignment,
    KidsPackageRun,
    KidsPackageUnit,
    KidsPackageUnitResult,
    ScoringJob,
    User,
    get_db,
)


router = APIRouter(prefix="/api/kids/learning", tags=["kids-learning"])
ACTIVE_ASSIGNMENT_STATUSES = {"assigned", "in_progress"}


class UnitEvidenceInput(BaseModel):
    evidence_type: Literal["iqra_attempt", "scoring_job"]
    evidence_id: UUID


class UnitResultInput(BaseModel):
    evidence: UnitEvidenceInput
    client_activity_seconds: float = Field(default=0, ge=0, le=21600)


def _unit_payload(unit: KidsPackageUnit, result: KidsPackageUnitResult | None = None) -> dict:
    return {
        "id": str(unit.id),
        "unit_key": unit.unit_key,
        "sequence": unit.sequence,
        "title": unit.title,
        "instruction": unit.instruction,
        "activity_type": unit.activity_type,
        "reference_text": unit.reference_text,
        "reference_id": unit.reference_id,
        "sample_id": unit.sample_id,
        "required": bool(unit.required),
        "assessment_config": unit.assessment_config or {},
        "result": None if result is None else {
            "id": str(result.id),
            "status": result.status,
            "passed": bool(result.passed),
            "score_summary": result.score_summary or {},
            "evidence_refs": result.evidence_refs or [],
            "engine_results": result.engine_results or {},
            "valid_attempt_count": result.valid_attempt_count,
            "credited_seconds": result.credited_seconds,
            "evaluated_at": result.evaluated_at.isoformat() if result.evaluated_at else None,
        },
    }


def _run_payload(run: KidsPackageRun, db: Session) -> dict:
    package = db.query(KidsLearningPackage).filter(KidsLearningPackage.id == run.package_id).first()
    if package is None:
        raise HTTPException(409, "Pakej bagi sesi ini tidak lagi tersedia.")
    results = {
        row.unit_id: row for row in db.query(KidsPackageUnitResult).filter(
            KidsPackageUnitResult.run_id == run.id
        ).all()
    }
    units = db.query(KidsPackageUnit).filter(
        KidsPackageUnit.package_id == package.id
    ).order_by(KidsPackageUnit.sequence).all()
    return {
        "id": str(run.id),
        "assignment_id": str(run.assignment_id),
        "package_id": str(package.id),
        "package_key": package.package_key,
        "package_version": run.package_version,
        "package_title": package.title,
        "package_type": package.package_type,
        "level": package.level,
        "status": run.status,
        "completion_rules": package.completion_rules or {},
        "completion_evaluation": run.completion_evaluation or {},
        "valid_activity_seconds": run.valid_activity_seconds,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "units": [_unit_payload(unit, results.get(unit.id)) for unit in units],
    }


def _student_assignment(db: Session, assignment_id: UUID, student_id: UUID) -> KidsPackageAssignment:
    assignment = db.query(KidsPackageAssignment).filter(
        KidsPackageAssignment.id == assignment_id,
        KidsPackageAssignment.student_id == student_id,
    ).first()
    if assignment is None:
        raise HTTPException(404, "Assignment tidak ditemui.")
    return assignment


def _student_run(db: Session, run_id: UUID, student_id: UUID) -> KidsPackageRun:
    run = db.query(KidsPackageRun).filter(
        KidsPackageRun.id == run_id,
        KidsPackageRun.student_id == student_id,
    ).first()
    if run is None:
        raise HTTPException(404, "Sesi pakej tidak ditemui.")
    return run


@router.get("/assignments/active")
def active_assignments(
    student: User = Depends(get_current_student_user),
    db: Session = Depends(get_db),
):
    assignments = db.query(KidsPackageAssignment).filter(
        KidsPackageAssignment.student_id == student.id,
        KidsPackageAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES),
    ).order_by(KidsPackageAssignment.assigned_at).all()
    output = []
    for assignment in assignments:
        package = db.query(KidsLearningPackage).filter(
            KidsLearningPackage.id == assignment.package_id
        ).first()
        if package is None or package.status != "published":
            continue
        run = db.query(KidsPackageRun).filter(
            KidsPackageRun.assignment_id == assignment.id,
            KidsPackageRun.status == "in_progress",
        ).order_by(KidsPackageRun.started_at.desc()).first()
        units = db.query(KidsPackageUnit).filter(
            KidsPackageUnit.package_id == package.id
        ).order_by(KidsPackageUnit.sequence).all()
        output.append({
            "id": str(assignment.id),
            "status": assignment.status,
            "reason": assignment.reason,
            "assigned_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
            "package": {
                "id": str(package.id),
                "package_key": package.package_key,
                "version": package.version,
                "title": package.title,
                "description": package.description,
                "package_type": package.package_type,
                "level": package.level,
                "completion_rules": package.completion_rules or {},
                "units": [_unit_payload(unit) for unit in units],
            },
            "active_run": None if run is None else _run_payload(run, db),
        })
    return output


@router.post("/assignments/{assignment_id}/runs")
def start_or_resume_run(
    assignment_id: UUID,
    student: User = Depends(get_current_student_user),
    db: Session = Depends(get_db),
):
    assignment = _student_assignment(db, assignment_id, student.id)
    if assignment.status not in ACTIVE_ASSIGNMENT_STATUSES:
        raise HTTPException(409, "Assignment ini tidak lagi aktif.")
    package = db.query(KidsLearningPackage).filter(
        KidsLearningPackage.id == assignment.package_id
    ).first()
    if package is None or package.status != "published":
        raise HTTPException(409, "Pakej ini belum diterbitkan atau telah diarkibkan.")
    run = db.query(KidsPackageRun).filter(
        KidsPackageRun.assignment_id == assignment.id,
        KidsPackageRun.status == "in_progress",
    ).order_by(KidsPackageRun.started_at.desc()).first()
    if run is None:
        run = KidsPackageRun(
            assignment_id=assignment.id,
            student_id=student.id,
            package_id=package.id,
            package_version=package.version,
            status="in_progress",
        )
        db.add(run)
    if assignment.status == "assigned":
        assignment.status = "in_progress"
        assignment.started_at = assignment.started_at or datetime.utcnow()
    db.commit()
    db.refresh(run)
    return _run_payload(run, db)


def _verified_evidence(
    db: Session,
    student_id: UUID,
    unit: KidsPackageUnit,
    evidence: UnitEvidenceInput,
) -> dict:
    if evidence.evidence_type == "iqra_attempt":
        attempt = db.query(IqraAttempt).filter(
            IqraAttempt.id == evidence.evidence_id,
            IqraAttempt.student_id == student_id,
        ).first()
        if attempt is None:
            raise HTTPException(404, "Percubaan IQRA tidak ditemui.")
        if unit.activity_type != "iqra_reading" or (unit.sample_id and attempt.sample_id != unit.sample_id):
            raise HTTPException(409, "Percubaan IQRA ini tidak sepadan dengan unit pakej.")
        return {
            "passed": bool(attempt.passed and attempt.valid_attempt),
            "score_summary": {
                "unit_score": attempt.unit_score,
                "accuracy_score": attempt.accuracy_score,
                "completeness_score": attempt.completeness_score,
                "fluency_score": attempt.fluency_score,
                "pronunciation_score": attempt.pronunciation_score,
            },
            "engine_results": {
                "provider": attempt.provider,
                "word_results": attempt.word_results or [],
                "fastconformer": attempt.fastconformer_result,
                "decision_reason": attempt.decision_reason,
            },
            "credited_seconds": float(attempt.credited_seconds or 0),
            "valid_attempt": bool(attempt.valid_attempt),
        }

    job = db.query(ScoringJob).filter(
        ScoringJob.id == evidence.evidence_id,
        ScoringJob.user_id == student_id,
        ScoringJob.status == "completed",
    ).first()
    if job is None:
        raise HTTPException(404, "Keputusan Tarannum lengkap tidak ditemui.")
    if unit.activity_type == "iqra_reading" or (unit.reference_id and job.reference_id != unit.reference_id):
        raise HTTPException(409, "Keputusan Tarannum ini tidak sepadan dengan unit pakej.")
    result = job.result_json or {}
    raw_score = result.get("normalizedScore", result.get("score", 0))
    try:
        score = max(0.0, min(100.0, float(raw_score)))
    except (TypeError, ValueError):
        score = 0.0
    minimum = float((unit.assessment_config or {}).get("minimum_score", 60))
    duration = 0.0
    if job.started_at and job.completed_at:
        duration = max(0.0, (job.completed_at - job.started_at).total_seconds())
    return {
        "passed": score >= minimum,
        "score_summary": {"score": score, "minimum_score": minimum},
        "engine_results": {"provider": "tarannum", "result": result},
        "credited_seconds": duration,
        "valid_attempt": True,
    }


@router.put("/runs/{run_id}/units/{unit_id}")
def record_unit_result(
    run_id: UUID,
    unit_id: UUID,
    payload: UnitResultInput,
    student: User = Depends(get_current_student_user),
    db: Session = Depends(get_db),
):
    run = _student_run(db, run_id, student.id)
    if run.status != "in_progress":
        raise HTTPException(409, "Sesi pakej ini telah ditutup.")
    unit = db.query(KidsPackageUnit).filter(
        KidsPackageUnit.id == unit_id,
        KidsPackageUnit.package_id == run.package_id,
    ).first()
    if unit is None:
        raise HTTPException(404, "Unit pakej tidak ditemui.")
    package = db.query(KidsLearningPackage).filter(KidsLearningPackage.id == run.package_id).first()
    if package and (package.completion_rules or {}).get("require_in_sequence", True):
        earlier_required = db.query(KidsPackageUnit).filter(
            KidsPackageUnit.package_id == run.package_id,
            KidsPackageUnit.required.is_(True),
            KidsPackageUnit.sequence < unit.sequence,
        ).order_by(KidsPackageUnit.sequence).all()
        earlier_ids = [item.id for item in earlier_required]
        passed_ids = {
            row.unit_id for row in db.query(KidsPackageUnitResult).filter(
                KidsPackageUnitResult.run_id == run.id,
                KidsPackageUnitResult.unit_id.in_(earlier_ids) if earlier_ids else False,
                KidsPackageUnitResult.passed.is_(True),
            ).all()
        } if earlier_ids else set()
        missing_earlier = [item.unit_key for item in earlier_required if item.id not in passed_ids]
        if missing_earlier:
            raise HTTPException(
                409,
                "Selesaikan unit terdahulu dahulu: " + ", ".join(missing_earlier),
            )
    verified = _verified_evidence(db, student.id, unit, payload.evidence)
    result = db.query(KidsPackageUnitResult).filter(
        KidsPackageUnitResult.run_id == run.id,
        KidsPackageUnitResult.unit_id == unit.id,
    ).first()
    if result is None:
        result = KidsPackageUnitResult(run_id=run.id, unit_id=unit.id)
        db.add(result)
    refs = list(result.evidence_refs or [])
    evidence_id = str(payload.evidence.evidence_id)
    if not any(item.get("type") == payload.evidence.evidence_type and item.get("id") == evidence_id for item in refs):
        refs.append({
            "type": payload.evidence.evidence_type,
            "id": evidence_id,
            "passed": bool(verified["passed"]),
            "credited_seconds": float(verified["credited_seconds"]),
        })
    # A later weak retry must not erase a previously passed unit.  Keep the
    # best qualifying result while retaining every evidence reference for the
    # package-level audit and learning-time calculation.
    if verified["passed"] or not result.passed:
        result.status = "passed" if verified["passed"] else "needs_retry"
        result.passed = verified["passed"]
        result.score_summary = verified["score_summary"]
        result.engine_results = verified["engine_results"]
    result.evidence_refs = refs
    result.valid_attempt_count = len(refs)
    result.credited_seconds = sum(float(item.get("credited_seconds") or 0) for item in refs)
    result.evaluated_at = datetime.utcnow()
    run.valid_activity_seconds = sum(
        float(row.credited_seconds or 0) for row in db.query(KidsPackageUnitResult).filter(
            KidsPackageUnitResult.run_id == run.id
        ).all() if row.id != result.id
    ) + result.credited_seconds
    db.commit()
    db.refresh(result)
    return _unit_payload(unit, result)


def _completion_evaluation(run: KidsPackageRun, package: KidsLearningPackage, db: Session) -> dict:
    units = db.query(KidsPackageUnit).filter(
        KidsPackageUnit.package_id == package.id
    ).order_by(KidsPackageUnit.sequence).all()
    required = [unit for unit in units if unit.required]
    results = {
        row.unit_id: row for row in db.query(KidsPackageUnitResult).filter(
            KidsPackageUnitResult.run_id == run.id
        ).all()
    }
    rules = package.completion_rules or {}
    return _evaluate_completion_rows(required, results, rules)


def _evaluate_completion_rows(required: list, results: dict, rules: dict) -> dict:
    """Pure completion gate used by the API and focused unit tests."""
    minimum_attempts = int(rules.get("minimum_valid_attempts_per_unit", 1))
    pass_rate_required = float(rules.get("required_unit_pass_rate", 1.0))
    passed = [unit for unit in required if results.get(unit.id) and results[unit.id].passed]
    attempted = [unit for unit in required if results.get(unit.id) and results[unit.id].valid_attempt_count >= minimum_attempts]
    pass_rate = len(passed) / len(required) if required else 0.0
    missing = [unit.unit_key for unit in required if unit not in attempted]
    failed = [unit.unit_key for unit in required if unit in attempted and unit not in passed]
    eligible = bool(required) and not missing and pass_rate >= pass_rate_required
    return {
        "eligible_for_agent": eligible,
        "required_unit_count": len(required),
        "attempted_required_unit_count": len(attempted),
        "passed_required_unit_count": len(passed),
        "required_pass_rate": pass_rate_required,
        "actual_pass_rate": round(pass_rate, 4),
        "minimum_valid_attempts_per_unit": minimum_attempts,
        "missing_unit_keys": missing,
        "failed_unit_keys": failed,
        "evaluated_at": datetime.utcnow().isoformat(),
    }


@router.post("/runs/{run_id}/complete")
def complete_run(
    run_id: UUID,
    student: User = Depends(get_current_student_user),
    db: Session = Depends(get_db),
):
    run = _student_run(db, run_id, student.id)
    if run.status == "completed":
        return _run_payload(run, db)
    package = db.query(KidsLearningPackage).filter(KidsLearningPackage.id == run.package_id).first()
    if package is None:
        raise HTTPException(409, "Pakej bagi sesi ini tidak lagi tersedia.")
    evaluation = _completion_evaluation(run, package, db)
    run.completion_evaluation = evaluation
    if evaluation["eligible_for_agent"]:
        now = datetime.utcnow()
        run.status = "completed"
        run.completed_at = now
        assignment = _student_assignment(db, run.assignment_id, student.id)
        assignment.status = "completed"
        assignment.completed_at = now
    db.commit()
    db.refresh(run)
    return _run_payload(run, db)
