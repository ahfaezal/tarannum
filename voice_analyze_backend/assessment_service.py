"""
Service for marking sessions as assessments (certification-grade).
Ensures data immutability for official competency certification.
"""
from database import UserSession, StudentProgress, AnalysisResult, AuditLog, SessionLocal
from sqlalchemy.orm import Session
from sqlalchemy import and_
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict
import logging

logger = logging.getLogger(__name__)


class AssessmentService:
    """Manages assessment/certification sessions with immutability."""
    
    @staticmethod
    def mark_as_assessment(
        session_id: str,
        marked_by_user_id: str,
        db: Optional[Session] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> bool:
        """
        Mark a session as assessment (immutable).
        
        Once marked, the session and its related data cannot be modified.
        This is required for certification-grade data integrity.
        
        Args:
            session_id: UUID of the session to mark
            marked_by_user_id: UUID of the user (Admin/Qari) marking it
            db: Database session (optional)
            ip_address: IP address of the request (optional)
            user_agent: User agent string (optional)
        
        Returns:
            True if successful
        
        Raises:
            ValueError: If session not found or already immutable
        """
        db_session = db or SessionLocal()
        try:
            session_uuid = UUID(session_id) if isinstance(session_id, str) else session_id
            user_uuid = UUID(marked_by_user_id) if isinstance(marked_by_user_id, str) else marked_by_user_id
            
            session = db_session.query(UserSession).filter(UserSession.id == session_uuid).first()
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            if session.is_immutable:
                raise ValueError(f"Session {session_id} is already immutable and cannot be modified")
            
            # Get old values for audit log
            old_values = {
                "is_assessment": session.is_assessment,
                "is_immutable": session.is_immutable
            }
            
            # Create audit log BEFORE making changes
            audit = AuditLog(
                action="mark_assessment",
                entity_type="session",
                entity_id=str(session.id),
                user_id=user_uuid,
                old_values=old_values,
                new_values={"is_assessment": True, "is_immutable": True},
                ip_address=ip_address,
                user_agent=user_agent
            )
            db_session.add(audit)
            
            # Mark session as assessment and immutable
            session.is_assessment = True
            session.is_immutable = True
            session.assessment_marked_at = datetime.utcnow()
            session.assessment_marked_by = user_uuid
            
            # Mark related progress records as immutable
            progress_records = db_session.query(StudentProgress).filter(
                StudentProgress.session_id == session_uuid
            ).all()
            
            for progress in progress_records:
                if not progress.is_immutable:
                    # Audit log for progress immutability
                    progress_audit = AuditLog(
                        action="mark_immutable",
                        entity_type="progress",
                        entity_id=str(progress.id),
                        user_id=user_uuid,
                        old_values={"is_immutable": False},
                        new_values={"is_immutable": True},
                        ip_address=ip_address,
                        user_agent=user_agent
                    )
                    db_session.add(progress_audit)
                    progress.is_immutable = True
            
            db_session.commit()
            logger.info(f"Session {session_id} marked as assessment (immutable)")
            return True
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error marking session as assessment: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def protect_immutable_data(
        entity_type: str,
        entity_id: str,
        db: Optional[Session] = None
    ) -> bool:
        """
        Check if entity is immutable and prevent modification.
        
        Args:
            entity_type: Type of entity ('session', 'progress', 'analysis')
            entity_id: UUID of the entity
        
        Returns:
            True if entity is immutable (cannot be modified)
        """
        db_session = db or SessionLocal()
        try:
            entity_uuid = UUID(entity_id) if isinstance(entity_id, str) else entity_id
            
            if entity_type == "session":
                session = db_session.query(UserSession).filter(
                    UserSession.id == entity_uuid
                ).first()
                return session.is_immutable if session else False
            
            elif entity_type == "progress":
                progress = db_session.query(StudentProgress).filter(
                    StudentProgress.id == entity_uuid
                ).first()
                return progress.is_immutable if progress else False
            
            elif entity_type == "analysis":
                # Analysis results are immutable if their session is immutable
                analysis = db_session.query(AnalysisResult).filter(
                    AnalysisResult.id == entity_uuid
                ).first()
                if analysis and analysis.user_session:
                    session = db_session.query(UserSession).filter(
                        UserSession.id == analysis.user_session_id
                    ).first()
                    return session.is_immutable if session else False
                return False
            
            return False
            
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_assessment_sessions(
        qari_id: Optional[str] = None,
        student_id: Optional[str] = None,
        limit: int = 100,
        db: Optional[Session] = None
    ) -> List[Dict]:
        """
        Get all assessment sessions with filters.
        
        Args:
            qari_id: Filter by Qari (optional)
            student_id: Filter by student (optional)
            limit: Maximum number of results
        
        Returns:
            List of assessment session dictionaries
        """
        db_session = db or SessionLocal()
        try:
            query = db_session.query(UserSession).filter(
                UserSession.is_assessment == True
            )
            
            if qari_id:
                qari_uuid = UUID(qari_id) if isinstance(qari_id, str) else qari_id
                query = query.filter(UserSession.qari_id == qari_uuid)
            
            if student_id:
                student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
                query = query.filter(UserSession.user_id == student_uuid)
            
            sessions = query.order_by(UserSession.assessment_marked_at.desc()).limit(limit).all()
            
            result = []
            for session in sessions:
                result.append({
                    "session_id": str(session.id),
                    "user_id": str(session.user_id) if session.user_id else None,
                    "reference_id": session.reference_id,
                    "is_assessment": session.is_assessment,
                    "is_immutable": session.is_immutable,
                    "assessment_marked_at": session.assessment_marked_at.isoformat() if session.assessment_marked_at else None,
                    "assessment_marked_by": str(session.assessment_marked_by) if session.assessment_marked_by else None,
                    "created_at": session.created_at.isoformat() if session.created_at else None
                })
            
            return result
            
        finally:
            if not db:
                db_session.close()


# Global instance
assessment_service = AssessmentService()
