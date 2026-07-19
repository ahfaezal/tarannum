"""
Database service for saving user sessions and analysis results.
"""
import logging
import os
import json
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
import uuid
import librosa

from database import UserSession, AnalysisResult, SessionLocal
from storage_path_helper import storage_path_helper

logger = logging.getLogger(__name__)

DATA_SCHEMA_VERSION = "tarannum-recording-v1"


def _sha256_file(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class DBSessionService:
    """Service for managing user sessions and analysis results in the database."""
    
    @staticmethod
    def create_user_session(
        user_audio_path: Path,
        reference_id: Optional[str] = None,
        user_id: Optional[str] = None,
        qari_id: Optional[str] = None,
        client_session_id: Optional[str] = None,
        recording_mode: Optional[str] = None,
        scoring_version: Optional[str] = None,
        recording_attempt: Optional[int] = None,
        challenge_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> UserSession:
        """
        Create a user session record for a recording.
        
        Args:
            user_audio_path: Path to the user's audio recording file
            reference_id: Optional reference ID that was used
            user_id: Optional user identifier
            db: Optional database session
        
        Returns:
            UserSession object
        """
        db_session = db or SessionLocal()
        try:
            # Get file size
            file_size = user_audio_path.stat().st_size if user_audio_path.exists() else 0
            
            # Get duration
            duration = None
            if user_audio_path.exists():
                try:
                    duration = librosa.get_duration(path=str(user_audio_path))
                except Exception as e:
                    logger.warning(f"Could not get audio duration: {e}")
            
            # Convert user_id string to UUID if provided
            user_uuid = None
            if user_id:
                try:
                    user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
                except ValueError:
                    logger.warning(f"Invalid user_id format: {user_id}, creating session without user")

            qari_uuid = None
            if qari_id:
                try:
                    qari_uuid = uuid.UUID(qari_id) if isinstance(qari_id, str) else qari_id
                except ValueError:
                    logger.warning(f"Invalid qari_id format: {qari_id}, storing session without qari")

            challenge_uuid = None
            if challenge_id:
                try:
                    challenge_uuid = uuid.UUID(challenge_id) if isinstance(challenge_id, str) else challenge_id
                except ValueError:
                    logger.warning(f"Invalid challenge_id format: {challenge_id}, storing session without challenge")
            
            # Create user session first to get session_id
            user_session = UserSession(
                user_id=user_uuid,
                reference_id=reference_id,
                qari_id=qari_uuid,
                client_session_id=client_session_id,
                recording_mode=recording_mode,
                scoring_version=scoring_version,
                recording_attempt=recording_attempt,
                challenge_id=challenge_uuid,
                audio_checksum=_sha256_file(user_audio_path),
                data_schema_version=DATA_SCHEMA_VERSION,
                integrity_status="pending_audio_upload",
                file_path=None,  # Will be set after S3 upload
                duration=duration,
                file_size=file_size,
                created_at=datetime.utcnow()
            )
            
            db_session.add(user_session)
            db_session.commit()
            db_session.refresh(user_session)
            
            session_id = str(user_session.id)
            
            # Upload to S3 if configured (Milestone 4 requirement)
            cloud_storage_type = None
            cloud_storage_path = None
            local_file_path = None
            integrity_error = None
            
            try:
                from cloud_storage import cloud_storage, S3Storage
                storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local").lower()
                is_s3_storage = isinstance(cloud_storage, S3Storage)
                
                if storage_type == "s3" and is_s3_storage and user_uuid and user_audio_path.exists():
                    # Generate structured S3 path
                    s3_path = storage_path_helper.generate_student_recording_path(
                        session_id=session_id,
                        student_id=str(user_uuid),
                        reference_id=reference_id,
                        filename=user_audio_path.name,
                        db=db_session
                    )
                    
                    # Upload to S3
                    s3_url = cloud_storage.upload_file(user_audio_path, s3_path)
                    
                    if s3_url and s3_url.startswith("s3://"):
                        cloud_storage_type = "s3"
                        cloud_storage_path = s3_url
                        
                        logger.info("=" * 60)
                        logger.info("✓ Student Recording Uploaded to S3")
                        logger.info(f"  S3 Path: {s3_path}")
                        logger.info(f"  S3 URL: {s3_url}")
                        logger.info(f"  Session ID: {session_id}")
                        logger.info(f"  Student ID: {user_uuid}")
                        logger.info("=" * 60)
                    else:
                        raise ValueError(f"S3 upload returned invalid URL: {s3_url}")
                else:
                    # Fallback to local storage
                    local_file_path = str(user_audio_path.relative_to(Path(__file__).parent))
                    integrity_error = "S3 audio upload was not completed; local storage was used."
                    logger.info(f"Student recording saved to local storage: {local_file_path}")
                    
            except Exception as cloud_error:
                # If S3 fails, use local storage
                logger.warning(f"Could not upload student recording to S3: {cloud_error}. Using local storage.")
                local_file_path = str(user_audio_path.relative_to(Path(__file__).parent))
                integrity_error = str(cloud_error)[:1000]
            
            # Update session with file path
            user_session.file_path = cloud_storage_path or local_file_path
            user_session.cloud_storage_type = cloud_storage_type
            user_session.cloud_storage_path = cloud_storage_path
            user_session.integrity_status = "pending_score_upload" if cloud_storage_path else "failed_audio_upload"
            user_session.integrity_error = integrity_error
            db_session.commit()
            db_session.refresh(user_session)
            
            logger.info(f"Created user session: {user_session.id} (reference: {reference_id})")
            
            return user_session
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error creating user session: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def save_analysis_result(
        user_session_id: str,
        score: float,
        reference_id: Optional[str] = None,
        segments: Optional[list] = None,
        pitch_data: Optional[dict] = None,
        regions: Optional[list] = None,
        ayat_timing: Optional[list] = None,
        feedback: Optional[dict] = None,
        score_breakdown: Optional[dict] = None,
        pronunciation_alerts: Optional[list] = None,
        db: Optional[Session] = None
    ) -> AnalysisResult:
        """
        Save analysis/scoring result to the database.
        
        Args:
            user_session_id: UUID string of the user session
            score: Similarity score
            reference_id: Optional reference ID
            segments: List of segment scores
            pitch_data: Pitch comparison data
            regions: Region coloring data
            ayat_timing: Ayah timing data
            feedback: Training feedback
            score_breakdown: Score breakdown (pitch, timing, pronunciation)
            pronunciation_alerts: Pronunciation alerts
            db: Optional database session
        
        Returns:
            AnalysisResult object
        """
        db_session = db or SessionLocal()
        try:
            # Convert user_session_id string to UUID if needed
            if isinstance(user_session_id, str):
                try:
                    user_session_uuid = uuid.UUID(user_session_id)
                except ValueError:
                    logger.error(f"Invalid user_session_id format: {user_session_id}")
                    raise ValueError(f"Invalid user_session_id format: {user_session_id}")
            else:
                user_session_uuid = user_session_id
            
            # Check if analysis result already exists for this session
            existing = db_session.query(AnalysisResult).filter(
                AnalysisResult.user_session_id == user_session_uuid
            ).first()
            
            if existing:
                # Update existing result
                existing.score = float(score)
                existing.reference_id = reference_id
                existing.segments = segments
                existing.pitch_data = pitch_data
                existing.regions = regions
                existing.ayat_timing = ayat_timing
                existing.feedback = feedback
                existing.score_breakdown = score_breakdown
                existing.pronunciation_alerts = pronunciation_alerts
                
                db_session.commit()
                db_session.refresh(existing)
                
                logger.info(f"Updated analysis result for session: {user_session_id}")
                return existing
            else:
                # Create new result
                analysis_result = AnalysisResult(
                    user_session_id=user_session_uuid,
                    reference_id=reference_id,
                    score=float(score),
                    segments=segments,
                    pitch_data=pitch_data,
                    regions=regions,
                    ayat_timing=ayat_timing,
                    feedback=feedback,
                    score_breakdown=score_breakdown,
                    pronunciation_alerts=pronunciation_alerts,
                    created_at=datetime.utcnow()
                )
                
                db_session.add(analysis_result)
                db_session.commit()
                db_session.refresh(analysis_result)
                
                # Upload scoring data to S3 (Milestone 4 requirement)
                try:
                    from cloud_storage import cloud_storage, S3Storage
                    storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local").lower()
                    is_s3_storage = isinstance(cloud_storage, S3Storage)
                    
                    if storage_type == "s3" and is_s3_storage:
                        # Get user session to find student_id
                        user_session = db_session.query(UserSession).filter(
                            UserSession.id == user_session_uuid
                        ).first()
                        
                        if user_session and user_session.user_id:
                            # Prepare scoring data as JSON
                            scoring_data = {
                                "data_schema_version": DATA_SCHEMA_VERSION,
                                "session_id": user_session_id,
                                "client_session_id": user_session.client_session_id,
                                "student_id": str(user_session.user_id),
                                "qari_id": str(user_session.qari_id) if user_session.qari_id else None,
                                "reference_id": reference_id,
                                "recording_mode": user_session.recording_mode,
                                "scoring_version": user_session.scoring_version,
                                "recording_attempt": user_session.recording_attempt,
                                "audio_checksum": user_session.audio_checksum,
                                "score": float(score),
                                "segments": segments,
                                "pitch_data": pitch_data,
                                "regions": regions,
                                "ayat_timing": ayat_timing,
                                "feedback": feedback,
                                "score_breakdown": score_breakdown,
                                "pronunciation_alerts": pronunciation_alerts,
                                "created_at": datetime.utcnow().isoformat()
                            }
                            
                            # Save to temp file
                            import tempfile
                            with tempfile.NamedTemporaryFile(
                                mode='w', suffix='.json', delete=False, encoding='utf-8'
                            ) as tmp_file:
                                # Preserve every field while avoiding whitespace
                                # inflation in the large pitch-data payload.
                                json.dump(
                                    scoring_data,
                                    tmp_file,
                                    ensure_ascii=False,
                                    separators=(',', ':'),
                                )
                                tmp_path = Path(tmp_file.name)
                            
                            try:
                                # Generate structured S3 path
                                s3_path = storage_path_helper.generate_scoring_data_path(
                                    session_id=user_session_id,
                                    student_id=str(user_session.user_id),
                                    reference_id=reference_id,
                                    db=db_session
                                )
                                
                                # Upload to S3
                                s3_url = cloud_storage.upload_file(tmp_path, s3_path)
                                
                                if s3_url and s3_url.startswith("s3://"):
                                    user_session.score_storage_path = s3_url
                                    user_session.score_checksum = _sha256_file(tmp_path)
                                    user_session.data_schema_version = DATA_SCHEMA_VERSION
                                    if user_session.cloud_storage_path and user_session.audio_checksum:
                                        user_session.integrity_status = "complete"
                                        user_session.integrity_error = None
                                    else:
                                        user_session.integrity_status = "failed_audio_upload"
                                        user_session.integrity_error = user_session.integrity_error or "Audio integrity requirements were not completed."
                                    db_session.commit()
                                    logger.info(f"✓ Scoring data uploaded to S3: {s3_url}")
                                else:
                                    raise ValueError(f"S3 upload returned invalid URL: {s3_url}")
                            finally:
                                # Clean up temp file
                                if tmp_path.exists():
                                    tmp_path.unlink()
                                    
                except Exception as s3_error:
                    user_session = db_session.query(UserSession).filter(
                        UserSession.id == user_session_uuid
                    ).first()
                    if user_session:
                        user_session.integrity_status = "failed_score_upload"
                        user_session.integrity_error = str(s3_error)[:1000]
                        db_session.commit()
                    logger.warning(f"Could not upload scoring data to S3: {s3_error}. Data stored in database only.")
                
                logger.info(f"Saved analysis result for session: {user_session_id} (score: {score})")
                return analysis_result
                
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error saving analysis result: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_user_session(session_id: str, db: Optional[Session] = None) -> Optional[UserSession]:
        """Get a user session by ID."""
        db_session = db or SessionLocal()
        try:
            if isinstance(session_id, str):
                session_uuid = uuid.UUID(session_id)
            else:
                session_uuid = session_id
            
            return db_session.query(UserSession).filter(UserSession.id == session_uuid).first()
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def get_analysis_result(session_id: str, db: Optional[Session] = None) -> Optional[AnalysisResult]:
        """Get analysis result by user session ID."""
        db_session = db or SessionLocal()
        try:
            if isinstance(session_id, str):
                session_uuid = uuid.UUID(session_id)
            else:
                session_uuid = session_id
            
            return db_session.query(AnalysisResult).filter(
                AnalysisResult.user_session_id == session_uuid
            ).first()
        finally:
            if not db:
                db_session.close()
    
    @staticmethod
    def list_user_sessions(
        user_id: Optional[str] = None,
        reference_id: Optional[str] = None,
        limit: int = 100,
        db: Optional[Session] = None
    ) -> list:
        """List user sessions with optional filters."""
        db_session = db or SessionLocal()
        try:
            query = db_session.query(UserSession)
            
            if user_id:
                query = query.filter(UserSession.user_id == user_id)
            if reference_id:
                query = query.filter(UserSession.reference_id == reference_id)
            
            return query.order_by(UserSession.created_at.desc()).limit(limit).all()
        finally:
            if not db:
                db_session.close()


# Global instance
db_session_service = DBSessionService()
