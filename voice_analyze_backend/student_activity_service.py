"""
Append-only student activity tracking.

This service records learning activity events without changing scoring,
analysis, or student progress calculations.
"""
import logging
from datetime import datetime
from typing import Dict, Optional, Any
from uuid import UUID

from sqlalchemy import and_
from sqlalchemy.orm import Session

from database import (
    AuditLog,
    SessionLocal,
    StudentActivityEvent,
    StudentQariRelationship,
    User,
    UserRole,
)

logger = logging.getLogger(__name__)


ALLOWED_STUDENT_ACTIVITY_EVENTS = {
    "practice_started",
    "practice_stopped",
    "reference_play",
    "reference_pause",
    "recording_started",
    "recording_submitted",
    "analysis_completed",
}


class StudentActivityService:
    """Service for append-only student activity events."""

    @staticmethod
    def record_event(
        user: User,
        event_type: str,
        reference_id: Optional[str] = None,
        session_id: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        playback_position: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
        occurred_at: Optional[datetime] = None,
        db: Optional[Session] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Optional[StudentActivityEvent]:
        """Record a single append-only activity event for a student."""
        if event_type not in ALLOWED_STUDENT_ACTIVITY_EVENTS:
            raise ValueError(f"Unsupported student activity event: {event_type}")

        if not user or user.role != UserRole.STUDENT:
            return None

        db_session = db or SessionLocal()
        try:
            qari_relationship = db_session.query(StudentQariRelationship).filter(
                and_(
                    StudentQariRelationship.student_id == user.id,
                    StudentQariRelationship.is_active == True,
                )
            ).first()

            session_uuid = None
            if session_id:
                session_uuid = UUID(session_id) if isinstance(session_id, str) else session_id

            event = StudentActivityEvent(
                student_id=user.id,
                qari_id=qari_relationship.qari_id if qari_relationship else None,
                reference_id=reference_id,
                session_id=session_uuid,
                event_type=event_type,
                duration_seconds=duration_seconds,
                playback_position=playback_position,
                metadata_json=metadata or {},
                occurred_at=occurred_at or datetime.utcnow(),
            )
            db_session.add(event)
            db_session.flush()

            audit = AuditLog(
                action="student_activity_event_created",
                entity_type="student_activity_event",
                entity_id=str(event.id),
                user_id=user.id,
                old_values=None,
                new_values={
                    "event_type": event_type,
                    "reference_id": reference_id,
                    "session_id": session_id,
                    "duration_seconds": duration_seconds,
                    "playback_position": playback_position,
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
            db_session.add(audit)
            db_session.commit()
            db_session.refresh(event)

            logger.info(
                "Recorded student activity event: student=%s event=%s reference=%s",
                user.id,
                event_type,
                reference_id,
            )
            return event
        except Exception:
            db_session.rollback()
            logger.error("Failed to record student activity event", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()


student_activity_service = StudentActivityService()
