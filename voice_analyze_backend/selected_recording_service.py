"""Maintain curated student recording slots for dashboards.

The raw student audio stays attached to UserSession. This service keeps three
pointers per student/reference: lowest, median, and highest scoring recordings.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import AnalysisResult, Reference, StudentSelectedRecording, UserSession

logger = logging.getLogger(__name__)

SELECTED_RECORDING_SLOTS = ("lowest", "median", "highest")
SELECTED_RECORDING_STORAGE_POLICY = {
    "mode": "pointer_only",
    "slots_per_student_reference": 3,
    "slots": list(SELECTED_RECORDING_SLOTS),
    "deletes_audio": False,
}


class SelectedRecordingService:
    def _has_durable_recording_path(self):
        return or_(
            UserSession.file_path.isnot(None),
            UserSession.cloud_storage_path.isnot(None),
        )

    def update_selected_recordings_for_session(
        self,
        *,
        session_id: str,
        analysis_result_id: str,
        db: Session,
    ) -> List[StudentSelectedRecording]:
        """Recompute lowest/median/highest slots for the session's student/reference."""
        session_uuid = uuid.UUID(str(session_id))
        analysis_uuid = uuid.UUID(str(analysis_result_id))

        session = db.query(UserSession).filter(UserSession.id == session_uuid).first()
        analysis = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_uuid).first()

        if not session or not analysis:
            logger.warning("Selected recordings skipped: session or analysis not found")
            return []
        if not session.user_id:
            logger.info("Selected recordings skipped: unauthenticated/public session")
            return []
        if not session.reference_id:
            logger.info("Selected recordings skipped: no reference_id")
            return []
        if not session.file_path and not session.cloud_storage_path:
            logger.info("Selected recordings skipped: no durable recording path")
            return []

        rows = (
            db.query(AnalysisResult, UserSession)
            .join(UserSession, AnalysisResult.user_session_id == UserSession.id)
            .filter(
                UserSession.user_id == session.user_id,
                UserSession.reference_id == session.reference_id,
                AnalysisResult.score.isnot(None),
                self._has_durable_recording_path(),
            )
            .all()
        )
        if not rows:
            return []

        candidates = sorted(rows, key=lambda item: (float(item[0].score), item[1].created_at or datetime.min))
        selected = {
            "lowest": candidates[0],
            "highest": candidates[-1],
        }

        scores = [float(item[0].score) for item in candidates]
        middle = len(scores) // 2
        median_score = scores[middle] if len(scores) % 2 else (scores[middle - 1] + scores[middle]) / 2.0
        selected["median"] = min(
            candidates,
            key=lambda item: (
                abs(float(item[0].score) - median_score),
                item[1].created_at or datetime.min,
            ),
        )

        updated: List[StudentSelectedRecording] = []
        for slot_type, (slot_analysis, slot_session) in selected.items():
            record = self._upsert_slot(
                db=db,
                student_id=session.user_id,
                reference_id=session.reference_id,
                slot_type=slot_type,
                session=slot_session,
                analysis=slot_analysis,
            )
            updated.append(record)

        db.commit()
        for record in updated:
            db.refresh(record)
        logger.info(
            "Updated selected recording slots for student=%s reference=%s count=%d",
            session.user_id,
            session.reference_id,
            len(updated),
        )
        return updated

    def _upsert_slot(
        self,
        *,
        db: Session,
        student_id: Any,
        reference_id: str,
        slot_type: str,
        session: UserSession,
        analysis: AnalysisResult,
    ) -> StudentSelectedRecording:
        record = (
            db.query(StudentSelectedRecording)
            .filter(
                StudentSelectedRecording.student_id == student_id,
                StudentSelectedRecording.reference_id == reference_id,
                StudentSelectedRecording.slot_type == slot_type,
            )
            .first()
        )
        if not record:
            record = StudentSelectedRecording(
                student_id=student_id,
                reference_id=reference_id,
                slot_type=slot_type,
            )
            db.add(record)

        record.session_id = session.id
        record.analysis_result_id = analysis.id
        record.score = float(analysis.score)
        record.cloud_storage_path = session.cloud_storage_path or session.file_path
        record.updated_at = datetime.utcnow()
        return record

    def rebuild_student_selected_recordings(
        self,
        *,
        student_id: str,
        db: Session,
        reference_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Rebuild selected recording slots from existing scored sessions."""
        student_uuid = uuid.UUID(str(student_id))
        query = (
            db.query(AnalysisResult, UserSession)
            .join(UserSession, AnalysisResult.user_session_id == UserSession.id)
            .filter(
                UserSession.user_id == student_uuid,
                UserSession.reference_id.isnot(None),
                AnalysisResult.score.isnot(None),
                self._has_durable_recording_path(),
            )
        )
        if reference_id:
            query = query.filter(UserSession.reference_id == reference_id)

        rows = query.order_by(UserSession.reference_id.asc(), AnalysisResult.created_at.desc()).all()
        reference_groups: Dict[str, List[Any]] = {}
        for analysis, session in rows:
            reference_groups.setdefault(str(session.reference_id), []).append((analysis, session))

        updated_count = 0
        for group_rows in reference_groups.values():
            # Any session in the group can trigger a full recompute for that student/reference.
            analysis, session = group_rows[0]
            updated_count += len(
                self.update_selected_recordings_for_session(
                    session_id=str(session.id),
                    analysis_result_id=str(analysis.id),
                    db=db,
                )
            )

        return {
            "student_id": str(student_uuid),
            "reference_id": reference_id,
            "references_rebuilt": len(reference_groups),
            "slots_updated": updated_count,
        }

    def rebuild_all_selected_recordings(
        self,
        *,
        db: Session,
        limit_students: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Admin maintenance helper to rebuild slots for all students with scored sessions."""
        query = (
            db.query(UserSession.user_id)
            .join(AnalysisResult, AnalysisResult.user_session_id == UserSession.id)
            .filter(
                UserSession.user_id.isnot(None),
                UserSession.reference_id.isnot(None),
                self._has_durable_recording_path(),
                AnalysisResult.score.isnot(None),
            )
            .distinct()
        )
        if limit_students:
            query = query.limit(limit_students)

        student_ids = [row[0] for row in query.all()]
        total_references = 0
        total_slots = 0
        for student_id in student_ids:
            result = self.rebuild_student_selected_recordings(
                student_id=str(student_id),
                db=db,
            )
            total_references += int(result.get("references_rebuilt", 0))
            total_slots += int(result.get("slots_updated", 0))

        return {
            "students_rebuilt": len(student_ids),
            "references_rebuilt": total_references,
            "slots_updated": total_slots,
        }

    def get_student_selected_recordings(
        self,
        *,
        student_id: str,
        db: Session,
        reference_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        student_uuid = uuid.UUID(str(student_id))
        query = db.query(StudentSelectedRecording).filter(
            StudentSelectedRecording.student_id == student_uuid
        )
        if reference_id:
            query = query.filter(StudentSelectedRecording.reference_id == reference_id)
        records = query.order_by(
            StudentSelectedRecording.reference_id.asc(),
            StudentSelectedRecording.slot_type.asc(),
        ).all()

        by_reference: Dict[str, Dict[str, Any]] = {}
        for record in records:
            ref_key = record.reference_id or "unknown"
            if ref_key not in by_reference:
                by_reference[ref_key] = {
                    "reference_id": record.reference_id,
                    "reference": self._serialize_reference(record.reference),
                    "recordings": {},
                }
            by_reference[ref_key]["recordings"][record.slot_type] = self._serialize_selected_recording(record)

        return {
            "student_id": str(student_uuid),
            "references": list(by_reference.values()),
            "count": len(records),
            "storage_policy": SELECTED_RECORDING_STORAGE_POLICY,
        }

    def _serialize_reference(self, reference: Optional[Reference]) -> Optional[Dict[str, Any]]:
        if not reference:
            return None
        return {
            "id": reference.id,
            "title": reference.title,
            "maqam": reference.maqam,
            "filename": reference.filename,
        }

    def _serialize_selected_recording(self, record: StudentSelectedRecording) -> Dict[str, Any]:
        session = record.session
        storage_path = record.cloud_storage_path or (session.cloud_storage_path if session else None) or (session.file_path if session else None)
        storage_type = (session.cloud_storage_type if session else None) or (
            "s3" if storage_path and str(storage_path).startswith("s3://") else "local"
        )
        return {
            "slot_type": record.slot_type,
            "score": round(float(record.score), 2),
            "session_id": str(record.session_id),
            "analysis_result_id": str(record.analysis_result_id),
            "reference_id": record.reference_id,
            "audio_url": f"/api/sessions/{record.session_id}/audio",
            "duration": session.duration if session else None,
            "file_size": session.file_size if session else None,
            "cloud_storage_path": storage_path,
            "storage_type": storage_type,
            "created_at": session.created_at.isoformat() if session and session.created_at else None,
            "updated_at": record.updated_at.isoformat() if record.updated_at else None,
        }


selected_recording_service = SelectedRecordingService()
