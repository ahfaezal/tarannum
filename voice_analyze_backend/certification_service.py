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

from certificate_display import certificate_display_snapshot
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


CEO_NAME = os.getenv("CERTIFICATE_CEO_NAME", "Ts. Ah Faezal Husni bin Hj. Arshad")
CEO_TITLE = os.getenv("CERTIFICATE_CEO_TITLE", "Ketua Pegawai Eksekutif")
CEO_ORGANIZATION = os.getenv("CERTIFICATE_CEO_ORGANIZATION", "Tarannum Technologies")
VERIFY_BASE_URL = os.getenv("CERTIFICATE_VERIFY_BASE_URL", "https://tarannum.ai/verify")
VALID_GRADES = {"mumtaz", "jayyid_jiddan", "jayyid"}
QARI_RUBRIC_WEIGHTS = {
    "lafaz_completion": 0.15,
    "pronunciation": 0.20,
    "melodic_contour": 0.15,
    "contour_detail": 0.10,
    "pitch_control": 0.10,
    "timing": 0.10,
    "vocal_breath": 0.10,
    "overall_azan": 0.10,
}


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


def calculate_qari_score(assessment: dict) -> float:
    """Convert the complete 1–5 human rubric into a weighted percentage."""
    if set(assessment) != set(QARI_RUBRIC_WEIGHTS):
        raise ValueError("Semua elemen penilaian qari mesti dilengkapkan")
    score = 0.0
    for key, weight in QARI_RUBRIC_WEIGHTS.items():
        rating = assessment.get(key)
        if isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= rating <= 5:
            raise ValueError("Setiap elemen penilaian qari mesti diberi skala 1 hingga 5")
        score += (rating / 5.0) * 100.0 * weight
    return round(score, 2)


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
        "student_name": (student.full_name or student.email).upper(),
        "reference_title": reference.title,
        "maqam": reference.maqam,
        "course_title": course.title if course else None,
        "course_date": course.starts_at.isoformat() if course else None,
        "course_duration_minutes": course.duration_minutes if course else None,
        "practice_minutes": round((course.required_practice_seconds if course else 0) / 60),
        "final_grade": grade_label(final_grade),
        "qari_name": (qari.full_name or qari.email) if qari else None,
        "qari_title": (db.query(QariSignature.signer_title).filter(QariSignature.qari_id == qari.id).scalar() if qari else None),
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
    attempted_sessions = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == enrollment.student_id,
            UserSession.reference_id == course.reference_id,
            UserSession.created_at >= course.starts_at,
            or_(UserSession.file_path.isnot(None), UserSession.cloud_storage_path.isnot(None)),
        )
        .order_by(UserSession.created_at.asc())
        .all()
    )

    deadline = course.starts_at + timedelta(days=course.completion_window_days)
    unique = []
    attempted_within_window = []
    seen = set()
    for session in attempted_sessions:
        if session.created_at > deadline:
            continue
        attempted_within_window.append(session)
        key = session.audio_checksum or f"session:{session.id}"
        if key in seen:
            continue
        seen.add(key)
        if (session.duration or 0) < minimum_duration:
            continue
        unique.append(session)

    old_count = enrollment.valid_recording_count or 0
    actual_valid_count = len(unique)
    credited_count = required if enrollment.eligibility_override else actual_valid_count
    enrollment.required_recording_count = required
    enrollment.valid_recording_count = credited_count
    enrollment.credited_practice_seconds = min(credited_count, required) * int(math.ceil(reference.duration))
    eligible = enrollment.attendance_status == "attended" and credited_count >= required
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
    new_percent = int(min(credited_count, required) * 100 / required) if required else 0
    for milestone in milestones:
        if old_percent < milestone <= new_percent:
            _notify(
                db,
                enrollment.student_id,
                "practice_progress",
                f"Latihan {milestone}% selesai",
                f"Anda telah melengkapkan {credited_count} daripada {required} rakaman.",
                {"course_id": str(course.id), "completed": credited_count, "required": required},
            )
    old_remaining = max(0, required - old_count)
    new_remaining = max(0, required - credited_count)
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
        "attempted_recording_count": len(attempted_within_window),
        "actual_valid_recording_count": actual_valid_count,
        "uncredited_recording_count": max(0, len(attempted_within_window) - actual_valid_count),
        "minimum_recording_duration_seconds": round(minimum_duration, 1),
        "valid_recording_count": credited_count,
        "remaining_recording_count": max(0, required - credited_count),
        "eligible": eligible,
        "eligibility_override": bool(enrollment.eligibility_override),
        "certificate_id": str(certificate.id) if certificate else None,
        "deadline": deadline.isoformat(),
    }


