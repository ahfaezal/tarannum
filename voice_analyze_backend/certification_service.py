"""Core eligibility and issuance rules for Tarannum.ai certificates."""
from __future__ import annotations

import math
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from assessment_service import assessment_service
from database import (
    AnalysisResult,
    AuditLog,
    Certificate,
    CertificateApplication,
    CertificateEvent,
    CertificationNotification,
    Course,
    CourseEnrollment,
    QariContent,
    QariSignature,
    Reference,
    User,
    UserSession,
)


CEO_NAME = os.getenv("CERTIFICATE_CEO_NAME", "Ts. Ah Faezal Husni Hj. Arshad")
CEO_TITLE = os.getenv("CERTIFICATE_CEO_TITLE", "Ketua Pegawai Eksekutif")
CEO_ORGANIZATION = os.getenv("CERTIFICATE_CEO_ORGANIZATION", "Tarannum Technologies")
VERIFY_BASE_URL = os.getenv("CERTIFICATE_VERIFY_BASE_URL", "https://tarannum.ai/verify")
VALID_GRADES = {"mumtaz", "jayyid_jiddan", "jayyid"}


def _as_uuid(value):
    return UUID(str(value)) if value is not None and not isinstance(value, UUID) else value


def required_recording_count(required_seconds: int, reference_duration: float) -> int:
    """Return the number of complete repetitions needed to meet the target."""
    if required_seconds <= 0:
        raise ValueError("required_seconds must be positive")
    if not reference_duration or reference_duration <= 0:
        raise ValueError("Reference duration must be positive")
    return int(math.ceil(required_seconds / reference_duration))


def grade_for_score(score: float) -> str:
    if score >= 85:
        return "mumtaz"
    if score >= 80:
        return "jayyid_jiddan"
    if score >= 75:
        return "jayyid"
    raise ValueError("A minimum score of 75 is required")


def grade_label(grade: Optional[str]) -> Optional[str]:
    return {
        "mumtaz": "Mumtaz",
        "jayyid_jiddan": "Jayyid Jiddan",
        "jayyid": "Jayyid",
    }.get(grade) if grade else None


def _notify(db: Session, user_id, notification_type: str, title: str, message: str, metadata=None):
    db.add(CertificationNotification(
        user_id=_as_uuid(user_id),
        notification_type=notification_type,
        title=title,
        message=message,
        metadata_json=metadata or {},
    ))


def _audit(db: Session, action: str, entity_type: str, entity_id, actor_id=None, values=None):
    db.add(AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        user_id=_as_uuid(actor_id) if actor_id else None,
        new_values=values or {},
    ))


def _certificate_prefix(certificate_type: str) -> str:
    return {
        "attendance": "KHD",
        "competency_tarannum": "TRN",
        "competency_azan": "AZN",
    }[certificate_type]


def _new_certificate_number(db: Session, certificate_type: str) -> str:
    prefix = _certificate_prefix(certificate_type)
    year = datetime.utcnow().year
    while True:
        suffix = secrets.token_hex(4).upper()
        value = f"{prefix}-{year}-{suffix}"
        if not db.query(Certificate.id).filter(Certificate.certificate_number == value).first():
            return value


