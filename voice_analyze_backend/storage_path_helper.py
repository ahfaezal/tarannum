"""
Helper for generating structured storage paths for Milestone 4.
Implements: Qari → Surah → Ayah → Student → Session → Audio → Pitch → Score
"""
import os
import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from uuid import UUID
from database import Reference, QariContent, UserSession, StudentQariRelationship, SessionLocal

logger = logging.getLogger(__name__)


class StoragePathHelper:
    """Helper class for generating structured S3 storage paths."""
    
    @staticmethod
    def get_qari_info_from_reference(
        reference_id: str,
        db: Optional[Session] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get Qari information from a reference ID.
        Checks QariContent first, then reference owner.
        
        Returns:
            Dict with qari_id, surah_number, surah_name, ayah_number, maqam
            or None if not found
        """
        db_session = db or SessionLocal()
        try:
            # First, check QariContent table
            qari_content = db_session.query(QariContent).filter(
                QariContent.reference_id == reference_id,
                QariContent.is_active == True
            ).first()
            
            if qari_content:
                return {
                    "qari_id": str(qari_content.qari_id),
                    "surah_number": qari_content.surah_number,
                    "surah_name": qari_content.surah_name,
                    "ayah_number": qari_content.ayah_number,
                    "maqam": qari_content.maqam
                }
            
            # Fallback: Check reference owner
            reference = db_session.query(Reference).filter(
                Reference.id == reference_id
            ).first()
            
            if reference and reference.owner_id:
                return {
                    "qari_id": str(reference.owner_id),
                    "surah_number": None,
                    "surah_name": None,
                    "ayah_number": None,
                    "maqam": reference.maqam
                }
            
            return None
            
        except Exception as e:
            logger.warning(f"Error getting Qari info from reference {reference_id}: {e}")
            return None
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_student_qari(
        student_id: str,
        db: Optional[Session] = None
    ) -> Optional[str]:
        """
        Get Qari ID for a student.
        
        Returns:
            Qari ID as string, or None if not found
        """
        db_session = db or SessionLocal()
        try:
            student_uuid = UUID(student_id) if isinstance(student_id, str) else student_id
            
            relationship = db_session.query(StudentQariRelationship).filter(
                StudentQariRelationship.student_id == student_uuid,
                StudentQariRelationship.is_active == True
            ).first()
            
            if relationship:
                return str(relationship.qari_id)
            
            return None
            
        except Exception as e:
            logger.warning(f"Error getting student Qari for {student_id}: {e}")
            return None
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def generate_reference_path(
        reference_id: str,
        qari_id: Optional[str] = None,
        owner_id: Optional[str] = None,
        surah_number: Optional[int] = None,
        surah_name: Optional[str] = None,
        ayah_number: Optional[int] = None,
        filename: Optional[str] = None,
        db: Optional[Session] = None
    ) -> str:
        """
        Generate structured S3 path for reference audio.
        Format: references/{owner_uuid}/{ref_id}.mp3
        
        Always includes owner UUID if available for better organization.
        """
        # Get owner_id from qari_id if provided, or try to get from reference
        owner_uuid = owner_id or qari_id
        
        # If owner not provided, try to get it from reference
        if not owner_uuid:
            qari_info = StoragePathHelper.get_qari_info_from_reference(reference_id, db)
            if qari_info:
                owner_uuid = qari_info["qari_id"]
            else:
                # Try to get owner from Reference table directly
                db_session = db or SessionLocal()
                try:
                    reference = db_session.query(Reference).filter(
                        Reference.id == reference_id
                    ).first()
                    if reference and reference.owner_id:
                        owner_uuid = str(reference.owner_id)
                except Exception as e:
                    logger.warning(f"Error getting owner from reference {reference_id}: {e}")
                finally:
                    if not db:
                        db_session.close()
        
        # Get file extension
        ext = ".mp3"
        if filename:
            ext = os.path.splitext(filename)[1] or ".mp3"
        
        # Generate path with owner UUID
        if owner_uuid:
            path = f"references/{owner_uuid}/{reference_id}{ext}"
        else:
            # Fallback: use "public" folder for references without owner
            path = f"references/public/{reference_id}{ext}"
        
        return path
    
    @staticmethod
    def generate_student_recording_path(
        session_id: str,
        student_id: str,
        qari_id: Optional[str] = None,
        reference_id: Optional[str] = None,
        surah_number: Optional[int] = None,
        surah_name: Optional[str] = None,
        ayah_number: Optional[int] = None,
        filename: Optional[str] = None,
        db: Optional[Session] = None
    ) -> str:
        """
        Generate structured S3 path for student recording.
        Format: qari/{qari_id}/surah/{surah}/ayah/{ayah}/student/{student_id}/session/{session_id}/audio.mp3
        """
        # Get Qari ID if not provided
        if not qari_id:
            qari_id = StoragePathHelper.get_student_qari(student_id, db)
        
        # Get Qari info from reference if available
        if reference_id and (not surah_number or not ayah_number):
            qari_info = StoragePathHelper.get_qari_info_from_reference(reference_id, db)
            if qari_info:
                qari_id = qari_info["qari_id"] or qari_id
                surah_number = qari_info.get("surah_number") or surah_number
                surah_name = qari_info.get("surah_name") or surah_name
                ayah_number = qari_info.get("ayah_number") or ayah_number
        
        # Get file extension
        ext = ".mp3"
        if filename:
            ext = os.path.splitext(filename)[1] or ".mp3"
        
        # Generate structured path
        if qari_id:
            # Clean surah name for path
            surah_part = ""
            if surah_number:
                surah_part = f"surah_{surah_number}"
            elif surah_name:
                surah_part = surah_name.lower().replace(" ", "_").replace("/", "_")
            
            ayah_part = f"ayah_{ayah_number}" if ayah_number else "general"
            
            if surah_part:
                path = f"qari/{qari_id}/{surah_part}/{ayah_part}/student/{student_id}/session/{session_id}/audio{ext}"
            else:
                path = f"qari/{qari_id}/student/{student_id}/session/{session_id}/audio{ext}"
        else:
            # Fallback to simple path
            path = f"students/{student_id}/session/{session_id}/audio{ext}"
        
        return path
    
    @staticmethod
    def generate_pitch_data_path(
        reference_id: str,
        qari_id: Optional[str] = None,
        surah_number: Optional[int] = None,
        surah_name: Optional[str] = None,
        ayah_number: Optional[int] = None,
        db: Optional[Session] = None
    ) -> str:
        """
        Generate structured S3 path for pitch data.
        Format: qari/{qari_id}/surah/{surah}/ayah/{ayah}/references/{ref_id}/pitch.json
        """
        # Get Qari info if not provided
        if not qari_id:
            qari_info = StoragePathHelper.get_qari_info_from_reference(reference_id, db)
            if qari_info:
                qari_id = qari_info["qari_id"]
                surah_number = qari_info.get("surah_number") or surah_number
                surah_name = qari_info.get("surah_name") or surah_name
                ayah_number = qari_info.get("ayah_number") or ayah_number
        
        if qari_id:
            surah_part = ""
            if surah_number:
                surah_part = f"surah_{surah_number}"
            elif surah_name:
                surah_part = surah_name.lower().replace(" ", "_").replace("/", "_")
            
            ayah_part = f"ayah_{ayah_number}" if ayah_number else "general"
            
            if surah_part:
                path = f"qari/{qari_id}/{surah_part}/{ayah_part}/references/{reference_id}/pitch.json"
            else:
                path = f"qari/{qari_id}/references/{reference_id}/pitch.json"
        else:
            path = f"references/{reference_id}/pitch.json"
        
        return path
    
    @staticmethod
    def generate_scoring_data_path(
        session_id: str,
        student_id: str,
        qari_id: Optional[str] = None,
        reference_id: Optional[str] = None,
        surah_number: Optional[int] = None,
        surah_name: Optional[str] = None,
        ayah_number: Optional[int] = None,
        db: Optional[Session] = None
    ) -> str:
        """
        Generate structured S3 path for scoring data.
        Format: qari/{qari_id}/surah/{surah}/ayah/{ayah}/student/{student_id}/session/{session_id}/score.json
        """
        # Get Qari ID if not provided
        if not qari_id:
            qari_id = StoragePathHelper.get_student_qari(student_id, db)
        
        # Get Qari info from reference if available
        if reference_id and (not surah_number or not ayah_number):
            qari_info = StoragePathHelper.get_qari_info_from_reference(reference_id, db)
            if qari_info:
                qari_id = qari_info["qari_id"] or qari_id
                surah_number = qari_info.get("surah_number") or surah_number
                surah_name = qari_info.get("surah_name") or surah_name
                ayah_number = qari_info.get("ayah_number") or ayah_number
        
        if qari_id:
            surah_part = ""
            if surah_number:
                surah_part = f"surah_{surah_number}"
            elif surah_name:
                surah_part = surah_name.lower().replace(" ", "_").replace("/", "_")
            
            ayah_part = f"ayah_{ayah_number}" if ayah_number else "general"
            
            if surah_part:
                path = f"qari/{qari_id}/{surah_part}/{ayah_part}/student/{student_id}/session/{session_id}/score.json"
            else:
                path = f"qari/{qari_id}/student/{student_id}/session/{session_id}/score.json"
        else:
            path = f"students/{student_id}/session/{session_id}/score.json"
        
        return path


# Global instance
storage_path_helper = StoragePathHelper()