def submit_competency_application(db: Session, student: User, session_id, certificate_type: str, course_id=None) -> CertificateApplication:
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
    # Managed-course assessments require enrollment, verified attendance and 60-minute completion.
    courses = db.query(Course).filter(Course.reference_id == session.reference_id,
        Course.qari_id.isnot(None), Course.starts_at <= session.created_at).order_by(Course.starts_at.desc()).all()
    relevant = [c for c in courses if session.created_at <= c.starts_at + timedelta(days=c.completion_window_days)]
    course = None
    if course_id:
        course = next((c for c in relevant if c.id == _as_uuid(course_id)), None)
        if not course: raise ValueError('Recording does not belong to this course reference or training window')
    elif relevant:
        enrolled = {r[0] for r in db.query(CourseEnrollment.course_id).filter(
            CourseEnrollment.student_id == student.id, CourseEnrollment.course_id.in_([c.id for c in relevant])).all()}
        course = next((c for c in relevant if c.id in enrolled), None)
        if not course: raise ValueError('Only enrolled course participants may apply for this assessment')
    if course:
        enrollment = db.query(CourseEnrollment).filter(CourseEnrollment.course_id == course.id,
            CourseEnrollment.student_id == student.id).first()
        if not enrollment or not recalculate_enrollment(db, enrollment, actor_id=student.id)['eligible']:
            raise ValueError('Verified attendance and 60 minutes of course practice are required')
        expected = 'competency_azan' if course.certificate_category == 'azan' else 'competency_tarannum'
        if certificate_type != expected: raise ValueError('Certificate type does not match course category')
    qari_id = session.qari_id
    if course: qari_id = course.qari_id
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
        course_id=course.id if course else None,
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


def decide_application(db: Session, application: CertificateApplication, qari: User, decision: str,
                       grade=None, notes=None, assessment=None, critical_error=False):
    if application.qari_id != qari.id:
        raise PermissionError("This application belongs to another Qari")
    if application.status != "pending":
        raise ValueError("This application has already been decided")
    if decision not in {"approved", "rejected", "resubmission_requested"}:
        raise ValueError("Invalid decision")
    qari_score = calculate_qari_score(assessment or {})
    if decision != "approved" and not (notes or "").strip():
        raise ValueError("Catatan qari diperlukan untuk keputusan ini")
    if decision == "approved" and critical_error:
        raise ValueError("Rakaman dengan kesilapan kritikal tidak boleh diluluskan")
    if decision == "approved" and qari_score < 75:
        raise ValueError("Skor penilaian qari mesti sekurang-kurangnya 75 untuk kelulusan")
    if decision == "approved":
        grade = grade_for_score(qari_score)
    if decision == "approved":
        if application.course_id:
            enrollment = db.query(CourseEnrollment).filter(CourseEnrollment.course_id == application.course_id,
                CourseEnrollment.student_id == application.student_id).first()
            if not enrollment or not recalculate_enrollment(db, enrollment, actor_id=qari.id)['eligible']:
                raise ValueError('Course attendance and 60 minutes of practice must remain verified')
        signature = db.query(QariSignature).filter(
            QariSignature.qari_id == qari.id,
            QariSignature.is_active.is_(True),
        ).first()
        if not signature:
            raise ValueError("Upload an active Qari signature before approving a certificate")

    application.status = decision
    application.final_grade = grade if decision == "approved" else None
    application.qari_notes = notes
    application.qari_assessment_json = assessment
    application.qari_score = qari_score
    application.critical_error = bool(critical_error)
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
            course=db.query(Course).filter(Course.id == application.course_id).first() if application.course_id else None,
        )
    else:
        _notify(db, application.student_id, "certificate_decision", "Keputusan semakan Qari", notes or "Rakaman belum diluluskan.", {
            "application_id": str(application.id), "decision": decision
        })
    _audit(db, "decide", "certificate_application", application.id, qari.id, {
        "decision": decision, "grade": grade, "notes": notes,
        "qari_score": qari_score, "critical_error": bool(critical_error),
        "assessment": assessment,
    })
    return certificate


def certificate_public_payload(certificate: Certificate) -> dict:
    return {
        "certificate_number": certificate.certificate_number,
        "certificate_type": certificate.certificate_type,
        "status": certificate.status,
        "issued_at": certificate.issued_at.isoformat(),
        "details": certificate_display_snapshot(certificate),
    }
