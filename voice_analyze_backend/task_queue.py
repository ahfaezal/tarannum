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
    from celery.signals import worker_process_init
    
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
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        task_time_limit=300,  # 5 minutes max per task
        task_soft_time_limit=240,  # 4 minutes soft limit
        worker_prefetch_multiplier=1,  # Process one task at a time
        worker_max_tasks_per_child=50,  # Restart worker after 50 tasks
    )
    
    CELERY_AVAILABLE = True
    logger.info("✓ Celery task queue initialized successfully")
    logger.info(f"  Redis URL: {redis_url.split('@')[1] if '@' in redis_url else 'configured'}")

    @worker_process_init.connect
    def initialize_scoring_worker(**_kwargs):
        """Load the shared Vosk model once when a scoring worker starts."""
        try:
            from scoring_engine import (
                VOSK_MODEL_AVAILABLE,
                VOSK_MODEL_PATH,
                set_global_vosk_model,
            )
            if VOSK_MODEL_AVAILABLE:
                from vosk import Model as VoskModel
                set_global_vosk_model(VoskModel(VOSK_MODEL_PATH))
                logger.info("Scoring worker Vosk model loaded")
        except Exception as model_error:
            logger.warning("Scoring worker could not load Vosk model: %s", model_error)
    
except ImportError:
    logger.warning("⚠ Celery not installed. Async processing disabled. Install with: pip install celery[redis]")
    CELERY_AVAILABLE = False
except Exception as e:
    logger.warning(f"⚠ Failed to initialize Celery: {e}. Async processing disabled.")
    logger.warning(f"  Check REDIS_URL environment variable and Redis service availability.")
    CELERY_AVAILABLE = False


if CELERY_AVAILABLE and celery_app:
    @celery_app.task(name="process_scoring_job", bind=True, max_retries=2)
    def process_scoring_job_async(self, job_id: str) -> Dict[str, Any]:
        """Run the exact production V2.3 pipeline for a durable scoring job."""
        import asyncio
        import tempfile
        from datetime import datetime
        from pathlib import Path
        from uuid import UUID

        from fastapi.encoders import jsonable_encoder
        from starlette.datastructures import Headers, UploadFile

        from database import ScoringJob, SessionLocal, User

        db = SessionLocal()
        local_path = Path(tempfile.gettempdir()) / f"scoring_job_{job_id}.wav"
        staged_path = None
        cloud_storage = None
        terminal = False

        try:
            # Keep optional/runtime imports inside the guarded section. If a
            # worker image is incomplete, the durable job must become failed
            # instead of remaining in "processing" forever.
            from cloud_storage import cloud_storage as active_cloud_storage
            cloud_storage = active_cloud_storage

            job = db.query(ScoringJob).filter(ScoringJob.id == UUID(job_id)).first()
            if not job:
                raise ValueError(f"Scoring job {job_id} not found")
            if job.status == "completed":
                return {"status": "completed", "job_id": job_id}

            staged_path = job.staging_path
            job.status = "processing"
            job.stage = "analysing"
            job.started_at = job.started_at or datetime.utcnow()
            job.error_message = None
            db.commit()

            if not staged_path or not cloud_storage.download_file(staged_path, local_path):
                raise RuntimeError("The staged recording could not be downloaded")

            user = db.query(User).filter(User.id == job.user_id).first()
            if not user:
                raise RuntimeError("The scoring job user no longer exists")

            # Import lazily to avoid task_queue <-> main circular imports.
            from main import score_performance

            with local_path.open("rb") as audio_stream:
                upload = UploadFile(
                    file=audio_stream,
                    filename=job.original_filename or "recitation.wav",
                    headers=Headers({"content-type": job.content_type or "audio/wav"}),
                )
                result = asyncio.run(score_performance(
                    user_audio=upload,
                    reference_audio=None,
                    reference_id=job.reference_id,
                    client_session_id=job.client_session_id,
                    recording_mode=job.recording_mode,
                    scoring_version=job.scoring_version,
                    recording_attempt=job.recording_attempt,
                    current_user=user,
                    db=db,
                ))

            encoded_result = jsonable_encoder(result)
            if not encoded_result.get("session_id") or not encoded_result.get("analysis_result_id"):
                raise RuntimeError(encoded_result.get("save_error") or "Scoring completed without a durable database result")

            job.status = "completed"
            job.stage = "completed"
            job.result_json = encoded_result
            job.completed_at = datetime.utcnow()
            job.error_message = None
            db.commit()
            terminal = True
            logger.info("Async scoring job completed job_id=%s session_id=%s", job_id, encoded_result.get("session_id"))
            return {"status": "completed", "job_id": job_id, "session_id": encoded_result.get("session_id")}

        except Exception as exc:
            db.rollback()
            logger.error("Async scoring job failed job_id=%s retry=%s: %s", job_id, self.request.retries, exc, exc_info=True)
            job = db.query(ScoringJob).filter(ScoringJob.id == UUID(job_id)).first()
            if job:
                job.error_message = str(exc)[:2000]
                if self.request.retries < self.max_retries:
                    job.status = "queued"
                    job.stage = "retrying"
                else:
                    job.status = "failed"
                    job.stage = "failed"
                    job.completed_at = datetime.utcnow()
                    terminal = True
                db.commit()
            if self.request.retries < self.max_retries:
                raise self.retry(exc=exc, countdown=15 * (self.request.retries + 1))
            raise

        finally:
            try:
                if local_path.exists():
                    local_path.unlink()
            except Exception as cleanup_error:
                logger.warning("Could not delete scoring job temp file %s: %s", local_path, cleanup_error)
            if terminal and staged_path and cloud_storage is not None:
                cloud_storage.delete_file(staged_path)
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
    def process_scoring_job_async(*args, **kwargs):
        """Fallback: raises error if Celery not available."""
        raise RuntimeError("Celery not available. Install with: pip install celery[redis]")
    
    def cleanup_old_files_task(*args, **kwargs):
        """Fallback: no-op when Celery not available."""
        pass