def issue_certificate(
    db: Session,
    certificate_type: str,
    student: User,
    reference: Reference,
    *,
    actor_id=None,
    course: Optional[Course] = None,
    enrollment: Optional[CourseEnrollment] = None,
    application: Optional[CertificateApplication] = None,
    qari: Optional[User] = None,
    final_grade: Optional[str] = None,
) -> Certificate:
    """Create one immutable certificate snapshot; issuance is idempotent by source."""
    query = db.query(Certificate).filter(
        Certificate.certificate_type == certificate_type,
        Certificate.student_id == student.id,
        Certificate.status == "valid",
    )
    if enrollment:
        existing = query.filter(Certificate.enrollment_id == enrollment.id).first()
    elif application:
        existing = query.filter(Certificate.application_id == application.id).first()
    else:
        existing = None
    if existing:
        return existing

    number = _new_certificate_number(db, certificate_type)
    token = secrets.token_urlsafe(24)
    snapshot = {
        "certificate_number": number,
        "certificate_type": certificate_type,
        "student_name": student.full_name or student.email,
        "reference_title": reference.title,
        "maqam": reference.maqam,
        "course_title": course.title if course else None,
        "course_date": course.starts_at.isoformat() if course else None,
        "course_duration_minutes": course.duration_minutes if course else None,
        "practice_minutes": round((course.required_practice_seconds if course else 0) / 60),
        "final_grade": grade_label(final_grade),
        "qari_name": (qari.full_name or qari.email) if qari else None,
        "ceo_name": CEO_NAME,
        "ceo_title": CEO_TITLE,
        "ceo_organization": CEO_ORGANIZATION,
        "verification_url": f"{VERIFY_BASE_URL}/{token}",
        "issued_at": datetime.utcnow().isoformat(),
    }
    certificate = Certificate(
        certificate_number=number,
        verification_token=token,
        certificate_type=certificate_type,
        student_id=student.id,
        course_id=course.id if course else None,
        enrollment_id=enrollment.id if enrollment else None,
        application_id=application.id if application else None,
        reference_id=reference.id,
        qari_id=qari.id if qari else None,
        final_grade=final_grade,
        snapshot_json=snapshot,
        issued_by=_as_uuid(actor_id) if actor_id else None,
    )
    db.add(certificate)
    db.flush()
    db.add(CertificateEvent(
        certificate_id=certificate.id,
        event_type="issued",
        actor_id=_as_uuid(actor_id) if actor_id else None,
        details_json={"certificate_number": number},
    ))
    _audit(db, "issue", "certificate", certificate.id, actor_id, snapshot)
    _notify(
        db,
        student.id,
        "certificate_issued",
        "Sijil anda telah tersedia",
        f"{number} telah dijana dan boleh disahkan melalui kod QR.",
        {"certificate_id": str(certificate.id), "certificate_number": number},
    )
    return certificate


def recalculate_enrollment(db: Session, enrollment: CourseEnrollment, actor_id=None) -> dict:
    """Recalculate valid repetitions using the canonical reference duration."""
    course = db.query(Course).filter(Course.id == enrollment.course_id).first()
    reference = db.query(Reference).filter(Reference.id == course.reference_id).first() if course else None
    if not course or not reference:
        raise ValueError("Course or reference not found")

    required = required_recording_count(course.required_practice_seconds, reference.duration)
    minimum_duration = reference.duration * 0.8
    sessions = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == enrollment.student_id,
            UserSession.reference_id == course.reference_id,
            UserSession.created_at >= course.starts_at,
            UserSession.duration >= minimum_duration,
            or_(UserSession.file_path.isnot(None), UserSession.cloud_storage_path.isnot(None)),
        )
        .order_by(UserSession.created_at.asc())
        .all()
    )

    deadline = course.starts_at + timedelta(days=course.completion_window_days)
    unique = []
    seen = set()
    for session in sessions:
        if session.created_at > deadline:
            continue
        key = session.audio_checksum or f"session:{session.id}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(session)

    old_count = enrollment.valid_recording_count or 0
    enrollment.required_recording_count = required
    enrollment.valid_recording_count = len(unique)
    enrollment.credited_practice_seconds = min(len(unique), required) * int(math.ceil(reference.duration))
    eligible = enrollment.attendance_status == "attended" and len(unique) >= required
    certificate = None
    if eligible and not enrollment.practice_completed_at:
        enrollment.practice_completed_at = datetime.utcnow()
        student = db.query(User).filter(User.id == enrollment.student_id).first()
        certificate = issue_certificate(
            db,
            "attendance",
            student,
            reference,
            actor_id=actor_id,
            course=course,
            enrollment=enrollment,
        )

    milestones = [25, 50, 75]
    old_percent = int(old_count * 100 / required) if required else 0
    new_percent = int(min(len(unique), required) * 100 / required) if required else 0
    for milestone in milestones:
        if old_percent < milestone <= new_percent:
            _notify(
                db,
                enrollment.student_id,
                "practice_progress",
                f"Latihan {milestone}% selesai",
                f"Anda telah melengkapkan {len(unique)} daripada {required} rakaman.",
                {"course_id": str(course.id), "completed": len(unique), "required": required},
            )
    old_remaining = max(0, required - old_count)
    new_remaining = max(0, required - len(unique))
    if old_remaining > 5 >= new_remaining > 0:
        _notify(
            db,
            enrollment.student_id,
            "practice_almost_complete",
            "Hanya lima rakaman lagi",
            f"Baki {new_remaining} rakaman untuk melengkapkan latihan kursus anda.",
            {"course_id": str(course.id), "remaining": new_remaining, "required": required},
        )

    return {
        "course_id": str(course.id),
        "enrollment_id": str(enrollment.id),
        "attendance_status": enrollment.attendance_status,
        "reference_duration_seconds": reference.duration,
        "required_practice_seconds": course.required_practice_seconds,
        "required_recording_count": required,
        "valid_recording_count": len(unique),
        "remaining_recording_count": max(0, required - len(unique)),
        "eligible": eligible,
        "certificate_id": str(certificate.id) if certificate else None,
        "deadline": deadline.isoformat(),
    }


