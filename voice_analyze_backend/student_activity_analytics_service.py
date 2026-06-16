"""
Student activity analytics for Student Progress V2.

This service summarizes append-only student_activity_events without changing
existing scoring or progress calculations.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from database import StudentActivityEvent, StudentQariRelationship, User


EVENT_TYPES = {
    "practice_started",
    "practice_stopped",
    "reference_play",
    "reference_pause",
    "recording_started",
    "recording_submitted",
    "analysis_completed",
}


def _event_timestamp(event: StudentActivityEvent) -> datetime:
    return event.occurred_at or event.created_at


def _event_date(event: StudentActivityEvent) -> date:
    return _event_timestamp(event).date()


def _sum_practice_seconds(events: List[StudentActivityEvent]) -> float:
    """
    Sum practice duration from practice_stopped events.

    Prefer explicit duration_seconds. If missing, pair the stop with the latest
    unmatched practice_started event in the ordered stream. If no safe pair
    exists, the stop contributes 0.
    """
    total_seconds = 0.0
    active_start: Optional[datetime] = None

    for event in sorted(events, key=_event_timestamp):
        if event.event_type == "practice_started":
            active_start = _event_timestamp(event)
            continue

        if event.event_type != "practice_stopped":
            continue

        if event.duration_seconds is not None:
            total_seconds += max(float(event.duration_seconds), 0.0)
            active_start = None
            continue

        if active_start:
            delta_seconds = (_event_timestamp(event) - active_start).total_seconds()
            if delta_seconds > 0:
                total_seconds += delta_seconds
            active_start = None

    return total_seconds


def _calculate_practice_streak_days(events: List[StudentActivityEvent]) -> int:
    practice_dates = {
        _event_date(event)
        for event in events
        if event.event_type == "practice_started"
    }
    if not practice_dates:
        return 0

    today = datetime.utcnow().date()
    cursor = today if today in practice_dates else today - timedelta(days=1)
    streak = 0

    while cursor in practice_dates:
        streak += 1
        cursor -= timedelta(days=1)

    return streak


def _serialize_recent_event(event: StudentActivityEvent) -> Dict[str, Any]:
    return {
        "event_type": event.event_type,
        "created_at": event.created_at.isoformat() if event.created_at else None,
        "reference_id": event.reference_id,
        "duration_seconds": event.duration_seconds,
        "metadata": event.metadata_json,
    }


class StudentActivityAnalyticsService:
    """Analytics queries over append-only student activity events."""

    @staticmethod
    def _build_summary(
        student: User,
        events: List[StudentActivityEvent],
        recent_events: List[StudentActivityEvent],
        qari_context: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        counts = {
            event_type: sum(1 for event in events if event.event_type == event_type)
            for event_type in EVENT_TYPES
        }
        total_practice_seconds = _sum_practice_seconds(events)
        today = datetime.utcnow().date()
        last_7_dates = [today - timedelta(days=offset) for offset in range(6, -1, -1)]
        events_by_date: Dict[date, List[StudentActivityEvent]] = defaultdict(list)
        for event in events:
            event_day = _event_date(event)
            if event_day in last_7_dates:
                events_by_date[event_day].append(event)

        weekly_activity = []
        for activity_date in last_7_dates:
            day_events = events_by_date.get(activity_date, [])
            weekly_activity.append(
                {
                    "date": activity_date.isoformat(),
                    "practice_sessions": sum(
                        1 for event in day_events if event.event_type == "practice_started"
                    ),
                    "practice_minutes": round(_sum_practice_seconds(day_events) / 60, 2),
                    "recordings": sum(
                        1 for event in day_events if event.event_type == "recording_submitted"
                    ),
                }
            )

        return {
            "total_practice_sessions": counts["practice_started"],
            "total_practice_minutes": round(total_practice_seconds / 60, 2),
            "total_reference_plays": counts["reference_play"],
            "total_recordings_started": counts["recording_started"],
            "total_recordings_submitted": counts["recording_submitted"],
            "total_analysis_completed": counts["analysis_completed"],
            "practice_streak_days": _calculate_practice_streak_days(events),
            "last_practice_at": max(
                (
                    _event_timestamp(event)
                    for event in events
                    if event.event_type == "practice_started"
                ),
                default=None,
            ).isoformat()
            if any(event.event_type == "practice_started" for event in events)
            else None,
            "weekly_activity": weekly_activity,
            "recent_activity": [_serialize_recent_event(event) for event in recent_events],
            "qari": qari_context,
        }

    @staticmethod
    def get_activity_summary(student: User, db: Session) -> Dict[str, Any]:
        events = (
            db.query(StudentActivityEvent)
            .filter(StudentActivityEvent.student_id == student.id)
            .order_by(StudentActivityEvent.occurred_at.asc(), StudentActivityEvent.created_at.asc())
            .all()
        )
        recent_events = (
            db.query(StudentActivityEvent)
            .filter(StudentActivityEvent.student_id == student.id)
            .order_by(StudentActivityEvent.created_at.desc())
            .limit(20)
            .all()
        )
        active_relationship = (
            db.query(StudentQariRelationship)
            .filter(
                and_(
                    StudentQariRelationship.student_id == student.id,
                    StudentQariRelationship.is_active == True,
                )
            )
            .first()
        )

        qari_context = None
        if active_relationship:
            qari = db.query(User).filter(User.id == active_relationship.qari_id).first()
            if qari:
                qari_context = {
                    "qari_id": str(qari.id),
                    "qari_name": qari.full_name or qari.email,
                }

        return StudentActivityAnalyticsService._build_summary(student, events, recent_events, qari_context)

    @staticmethod
    def get_qari_student_activity_summary(student: User, qari: User, db: Session) -> Dict[str, Any]:
        """Summarize a student's activity for their assigned Qari.

        Legacy events with qari_id NULL are included only after the caller verifies
        the student currently has an active relationship with this Qari.
        """
        filters = and_(
            StudentActivityEvent.student_id == student.id,
            or_(
                StudentActivityEvent.qari_id == qari.id,
                StudentActivityEvent.qari_id.is_(None),
            ),
        )
        events = (
            db.query(StudentActivityEvent)
            .filter(filters)
            .order_by(StudentActivityEvent.occurred_at.asc(), StudentActivityEvent.created_at.asc())
            .all()
        )
        recent_events = (
            db.query(StudentActivityEvent)
            .filter(filters)
            .order_by(StudentActivityEvent.created_at.desc())
            .limit(20)
            .all()
        )
        qari_context = {
            "qari_id": str(qari.id),
            "qari_name": qari.full_name or qari.email,
        }
        summary = StudentActivityAnalyticsService._build_summary(student, events, recent_events, qari_context)
        practice_sessions = summary["total_practice_sessions"]
        recordings_submitted = summary["total_recordings_submitted"]

        if practice_sessions == 0 and recordings_submitted == 0:
            pattern = "new_student"
            recommendation = "Student has not started tracked practice yet."
        elif practice_sessions == 0 and recordings_submitted > 0:
            pattern = "needs_practice"
            recommendation = "Student has assessment records but limited tracked practice."
        elif recordings_submitted > practice_sessions:
            pattern = "assessment_heavy"
            recommendation = "Student records often. Encourage more reference listening before submitting."
        elif practice_sessions >= recordings_submitted * 3:
            pattern = "consistent"
            recommendation = "Student is practicing consistently before assessment."
        else:
            pattern = "needs_practice"
            recommendation = "Encourage more reference listening before assessment."

        summary.update({
            "student_id": str(student.id),
            "qari_id": str(qari.id),
            "coaching_snapshot": {
                "practice_to_assessment_ratio": round(practice_sessions / recordings_submitted, 2)
                if recordings_submitted else float(practice_sessions),
                "learning_pattern": pattern,
                "recommendation": recommendation,
            },
        })
        return summary


student_activity_analytics_service = StudentActivityAnalyticsService()
