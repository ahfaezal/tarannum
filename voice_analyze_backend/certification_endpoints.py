"""HTTP API for Tarannum.ai courses and the three official certificate types."""
from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from PIL import Image

from auth import get_current_admin_user, get_current_qari_user, get_current_student_user, get_current_user
from certification_service import (
    certificate_public_payload,
    decide_application,
    recalculate_enrollment,
    required_recording_count,
    submit_competency_application,
)
from certificate_renderer import render_certificate_pdf
from database import (
    Certificate,
    CertificateEvent,
    CertificateApplication,
    CertificationNotification,
    Course,
    CourseEnrollment,
    AnalysisResult,
    QariSignature,
    Reference,
    User,
    UserSession,
    get_db,
)


router = APIRouter(prefix="/api/certification", tags=["certification"])


class CourseCreate(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    certificate_category: str
    reference_id: str
    starts_at: datetime
    duration_minutes: int = Field(default=360, ge=30, le=1440)
    location: Optional[str] = Field(default=None, max_length=240)
    completion_window_days: int = Field(default=30, ge=1, le=365)


class EnrollStudents(BaseModel):
    student_ids: List[UUID]


class AttendanceUpdate(BaseModel):
    attendance_status: str


class CompetencyApplicationCreate(BaseModel):
    session_id: UUID
    certificate_type: str


class QariDecision(BaseModel):
    decision: str
    grade: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class RevokeCertificate(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)


def _course_payload(course: Course, reference: Reference) -> dict:
    return {
        "id": str(course.id),
        "title": course.title,
        "certificate_category": course.certificate_category,
        "reference_id": course.reference_id,
        "reference_title": reference.title,
        "reference_duration_seconds": reference.duration,
        "required_practice_seconds": course.required_practice_seconds,
        "required_recording_count": required_recording_count(course.required_practice_seconds, reference.duration),
        "starts_at": course.starts_at.isoformat(),
        "duration_minutes": course.duration_minutes,
        "location": course.location,
        "completion_window_days": course.completion_window_days,
        "status": course.status,
    }


@router.post("/admin/courses")
def create_course(payload: CourseCreate, admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    if payload.certificate_category not in {"tarannum", "azan"}:
        raise HTTPException(400, "certificate_category must be tarannum or azan")
    reference = db.query(Reference).filter(Reference.id == payload.reference_id).first()
    if not reference:
        raise HTTPException(404, "Reference not found")
    course = Course(
        title=payload.title.strip(),
        certificate_category=payload.certificate_category,
        reference_id=payload.reference_id,
        starts_at=payload.starts_at,
        duration_minutes=payload.duration_minutes,
        location=payload.location,
        completion_window_days=payload.completion_window_days,
        required_practice_seconds=3600,
        status="published",
        created_by=admin.id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return _course_payload(course, reference)


@router.get("/admin/courses")
def list_courses(admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    rows = db.query(Course, Reference).join(Reference, Reference.id == Course.reference_id).order_by(Course.starts_at.desc()).all()
    return [_course_payload(course, reference) for course, reference in rows]


@router.post("/admin/courses/{course_id}/enroll")
def enroll_students(course_id: UUID, payload: EnrollStudents, admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Course not found")
    reference = db.query(Reference).filter(Reference.id == course.reference_id).first()
    required = required_recording_count(course.required_practice_seconds, reference.duration)
    created = 0
    for student_id in set(payload.student_ids):
        student = db.query(User).filter(User.id == student_id, User.role == "student").first()
        if not student:
            continue
        exists = db.query(CourseEnrollment).filter(
            CourseEnrollment.course_id == course.id,
            CourseEnrollment.student_id == student.id,
        ).first()
        if not exists:
            db.add(CourseEnrollment(course_id=course.id, student_id=student.id, required_recording_count=required))
            created += 1
    db.commit()
    return {"created": created, "required_recording_count": required}


@router.get("/admin/courses/{course_id}/enrollments")
def course_enrollments(course_id: UUID, admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    rows = (
        db.query(CourseEnrollment, User)
        .join(User, User.id == CourseEnrollment.student_id)
        .filter(CourseEnrollment.course_id == course_id)
        .order_by(User.full_name.asc(), User.email.asc())
        .all()
    )
    return [{
        "id": str(enrollment.id),
        "student_id": str(student.id),
        "student_name": student.full_name or student.email,
        "student_email": student.email,
        "attendance_status": enrollment.attendance_status,
        "valid_recording_count": enrollment.valid_recording_count,
        "required_recording_count": enrollment.required_recording_count,
        "practice_completed_at": enrollment.practice_completed_at.isoformat() if enrollment.practice_completed_at else None,
    } for enrollment, student in rows]


@router.patch("/admin/enrollments/{enrollment_id}/attendance")
def update_attendance(enrollment_id: UUID, payload: AttendanceUpdate, admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    if payload.attendance_status not in {"attended", "absent", "registered"}:
        raise HTTPException(400, "Invalid attendance status")
    enrollment = db.query(CourseEnrollment).filter(CourseEnrollment.id == enrollment_id).first()
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    enrollment.attendance_status = payload.attendance_status
    enrollment.attendance_verified_at = datetime.utcnow() if payload.attendance_status != "registered" else None
    enrollment.attendance_verified_by = admin.id if payload.attendance_status != "registered" else None
    result = recalculate_enrollment(db, enrollment, actor_id=admin.id)
    db.commit()
    return result


@router.post("/admin/enrollments/{enrollment_id}/recalculate")
def recalculate_admin(enrollment_id: UUID, admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    enrollment = db.query(CourseEnrollment).filter(CourseEnrollment.id == enrollment_id).first()
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")
    result = recalculate_enrollment(db, enrollment, actor_id=admin.id)
    db.commit()
    return result


@router.get("/student/courses")
def student_courses(student: User = Depends(get_current_student_user), db: Session = Depends(get_db)):
    enrollments = db.query(CourseEnrollment).filter(CourseEnrollment.student_id == student.id).order_by(CourseEnrollment.enrolled_at.desc()).all()
    result = []
    for enrollment in enrollments:
        progress = recalculate_enrollment(db, enrollment, actor_id=student.id)
        course = db.query(Course).filter(Course.id == enrollment.course_id).first()
        progress["title"] = course.title
        progress["starts_at"] = course.starts_at.isoformat()
        result.append(progress)
    db.commit()
    return result


@router.post("/student/competency-applications")
def create_competency_application(payload: CompetencyApplicationCreate, student: User = Depends(get_current_student_user), db: Session = Depends(get_db)):
    try:
        application = submit_competency_application(db, student, payload.session_id, payload.certificate_type)
        db.commit()
        return {"id": str(application.id), "status": application.status, "suggested_grade": application.suggested_grade}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))


@router.get("/student/competency-eligibility")
def competency_eligibility(student: User = Depends(get_current_student_user), db: Session = Depends(get_db)):
    rows = (
        db.query(UserSession, AnalysisResult, Reference, CertificateApplication)
        .join(AnalysisResult, AnalysisResult.user_session_id == UserSession.id)
        .join(Reference, Reference.id == UserSession.reference_id)
        .outerjoin(CertificateApplication, CertificateApplication.session_id == UserSession.id)
        .filter(UserSession.user_id == student.id, AnalysisResult.score >= 75)
        .order_by(AnalysisResult.score.desc(), UserSession.created_at.desc())
        .limit(50)
        .all()
    )
    return [{
        "session_id": str(session.id),
        "reference_id": reference.id,
        "reference_title": reference.title,
        "maqam": reference.maqam,
        "score": analysis.score,
        "application_id": str(application.id) if application else None,
        "application_status": application.status if application else None,
        "created_at": session.created_at.isoformat(),
    } for session, analysis, reference, application in rows]


@router.get("/qari/applications")
def qari_applications(qari: User = Depends(get_current_qari_user), db: Session = Depends(get_db)):
    rows = db.query(CertificateApplication).filter(CertificateApplication.qari_id == qari.id).order_by(CertificateApplication.submitted_at.desc()).all()
    return [{
        "id": str(row.id),
        "student_id": str(row.student_id),
        "student_name": (db.query(User).filter(User.id == row.student_id).first().full_name or "Peserta"),
        "session_id": str(row.session_id),
        "reference_id": row.reference_id,
        "certificate_type": row.certificate_type,
        "score_snapshot": row.score_snapshot,
        "suggested_grade": row.suggested_grade,
        "final_grade": row.final_grade,
        "status": row.status,
        "qari_notes": row.qari_notes,
        "submitted_at": row.submitted_at.isoformat(),
    } for row in rows]


@router.post("/qari/applications/{application_id}/decision")
def qari_decision(application_id: UUID, payload: QariDecision, qari: User = Depends(get_current_qari_user), db: Session = Depends(get_db)):
    application = db.query(CertificateApplication).filter(CertificateApplication.id == application_id).first()
    if not application:
        raise HTTPException(404, "Application not found")
    try:
        certificate = decide_application(db, application, qari, payload.decision, payload.grade, payload.notes)
        db.commit()
        return {"status": application.status, "certificate_id": str(certificate.id) if certificate else None}
    except PermissionError as exc:
        db.rollback()
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))


@router.post("/qari/signature")
async def upload_qari_signature(file: UploadFile = File(...), qari: User = Depends(get_current_qari_user), db: Session = Depends(get_db)):
    allowed = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Signature must be PNG, JPEG, or WebP")
    content = await file.read()
    if not content or len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "Signature must be between 1 byte and 2 MB")
    try:
        image = Image.open(io.BytesIO(content))
        image.verify()
        if image.width > 4000 or image.height > 4000:
            raise ValueError("Image dimensions are too large")
    except Exception as exc:
        raise HTTPException(400, f"Invalid signature image: {exc}")
    checksum = hashlib.sha256(content).hexdigest()
    directory = Path(os.getenv("CERTIFICATE_SIGNATURE_DIR", "data/private/signatures")).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{qari.id}-{checksum[:12]}{allowed[file.content_type]}"
    path.write_bytes(content)
    signature = db.query(QariSignature).filter(QariSignature.qari_id == qari.id).first()
    if signature:
        signature.storage_path = str(path)
        signature.checksum = checksum
        signature.mime_type = file.content_type
        signature.is_active = True
    else:
        signature = QariSignature(qari_id=qari.id, storage_path=str(path), checksum=checksum, mime_type=file.content_type)
        db.add(signature)
    db.commit()
    return {"uploaded": True, "checksum": checksum, "mime_type": file.content_type}


@router.get("/certificates/mine")
def my_certificates(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Certificate).filter(Certificate.student_id == current_user.id).order_by(Certificate.issued_at.desc()).all()
    return [certificate_public_payload(row) | {"id": str(row.id)} for row in rows]


@router.get("/admin/certificates")
def admin_certificates(admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    rows = db.query(Certificate).order_by(Certificate.issued_at.desc()).limit(500).all()
    return [certificate_public_payload(row) | {"id": str(row.id)} for row in rows]


@router.post("/admin/certificates/{certificate_id}/revoke")
def revoke_certificate(certificate_id: UUID, payload: RevokeCertificate, admin: User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    certificate = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not certificate:
        raise HTTPException(404, "Certificate not found")
    if certificate.status != "valid":
        raise HTTPException(409, f"Certificate status is already {certificate.status}")
    certificate.status = "revoked"
    certificate.revoked_at = datetime.utcnow()
    certificate.revocation_reason = payload.reason.strip()
    db.add(CertificateEvent(certificate_id=certificate.id, event_type="revoked", actor_id=admin.id, details_json={"reason": payload.reason.strip()}))
    db.commit()
    return {"certificate_number": certificate.certificate_number, "status": certificate.status}


@router.get("/certificates/{certificate_id}/download")
def download_certificate(certificate_id: UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    certificate = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not certificate:
        raise HTTPException(404, "Certificate not found")
    allowed = current_user.role == "admin" or certificate.student_id == current_user.id or certificate.qari_id == current_user.id
    if not allowed:
        raise HTTPException(403, "You do not have access to this certificate")
    if certificate.status != "valid":
        raise HTTPException(409, f"Certificate status is {certificate.status}")
    path = render_certificate_pdf(db, certificate)
    db.commit()
    return FileResponse(path, media_type="application/pdf", filename=f"{certificate.certificate_number}.pdf")


@router.get("/notifications")
def my_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(CertificationNotification).filter(CertificationNotification.user_id == current_user.id).order_by(CertificationNotification.created_at.desc()).limit(100).all()
    return [{
        "id": str(row.id), "type": row.notification_type, "title": row.title, "message": row.message,
        "metadata": row.metadata_json, "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat(),
    } for row in rows]


@router.get("/verify/{verification_token}")
def verify_certificate(verification_token: str, db: Session = Depends(get_db)):
    certificate = db.query(Certificate).filter(Certificate.verification_token == verification_token).first()
    if not certificate:
        raise HTTPException(404, "Certificate not found")
    return certificate_public_payload(certificate)