def submit_competency_application(db: Session, student: User, session_id, certificate_type: str) -> CertificateApplication:
    if certificate_type not in {"competency_tarannum", "competency_azan"}:
        raise ValueError("Invalid competency certificate type")
    session = db.query(UserSession).filter(
        UserSession.id == _as_uuid(session_id), UserSession.user_id == student.id
    ).first()
    if not session:
        raise ValueError("Recording session not found")
    analysis = db.query(AnalysisResult).filter(AnalysisResult.user_session_id == session.id).first()
    if not analysis:
        raise ValueError("Recording has not been scored")
    suggested = grade_for_score(analysis.score)
    qari_id = session.qari_id
    if not qari_id:
        owner = db.query(QariContent).filter(QariContent.reference_id == session.reference_id).first()
        qari_id = owner.qari_id if owner else None
    if not qari_id:
        raise ValueError("The reference owner Qari could not be determined")
    existing = db.query(CertificateApplication).filter(CertificateApplication.session_id == session.id).first()
    if existing:
        return existing
    application = CertificateApplication(
        certificate_type=certificate_type,
        student_id=student.id,
        qari_id=qari_id,
        reference_id=session.reference_id,
        session_id=session.id,
        score_snapshot=analysis.score,
        suggested_grade=suggested,
    )
    db.add(application)
    db.flush()
    _audit(db, "submit", "certificate_application", application.id, student.id, {
        "score_snapshot": analysis.score, "suggested_grade": suggested
    })
    _notify(db, qari_id, "qari_review_requested", "Permohonan sijil baharu", "Satu rakaman menunggu semakan anda.", {
        "application_id": str(application.id)
    })
    return application


def decide_application(db: Session, application: CertificateApplication, qari: User, decision: str, grade=None, notes=None):
    if application.qari_id != qari.id:
        raise PermissionError("This application belongs to another Qari")
    if application.status != "pending":
        raise ValueError("This application has already been decided")
    if decision not in {"approved", "rejected", "resubmission_requested"}:
        raise ValueError("Invalid decision")
    if decision == "approved" and grade not in VALID_GRADES:
        raise ValueError("An approved application requires a valid final grade")
    if decision == "approved":
        signature = db.query(QariSignature).filter(
            QariSignature.qari_id == qari.id,
            QariSignature.is_active.is_(True),
        ).first()
        if not signature:
            raise ValueError("Upload an active Qari signature before approving a certificate")

    application.status = decision
    application.final_grade = grade if decision == "approved" else None
    application.qari_notes = notes
    application.decided_at = datetime.utcnow()
    certificate = None
    if decision == "approved":
        assessment_service.mark_as_assessment(str(application.session_id), str(qari.id), db=db)
        student = db.query(User).filter(User.id == application.student_id).first()
        reference = db.query(Reference).filter(Reference.id == application.reference_id).first()
        certificate = issue_certificate(
            db,
            application.certificate_type,
            student,
            reference,
            actor_id=qari.id,
            application=application,
            qari=qari,
            final_grade=grade,
        )
    else:
        _notify(db, application.student_id, "certificate_decision", "Keputusan semakan Qari", notes or "Rakaman belum diluluskan.", {
            "application_id": str(application.id), "decision": decision
        })
    _audit(db, "decide", "certificate_application", application.id, qari.id, {
        "decision": decision, "grade": grade, "notes": notes
    })
    return certificate


def certificate_public_payload(certificate: Certificate) -> dict:
    return {
        "certificate_number": certificate.certificate_number,
        "certificate_type": certificate.certificate_type,
        "status": certificate.status,
        "issued_at": certificate.issued_at.isoformat(),
        "details": certificate.snapshot_json,
    }
