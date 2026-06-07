"""
Task queue for asynchronous audio processing (Milestone 4).
Uses Celery for background job processing.
"""
import os
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Try to initialize Celery
celery_app = None
CELERY_AVAILABLE = False

try:
    from celery import Celery
    
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    celery_app = Celery(
        'tarannum_ai',
        broker=redis_url,
        backend=redis_url
    )
    
    # Celery configuration
    celery_app.conf.update(
        task_serializer='json',
        accept_content=['json'],
        result_serializer='json',
        timezone='UTC',
        enable_utc=True,
        task_track_started=True,
        task_time_limit=300,  # 5 minutes max per task
        task_soft_time_limit=240,  # 4 minutes soft limit
        worker_prefetch_multiplier=1,  # Process one task at a time
        worker_max_tasks_per_child=50,  # Restart worker after 50 tasks
    )
    
    CELERY_AVAILABLE = True
    logger.info("✓ Celery task queue initialized successfully")
    logger.info(f"  Redis URL: {redis_url.split('@')[1] if '@' in redis_url else 'configured'}")
    
except ImportError:
    logger.warning("⚠ Celery not installed. Async processing disabled. Install with: pip install celery[redis]")
    CELERY_AVAILABLE = False
except Exception as e:
    logger.warning(f"⚠ Failed to initialize Celery: {e}. Async processing disabled.")
    logger.warning(f"  Check REDIS_URL environment variable and Redis service availability.")
    CELERY_AVAILABLE = False


if CELERY_AVAILABLE and celery_app:
    @celery_app.task(name="process_audio_scoring", bind=True, max_retries=3)
    def process_audio_scoring_async(
        self,
        user_audio_path: str,
        reference_audio_path: str,
        session_id: str,
        user_id: Optional[str] = None,
        reference_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process audio scoring asynchronously.
        
        This task runs in the background to avoid blocking the API.
        
        Args:
            user_audio_path: Path to user audio file (local or cloud)
            reference_audio_path: Path to reference audio file (local or cloud)
            session_id: UUID of the session
            user_id: UUID of the user (optional)
            reference_id: Reference ID (optional)
        
        Returns:
            Dictionary with scoring results
        """
        from scoring_engine import calculate_similarity_score
        from database import SessionLocal, UserSession, AnalysisResult, UserRole
        from progress_service import progress_service
        from cloud_storage import cloud_storage
        from pathlib import Path
        import tempfile
        
        db = SessionLocal()
        temp_files = []
        
        try:
            logger.info(f"Processing audio scoring for session {session_id} (async)")
            
            # Download from cloud if needed
            user_local_path = None
            ref_local_path = None
            
            if user_audio_path.startswith("s3://") or user_audio_path.startswith("http"):
                # Download from cloud
                temp_dir = Path(tempfile.gettempdir())
                user_local_path = temp_dir / f"user_{session_id}.wav"
                cloud_storage.download_file(user_audio_path, user_local_path)
                temp_files.append(user_local_path)
            else:
                user_local_path = Path(user_audio_path)
            
            if reference_audio_path.startswith("s3://") or reference_audio_path.startswith("http"):
                # Download from cloud
                temp_dir = Path(tempfile.gettempdir())
                ref_local_path = temp_dir / f"ref_{session_id}.wav"
                cloud_storage.download_file(reference_audio_path, ref_local_path)
                temp_files.append(ref_local_path)
            else:
                ref_local_path = Path(reference_audio_path)
            
            # Perform scoring
            result = calculate_similarity_score(
                str(user_local_path),
                str(ref_local_path)
            )
            
            # Get session
            from uuid import UUID
            session_uuid = UUID(session_id) if isinstance(session_id, str) else session_id
            session = db.query(UserSession).filter(UserSession.id == session_uuid).first()
            
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            # Save analysis result
            analysis = AnalysisResult(
                user_session_id=session_uuid,
                reference_id=reference_id,
                score=result.get("score", 0.0),
                segments=result.get("segments"),
                pitch_data=result.get("pitch_data"),
                regions=result.get("regions"),
                ayat_timing=result.get("ayah_timing"),
                feedback=result.get("feedback"),
                score_breakdown=result.get("score_breakdown"),
                pronunciation_alerts=result.get("pronunciation_alerts")
            )
            db.add(analysis)
            db.commit()
            
            # Save progress if student
            if user_id:
                try:
                    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
                    user = db.query(User).filter(User.id == user_uuid).first()
                    
                    if user and user.role == UserRole.STUDENT:
                        verse_scores = None
                        if result.get("ayah_timing"):
                            verse_scores = []
                            for ayah in result.get("ayah_timing", []):
                                verse_scores.append({
                                    "start": ayah.get("start", 0),
                                    "end": ayah.get("end", 0),
                                    "score": 0.0,  # Will be calculated from segments
                                    "text": ayah.get("text", "")
                                })
                        
                        progress_service.save_progress(
                            student_id=user_id,
                            session_id=session_id,
                            overall_score=result.get("score", 0.0),
                            reference_id=reference_id,
                            verse_scores=verse_scores,
                            segments=result.get("segments"),
                            db=db
                        )
                except Exception as progress_error:
                    logger.error(f"Error saving progress (non-fatal): {progress_error}")
            
            logger.info(f"Completed audio scoring for session {session_id}")
            
            return {
                "status": "completed",
                "session_id": session_id,
                "score": result.get("score", 0.0)
            }
            
        except Exception as e:
            logger.error(f"Error in async audio processing: {e}", exc_info=True)
            # Retry on failure
            raise self.retry(exc=e, countdown=60)  # Retry after 60 seconds
            
        finally:
            # Cleanup temp files
            for temp_file in temp_files:
                try:
                    if temp_file and temp_file.exists():
                        temp_file.unlink()
                except Exception as e:
                    logger.warning(f"Could not delete temp file {temp_file}: {e}")
            
            db.close()
    
    @celery_app.task(name="cleanup_old_files")
    def cleanup_old_files_task():
        """Periodic task to clean up old temporary files."""
        from pathlib import Path
        from datetime import datetime, timedelta
        
        temp_dir = Path(__file__).parent / "temp_audio"
        if not temp_dir.exists():
            return
        
        cutoff_date = datetime.utcnow() - timedelta(days=7)
        deleted_count = 0
        
        for file_path in temp_dir.glob("*"):
            if file_path.is_file():
                try:
                    file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                    if file_time < cutoff_date:
                        file_path.unlink()
                        deleted_count += 1
                except Exception as e:
                    logger.warning(f"Could not delete {file_path}: {e}")
        
        logger.info(f"Cleaned up {deleted_count} old temporary files")
        return {"deleted": deleted_count}

else:
    # Fallback functions when Celery is not available
    def process_audio_scoring_async(*args, **kwargs):
        """Fallback: raises error if Celery not available."""
        raise RuntimeError("Celery not available. Install with: pip install celery[redis]")
    
    def cleanup_old_files_task(*args, **kwargs):
        """Fallback: no-op when Celery not available."""
        pass
