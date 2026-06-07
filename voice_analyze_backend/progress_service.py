"""
Service for student progress tracking and verse-level scoring.
"""
import logging
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from uuid import UUID
from database import (
    StudentProgress, UserSession, AnalysisResult, User, SessionLocal
)

logger = logging.getLogger(__name__)


class ProgressService:
    """Service for tracking student progress and verse-level scoring."""
    
    @staticmethod
    def save_progress(
        student_id: str,
        session_id: str,
        overall_score: float,
        qari_id: Optional[str] = None,
        reference_id: Optional[str] = None,
        verse_scores: Optional[List[Dict]] = None,
        segments: Optional[List[Dict]] = None,
        db: Optional[Session] = None
    ) -> StudentProgress:
        """Save student progress with verse-level scoring."""
        db_session = db or SessionLocal()
        try:
            student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
            session_uuid = UUID(session_id) if isinstance(session_id, str) else session_id
            qari_uuid = UUID(qari_id) if isinstance(qari_id, str) else qari_id if qari_id else None
            
            # Get previous score for improvement calculation
            previous = db_session.query(StudentProgress).filter(
                StudentProgress.student_id == student_uuid
            ).order_by(desc(StudentProgress.created_at)).first()
            
            previous_score = previous.overall_score if previous else None
            improvement = overall_score - previous_score if previous_score else None
            
            # Extract verse scores from segments if not provided
            if not verse_scores and segments:
                verse_scores = []
                for seg in segments:
                    verse_scores.append({
                        "start": seg.get("start", 0),
                        "end": seg.get("end", 0),
                        "score": seg.get("score", 0),
                        "text": seg.get("text", "")
                    })
            
            # Identify weakest verses (bottom 20%)
            weakest_verses = []
            if verse_scores:
                sorted_verses = sorted(verse_scores, key=lambda x: x.get("score", 0))
                weakest_count = max(1, len(sorted_verses) // 5)  # Bottom 20%
                weakest_verses = sorted_verses[:weakest_count]
            
            # Create progress record
            progress = StudentProgress(
                student_id=student_uuid,
                session_id=session_uuid,
                qari_id=qari_uuid,
                reference_id=reference_id,
                overall_score=overall_score,
                verse_scores=verse_scores,
                previous_score=previous_score,
                improvement=improvement,
                weakest_verses=weakest_verses
            )
            
            db_session.add(progress)
            db_session.commit()
            db_session.refresh(progress)
            
            logger.info(f"Saved progress for student {student_id}: score {overall_score}")
            return progress
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error saving progress: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_student_progress(
        student_id: str,
        limit: int = 50,
        db: Optional[Session] = None
    ) -> List[Dict]:
        """Get all progress records for a student."""
        db_session = db or SessionLocal()
        try:
            student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
            progress_records = db_session.query(StudentProgress).filter(
                StudentProgress.student_id == student_uuid
            ).order_by(desc(StudentProgress.created_at)).limit(limit).all()
            
            result = []
            for progress in progress_records:
                session = db_session.query(UserSession).filter(UserSession.id == progress.session_id).first()
                result.append({
                    "id": str(progress.id),
                    "session_id": str(progress.session_id),
                    "overall_score": progress.overall_score,
                    "previous_score": progress.previous_score,
                    "improvement": progress.improvement,
                    "verse_scores": progress.verse_scores,
                    "weakest_verses": progress.weakest_verses,
                    "reference_id": progress.reference_id,
                    "created_at": progress.created_at.isoformat() if progress.created_at else None,
                    "file_path": session.file_path if session else None
                })
            
            return result
            
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_student_statistics(
        student_id: str,
        db: Optional[Session] = None
    ) -> Dict:
        """Get comprehensive statistics for a student."""
        db_session = db or SessionLocal()
        try:
            student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
            
            # Get all progress records
            all_progress = db_session.query(StudentProgress).filter(
                StudentProgress.student_id == student_uuid
            ).order_by(desc(StudentProgress.created_at)).all()
            
            if not all_progress:
                return {
                    "total_sessions": 0,
                    "average_score": 0,
                    "best_score": 0,
                    "latest_score": 0,
                    "improvement_trend": [],
                    "weakest_verses": []
                }
            
            scores = [p.overall_score for p in all_progress]
            improvements = [p.improvement for p in all_progress if p.improvement is not None]
            
            # Aggregate weakest verses across all sessions
            all_weakest = []
            for progress in all_progress:
                if progress.weakest_verses:
                    all_weakest.extend(progress.weakest_verses)
            
            # Count verse occurrences
            verse_counts = {}
            for verse in all_weakest:
                verse_text = verse.get("text", "")
                if verse_text:
                    verse_counts[verse_text] = verse_counts.get(verse_text, 0) + 1
            
            # Get top 5 most frequently weak verses
            top_weakest = sorted(verse_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            
            return {
                "total_sessions": len(all_progress),
                "average_score": sum(scores) / len(scores) if scores else 0,
                "best_score": max(scores) if scores else 0,
                "latest_score": scores[0] if scores else 0,
                "improvement_trend": improvements[-10:] if improvements else [],  # Last 10 improvements
                "weakest_verses": [{"text": text, "frequency": count} for text, count in top_weakest]
            }
            
        finally:
            if not db:
                db_session.close()


# Global instance
progress_service = ProgressService()
