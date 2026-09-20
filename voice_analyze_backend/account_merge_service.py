"""Audited consolidation of a temporary student account into its owner account."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from database import AuditLog, CourseEnrollment, User


OWNER_COLUMNS = (
    ("certificate_applications", "student_id"),
    ("certificates", "student_id"),
    ("certification_notifications", "user_id"),
    ("promotion_registrations", "user_id"),
    ("scoring_jobs", "user_id"),
    ("student_activity_events", "student_id"),
    ("student_progress", "student_id"),
    ("student_selected_recordings", "student_id"),
    ("student_qari_relationships", "student_id"),
    ("user_sessions", "user_id"),
)


def merge_student_accounts(db: Session, source: User, target: User, actor: User) -> dict:
    """Move learning ownership to target and deactivate source atomically."""
    if source.id == target.id:
        raise ValueError("Source and target accounts must be different")
    if source.role != "student" or target.role != "student":
        raise ValueError("Only student accounts can be merged")
    if not target.is_active:
        raise ValueError("The destination account must be active")

    connection = db.connection()
    # Serialize any competing merge touching either account.
    if connection.dialect.name == "postgresql":
        connection.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
            {"key": f"student-account-merge:{min(str(source.id), str(target.id))}:{max(str(source.id), str(target.id))}"},
        )

    before = {
        "source_email": source.email,
        "target_email": target.email,
        "source_sessions": connection.execute(
            text("SELECT COUNT(*) FROM user_sessions WHERE user_id=:id"), {"id": source.id}
        ).scalar_one(),
        "target_sessions": connection.execute(
            text("SELECT COUNT(*) FROM user_sessions WHERE user_id=:id"), {"id": target.id}
        ).scalar_one(),
    }

    # One student can only have one enrollment per course. Consolidate the
    # source row into the destination row before moving all remaining rows.
    collisions = connection.execute(text("""
        SELECT source.id AS source_id, target.id AS target_id
        FROM course_enrollments source
        JOIN course_enrollments target ON target.course_id=source.course_id
        WHERE source.student_id=:source_id AND target.student_id=:target_id
        FOR UPDATE
    """), {"source_id": source.id, "target_id": target.id}).mappings().all()
    for row in collisions:
        connection.execute(text("""
            UPDATE certificates SET enrollment_id=:target_enrollment
            WHERE enrollment_id=:source_enrollment
        """), {"target_enrollment": row["target_id"], "source_enrollment": row["source_id"]})
        connection.execute(text("""
            UPDATE course_enrollments target SET
              attendance_status=CASE WHEN source.attendance_status='attended' THEN 'attended' ELSE target.attendance_status END,
              valid_recording_count=GREATEST(target.valid_recording_count, source.valid_recording_count),
              credited_practice_seconds=GREATEST(target.credited_practice_seconds, source.credited_practice_seconds),
              eligibility_override=target.eligibility_override OR source.eligibility_override,
              updated_at=NOW()
            FROM course_enrollments source
            WHERE target.id=:target_enrollment AND source.id=:source_enrollment
        """), {"target_enrollment": row["target_id"], "source_enrollment": row["source_id"]})
        connection.execute(text("DELETE FROM course_enrollments WHERE id=:id"), {"id": row["source_id"]})

    connection.execute(text("""
        UPDATE course_enrollments SET student_id=:target_id, updated_at=NOW()
        WHERE student_id=:source_id
    """), {"target_id": target.id, "source_id": source.id})

    connection.execute(text("""
        DELETE FROM training_challenge_participants source
        USING training_challenge_participants target
        WHERE source.student_id=:source_id AND target.student_id=:target_id
          AND source.challenge_id=target.challenge_id
    """), {"source_id": source.id, "target_id": target.id})
    connection.execute(text("""
        UPDATE training_challenge_participants SET student_id=:target_id
        WHERE student_id=:source_id
    """), {"target_id": target.id, "source_id": source.id})

    moved = {}
    for table_name, column_name in OWNER_COLUMNS:
        result = connection.execute(
            text(f'UPDATE "{table_name}" SET "{column_name}"=:target_id WHERE "{column_name}"=:source_id'),
            {"target_id": target.id, "source_id": source.id},
        )
        moved[f"{table_name}.{column_name}"] = result.rowcount

    source.is_active = False
    source.is_approved = False
    if not target.full_name and source.full_name:
        target.full_name = source.full_name

    after_source_sessions = connection.execute(
        text("SELECT COUNT(*) FROM user_sessions WHERE user_id=:id"), {"id": source.id}
    ).scalar_one()
    after_target_sessions = connection.execute(
        text("SELECT COUNT(*) FROM user_sessions WHERE user_id=:id"), {"id": target.id}
    ).scalar_one()
    if after_source_sessions != 0 or after_target_sessions != before["source_sessions"] + before["target_sessions"]:
        raise RuntimeError("Session reconciliation failed; merge was rolled back")

    summary = {
        "source_deactivated": True,
        "target_email": target.email,
        "moved": moved,
        "target_sessions": after_target_sessions,
    }
    db.add(AuditLog(
        action="merge_student_account",
        entity_type="user",
        entity_id=str(target.id),
        user_id=actor.id,
        old_values=before,
        new_values=summary,
    ))
    db.commit()
    return summary
