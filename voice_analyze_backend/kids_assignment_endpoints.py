"""Admin API for assigning published Tarannum Kids packages to central students."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from auth import get_current_admin_user
from database import (
    KidsLearningPackage,
    KidsPackageAssignment,
    KidsPackageRun,
    User,
    get_db,
)


router = APIRouter(prefix="/api/admin/kids", tags=["kids-assignments-admin"])
ACTIVE_ASSIGNMENT_STATUSES = {"assigned", "in_progress"}
ASSIGNMENT_STATUSES = ACTIVE_ASSIGNMENT_STATUSES | {"completed", "cancelled"}


class AssignmentCreate(BaseModel):
    student_id: UUID
    package_id: UUID
    reason: Optional[str] = Field(default=None, max_length=2000)


def _validate_assignment_target(student: User, package: KidsLearningPackage) -> None:
    if student.role != "student" or not student.is_active:
        raise HTTPException(400, "Pilih akaun pelajar yang masih aktif.")
    if package.status != "published":
        raise HTTPException(400, "Hanya pakej yang telah diterbitkan boleh diberikan kepada pelajar.")


def _assignment_payload(
    assignment: KidsPackageAssignment,
    student: User,
    package: KidsLearningPackage,
    latest_run: Optional[KidsPackageRun],
) -> dict:
    return {
        "id": str(assignment.id),
        "student_id": str(assignment.student_id),
        "student_name": student.full_name or "PELAJAR",
        "student_email": student.email,
        "package_id": str(assignment.package_id),
        "package_title": package.title,
        "package_key": package.package_key,
        "package_version": package.version,
        "source": assignment.source,
        "status": assignment.status,
        "reason": assignment.reason,
        "assigned_at": assignment.assigned_at.isoformat() if assignment.assigned_at else None,
        "started_at": assignment.started_at.isoformat() if assignment.started_at else None,
        "completed_at": assignment.completed_at.isoformat() if assignment.completed_at else None,
        "latest_run": None if latest_run is None else {
            "id": str(latest_run.id),
            "status": latest_run.status,
            "valid_activity_seconds": latest_run.valid_activity_seconds,
            "started_at": latest_run.started_at.isoformat() if latest_run.started_at else None,
            "completed_at": latest_run.completed_at.isoformat() if latest_run.completed_at else None,
        },
    }


@router.get("/students")
def list_students(
    search: str = Query(default="", max_length=120),
    limit: int = Query(default=50, ge=1, le=100),
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.role == "student", User.is_active == True)
    if search.strip():
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    rows = query.order_by(User.full_name, User.email).limit(limit).all()
    return [
        {"id": str(student.id), "name": student.full_name or "PELAJAR", "email": student.email}
        for student in rows
    ]


@router.get("/assignments")
def list_assignments(
    student_id: Optional[UUID] = None,
    status: Optional[str] = Query(default=None),
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    if status and status not in ASSIGNMENT_STATUSES:
        raise HTTPException(400, "Status assignment tidak sah.")
    query = db.query(KidsPackageAssignment)
    if student_id:
        query = query.filter(KidsPackageAssignment.student_id == student_id)
    if status:
        query = query.filter(KidsPackageAssignment.status == status)
    assignments = query.order_by(KidsPackageAssignment.assigned_at.desc()).limit(200).all()
    result = []
    for assignment in assignments:
        student = db.query(User).filter(User.id == assignment.student_id).first()
        package = db.query(KidsLearningPackage).filter(KidsLearningPackage.id == assignment.package_id).first()
        if not student or not package:
            continue
        latest_run = db.query(KidsPackageRun).filter(
            KidsPackageRun.assignment_id == assignment.id
        ).order_by(KidsPackageRun.started_at.desc()).first()
        result.append(_assignment_payload(assignment, student, package, latest_run))
    return result


@router.post("/assignments")
def create_assignment(
    payload: AssignmentCreate,
    admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    student = db.query(User).filter(User.id == payload.student_id).first()
    package = db.query(KidsLearningPackage).filter(KidsLearningPackage.id == payload.package_id).first()
    if not student:
        raise HTTPException(404, "Pelajar tidak ditemui.")
    if not package:
        raise HTTPException(404, "Pakej tidak ditemui.")
    _validate_assignment_target(student, package)

    existing = db.query(KidsPackageAssignment).filter(
        KidsPackageAssignment.student_id == student.id,
        KidsPackageAssignment.package_id == package.id,
        KidsPackageAssignment.status.in_(ACTIVE_ASSIGNMENT_STATUSES),
    ).first()
    if existing:
        raise HTTPException(409, "Pelajar sudah mempunyai assignment aktif bagi pakej ini.")

    assignment = KidsPackageAssignment(
        student_id=student.id,
        package_id=package.id,
        assigned_by=admin.id,
        source="admin",
        status="assigned",
        reason=payload.reason.strip() if payload.reason else None,
        assignment_metadata={"package_version": package.version},
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return _assignment_payload(assignment, student, package, None)
