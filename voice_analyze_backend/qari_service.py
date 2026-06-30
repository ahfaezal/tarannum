"""
Service for Qari content management and student relationships.
"""
import logging
from typing import List, Dict, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from uuid import UUID
from database import (
    User, QariContent, StudentQariRelationship, StudentProgress,
    UserSession, AnalysisResult, Reference, SessionLocal
)

logger = logging.getLogger(__name__)


class QariService:
    """Service for managing Qari content and student relationships."""
    
    @staticmethod
    def add_content_to_qari(
        qari_id: str,
        reference_id: str,
        surah_number: Optional[int] = None,
        surah_name: Optional[str] = None,
        ayah_number: Optional[int] = None,
        maqam: Optional[str] = None,
        db: Optional[Session] = None
    ) -> QariContent:
        """Add a reference audio to Qari's content library."""
        db_session = db or SessionLocal()
        try:
            # Check if already exists
            existing = db_session.query(QariContent).filter(
                and_(
                    QariContent.qari_id == UUID(qari_id) if isinstance(qari_id, str) else qari_id,
                    QariContent.reference_id == reference_id
                )
            ).first()
            
            if existing:
                return existing
            
            # Create new content
            qari_content = QariContent(
                qari_id=UUID(qari_id) if isinstance(qari_id, str) else qari_id,
                reference_id=reference_id,
                surah_number=surah_number,
                surah_name=surah_name,
                ayah_number=ayah_number,
                maqam=maqam,
                is_active=True
            )
            
            db_session.add(qari_content)
            db_session.commit()
            db_session.refresh(qari_content)
            
            logger.info(f"Added content to Qari {qari_id}: {reference_id}")
            return qari_content
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error adding Qari content: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def update_qari_content(
        content_id: str,
        qari_id: str,
        surah_number: Optional[int] = None,
        surah_name: Optional[str] = None,
        ayah_number: Optional[int] = None,
        maqam: Optional[str] = None,
        db: Optional[Session] = None
    ) -> QariContent:
        """Update Qari content metadata (surah/ayah settings)."""
        db_session = db or SessionLocal()
        try:
            qari_uuid = UUID(qari_id) if isinstance(qari_id, str) else qari_id
            try:
                content_uuid = UUID(content_id) if isinstance(content_id, str) else content_id
            except (ValueError, AttributeError):
                content_uuid = None
            
            # Find the content and verify ownership
            qari_content = None
            if content_uuid:
                qari_content = db_session.query(QariContent).filter(
                    and_(
                        QariContent.id == content_uuid,
                        QariContent.qari_id == qari_uuid
                    )
                ).first()
            
            if not qari_content:
                reference = db_session.query(Reference).filter(
                    and_(
                        Reference.id == content_id,
                        Reference.owner_id == qari_uuid
                    )
                ).first()
                if reference:
                    qari_content = db_session.query(QariContent).filter(
                        and_(
                            QariContent.reference_id == reference.id,
                            QariContent.qari_id == qari_uuid
                        )
                    ).first()
                    if not qari_content:
                        qari_content = QariContent(
                            qari_id=qari_uuid,
                            reference_id=reference.id,
                            is_active=True
                        )
                        db_session.add(qari_content)
            
            if not qari_content:
                raise ValueError(f"Content {content_id} not found or access denied")
            
            # Update fields if provided
            if surah_number is not None:
                qari_content.surah_number = surah_number
            if surah_name is not None:
                qari_content.surah_name = surah_name
            if ayah_number is not None:
                qari_content.ayah_number = ayah_number
            if maqam is not None:
                qari_content.maqam = maqam
            
            db_session.commit()
            db_session.refresh(qari_content)
            
            logger.info(f"Updated Qari content {content_id}: surah={surah_number}, ayah={ayah_number}")
            return qari_content
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error updating Qari content: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_qari_content(
        qari_id: str,
        db: Optional[Session] = None
    ) -> List[Dict]:
        """Get all content for a Qari by directly querying Reference table using owner_id."""
        db_session = db or SessionLocal()
        try:
            qari_uuid = UUID(qari_id) if isinstance(qari_id, str) else qari_id
            
            # Directly query Reference table by owner_id (Qari's ID) and sort by upload_date
            # This ensures we get the latest uploaded files first
            references = db_session.query(Reference).filter(
                Reference.owner_id == qari_uuid
            ).order_by(
                Reference.upload_date.desc().nullslast()  # Latest upload_date first, nulls last
            ).all()
            
            logger.info(f"Found {len(references)} references for Qari {qari_id} (sorted by upload_date desc)")
            
            result = []
            for ref in references:
                # Check if there's any QariContent for this reference (active or inactive)
                any_qari_content = db_session.query(QariContent).filter(
                    and_(
                        QariContent.reference_id == ref.id,
                        QariContent.qari_id == qari_uuid
                    )
                ).first()
                
                # If QariContent exists but is inactive (soft deleted), exclude this Reference
                if any_qari_content and not any_qari_content.is_active:
                    logger.debug(f"Skipping Reference {ref.id} - QariContent is soft deleted")
                    continue
                
                # Get active QariContent metadata if it exists (for surah/ayah settings)
                qari_content = db_session.query(QariContent).filter(
                    and_(
                        QariContent.reference_id == ref.id,
                        QariContent.qari_id == qari_uuid,
                        QariContent.is_active == True
                    )
                ).first()
                
                # Get text segments if they exist, filtered by qari_id (user_id)
                text_segments = []
                if ref.text_segments:
                    # Filter text_segments by qari_id (user_id) - each Qari has their own text segments
                    qari_text_segments = [
                        seg for seg in ref.text_segments 
                        if seg.user_id == qari_uuid
                    ]
                    # Sort by 'start' field (ascending order - earliest first)
                    qari_text_segments = sorted(qari_text_segments, key=lambda seg: seg.start or 0)
                    
                    text_segments = [
                        {
                            "text": seg.text,
                            "start": float(seg.start),
                            "end": float(seg.end)
                        }
                        for seg in qari_text_segments
                    ]
                
                # Use QariContent metadata if available, otherwise use Reference defaults
                result.append({
                    "id": str(qari_content.id) if qari_content else str(ref.id),  # Use QariContent ID if exists
                    "reference_id": ref.id,
                    "title": ref.title,
                    "reference_title": ref.title,
                    "surah_number": qari_content.surah_number if qari_content else None,
                    "surah_name": qari_content.surah_name if qari_content else None,
                    "ayah_number": qari_content.ayah_number if qari_content else None,
                    "maqam": qari_content.maqam if qari_content and qari_content.maqam else (ref.maqam or ""),
                    "filename": ref.filename,
                    "file_path": ref.file_path,
                    "duration": float(ref.duration),
                    "reference_duration": float(ref.duration),
                    "file_size": ref.file_size,
                    "is_preset": ref.is_preset,
                    "upload_date": ref.upload_date.isoformat() if ref.upload_date else None,
                    "created_at": ref.upload_date.isoformat() if ref.upload_date else None,  # Use upload_date for created_at too
                    "text_segments": text_segments
                })
            
            # Log the result for debugging
            logger.info(f"Returning {len(result)} Qari content items (sorted by upload_date desc):")
            for item in result[:5]:  # Log first 5 items
                logger.info(f"  - {item.get('filename', 'N/A')}: upload_date={item.get('upload_date')}")
            
            return result
            
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def delete_qari_content(
        content_id: str,
        qari_id: str,
        db: Optional[Session] = None
    ) -> bool:
        """Soft delete a Qari's content item.
        
        Handles both QariContent.id and Reference.id (when no QariContent exists).
        """
        db_session = db or SessionLocal()
        try:
            qari_uuid = UUID(qari_id) if isinstance(qari_id, str) else qari_id
            
            # Try to parse content_id as UUID (for QariContent.id)
            # If it fails, it's likely a Reference.id (string/MD5 hash)
            content_uuid = None
            try:
                content_uuid = UUID(content_id) if isinstance(content_id, str) else content_id
            except (ValueError, AttributeError):
                # content_id is not a valid UUID, treat it as Reference.id (string)
                content_uuid = None
            
            # First, try to find QariContent record (if content_id is a UUID)
            if content_uuid:
                qari_content = db_session.query(QariContent).filter(
                    and_(
                        QariContent.id == content_uuid,
                        QariContent.qari_id == qari_uuid,
                        QariContent.is_active == True
                    )
                ).first()
                
                if qari_content:
                    # Found QariContent, soft delete it
                    qari_content.is_active = False
                    db_session.commit()
                    logger.info(f"Soft deleted QariContent {content_id} for Qari {qari_id}")
                    return True
            
            # If no QariContent found, check if it's a Reference.id
            # This can happen when get_qari_content returns Reference.id when no QariContent exists
            # Reference.id is a String (MD5 hash), so use content_id directly
            reference_id_to_check = content_id
            
            reference = db_session.query(Reference).filter(
                and_(
                    Reference.id == reference_id_to_check,
                    Reference.owner_id == qari_uuid
                )
            ).first()
            
            if reference:
                # Reference exists and belongs to Qari, but no QariContent record
                # Create a QariContent record with is_active=False to mark it as deleted
                # This ensures get_qari_content will filter it out
                qari_content_deleted = QariContent(
                    qari_id=qari_uuid,
                    reference_id=reference_id_to_check,
                    is_active=False
                )
                db_session.add(qari_content_deleted)
                db_session.commit()
                logger.info(f"Marked Reference {reference_id_to_check} as deleted for Qari {qari_id} by creating inactive QariContent record.")
                return True
            
            # Neither QariContent nor Reference found
            raise ValueError(f"Content with ID {content_id} not found or access denied for Qari {qari_id}")
            
        except ValueError:
            # Re-raise ValueError (our custom error)
            raise
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error deleting Qari content {content_id}: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def assign_student_to_qari(
        student_id: str,
        qari_id: str,
        referral_code: Optional[str] = None,
        db: Optional[Session] = None
    ) -> StudentQariRelationship:
        """Assign a student to a Qari (or switch Qari)."""
        db_session = db or SessionLocal()
        try:
            student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
            qari_uuid = UUID(qari_id) if isinstance(qari_id, str) else qari_id
            
            # Get Qari to check commission rate
            qari = db_session.query(User).filter(User.id == qari_uuid).first()
            if not qari:
                raise ValueError(f"Qari {qari_id} not found")
            
            # Use Qari's default commission rate
            commission_rate = qari.commission_rate if qari.commission_rate else 0.0
            
            # Deactivate any existing active relationship for this student
            existing = db_session.query(StudentQariRelationship).filter(
                and_(
                    StudentQariRelationship.student_id == student_uuid,
                    StudentQariRelationship.is_active == True
                )
            ).all()
            
            for rel in existing:
                rel.is_active = False
            
            # Create new relationship
            relationship = StudentQariRelationship(
                student_id=student_uuid,
                qari_id=qari_uuid,
                is_active=True,
                referral_code=referral_code,
                commission_rate=commission_rate
            )
            
            db_session.add(relationship)
            db_session.commit()
            db_session.refresh(relationship)
            
            logger.info(f"Assigned student {student_id} to Qari {qari_id} (referral: {referral_code})")
            return relationship
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error assigning student to Qari: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_qari_students(
        qari_id: str,
        db: Optional[Session] = None
    ) -> List[Dict]:
        """Get all students for a Qari."""
        db_session = db or SessionLocal()
        try:
            qari_uuid = UUID(qari_id) if isinstance(qari_id, str) else qari_id
            relationships = db_session.query(StudentQariRelationship).filter(
                and_(
                    StudentQariRelationship.qari_id == qari_uuid,
                    StudentQariRelationship.is_active == True
                )
            ).all()
            
            result = []
            for rel in relationships:
                student = db_session.query(User).filter(User.id == rel.student_id).first()
                if student:
                    # Get latest progress
                    latest_progress = db_session.query(StudentProgress).filter(
                        StudentProgress.student_id == rel.student_id
                    ).order_by(StudentProgress.created_at.desc()).first()
                    
                    result.append({
                        "student_id": str(rel.student_id),
                        "student_email": student.email,
                        "student_name": student.full_name,
                        "joined_at": rel.joined_at.isoformat() if rel.joined_at else None,
                        "last_active": rel.last_active.isoformat() if rel.last_active else None,
                        "latest_score": latest_progress.overall_score if latest_progress else None,
                        "improvement": latest_progress.improvement if latest_progress else None
                    })
            
            return result
            
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_student_qari(
        student_id: str,
        db: Optional[Session] = None
    ) -> Optional[Dict]:
        """Get the active Qari for a student."""
        db_session = db or SessionLocal()
        try:
            student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
            relationship = db_session.query(StudentQariRelationship).filter(
                and_(
                    StudentQariRelationship.student_id == student_uuid,
                    StudentQariRelationship.is_active == True
                )
            ).first()
            
            if not relationship:
                return None
            
            qari = db_session.query(User).filter(User.id == relationship.qari_id).first()
            if not qari:
                return None
            
            return {
                "qari_id": str(relationship.qari_id),
                "qari_email": qari.email,
                "qari_name": qari.full_name,
                "joined_at": relationship.joined_at.isoformat() if relationship.joined_at else None
            }
            
        finally:
            if not db:
                db_session.close()


# Global instance
qari_service = QariService()
