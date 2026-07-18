
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import json
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
import shutil
import os
import uuid
import gc  # For garbage collection
import threading
import time
from pathlib import Path
from typing import Optional

import setuptools, pkg_resources
print("setuptools:", setuptools.__version__)
print("pkg_resources OK")


try:
    from dotenv import load_dotenv
    load_dotenv()  # Loads .env file if it exists
except ImportError:
    # python-dotenv not installed, environment variables must be set manually
    pass
from scoring_engine import (
    calculate_similarity_score,
    extract_pitch,
    convert_to_wav,
    preprocess_audio,
    set_global_vosk_model,
    VOSK_MODEL_AVAILABLE,
    VOSK_MODEL_PATH,
)

from reference_library import reference_library
from db_reference_library import db_reference_library
from database import init_db, check_db_connection, get_db, User, UserRole, UserSession, AnalysisResult
from sqlalchemy.orm import Session
from sqlalchemy import and_
from db_session_service import db_session_service
from qari_service import qari_service
from quran_correctness_service import build_ai_recitation_notes, evaluate_quran_correctness
from progress_service import progress_service
from selected_recording_service import selected_recording_service
from auth import get_current_user_optional, require_registered_user, get_current_admin_user
from auth_endpoints import router as auth_router, debug_router as auth_debug_router, log_email_config_startup
from platform_endpoints import router as platform_router
import librosa
import logging

# Memory optimization: File size limits
MAX_FILE_SIZE = 100 * 1024 * 1024  # 20MB maximum file size
PROCESSING_SAMPLE_RATE = 16000  # Reduced from 22050 to save memory (~27% reduction)

# Mapping of common audio content types to file extensions
AUDIO_CONTENT_TYPE_EXT = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/3gpp": ".3gp",
    "audio/flac": ".flac",
}


def guess_audio_extension(upload: UploadFile, default_ext: str = ".mp3") -> str:
    """
    Guess a safe file extension for an uploaded audio file.

    Priority:
    1. Use the extension from the original filename if it exists.
    2. Fallback to mapping from content_type.
    3. Fallback to default_ext.
    """
    # 1) From filename
    if upload.filename:
        ext = Path(upload.filename).suffix
        if ext:
            return ext.lower()

    # 2) From content_type
    ct: Optional[str] = getattr(upload, "content_type", None)
    if ct:
        ct = ct.split(";")[0].strip().lower()
        if ct in AUDIO_CONTENT_TYPE_EXT:
            return AUDIO_CONTENT_TYPE_EXT[ct]

        # Broad matches, e.g. "audio/mpeg; codecs=..." or vendor types
        for key, ext in AUDIO_CONTENT_TYPE_EXT.items():
            if key in ct:
                return ext

    # 3) Fallback
    return default_ext

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
SCORING_CONCURRENCY = max(1, int(os.getenv("SCORING_CONCURRENCY", "2")))
scoring_semaphore = asyncio.Semaphore(SCORING_CONCURRENCY)
_scoring_active = 0
_scoring_waiting = 0
_scoring_counter_lock = asyncio.Lock()

# Import task_queue to initialize Celery (Milestone 4)
try:
    from task_queue import celery_app, CELERY_AVAILABLE
    if CELERY_AVAILABLE:
        logger.info("✓ Celery task queue available for async processing")
    else:
        logger.info("ℹ Celery not available - using synchronous processing")
except ImportError:
    logger.warning("task_queue module not available")
except Exception as e:
    logger.warning(f"Error importing task_queue: {e}")

# Import cloud_storage to initialize storage (Milestone 4)
try:
    from cloud_storage import cloud_storage, get_cloud_storage
    storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local").lower()
    # The cloud_storage instance is already initialized when imported
    # Check what type was actually initialized
    storage_class_name = cloud_storage.__class__.__name__
    if storage_class_name == "S3Storage":
        bucket_name = os.getenv("S3_BUCKET_NAME", "N/A")
        logger.info(f"✓ Cloud storage initialized: S3 (bucket: {bucket_name})")
    elif storage_class_name == "LocalStorage":
        if storage_type == "s3":
            logger.warning(f"⚠ S3 configured but failed to initialize. Using local storage fallback.")
        else:
            logger.info("ℹ Cloud storage: Using local file storage (Railway volumes)")
    else:
        logger.info(f"ℹ Cloud storage initialized: {storage_class_name}")
except ImportError:
    logger.warning("cloud_storage module not available")
except Exception as e:
    logger.warning(f"Error initializing cloud storage: {e}", exc_info=True)

# Global Vosk model (loaded once at startup for Railway memory efficiency)
vosk_model = None

# Lifespan event handler (replaces deprecated @app.on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events."""
    global vosk_model

    # Startup
    logger.info("Starting up application...")
    log_email_config_startup()

    # Initialize database
    try:
        logger.info("Initializing database...")
        init_db()
        if check_db_connection():
            logger.info("✓ Database connection successful")
        else:
            logger.warning("⚠ Database connection check failed, but continuing...")
    except Exception as e:
        logger.error(f"Database initialization error: {e}", exc_info=True)
        logger.warning("Continuing without database (will use file-based storage)")

    # Download model if needed
    auto_download = os.getenv("AUTO_DOWNLOAD_MODEL", "false").lower() == "true"
    if auto_download:
        try:
            from startup_download import ensure_model_available
            ensure_model_available()
        except Exception as e:
            logger.warning(f"Startup model download failed: {e}")

    # Load Vosk model once at startup (CRITICAL for Railway memory efficiency)
    if VOSK_MODEL_AVAILABLE:
        try:
            from vosk import Model as VoskModel
            logger.info(f"Loading Vosk model at startup from: {VOSK_MODEL_PATH}")
            vosk_model = VoskModel(VOSK_MODEL_PATH)
            # Set global model in scoring_engine
            set_global_vosk_model(vosk_model)
            logger.info("✓ Vosk model loaded successfully at startup (memory efficient)")
        except Exception as e:
            logger.error(f"Failed to load Vosk model at startup: {e}")
            vosk_model = None
    else:
        logger.info("Vosk model not available - text extraction will be disabled")

    yield  # Application runs here

    # Shutdown
    logger.info("Shutting down application...")
    if vosk_model is not None:
        vosk_model = None
        logger.info("Vosk model unloaded")

app = FastAPI(
    title="Tarannum AI Platform",
    description="Multi-user Quranic recitation learning platform",
    version="3.0.0",
    lifespan=lifespan
)

# Include routers for authentication and platform features
try:
    from auth_endpoints import router as auth_router, debug_router as auth_debug_router
    from platform_endpoints import router as platform_router
    app.include_router(auth_router)
    app.include_router(auth_debug_router)
    app.include_router(platform_router)
except ImportError as e:
    logger.warning(f"Could not import routers: {e}")

# Enable CORS - allow all origins for production deployment
# Note: allow_credentials cannot be True with allow_origins=["*"]
# If you need credentials, specify exact origins instead
# In production, replace ["*"] with specific allowed origins
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
if allowed_origins == ["*"]:
    allow_origins_list = ["*"]
    allow_creds = False  # Cannot use credentials with wildcard
else:
    allow_origins_list = [origin.strip() for origin in allowed_origins]
    allow_creds = True  # Can use credentials with specific origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins_list,
    allow_credentials=allow_creds,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],  # Explicitly allow OPTIONS
    allow_headers=["*"],  # Allow all headers (including Authorization)
    expose_headers=["*"],  # Expose all headers to frontend
)
logger.info(f"CORS configured: origins={allow_origins_list}, credentials={allow_creds}")

# Add rate limiting middleware (Milestone 4)
try:
    from rate_limiting import RateLimitMiddleware
    # Check if rate limiting is disabled in development
    enable_rate_limiting = os.getenv("ENABLE_RATE_LIMITING", "true").lower() == "true"

    if enable_rate_limiting:
        requests_per_minute = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
        burst_limit = int(os.getenv("RATE_LIMIT_BURST", "30"))  # Increased from 10 to 30
        requests_per_hour = int(os.getenv("RATE_LIMIT_PER_HOUR", "5000"))
        safe_read_requests_per_minute = int(os.getenv("RATE_LIMIT_SAFE_READ_PER_MINUTE", "1200"))
        safe_read_burst_limit = int(os.getenv("RATE_LIMIT_SAFE_READ_BURST", "300"))
        safe_read_requests_per_hour = int(os.getenv("RATE_LIMIT_SAFE_READ_PER_HOUR", "20000"))
        exclude_localhost = os.getenv("RATE_LIMIT_EXCLUDE_LOCALHOST", "true").lower() == "true"

        app.add_middleware(
            RateLimitMiddleware,
            requests_per_minute=requests_per_minute,
            requests_per_hour=requests_per_hour,
            burst_limit=burst_limit,
            safe_read_requests_per_minute=safe_read_requests_per_minute,
            safe_read_requests_per_hour=safe_read_requests_per_hour,
            safe_read_burst_limit=safe_read_burst_limit,
            exclude_localhost=exclude_localhost
        )
        localhost_note = " (localhost excluded)" if exclude_localhost else ""
        logger.info(f"Rate limiting enabled: {requests_per_minute} req/min, {burst_limit} burst, {requests_per_hour} req/hour{localhost_note}")
    else:
        logger.info("Rate limiting disabled (ENABLE_RATE_LIMITING=false)")
except Exception as e:
    logger.warning(f"Rate limiting middleware not available: {e}")

# Add security headers middleware (Milestone 4)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class OptionsHandlerMiddleware(BaseHTTPMiddleware):
    """Handle OPTIONS requests before FastAPI route validation."""
    async def dispatch(self, request, call_next):
        if request.method == "OPTIONS":
            logger.info(f"OptionsHandlerMiddleware: Handling OPTIONS request for {request.url.path}")
            # Return early for OPTIONS requests - CORS middleware will add headers
            response = Response(
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Max-Age": "3600",
                }
            )
            logger.info(f"OptionsHandlerMiddleware: Returning 200 for OPTIONS {request.url.path}")
            return response
        return await call_next(request)

# Add OPTIONS handler middleware BEFORE other middleware (but after CORS)
app.add_middleware(OptionsHandlerMiddleware)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Only add HSTS if using HTTPS
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)
logger.info("Security headers middleware enabled")


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Expose request latency and log slow endpoints without recording request bodies."""
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = f"{duration_ms:.1f}"
        if duration_ms >= float(os.getenv("SLOW_REQUEST_MS", "1000")):
            logger.warning(
                "Slow request method=%s path=%s status=%s duration_ms=%.1f request_id=%s",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
                request_id,
            )
        return response


class ScoringAdmissionMiddleware(BaseHTTPMiddleware):
    """Gate /score before multipart parsing, authentication and DB checkout."""
    async def dispatch(self, request, call_next):
        global _scoring_active, _scoring_waiting
        if request.method != "POST" or request.url.path != "/score":
            return await call_next(request)

        queued_at = time.perf_counter()
        async with _scoring_counter_lock:
            _scoring_waiting += 1
            waiting_position = _scoring_waiting
            active_snapshot = _scoring_active
        logger.info(
            "Scoring admission queued position=%s active=%s limit=%s",
            waiting_position,
            active_snapshot,
            SCORING_CONCURRENCY,
        )

        await scoring_semaphore.acquire()
        queue_wait_ms = (time.perf_counter() - queued_at) * 1000
        async with _scoring_counter_lock:
            _scoring_waiting = max(0, _scoring_waiting - 1)
            _scoring_active += 1
            active_now = _scoring_active
        logger.info(
            "Scoring admission started queue_wait_ms=%.1f active=%s limit=%s",
            queue_wait_ms,
            active_now,
            SCORING_CONCURRENCY,
        )

        try:
            response = await call_next(request)
            response.headers["X-Scoring-Queue-Wait-Ms"] = f"{queue_wait_ms:.1f}"
            response.headers["X-Scoring-Concurrency-Limit"] = str(SCORING_CONCURRENCY)
            return response
        finally:
            async with _scoring_counter_lock:
                _scoring_active = max(0, _scoring_active - 1)
                active_remaining = _scoring_active
            scoring_semaphore.release()
            logger.info("Scoring admission released active=%s", active_remaining)


# RequestTiming is added last and therefore remains outermost, so its latency
# includes time spent safely waiting for a scoring slot.
app.add_middleware(ScoringAdmissionMiddleware)
app.add_middleware(RequestTimingMiddleware)

# Get the directory where this script is located (backend folder)
BASE_DIR = Path(__file__).parent.resolve()

# Create temp directory for audio files (relative to backend folder)
TEMP_DIR = BASE_DIR / "temp_audio"
TEMP_DIR.mkdir(exist_ok=True)
REFERENCE_AUDIO_CACHE_DIR = TEMP_DIR / "reference_cache"
REFERENCE_AUDIO_CACHE_DIR.mkdir(exist_ok=True)
_reference_audio_cache_locks: dict[str, threading.Lock] = {}
_reference_audio_cache_locks_guard = threading.Lock()

# Create uploads directory for permanent storage (optional)
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

logger.info(f"Backend initialized. Temp directory: {TEMP_DIR}")
logger.info(f"Temp directory exists: {TEMP_DIR.exists()}")

def get_completed_recording_modes(
    db: Session,
    user_id: str,
    client_session_id: str,
    reference_id: Optional[str] = None,
) -> dict:
    query = (
        db.query(UserSession, AnalysisResult)
        .join(AnalysisResult, AnalysisResult.user_session_id == UserSession.id)
        .filter(
            UserSession.user_id == uuid.UUID(user_id),
            UserSession.client_session_id == client_session_id,
            UserSession.recording_mode.in_(["R1", "R2", "R3"]),
        )
    )
    if reference_id:
        query = query.filter(UserSession.reference_id == reference_id)

    completed = {}
    for session, analysis in query.order_by(UserSession.created_at.asc()).all():
        completed[session.recording_mode] = {
            "session_id": str(session.id),
            "analysis_result_id": str(analysis.id),
            "score": float(analysis.score),
            "attempt": session.recording_attempt or 1,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "scoring_version": session.scoring_version,
            "data_schema_version": session.data_schema_version,
            "integrity_status": session.integrity_status,
            "segments": analysis.segments or [],
            "pitch_data": analysis.pitch_data,
            "ayat_timing": analysis.ayat_timing or [],
            "feedback": analysis.feedback,
            "score_breakdown": analysis.score_breakdown,
        }
    return completed


def get_recording_assessment_summary(
    db: Session,
    user_id: str,
    client_session_id: str,
    reference_id: Optional[str] = None,
) -> dict:
    """Return the professional Baseline/Progress view without rewriting legacy data.

    R1 remains the single baseline capture. Existing R2 and R3 rows are both
    treated as progress attempts, while new clients submit progress as R2.
    The median is an observed attempt (nearest middle score), not a synthetic
    average, so its original audio and score remain auditable.
    """
    query = (
        db.query(UserSession, AnalysisResult)
        .join(AnalysisResult, AnalysisResult.user_session_id == UserSession.id)
        .filter(
            UserSession.user_id == uuid.UUID(user_id),
            UserSession.client_session_id == client_session_id,
            UserSession.recording_mode.in_(["R1", "R2", "R3"]),
        )
    )
    if reference_id:
        query = query.filter(UserSession.reference_id == reference_id)

    def serialize(session: UserSession, analysis: AnalysisResult) -> dict:
        return {
            "session_id": str(session.id),
            "analysis_result_id": str(analysis.id),
            "recording_mode": session.recording_mode,
            "score": float(analysis.score),
            "attempt": session.recording_attempt or 1,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "scoring_version": session.scoring_version,
            "integrity_status": session.integrity_status,
        }

    baseline = None
    progress = []
    for session, analysis in query.order_by(UserSession.created_at.asc()).all():
        item = serialize(session, analysis)
        if session.recording_mode == "R1" and baseline is None:
            baseline = item
        elif session.recording_mode in {"R2", "R3"}:
            progress.append(item)

    ranked_progress = sorted(progress, key=lambda item: (item["score"], item["created_at"] or ""))
    median_progress = ranked_progress[(len(ranked_progress) - 1) // 2] if ranked_progress else None
    best_progress = max(progress, key=lambda item: item["score"]) if progress else None
    return {
        "baseline": baseline,
        "progress_attempts": progress,
        "progress_count": len(progress),
        "median_progress": median_progress,
        "best_progress": best_progress,
    }


@app.get("/api/scoring/capacity")
async def get_scoring_capacity():
    """Return non-sensitive live queue pressure for the recording UI."""
    async with _scoring_counter_lock:
        return {
            "active": _scoring_active,
            "waiting": _scoring_waiting,
            "limit": SCORING_CONCURRENCY,
        }


@app.post("/score")
async def score_performance(
    user_audio: UploadFile = File(...),
    reference_audio: Optional[UploadFile] = File(None),
    reference_id: Optional[str] = Form(None),
    client_session_id: Optional[str] = Form(None),
    recording_mode: Optional[str] = Form(None),
    scoring_version: str = Form("V2.3"),
    recording_attempt: int = Form(1),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    ref_path = None
    user_path = None

    try:
        normalized_recording_mode = (recording_mode or "LEGACY").strip().upper()
        if normalized_recording_mode not in {"R1", "R2", "R3", "LEGACY"}:
            raise HTTPException(status_code=400, detail="recording_mode must be R1, R2, or R3")

        normalized_scoring_version = (scoring_version or "V2.3").strip().upper()
        if normalized_scoring_version != "V2.3":
            raise HTTPException(status_code=400, detail="Only scoring version V2.3 is accepted")
        if recording_attempt < 1:
            raise HTTPException(status_code=400, detail="recording_attempt must be at least 1")

        if client_session_id:
            try:
                uuid.UUID(client_session_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="client_session_id must be a valid UUID")
        else:
            client_session_id = str(uuid.uuid4())

        if normalized_recording_mode in {"R1", "R2", "R3"}:
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication is required for recording sessions")
            completed_modes = get_completed_recording_modes(
                db,
                str(current_user.id),
                client_session_id,
                reference_id,
            )
            required_mode = {"R2": "R1", "R3": "R2"}.get(normalized_recording_mode)
            if required_mode and required_mode not in completed_modes:
                raise HTTPException(
                    status_code=409,
                    detail=f"{required_mode} must be completed before {normalized_recording_mode}",
                )
            if normalized_recording_mode == "R1" and "R1" in completed_modes:
                raise HTTPException(status_code=409, detail="R1 has already been completed for this session")

        # Log incoming request details
        logger.info("=" * 50)
        logger.info("Received /score request")
        logger.info(f"User audio filename: {user_audio.filename}")
        logger.info(f"User audio content_type: {user_audio.content_type}")
        logger.info(f"Reference ID: {reference_id}")
        logger.info(f"Reference audio provided: {reference_audio is not None}")
        logger.info(f"Client session ID: {client_session_id}")
        logger.info(f"Recording mode: {normalized_recording_mode}")
        logger.info(f"Scoring version: {normalized_scoring_version}")
        logger.info(f"Recording attempt: {recording_attempt}")

        # Handle reference audio: either from library or upload
        if reference_id:
            # Load from library with access control
            user_role = current_user.role if current_user else UserRole.PUBLIC
            user_id = str(current_user.id) if current_user else None
            student_qari_id = None

            # Log authentication status
            if not current_user:
                logger.warning(f"⚠ Unauthenticated /score request for reference {reference_id} - will only allow public/demo content")
            else:
                logger.info(f"✓ Authenticated /score request: User {user_id}, Role: {user_role}")

            # Get student's Qari if they are a student
            if user_role == UserRole.STUDENT and current_user:
                try:
                    qari_info = qari_service.get_student_qari(str(current_user.id), db=db)
                    if qari_info:
                        student_qari_id = qari_info.get("qari_id")
                        logger.info(f"✓ Student {user_id} is assigned to Qari {student_qari_id}")
                    else:
                        logger.warning(f"⚠ Student {user_id} is not assigned to any Qari - can only access public content")
                except Exception as e:
                    logger.warning(f"Could not get student's Qari: {e}", exc_info=True)

            # Check access to reference
            ref_data = db_reference_library.get_reference(
                ref_id=reference_id,
                user_role=user_role,
                user_id=user_id,
                student_qari_id=student_qari_id,
                db=db
            )
            if not ref_data:
                # Get reference details for better error message
                from database import Reference
                ref_record = db.query(Reference).filter(Reference.id == reference_id).first()
                ref_owner = str(ref_record.owner_id) if ref_record and ref_record.owner_id else "None"
                ref_is_public = ref_record.is_public if ref_record else False

                logger.error(
                    f"✗ Reference {reference_id} access denied for /score. "
                    f"User: {user_id}, Role: {user_role}, Student Qari: {student_qari_id}, "
                    f"Ref Owner: {ref_owner}, Ref Is Public: {ref_is_public}"
                )

                # Provide helpful error message
                if not current_user:
                    error_detail = "Authentication required. Please log in to use this reference for scoring."
                elif user_role == UserRole.STUDENT and not student_qari_id:
                    error_detail = "You are not assigned to a Qari. Please select a Qari to access their content."
                elif user_role == UserRole.STUDENT and student_qari_id and ref_record and ref_record.owner_id:
                    error_detail = f"This reference belongs to a different Qari. You can only use your Qari's content or public content."
                elif user_role == UserRole.QARI and ref_record and ref_record.owner_id and str(ref_record.owner_id) != user_id:
                    error_detail = "This reference belongs to another Qari. You can only use your own content or public content."
                else:
                    error_detail = "Reference not found or access denied."

                raise HTTPException(status_code=403, detail=error_detail)

            # Get reference record to check for S3 storage
            from database import Reference
            ref_record = db.query(Reference).filter(Reference.id == reference_id).first()
            if not ref_record:
                raise HTTPException(status_code=404, detail=f"Reference with ID {reference_id} not found")

            # Handle S3 files - download temporarily for processing
            if ref_record.cloud_storage_type == "s3" and ref_record.cloud_storage_path:
                logger.info(f"Reference {reference_id} is in S3, downloading temporarily for scoring")
                logger.info(f"S3 path: {ref_record.cloud_storage_path}")
                try:
                    from cloud_storage import cloud_storage
                    from pathlib import Path as PathLib
                    import time
                    # Download from S3 to temp file with unique identifier to avoid conflicts
                    file_ext = PathLib(ref_record.filename).suffix if ref_record.filename else '.mp3'
                    # Add timestamp to make filename unique and avoid Windows file locking issues
                    unique_id = f"{reference_id}_{int(time.time() * 1000)}"
                    temp_audio_path = TEMP_DIR / f"s3_download_score_{unique_id}{file_ext}"

                    # Check if file exists in S3 first
                    if not cloud_storage.file_exists(ref_record.cloud_storage_path):
                        logger.error(f"File does not exist in S3: {ref_record.cloud_storage_path}")
                        raise HTTPException(
                            status_code=404,
                            detail=f"Reference file not found in S3. Path: {ref_record.cloud_storage_path}"
                        )

                    # Download from S3
                    success = cloud_storage.download_file(ref_record.cloud_storage_path, temp_audio_path)
                    if success and temp_audio_path.exists():
                        ref_path = temp_audio_path
                        logger.info(f"✓ Downloaded S3 file to: {ref_path}")
                    else:
                        logger.error(f"S3 download returned success={success}, file exists={temp_audio_path.exists() if temp_audio_path else False}")
                        raise HTTPException(
                            status_code=404,
                            detail=f"Could not download reference from S3: {reference_id}. Check S3 path: {ref_record.cloud_storage_path}"
                        )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"Error downloading from S3: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail=f"Error accessing S3 file: {str(e)}")
            else:
                # Local file - try to get from local storage
                ref_path = db_reference_library.get_reference_file_path(reference_id, db=db)
                if not ref_path or not ref_path.exists():
                    # If S3 was configured but file not in S3, might be in local storage
                    # Try local storage as fallback
                    logger.warning(f"Reference {reference_id} marked as local but not found. Trying local storage fallback...")
                    # Try local storage path directly
                    from pathlib import Path
                    local_storage_path = Path(__file__).parent / "uploads" / "references" / f"{reference_id}.mp3"
                    if local_storage_path.exists():
                        ref_path = local_storage_path
                        logger.info(f"Found reference in local storage: {ref_path}")
                    else:
                        raise HTTPException(status_code=404, detail=f"Reference audio file not found in S3 or local storage")
                else:
                    logger.info(f"Using reference from library: {ref_path}")
        elif reference_audio:
            # Use uploaded file (existing behavior)
            logger.info(f"Reference audio filename: {reference_audio.filename}")
            logger.info(f"Reference audio content_type: {reference_audio.content_type}")

            # Generate unique filenames to avoid conflicts
            ref_id = str(uuid.uuid4())
            user_id = str(uuid.uuid4())

            # Get file extensions from filename or content type (support many formats)
            ref_ext = guess_audio_extension(reference_audio, default_ext=".mp3")
            user_ext = guess_audio_extension(user_audio, default_ext=".webm")

            # Create file paths
            ref_path = TEMP_DIR / f"ref_{ref_id}{ref_ext}"
            user_path = TEMP_DIR / f"user_{user_id}{user_ext}"

            logger.info(f"Saving files to temp_audio folder:")
            logger.info(f"  - Reference: {ref_path}")
            logger.info(f"  - User: {user_path}")

            # Save reference audio file to temp_audio folder
            try:
                # Read file content
                content = await reference_audio.read()
                logger.info(f"Read reference audio: {len(content)} bytes")

                # Check file size to prevent memory issues
                if len(content) > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Reference audio too large: {len(content)} bytes (max: {MAX_FILE_SIZE} bytes / {MAX_FILE_SIZE // 1024 // 1024}MB)"
                    )

                if not content or len(content) == 0:
                    raise ValueError("Reference audio file is empty (0 bytes)")

                # Write to file
                with open(ref_path, "wb") as buffer:
                    buffer.write(content)

                # Verify file was written
                if not ref_path.exists():
                    raise ValueError(f"Reference audio file was not created: {ref_path}")
                file_size = ref_path.stat().st_size
                if file_size == 0:
                    raise ValueError(f"Reference audio file is empty after save: {ref_path}")

                logger.info(f"✓ Reference audio saved: {file_size} bytes to {ref_path}")
            except Exception as e:
                logger.error(f"Error saving reference audio: {e}", exc_info=True)
                raise HTTPException(status_code=400, detail=f"Failed to save reference audio: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail="Either reference_audio or reference_id must be provided")

        # Generate unique filename for user audio if not already set
        if user_path is None:
            user_id = str(uuid.uuid4())
            user_ext = guess_audio_extension(user_audio, default_ext=".webm")
            user_path = TEMP_DIR / f"user_{user_id}{user_ext}"
            logger.info(f"Generated user audio path: {user_path}")

        # Save user audio file to temp_audio folder
        try:
            # Read file content
            content = await user_audio.read()
            logger.info(f"Read user audio: {len(content)} bytes")

            # Check file size to prevent memory issues
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"User audio too large: {len(content)} bytes (max: {MAX_FILE_SIZE} bytes / {MAX_FILE_SIZE // 1024 // 1024}MB)"
                )

            if not content or len(content) == 0:
                raise ValueError("User audio file is empty (0 bytes)")

            # Write to file
            with open(user_path, "wb") as buffer:
                buffer.write(content)

            # Verify file was written
            if not user_path.exists():
                raise ValueError(f"User audio file was not created: {user_path}")

            file_size = user_path.stat().st_size
            if file_size == 0:
                raise ValueError(f"User audio file is empty after save: {user_path}")

            logger.info(f"✓ User audio saved: {file_size} bytes to {user_path}")
        except Exception as e:
            logger.error(f"Error saving user audio: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"Failed to save user audio: {str(e)}")

        # Verify files exist and have content
        if not ref_path.exists() or ref_path.stat().st_size == 0:
            raise ValueError(f"Reference audio file not saved properly: {ref_path}")
        if not user_path.exists() or user_path.stat().st_size == 0:
            raise ValueError(f"User audio file not saved properly: {user_path}")

        logger.info(f"Files saved successfully. Ref size: {ref_path.stat().st_size} bytes, User size: {user_path.stat().st_size} bytes")

        # Get text segments from reference if available (for Quranic text-based scoring)
        text_segments_for_scoring = []
        if reference_id and ref_data and ref_data.get('text_segments'):
            text_segments_for_scoring = ref_data['text_segments']
            # Filter to only include segments with actual text content
            text_segments_for_scoring = [seg for seg in text_segments_for_scoring if seg.get('text') and seg.get('text', '').strip()]
            logger.info(f"Found {len(text_segments_for_scoring)} text segments with content for scoring")
        else:
            logger.info("No text segments available - will use dynamic segmentation")

        # Calculate similarity score with segments and pitch data
        try:
            logger.info("Starting similarity calculation...")
            # Concurrency is admitted by ScoringAdmissionMiddleware before file
            # parsing and DB checkout. A second semaphore here would deadlock.
            result = await asyncio.to_thread(
                calculate_similarity_score,
                str(ref_path),
                str(user_path),
                return_segments=True,
                return_pitch=True,
                return_ayah_timing=False,  # Disabled - admin manually enters text in preset editor
                text_segments=text_segments_for_scoring if text_segments_for_scoring else None,
            )

            # Handle different return types
            # Since we're requesting segments, pitch, and ayah_timing, result should be a tuple
            # Training feedback is always included as the last element
            ayah_timing = []
            training_feedback = {}
            if isinstance(result, tuple):
                # Training feedback is always the last element
                if len(result) > 0:
                    training_feedback = result[-1] if isinstance(result[-1], dict) and 'label' in result[-1] else {}

                if len(result) == 6:
                    # (score, segments, pitch_data, ayah_timing, pronunciation_alerts, training_feedback)
                    score, segments, pitch_data, ayah_timing, pronunciation_alerts, training_feedback = result
                elif len(result) == 5:
                    # With return_ayah_timing=False: (score, segments, pitch_data, pronunciation_alerts, training_feedback)
                    # With return_ayah_timing=True (old code): (score, segments, pitch_data, ayah_timing, training_feedback)
                    # Check the 4th element to determine which format
                    score, segments, pitch_data, fourth, training_feedback = result
                    if isinstance(fourth, list):
                        # Check if it's pronunciation_alerts (has 'time', 'expected', 'detected') or ayah_timing (has 'text', 'start', 'end')
                        if len(fourth) > 0 and isinstance(fourth[0], dict):
                            if 'time' in fourth[0] and 'expected' in fourth[0]:
                                # It's pronunciation_alerts
                                pronunciation_alerts = fourth
                                ayah_timing = []
                            elif 'text' in fourth[0] and 'start' in fourth[0]:
                                # It's ayah_timing (old format without pronunciation_alerts)
                                ayah_timing = fourth
                                pronunciation_alerts = []
                            else:
                                # Default: assume it's pronunciation_alerts (most common case)
                                pronunciation_alerts = fourth
                                ayah_timing = []
                        else:
                            # Empty list - default to pronunciation_alerts
                            pronunciation_alerts = fourth
                            ayah_timing = []
                    else:
                        # Not a list - shouldn't happen, but default to empty
                        pronunciation_alerts = []
                        ayah_timing = []
                elif len(result) == 4:
                    # (score, segments, pitch_data, training_feedback) - both ayah_timing and pronunciation_alerts not included
                    score, segments, pitch_data, training_feedback = result
                    ayah_timing = []
                    pronunciation_alerts = []
                elif len(result) == 3:
                    # (score, segments, training_feedback) or (score, pitch_data, training_feedback)
                    score = result[0]
                    second = result[1]
                    training_feedback = result[2] if isinstance(result[2], dict) and 'label' in result[2] else {}
                    if isinstance(second, list) and len(second) > 0 and isinstance(second[0], dict):
                        if 'start' in second[0] and 'end' in second[0]:
                            # It's segments
                            segments = second
                            pitch_data = {}
                        elif 'text' in second[0]:
                            # It's ayah_timing
                            ayah_timing = second
                            segments = []
                            pitch_data = {}
                        else:
                            # Could be pitch_data (list of pitch points)
                            segments = []
                            pitch_data = {'reference': second, 'student': [], 'errorPoints': []}
                    elif isinstance(second, dict):
                        # It's pitch_data
                        segments = []
                        pitch_data = second
                    else:
                        segments = []
                        pitch_data = {}
                    ayah_timing = []
                    pronunciation_alerts = []
                elif len(result) == 2:
                    # (score, training_feedback) - only score and feedback
                    score = result[0]
                    training_feedback = result[1] if isinstance(result[1], dict) and 'label' in result[1] else {}
                    segments = []
                    pitch_data = {}
                    ayah_timing = []
                    pronunciation_alerts = []
                else:
                    score = result[0] if len(result) > 0 else result
                    segments = []
                    pitch_data = {}
                    ayah_timing = []
                    pronunciation_alerts = []
            else:
                score = result
                segments = []
                pitch_data = {}
                ayah_timing = []
                pronunciation_alerts = []
                training_feedback = {}

            # Ensure score is a valid number
            try:
                if isinstance(score, (int, float)):
                    final_score = float(score)
                elif hasattr(score, 'item'):
                    final_score = float(score.item())  # type: ignore  # Convert numpy scalar
                else:
                    final_score = float(score)  # type: ignore
            except (ValueError, TypeError, AttributeError):
                logger.warning(f"Score is not a number: {type(score)}, using 0")
                final_score = 0.0

            logger.info(f"Score calculated: {final_score}")
            logger.info(f"Segments calculated: {len(segments)}")

            # Verify segments have score field and log first segment
            if segments and len(segments) > 0:
                first_seg = segments[0]
                logger.info(f"First segment structure: {first_seg}")
                logger.info(f"First segment has 'score' key: {'score' in first_seg}")
                if 'score' in first_seg:
                    logger.info(f"First segment score value: {first_seg['score']} (type: {type(first_seg['score'])})")

            logger.info(f"Pitch data: ref={len(pitch_data.get('reference', [])) if isinstance(pitch_data, dict) else 0} points, student={len(pitch_data.get('student', [])) if isinstance(pitch_data, dict) else 0} points")

            # Log detailed pitch data structure for debugging
            if isinstance(pitch_data, dict):
                logger.info(f"Pitch data type: dict, keys: {list(pitch_data.keys())}")
                if pitch_data.get('reference'):
                    logger.info(f"First reference pitch point: {pitch_data['reference'][0] if len(pitch_data.get('reference', [])) > 0 else 'N/A'}")
                if pitch_data.get('student'):
                    logger.info(f"First student pitch point: {pitch_data['student'][0] if len(pitch_data.get('student', [])) > 0 else 'N/A'}")
            else:
                logger.warning(f"Pitch data is not a dict! Type: {type(pitch_data)}, Value: {pitch_data}")

            # Ensure all segments have score field, normalized 0-100 (Milestone 5)
            validated_segments = []
            for i, seg in enumerate(segments):
                # Prefer normalized from backend; fallback to score
                seg_normalized = seg.get('normalized')
                seg_score = seg.get('score') if seg_normalized is None else seg_normalized
                logger.debug(f"Segment {i} raw score from dict: {seg_score} (type: {type(seg_score)})")

                if seg_score is None:
                    logger.warning(f"Segment {i} missing score field in dictionary: {seg}")
                    seg_score = 0.0
                elif not isinstance(seg_score, (int, float)):
                    try:
                        if hasattr(seg_score, 'item'):
                            seg_score = seg_score.item()
                        else:
                            seg_score = float(seg_score)
                    except (ValueError, TypeError, AttributeError):
                        logger.warning(f"Segment {i} has invalid score type: {type(seg_score)}, value: {seg_score}, using 0")
                        seg_score = 0.0

                try:
                    seg_score = float(seg_score)
                    seg_score = max(0.0, min(100.0, seg_score))
                except (ValueError, TypeError):
                    seg_score = 0.0

                if seg_score > 0 and seg_score < 0.01:
                    normalized_val = float(seg_score)
                else:
                    normalized_val = float(round(seg_score, 2))

                validated_seg = {
                    'segmentId': seg.get('segmentId', f'seg_{i}'),
                    'start': seg.get('start', 0),
                    'end': seg.get('end', 0),
                    'score': normalized_val,
                    'normalized': normalized_val,
                    'accuracy': seg.get('accuracy', 'low')
                }
                if seg.get('raw') is not None:
                    validated_seg['raw'] = float(seg['raw'])
                if seg.get('max') is not None:
                    validated_seg['max'] = float(seg['max'])
                if seg.get('text') is not None:
                    validated_seg['text'] = seg['text']
                logger.debug(f"Segment {i} validated score: {validated_seg['score']} (type: {type(validated_seg['score'])})")
                validated_segments.append(validated_seg)

            logger.info(f"Validated {len(validated_segments)} segments, first segment score: {validated_segments[0]['score'] if validated_segments else 'N/A'}")

            # Regenerate segment feedback with validated segments to ensure correct segment scores
            # The original training_feedback was generated with unvalidated segments
            if validated_segments and len(validated_segments) > 0 and isinstance(training_feedback, dict):
                logger.info("Regenerating segment feedback with validated segments...")
                original_feedback_by_index = {}
                for old_fb in training_feedback.get('segment_feedback') or []:
                    try:
                        original_feedback_by_index[int(old_fb.get('segment_index', len(original_feedback_by_index)))] = old_fb
                    except (TypeError, ValueError):
                        continue

                def _ayat_feedback_message(seg_score, issues):
                    issues = issues or []
                    if 'timing_too_slow' in issues:
                        return 'Timing sedikit lambat; ikut perubahan ayat rujukan'
                    if 'timing_too_fast' in issues:
                        return 'Timing sedikit cepat; stabilkan tempo ayat'
                    if 'pitch_too_high' in issues or 'pitch_too_low' in issues:
                        if seg_score >= 85:
                            return 'Alunan hampir selari, teruskan kawalan graph'
                        if seg_score >= 75:
                            return 'Alunan baik, kemaskan sedikit lenggok'
                        if seg_score >= 60:
                            return 'Alunan belum cukup selari dengan rujukan'
                        return 'Ulang bahagian ini dengan alunan lebih dekat kepada rujukan'
                    if seg_score >= 85:
                        return 'Alunan dan timing hampir selari'
                    if seg_score >= 75:
                        return 'Alunan baik, kemaskan sedikit timing'
                    if seg_score >= 60:
                        return 'Graph agak selari, ulang untuk lebih stabil'
                    return 'Ulang bahagian ini dengan graph yang lebih dekat kepada rujukan'

                def _ayat_feedback_label(seg_score):
                    if seg_score >= 85:
                        return 'Kuat'
                    if seg_score >= 75:
                        return 'Baik'
                    if seg_score >= 60:
                        return 'Perlu kemas'
                    return 'Perlu ulang'

                segment_feedback = []
                for i, seg in enumerate(validated_segments):
                    seg_score = seg.get('score', 0.0)
                    seg_accuracy = seg.get('accuracy', 'low')
                    old_fb = original_feedback_by_index.get(i, {})
                    issues = old_fb.get('issues') or []
                    practice_technique = old_fb.get('practiceTechnique') or ''

                    seg_fb = {
                        'segment_index': i,
                        'start': seg.get('start', 0.0),
                        'end': seg.get('end', 0.0),
                        'score': seg_score,
                        'label': _ayat_feedback_label(seg_score),
                        'message': _ayat_feedback_message(seg_score, issues),
                        'issues': issues,
                        'practiceTechnique': practice_technique,
                    }
                    if seg.get('text') is not None:
                        seg_fb['text'] = seg.get('text')

                    segment_feedback.append(seg_fb)

                # Update the training_feedback with regenerated segment_feedback
                training_feedback['segment_feedback'] = segment_feedback
                training_feedback['ayat_feedback'] = segment_feedback
                logger.info(f"Regenerated segment feedback with {len(validated_segments)} validated segments")

            # Prepare regions array for pitch visualization (same as segments but with different naming)
            regions = []
            for seg in validated_segments:
                regions.append({
                    "start": seg.get('start', 0),
                    "end": seg.get('end', 0),
                    "score": seg.get('score', 0)
                })

            # Extract score breakdown from training_feedback if available
            score_breakdown = None
            if isinstance(training_feedback, dict) and 'scoreBreakdown' in training_feedback:
                breakdown = training_feedback['scoreBreakdown']
                base_score_val = breakdown.get('base_score', 0)
                pitch_score_val = breakdown.get('pitch_score', 0)
                segment_score_val = breakdown.get('segment_consistency_score')
                if segment_score_val is None:
                    segment_score_val = breakdown.get('segment_based_overall')
                if segment_score_val is None:
                    segment_score_val = base_score_val

                # These fields are assessment components, not full tajwid judgment.
                # Keep legacy pitch/timing/pronunciation keys for frontend compatibility,
                # while exposing clearer tarannum-aware fields for debugging/UI.
                feature_scores = breakdown.get('feature_scores') or {}
                assessment_validity = breakdown.get('assessment_validity') or {}
                chroma_score = feature_scores.get('chroma')
                mfcc_score = feature_scores.get('mfcc')
                spectral_score = feature_scores.get('spectral_contrast')
                tonnetz_score = feature_scores.get('tonnetz')
                zcr_score = feature_scores.get('zcr')

                tonal_pattern_val = chroma_score if chroma_score is not None else base_score_val
                audio_clarity_val = mfcc_score if mfcc_score is not None else base_score_val
                stability_components = [
                    val for val in [spectral_score, zcr_score, tonnetz_score]
                    if isinstance(val, (int, float))
                ]
                mic_stability_val = (
                    sum(stability_components) / len(stability_components)
                    if stability_components else base_score_val
                )

                score_breakdown = {
                    "scoringVersion": breakdown.get('scoring_version', 'v1'),
                    "pitch": round(pitch_score_val, 2),
                    "timing": round(segment_score_val, 2),
                    "pronunciation": round(base_score_val, 2),
                    "consistency": round(segment_score_val, 2),
                    "audioMatch": round(base_score_val, 2),
                    "pitchContour": round(pitch_score_val, 2),
                    "ayatTiming": round(segment_score_val, 2),
                    "graphStability": round(breakdown.get('graph_stability_score', pitch_score_val) or pitch_score_val, 2),
                    "graphPosition": round(breakdown.get('graph_position_score', pitch_score_val) or pitch_score_val, 2),
                    "contourDetail": round(breakdown.get('contour_detail_score', pitch_score_val) or pitch_score_val, 2),
                    "ayatGraph": round(breakdown.get('ayat_graph_score', segment_score_val) or segment_score_val, 2),
                    "segmentCoverage": round(breakdown.get('segment_coverage_score', 0) or 0, 2),
                    "recitationValidity": round(breakdown.get('recitation_validity_score', 0) or 0, 2),
                    "tonalPattern": round(tonal_pattern_val, 2),
                    "audioClarity": round(audio_clarity_val, 2),
                    "micStability": round(mic_stability_val, 2),
                    "rawBase": round(breakdown.get('raw_base_score', base_score_val), 2),
                    "rawPitch": round(breakdown.get('raw_pitch_contour_score', pitch_score_val), 2),
                    "segmentOverall": round(segment_score_val, 2),
                    "finalAfterSegmentFusion": round(breakdown.get('final_score_after_segment_fusion', final_score), 2),
                    "weights": breakdown.get('assessment_weights'),
                    "featureScores": feature_scores,
                }
                if assessment_validity:
                    score_breakdown["assessmentValidity"] = assessment_validity

            # Normalized overall score 0-100 (Milestone 5)
            normalized_overall = max(0.0, min(100.0, float(final_score)))
            normalized_overall = round(normalized_overall, 2)

            # Prepare response
            response_data = {
                "score": normalized_overall,
                "normalizedScore": normalized_overall,
                "maxPossible": 100.0,
                "pronunciationAlerts": pronunciation_alerts,
                "segments": validated_segments,
                "pitchData": pitch_data,
                "regions": regions,
                "ayatTiming": ayah_timing,
                "feedback": training_feedback,
                "ayatFeedback": training_feedback.get('ayat_feedback') if isinstance(training_feedback, dict) else None,
                "scoreBreakdown": score_breakdown,
                "assessmentValidity": (
                    score_breakdown.get("assessmentValidity")
                    if isinstance(score_breakdown, dict) else None
                ),
            }

            # Log final response structure for debugging
            logger.info(f"=== FINAL RESPONSE DEBUG ===")
            logger.info(f"Response has pitchData: {'pitchData' in response_data}")
            if 'pitchData' in response_data:
                pd = response_data['pitchData']
                logger.info(f"pitchData type: {type(pd)}")
                if isinstance(pd, dict):
                    logger.info(f"pitchData keys: {list(pd.keys())}")
                    logger.info(f"pitchData.reference length: {len(pd.get('reference', []))}")
                    logger.info(f"pitchData.student length: {len(pd.get('student', []))}")
            logger.info(f"=== END RESPONSE DEBUG ===")

            # Final verification - log the actual response data structure
            logger.info(f"=== RESPONSE DATA VERIFICATION ===")
            logger.info(f"Response score: {response_data['score']}")
            logger.info(f"Response segments count: {len(response_data['segments'])}")
            if response_data['segments']:
                first_resp_seg = response_data['segments'][0]
                logger.info(f"First response segment: {first_resp_seg}")
                logger.info(f"First response segment score: {first_resp_seg.get('score')} (type: {type(first_resp_seg.get('score'))})")
            logger.info(f"=== END VERIFICATION ===")

            # Save to database: Create user session and analysis result
            try:
                # Determine user_id and role
                user_id = None
                user_role = None
                qari_id = None

                if current_user:
                    user_id = str(current_user.id)
                    user_role = current_user.role

                    # Get student's Qari if they are a student
                    if user_role == UserRole.STUDENT:
                        try:
                            qari_info = qari_service.get_student_qari(user_id, db=db)
                            if qari_info:
                                qari_id = qari_info.get("qari_id")
                                logger.info(f"Student {user_id} is assigned to Qari {qari_id}")
                        except Exception as e:
                            logger.warning(f"Could not get student's Qari: {e}")

                # Save scores for ALL authenticated users (Qari, Student, Admin)
                # Only Public/unauthenticated users skip saving (demo mode only)
                if user_role == UserRole.PUBLIC or not current_user:
                    logger.info("Public user or unauthenticated - skipping database save (demo mode)")
                else:
                    # Save for Qari, Student, and Admin users
                    logger.info(f"✓ Saving analysis result for user: {user_id}, role: {user_role}")
                    try:
                        # Create user session
                        user_session = db_session_service.create_user_session(
                            user_audio_path=user_path,
                            reference_id=reference_id if reference_id else None,
                            user_id=user_id,
                            qari_id=qari_id,
                            client_session_id=client_session_id,
                            recording_mode=normalized_recording_mode,
                            scoring_version=normalized_scoring_version,
                            recording_attempt=recording_attempt,
                            db=db
                        )
                        logger.info(f"Created user session: {user_session.id}")

                        # Save analysis result to analysis_results table
                        analysis_result = db_session_service.save_analysis_result(
                            user_session_id=str(user_session.id),
                            score=final_score,
                            reference_id=reference_id if reference_id else None,
                            segments=validated_segments,
                            pitch_data=pitch_data,
                            regions=regions,
                            ayat_timing=ayah_timing,
                            feedback=training_feedback,
                            score_breakdown=score_breakdown,
                            pronunciation_alerts=pronunciation_alerts,
                            db=db
                        )
                        logger.info(f"✓ Saved analysis result to analysis_results table (ID: {analysis_result.id}, Session: {user_session.id})")

                        # Maintain the curated lowest/median/highest student recording slots.
                        try:
                            selected_recording_service.update_selected_recordings_for_session(
                                session_id=str(user_session.id),
                                analysis_result_id=str(analysis_result.id),
                                db=db,
                            )
                        except Exception as selected_recording_error:
                            logger.error(
                                f"Error updating selected recordings (non-fatal): {selected_recording_error}",
                                exc_info=True,
                            )

                        # Save student progress (only for students)
                        if user_role == UserRole.STUDENT and user_id:
                            try:
                                # Extract verse scores from ayat_timing if available
                                verse_scores = None
                                if ayah_timing and isinstance(ayah_timing, list):
                                    verse_scores = []
                                    for ayah in ayah_timing:
                                        if isinstance(ayah, dict):
                                            # Find corresponding segment score
                                            ayah_start = ayah.get("start", 0)
                                            ayah_end = ayah.get("end", 0)
                                            ayah_score = 0.0

                                            # Match with segment scores
                                            for seg in validated_segments:
                                                seg_start = seg.get("start", 0)
                                                seg_end = seg.get("end", 0)
                                                # Check if segment overlaps with ayah
                                                if seg_start < ayah_end and seg_end > ayah_start:
                                                    seg_score = seg.get("score", 0)
                                                    if seg_score > ayah_score:
                                                        ayah_score = seg_score

                                            verse_scores.append({
                                                "start": ayah_start,
                                                "end": ayah_end,
                                                "score": ayah_score,
                                                "text": ayah.get("text", "")
                                            })

                                progress_service.save_progress(
                                    student_id=user_id,
                                    session_id=str(user_session.id),
                                    overall_score=final_score,
                                    qari_id=qari_id,
                                    reference_id=reference_id,
                                    verse_scores=verse_scores,
                                    segments=validated_segments,
                                    db=db
                                )
                                logger.info(f"✓ Saved student progress to student_progress table for {user_id} (Qari: {qari_id})")
                            except Exception as progress_error:
                                logger.error(f"Error saving student progress (non-fatal): {progress_error}", exc_info=True)

                        # Add session ID to response for tracking
                        response_data["session_id"] = str(user_session.id)
                        response_data["analysis_result_id"] = str(analysis_result.id)
                        response_data["client_session_id"] = client_session_id
                        response_data["recording_mode"] = normalized_recording_mode
                        response_data["scoring_version"] = normalized_scoring_version
                        response_data["recording_attempt"] = recording_attempt
                        db.refresh(user_session)
                        response_data["data_schema_version"] = user_session.data_schema_version
                        response_data["integrity_status"] = user_session.integrity_status
                        logger.info(f"✓ Successfully saved all data: session={user_session.id}, analysis_result={analysis_result.id}")
                    except Exception as save_error:
                        # Log the error with full details
                        logger.error(f"✗ Failed to save analysis result to database: {save_error}", exc_info=True)
                        logger.error(f"  User ID: {user_id}, Role: {user_role}, Reference ID: {reference_id}")
                        # Re-raise to see the actual error (or log more details)
                        import traceback
                        logger.error(f"  Full traceback: {traceback.format_exc()}")
                        # Don't fail the request, but log the error clearly
                        response_data["save_error"] = f"Database save failed: {str(save_error)}"
                        response_data["save_warning"] = "Analysis completed but could not be saved to database. Check server logs."

            except Exception as db_error:
                # Log database error but don't fail the request
                logger.error(f"✗ Error in database save block (non-fatal): {db_error}", exc_info=True)
                import traceback
                logger.error(f"  Full traceback: {traceback.format_exc()}")
                # Continue with response even if database save fails

        except Exception as e:
            logger.error(f"Error in scoring: {e}")
            raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")

        # Cleanup temporary files and free memory
        # IMPORTANT: Only delete files from TEMP_DIR, never from UPLOADS_DIR
        try:
            # Force garbage collection to free memory
            gc.collect()

            # Only delete ref_path if it's in TEMP_DIR (not from library/UPLOADS_DIR)
            # This includes S3 downloads which are stored in TEMP_DIR
            if ref_path and ref_path.exists() and TEMP_DIR in ref_path.parents:
                # Delete temp files (uploaded files or S3 downloads)
                if "s3_download" in str(ref_path) or reference_id is None:
                    os.remove(ref_path)
                    logger.info(f"Deleted temporary reference file: {ref_path}")
                else:
                    logger.info(f"Skipping deletion of library reference file: {ref_path}")
            elif ref_path and ref_path.exists():
                logger.info(f"Skipping deletion of library reference file: {ref_path}")

            # Only delete user_path if it's in TEMP_DIR
            if user_path and user_path.exists() and TEMP_DIR in user_path.parents:
                os.remove(user_path)
                logger.info(f"Deleted temporary user file: {user_path}")

            logger.info("Temporary files cleaned up and memory freed")
        except Exception as e:
            logger.warning(f"Error cleaning up files: {e}")

        return JSONResponse(content=response_data)

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        # Cleanup on error - only delete temp files (not library files)
        try:
            # Only delete ref_path if it's in TEMP_DIR (not from library/UPLOADS_DIR)
            # This includes S3 downloads which are stored in TEMP_DIR
            if ref_path and ref_path.exists() and TEMP_DIR in ref_path.parents:
                # Delete temp files (uploaded files or S3 downloads)
                if "s3_download" in str(ref_path) or reference_id is None:
                    os.remove(ref_path)
                    logger.info(f"Deleted temporary reference file on error: {ref_path}")

            # Only delete user_path if it's in TEMP_DIR
            if user_path and user_path.exists() and TEMP_DIR in user_path.parents:
                os.remove(user_path)
                logger.info(f"Deleted temporary user file on error: {user_path}")
        except Exception as cleanup_error:
            logger.warning(f"Error during cleanup on exception: {cleanup_error}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Internal server error: {str(e)}"}
        )

@app.post("/api/extract-pitch")
async def extract_pitch_endpoint(
    audio: UploadFile = File(None),
    reference_id: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Extract pitch data from an audio file (typically reference audio).
    Can use either uploaded audio file OR reference_id from library.
    Returns pitch data in the same format as the scoring endpoint.
    This allows frontend to pre-extract reference pitch when audio loads.

    Access control:
    - Admin: All references
    - Qari: Their own + public references
    - Student: Their Qari's + public references
    - Public: Only public references
    """
    audio_path = None
    wav_path = None

    try:
        logger.info("=" * 50)
        logger.info("Received /api/extract-pitch request")

        # Handle reference_id (preferred - uses backend-stored file)
        if reference_id:
            logger.info(f"Using reference_id: {reference_id}")

            # Check access control first (before cache check for security)
            user_role = current_user.role if current_user else UserRole.PUBLIC
            user_id = str(current_user.id) if current_user else None
            student_qari_id = None

            # Get student's Qari if they are a student
            if user_role == UserRole.STUDENT and current_user:
                try:
                    from qari_service import qari_service
                    qari_info = qari_service.get_student_qari(str(current_user.id), db=db)
                    if qari_info:
                        student_qari_id = qari_info.get("qari_id")
                except Exception as e:
                    logger.warning(f"Could not get student's Qari: {e}")

            # Check access to reference
            ref_data = db_reference_library.get_reference(
                ref_id=reference_id,
                user_role=user_role,
                user_id=user_id,
                student_qari_id=student_qari_id,
                db=db
            )
            if not ref_data:
                logger.warning(
                    f"Reference {reference_id} access denied. "
                    f"User: {user_id}, Role: {user_role}, Student Qari: {student_qari_id}"
                )
                raise HTTPException(
                    status_code=403,
                    detail="Reference not found or access denied. You don't have permission to access this reference."
                )

            # Check cache first for library references (after access control)
            cached_pitch_data = db_reference_library.get_cached_pitch_data(reference_id)
            if cached_pitch_data:
                logger.info(f"Returning cached pitch data for reference_id: {reference_id}")
                return JSONResponse(content={
                    "reference": cached_pitch_data,
                    "student": [],
                    "ayah_timing": []
                })

            # Check if reference exists and get file path or S3 info
            from database import Reference
            ref_record = db.query(Reference).filter(Reference.id == reference_id).first()
            if not ref_record:
                raise HTTPException(status_code=404, detail=f"Reference with ID {reference_id} not found")

            # Handle S3 files - download temporarily for processing
            if ref_record.cloud_storage_type == "s3" and ref_record.cloud_storage_path:
                logger.info(f"Reference {reference_id} is in S3, downloading temporarily for pitch extraction")
                logger.info(f"S3 path: {ref_record.cloud_storage_path}")
                try:
                    from cloud_storage import cloud_storage
                    from pathlib import Path as PathLib
                    # Download from S3 to temp file
                    file_ext = PathLib(ref_record.filename).suffix if ref_record.filename else '.mp3'
                    temp_audio_path = TEMP_DIR / f"s3_download_{reference_id}{file_ext}"

                    # Check if file exists in S3 first
                    if not cloud_storage.file_exists(ref_record.cloud_storage_path):
                        logger.error(f"File does not exist in S3: {ref_record.cloud_storage_path}")
                        raise HTTPException(
                            status_code=404,
                            detail=f"Reference file not found in S3. Path: {ref_record.cloud_storage_path}"
                        )

                    # Download from S3
                    success = cloud_storage.download_file(ref_record.cloud_storage_path, temp_audio_path)
                    if success and temp_audio_path.exists():
                        audio_path = temp_audio_path
                        logger.info(f"✓ Downloaded S3 file to: {audio_path}")
                    else:
                        logger.error(f"S3 download returned success={success}, file exists={temp_audio_path.exists() if temp_audio_path else False}")
                        raise HTTPException(
                            status_code=404,
                            detail=f"Could not download reference from S3: {reference_id}. Check S3 path: {ref_record.cloud_storage_path}"
                        )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"Error downloading from S3: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail=f"Error accessing S3 file: {str(e)}")
            else:
                # Local file - try to get from local storage
                audio_path = db_reference_library.get_reference_file_path(reference_id, db=db)
                if not audio_path or not audio_path.exists():
                    # If S3 was configured but file not in S3, might be in local storage
                    # Try local storage as fallback
                    logger.warning(f"Reference {reference_id} marked as S3 but not found. Trying local storage fallback...")
                    # Try local storage path directly
                    from pathlib import Path
                    local_storage_path = Path(__file__).parent / "uploads" / "references" / f"{reference_id}.mp3"
                    if local_storage_path.exists():
                        audio_path = local_storage_path
                        logger.info(f"Found reference in local storage: {audio_path}")
                    else:
                        raise HTTPException(status_code=404, detail=f"Reference with ID {reference_id} not found in S3 or local storage")
                else:
                    logger.info(f"Using reference from library: {audio_path} (no cached pitch data found, will extract)")
        elif audio:
            # Fallback: use uploaded file
            logger.info(f"Audio filename: {audio.filename}")
            logger.info(f"Audio content_type: {audio.content_type}")

            # Generate unique filename
            audio_id = str(uuid.uuid4())
            audio_ext = guess_audio_extension(audio, default_ext=".mp3")
            audio_path = TEMP_DIR / f"pitch_{audio_id}{audio_ext}"

            # Save uploaded file
            content = await audio.read()
            if not content or len(content) == 0:
                raise ValueError("Audio file is empty")

            # Check file size to prevent memory issues
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File too large: {len(content)} bytes (max: {MAX_FILE_SIZE} bytes / {MAX_FILE_SIZE // 1024 // 1024}MB)"
                )

            with open(audio_path, "wb") as buffer:
                buffer.write(content)

            logger.info(f"Saved audio file: {audio_path.stat().st_size} bytes")
        else:
            raise HTTPException(status_code=400, detail="Either audio file or reference_id must be provided")

        # Convert to WAV if needed (for librosa compatibility)
        wav_path = convert_to_wav(str(audio_path))

        # Load audio with librosa at reduced sample rate for memory efficiency
        audio_data, sr = librosa.load(wav_path, sr=PROCESSING_SAMPLE_RATE, mono=True)
        logger.info(f"Loaded audio: {len(audio_data)} samples, {sr} Hz")

        # Note: Don't delete WAV file here - we'll clean it up later if it's a temp file

        # Use same minimal processing as scoring endpoint for consistency
        # Minimal processing: just normalization, no noise reduction (close to original)
        audio_processed = librosa.util.normalize(audio_data)
        logger.info(f"Audio normalized: {len(audio_processed)} samples (original: {len(audio_data)})")

        # Extract pitch using librosa (accurate backend extraction)
        # Use normalized but untrimmed audio to preserve full duration
        pitch_data = extract_pitch(audio_processed, sr, fmin=60.0, fmax=1200.0)
        logger.info(f"Extracted {len(pitch_data)} pitch points")

        # Text timing removed - admin manually enters text in preset editor
        # No automatic text extraction needed for manual workflow
        ayah_timing = []

        # Convert to frontend format
        # Backend returns: [{time, f_hz, midi, confidence}, ...]
        # Frontend expects: {reference: [...], student: [], ayah_timing: [...]}
        pitch_response = {
            "reference": pitch_data,  # Use "reference" key for consistency
            "student": [],  # Empty for reference-only extraction
            "ayah_timing": ayah_timing  # Empty - text is manually entered by admin
        }

        # Cache pitch data if it's a library reference
        if reference_id:
            db_reference_library.cache_pitch_data(reference_id, pitch_data)
            logger.info(f"Cached pitch data for reference_id: {reference_id}")

        # Cleanup temporary files and free memory
        try:
            # Clear audio data from memory
            del audio_data, audio_processed
            gc.collect()  # Force garbage collection

            # Only delete temp files if we created them (not library files, but include S3 downloads)
            if audio_path and audio_path.exists() and TEMP_DIR in audio_path.parents:
                # Delete if it's a temp file (uploaded file or S3 download)
                if reference_id is None or "s3_download_" in str(audio_path):
                    try:
                        os.remove(audio_path)
                        logger.debug(f"Cleaned up temp file: {audio_path}")
                    except Exception as e:
                        logger.warning(f"Could not delete temp file {audio_path}: {e}")
            if wav_path and wav_path != str(audio_path) and Path(wav_path).exists() and TEMP_DIR in Path(wav_path).parents:
                try:
                    os.remove(wav_path)
                    logger.debug(f"Cleaned up temp WAV file: {wav_path}")
                except Exception as e:
                    logger.warning(f"Could not delete temp WAV file {wav_path}: {e}")
            logger.info("Temporary files cleaned up and memory freed")
        except Exception as e:
            logger.warning(f"Error cleaning up files: {e}")

        return JSONResponse(content=pitch_response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting pitch: {e}", exc_info=True)
        # Cleanup on error - delete temp files (including S3 downloads)
        try:
            if audio_path and audio_path.exists() and TEMP_DIR in audio_path.parents:
                # Delete if it's a temp file (uploaded file or S3 download)
                if reference_id is None or "s3_download_" in str(audio_path):
                    os.remove(audio_path)
            if wav_path and wav_path != str(audio_path) and Path(wav_path).exists() and TEMP_DIR in Path(wav_path).parents:
                os.remove(wav_path)
        except Exception as e:
            logger.warning(f"Error during cleanup: {e}")
        raise HTTPException(status_code=500, detail=f"Pitch extraction error: {str(e)}")

@app.options("/{full_path:path}")
async def options_catchall(full_path: str):
    """Catch-all OPTIONS handler for CORS preflight requests."""
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "3600",
        }
    )

@app.get("/")
async def root():
    return {
        "message": "Tarannum Voice Training API",
        "version": "1.0.0",
        "endpoints": {
            "score": "POST /score - Upload reference_audio and user_audio files to get similarity score",
            "extract_pitch": "POST /api/extract-pitch - Extract pitch data from audio file"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    # Count files in temp_audio directory
    temp_files = list(TEMP_DIR.glob("*")) if TEMP_DIR.exists() else []
    return {
        "status": "healthy",
        "temp_dir": str(TEMP_DIR),
        "temp_dir_exists": TEMP_DIR.exists(),
        "temp_dir_files_count": len(temp_files),
        "uploads_dir": str(UPLOADS_DIR),
        "uploads_dir_exists": UPLOADS_DIR.exists()
    }

@app.post("/test-upload")
async def test_upload(
    test_file: UploadFile = File(...)
):
    """Test endpoint to verify file upload is working"""
    try:
        content = await test_file.read()
        return {
            "success": True,
            "filename": test_file.filename,
            "content_type": test_file.content_type,
            "size": len(content),
            "message": "File received successfully"
        }
    except Exception as e:
        logger.error(f"Test upload error: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

@app.get("/debug/files")
async def list_temp_files():
    """Debug endpoint to list files in temp_audio folder"""
    if not TEMP_DIR.exists():
        return {"error": "temp_audio directory does not exist"}

    files = []
    for file_path in TEMP_DIR.glob("*"):
        if file_path.is_file():
            files.append({
                "name": file_path.name,
                "size": file_path.stat().st_size,
                "path": str(file_path)
            })

    return {
        "temp_dir": str(TEMP_DIR),
        "files": files,
        "count": len(files)
    }


# Reference Audio Library Endpoints
@app.post("/api/references/upload")
async def upload_reference(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    maqam: Optional[str] = Form(None),
    is_public: bool = Form(False),
    target_qari_id: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Upload a new reference audio file to the library.
    - Admin: Can upload and set as public
    - Qari: Can upload their own content (owner_id set automatically)
    - Student/Public: Cannot upload
    """
    try:
        # Access control: Only Admin and Qari can upload
        if not current_user:
            logger.warning("Upload failed: No current_user - authentication required")
            raise HTTPException(status_code=401, detail="Authentication required to upload references")

        if current_user.role not in [UserRole.ADMIN, UserRole.QARI]:
            raise HTTPException(
                status_code=403,
                detail="Only Admin and Qari can upload reference audio files"
            )

        # Qari must be approved
        if current_user.role == UserRole.QARI and not current_user.is_approved:
            raise HTTPException(
                status_code=403,
                detail="Qari account must be approved by Admin before uploading content"
            )

        target_qari = None
        if target_qari_id:
            if current_user.role != UserRole.ADMIN:
                raise HTTPException(
                    status_code=403,
                    detail="Only Admin can upload content on behalf of a Qari"
                )
            from uuid import UUID
            try:
                target_qari_uuid = UUID(target_qari_id)
            except (ValueError, AttributeError):
                raise HTTPException(status_code=404, detail="Target Qari not found")
            target_qari = db.query(User).filter(User.id == target_qari_uuid).first()
            if not target_qari or target_qari.role != UserRole.QARI:
                raise HTTPException(status_code=404, detail="Target Qari not found")

        if not title:
            # Use filename as title if not provided
            title = file.filename or "Untitled Reference"

        # Save uploaded file temporarily
        temp_id = str(uuid.uuid4())
        ext = guess_audio_extension(file, default_ext=".mp3")
        temp_path = TEMP_DIR / f"upload_{temp_id}{ext}"

        # Check file size
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large: {len(content)} bytes (max: {MAX_FILE_SIZE} bytes)"
            )

        # Write to temp file
        with open(temp_path, "wb") as buffer:
            buffer.write(content)

        logger.info(f"Temporary file saved: {temp_path} ({len(content)} bytes)")

        # Determine owner_id and is_public
        # Both Admin and Qari should have owner_id set to their user_id
        if target_qari:
            owner_id = str(target_qari.id)
        elif current_user.role == UserRole.QARI:
            owner_id = str(current_user.id)
        elif current_user.role == UserRole.ADMIN:
            owner_id = str(current_user.id)  # Admin should also have owner_id set
        else:
            owner_id = None
        # Admin uploads are public by default (accessible to public users)
        # Qari content is private by default
        if target_qari:
            public_flag = False
        elif current_user.role == UserRole.ADMIN:
            # Default to True for Admin uploads unless explicitly set to False
            public_flag = is_public if is_public else True
        else:
            public_flag = False  # Qari content is private by default

        # Save to library
        try:
            ref_data = db_reference_library.save_reference(
                audio_file_path=temp_path,
                title=title,
                maqam=maqam,
                filename=file.filename,
                owner_id=owner_id,
                is_public=public_flag,
                db=db
            )
            logger.info(f"Successfully saved reference to library: {ref_data.get('id', 'unknown')}")

            # If Qari uploaded, or Admin uploaded for a Qari, automatically add to that Qari's Content Library
            qari_content_owner_id = str(target_qari.id) if target_qari else (owner_id if current_user.role == UserRole.QARI else None)
            if qari_content_owner_id:
                try:
                    from qari_service import qari_service
                    qari_service.add_content_to_qari(
                        qari_id=qari_content_owner_id,
                        reference_id=ref_data.get('id'),
                        maqam=maqam,
                        db=db
                    )
                    logger.info(f"Automatically added reference {ref_data.get('id')} to Qari {qari_content_owner_id}'s Content Library")
                except Exception as qari_content_error:
                    # Non-critical - log but don't fail the upload
                    logger.warning(f"Could not add reference to Qari Content Library: {qari_content_error}")

            # Track that this reference was "used" (uploaded/accessed) by creating a UserSession
            # This ensures the reference appears in "last used" sorting
            try:
                from database import UserSession
                from datetime import datetime

                # Create a session record to track this reference usage
                usage_session = UserSession(
                    user_id=current_user.id if current_user else None,
                    reference_id=ref_data.get('id'),
                    qari_id=UUID(qari_content_owner_id or owner_id) if (qari_content_owner_id or owner_id) else None,
                    is_public_demo=False,
                    created_at=datetime.utcnow()
                )
                db.add(usage_session)
                db.commit()
                logger.info(f"Created usage session for reference {ref_data.get('id')}")
            except Exception as session_error:
                # Non-critical - log but don't fail the upload
                logger.warning(f"Could not create usage session for reference: {session_error}")
                db.rollback()
        except Exception as save_error:
            logger.error(f"Error saving reference to library: {save_error}", exc_info=True)
            # Clean up temp file before re-raising (with error handling)
            if temp_path.exists():
                try:
                    import time
                    time.sleep(0.1)  # Small delay to ensure file handles are closed
                    temp_path.unlink()
                except (PermissionError, OSError) as delete_error:
                    logger.warning(f"Could not delete temp file {temp_path} after error: {delete_error}")
                except Exception as delete_error:
                    logger.warning(f"Unexpected error deleting temp file {temp_path}: {delete_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save reference to library: {str(save_error)}"
            )

        # Clean up temp file (with error handling - not critical if deletion fails)
        if temp_path.exists():
            try:
                # On Windows, files might still be in use, so add a small delay and retry
                import time
                time.sleep(0.1)  # Small delay to ensure file handles are closed
                temp_path.unlink()
            except (PermissionError, OSError) as delete_error:
                # File might still be in use - log warning but don't fail the request
                logger.warning(f"Could not delete temp file {temp_path}: {delete_error}. It will be cleaned up later.")
            except Exception as delete_error:
                logger.warning(f"Unexpected error deleting temp file {temp_path}: {delete_error}")

        return ref_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading reference: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/references")
def list_references(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    List references with role-based access control.
    - Admin: Only their own uploaded files (filtered by owner_id), sorted by upload_date DESC
    - Qari: Only their own uploaded files (filtered by owner_id), sorted by upload_date DESC
    - Student: Their Qari's + public
    - Public: Only public references

    Returns empty list if there's an error (graceful degradation).
    """
    try:
        from qari_service import qari_service

        user_role = current_user.role if current_user else UserRole.PUBLIC
        owner_id = str(current_user.id) if current_user and current_user.role == UserRole.QARI else None
        # Get Admin's user_id for text segment filtering
        admin_user_id = str(current_user.id) if current_user and current_user.role == UserRole.ADMIN else None
        student_qari_id = None

        # Get student's Qari if they are a student
        if user_role == UserRole.STUDENT and current_user:
            try:
                qari_info = qari_service.get_student_qari(str(current_user.id), db=db)
                if qari_info:
                    student_qari_id = qari_info.get("qari_id")
            except Exception as e:
                logger.warning(f"Could not get student's Qari: {e}")

        references = db_reference_library.list_references(
            owner_id=owner_id,
            user_role=user_role,
            student_qari_id=student_qari_id,
            admin_user_id=admin_user_id,
            db=db
        )
        return {"references": references, "count": len(references)}
    except Exception as e:
        # Return empty list instead of raising error (graceful degradation)
        logger.warning(f"Error listing references (returning empty list): {e}", exc_info=True)
        return {"references": [], "count": 0}


@app.get("/api/references/{ref_id}/pitch")
def get_cached_pitch_data(
    ref_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Retrieve cached pitch data for a given reference ID with access control.
    - Admin: All references
    - Qari: Their own + public
    - Student: Their Qari's + public
    - Public: Only public references
    """
    try:
        from qari_service import qari_service

        user_role = current_user.role if current_user else UserRole.PUBLIC
        user_id = str(current_user.id) if current_user else None
        student_qari_id = None

        # Get student's Qari if they are a student
        if user_role == UserRole.STUDENT and current_user:
            try:
                qari_info = qari_service.get_student_qari(str(current_user.id), db=db)
                if qari_info:
                    student_qari_id = qari_info.get("qari_id")
            except Exception as e:
                logger.warning(f"Could not get student's Qari: {e}")

        # Check access first
        ref_data = db_reference_library.get_reference(
            ref_id=ref_id,
            user_role=user_role,
            user_id=user_id,
            student_qari_id=student_qari_id,
            db=db
        )
        if not ref_data:
            raise HTTPException(status_code=404, detail="Reference not found or access denied")

        cached_pitch_data = db_reference_library.get_cached_pitch_data(ref_id, db=db)
        if not cached_pitch_data:
            raise HTTPException(status_code=404, detail="Cached pitch data not found")
        return JSONResponse(content={
            "reference": cached_pitch_data,
            "student": [],
            "ayah_timing": []
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving cached pitch data for {ref_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/references/{ref_id}")
def get_reference(
    ref_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Get reference metadata by ID with access control.
    - Admin: All references
    - Qari: Their own + public
    - Student: Their Qari's + public
    - Public: Only public references
    """
    try:
        from qari_service import qari_service

        user_role = current_user.role if current_user else UserRole.PUBLIC
        user_id = str(current_user.id) if current_user else None
        student_qari_id = None

        # Get student's Qari if they are a student
        if user_role == UserRole.STUDENT and current_user:
            try:
                qari_info = qari_service.get_student_qari(str(current_user.id), db=db)
                if qari_info:
                    student_qari_id = qari_info.get("qari_id")
            except Exception as e:
                logger.warning(f"Could not get student's Qari: {e}")

        ref_data = db_reference_library.get_reference(
            ref_id=ref_id,
            user_role=user_role,
            user_id=user_id,
            student_qari_id=student_qari_id,
            db=db
        )
        if not ref_data:
            raise HTTPException(status_code=404, detail="Reference not found or access denied")
        return ref_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting reference: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/references/{ref_id}/audio")
async def get_reference_audio(
    ref_id: str,
    request: Request,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Download reference audio file by ID with access control.
    - Admin: All references
    - Qari: Their own + public
    - Student: Their Qari's + public
    - Public: Only public references
    """
    try:
        from qari_service import qari_service

        user_role = current_user.role if current_user else UserRole.PUBLIC
        user_id = str(current_user.id) if current_user else None
        student_qari_id = None

        # Log authentication status for debugging
        if not current_user:
            # Check if Authorization header was sent
            auth_header = request.headers.get("Authorization", "")
            has_bearer = auth_header.startswith("Bearer ")
            logger.warning(
                f"⚠ Unauthenticated request for reference {ref_id} - will only allow public/demo content. "
                f"Auth header present: {bool(auth_header)}, Has Bearer: {has_bearer}"
            )
            if auth_header and not has_bearer:
                logger.warning(f"⚠ Authorization header present but doesn't start with 'Bearer ': {auth_header[:50]}")
            elif not auth_header:
                logger.warning(f"⚠ No Authorization header in request")
        else:
            logger.info(f"✓ Authenticated user: {user_id}, Role: {user_role}")

        # Get student's Qari if they are a student
        if user_role == UserRole.STUDENT and current_user:
            try:
                qari_info = qari_service.get_student_qari(str(current_user.id), db=db)
                if qari_info:
                    student_qari_id = qari_info.get("qari_id")
                    logger.info(f"✓ Student {user_id} is assigned to Qari {student_qari_id}")
                else:
                    logger.warning(f"⚠ Student {user_id} is not assigned to any Qari - can only access public content")
            except Exception as e:
                logger.warning(f"Could not get student's Qari: {e}", exc_info=True)

        # Check access first
        ref_data = db_reference_library.get_reference(
            ref_id=ref_id,
            user_role=user_role,
            user_id=user_id,
            student_qari_id=student_qari_id,
            db=db
        )
        if not ref_data:
            # Get reference details for better error message
            from database import Reference
            ref_record = db.query(Reference).filter(Reference.id == ref_id).first()
            ref_owner = str(ref_record.owner_id) if ref_record and ref_record.owner_id else "None"
            ref_is_public = ref_record.is_public if ref_record else False

            logger.warning(
                f"✗ Reference {ref_id} access denied. "
                f"User: {user_id}, Role: {user_role}, Student Qari: {student_qari_id}, "
                f"Ref Owner: {ref_owner}, Ref Is Public: {ref_is_public}"
            )

            # Provide helpful error message
            if not current_user:
                error_detail = "Authentication required. Please log in to access this reference."
            elif user_role == UserRole.STUDENT and not student_qari_id:
                error_detail = "You are not assigned to a Qari. Please select a Qari to access their content."
            elif user_role == UserRole.STUDENT and student_qari_id and ref_record and ref_record.owner_id:
                error_detail = f"This reference belongs to a different Qari. You can only access your Qari's content or public content."
            else:
                error_detail = "Reference not found or access denied."

            raise HTTPException(status_code=404, detail=error_detail)

        logger.info(f"Getting audio file for reference {ref_id}: {ref_data.get('title', 'Unknown')}")
        file_path = db_reference_library.get_reference_file_path(ref_id, db=db)

        # Check if this is a cloud storage reference
        from database import Reference
        ref_record = db.query(Reference).filter(Reference.id == ref_id).first()

        if ref_record and ref_record.cloud_storage_type and ref_record.cloud_storage_path:
            # Proxy S3 file through backend to avoid CORS issues
            try:
                from cloud_storage import cloud_storage
                from pathlib import Path as PathLib

                extension = PathLib(ref_record.filename).suffix if ref_record.filename else ".mp3"
                cache_version = f"{int(ref_record.file_size or 0)}_{int(ref_record.upload_date.timestamp()) if ref_record.upload_date else 0}"
                temp_audio_path = REFERENCE_AUDIO_CACHE_DIR / f"{ref_id}_{cache_version}{extension}"

                with _reference_audio_cache_locks_guard:
                    cache_lock = _reference_audio_cache_locks.setdefault(ref_id, threading.Lock())

                with cache_lock:
                    success = temp_audio_path.exists() and temp_audio_path.stat().st_size > 0
                    if success:
                        logger.info(f"Reference audio cache hit for {ref_id}: {temp_audio_path.name}")
                    else:
                        partial_path = temp_audio_path.with_suffix(f"{temp_audio_path.suffix}.{uuid.uuid4().hex}.part")
                        success = cloud_storage.download_file(ref_record.cloud_storage_path, partial_path)
                        if success and partial_path.exists() and partial_path.stat().st_size > 0:
                            partial_path.replace(temp_audio_path)
                            logger.info(f"Reference audio cached for {ref_id}: {temp_audio_path.name}")
                        elif partial_path.exists():
                            partial_path.unlink(missing_ok=True)

                if success and temp_audio_path.exists():
                    # Serve file through backend (avoids CORS)
                    from fastapi.responses import FileResponse
                    media_type = "audio/mpeg"  # default
                    if temp_audio_path.suffix.lower() == ".wav":
                        media_type = "audio/wav"
                    elif temp_audio_path.suffix.lower() in [".m4a", ".mp4"]:
                        media_type = "audio/mp4"
                    elif temp_audio_path.suffix.lower() == ".ogg":
                        media_type = "audio/ogg"

                    # Return file response (will be cleaned up by system)
                    return FileResponse(
                        path=str(temp_audio_path),
                        media_type=media_type,
                        filename=ref_record.filename or temp_audio_path.name,
                        headers={
                            "Cache-Control": "private, max-age=3600",
                            "X-Content-Type-Options": "nosniff"
                        }
                    )
                else:
                    raise HTTPException(status_code=404, detail=f"Could not download file from S3")
            except Exception as e:
                logger.error(f"Error accessing cloud storage for reference {ref_id}: {e}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Error accessing cloud storage: {str(e)}"
                )

        # Local file storage
        if not file_path or not file_path.exists():
            logger.error(
                f"Reference audio file not found for {ref_id}. "
                f"File path: {file_path}, "
                f"Cloud storage: {ref_record.cloud_storage_type if ref_record else 'N/A'}"
            )
            raise HTTPException(
                status_code=404,
                detail=f"Reference audio file not found. Reference ID: {ref_id}"
            )

        from fastapi.responses import FileResponse
        # Determine media type from file extension
        media_type = "audio/mpeg"  # default
        if file_path.suffix.lower() == ".wav":
            media_type = "audio/wav"
        elif file_path.suffix.lower() in [".m4a", ".mp4"]:
            media_type = "audio/mp4"
        elif file_path.suffix.lower() == ".ogg":
            media_type = "audio/ogg"

        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=file_path.name,
            headers={
                "Cache-Control": "private, max-age=3600",
                "X-Content-Type-Options": "nosniff"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting reference audio: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/references/{ref_id}/trim")
async def trim_reference_audio(
    ref_id: str,
    trim_start: float = Form(...),
    trim_end: float = Form(...),
    target_user_id: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Trim the start/end of a reference audio file and replace the stored reference audio."""
    source_path = None
    trimmed_path = None
    fallback_wav_path = None
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if current_user.role not in [UserRole.ADMIN, UserRole.QARI]:
            raise HTTPException(status_code=403, detail="Only Admin and Qari can trim reference audio")

        from uuid import UUID
        from database import Reference, TextSegment, PitchCache
        from pydub import AudioSegment

        ref_record = db.query(Reference).filter(Reference.id == ref_id).first()
        if not ref_record:
            raise HTTPException(status_code=404, detail="Reference not found")

        if current_user.role == UserRole.QARI and ref_record.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="You can only trim your own references")

        segment_owner_id = ref_record.owner_id or current_user.id
        if target_user_id:
            if current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Only Admin can trim on behalf of another user")
            try:
                segment_owner_uuid = UUID(target_user_id)
            except (ValueError, AttributeError):
                raise HTTPException(status_code=404, detail="Target Qari not found")
            target_user = db.query(User).filter(User.id == segment_owner_uuid).first()
            if not target_user or target_user.role != UserRole.QARI:
                raise HTTPException(status_code=404, detail="Target Qari not found")
            segment_owner_id = target_user.id

        original_duration = float(ref_record.duration or 0)
        if original_duration <= 0:
            raise HTTPException(status_code=400, detail="Reference duration is not available")
        if trim_start < 0 or trim_end <= trim_start or trim_end > original_duration + 0.1:
            raise HTTPException(
                status_code=400,
                detail=f"Trim range must be between 0 and {original_duration:.2f} seconds, and end must be after start"
            )

        ext = Path(ref_record.filename or ref_record.file_path or "reference.mp3").suffix or ".mp3"
        source_path = TEMP_DIR / f"trim_source_{ref_id}_{uuid.uuid4().hex}{ext}"
        trimmed_path = TEMP_DIR / f"trimmed_{ref_id}_{uuid.uuid4().hex}.mp3"
        fallback_wav_path = None

        if ref_record.cloud_storage_type and ref_record.cloud_storage_path:
            from cloud_storage import cloud_storage
            success = cloud_storage.download_file(ref_record.cloud_storage_path, source_path)
            if not success or not source_path.exists():
                raise HTTPException(status_code=404, detail="Could not download reference audio for trimming")
        else:
            local_path = db_reference_library.get_reference_file_path(ref_id, db=db)
            if not local_path or not local_path.exists():
                raise HTTPException(status_code=404, detail="Reference audio file not found")
            shutil.copyfile(local_path, source_path)

        try:
            audio = AudioSegment.from_file(source_path)
            start_ms = max(0, int(trim_start * 1000))
            end_ms = min(len(audio), int(trim_end * 1000))
            trimmed_audio = audio[start_ms:end_ms]

            trimmed_audio.export(trimmed_path, format="mp3", bitrate="128k")
            verified_duration = len(trimmed_audio) / 1000.0
        except Exception as pydub_error:
            is_missing_ffmpeg = any(
                text in str(pydub_error).lower()
                for text in ["ffmpeg", "ffprobe", "no such file", "cannot find the file"]
            )
            if not is_missing_ffmpeg:
                raise

            logger.warning(
                f"pydub MP3 export failed, using librosa WAV temp + ffmpeg MP3 encode fallback: {pydub_error}"
            )
            from scipy.io import wavfile
            import numpy as np
            import subprocess

            audio_data, sample_rate = librosa.load(str(source_path), sr=None, mono=False)
            total_samples = audio_data.shape[-1]
            start_sample = max(0, int(trim_start * sample_rate))
            end_sample = min(total_samples, int(trim_end * sample_rate))
            trimmed_data = audio_data[..., start_sample:end_sample]

            if trimmed_data.size == 0:
                raise HTTPException(status_code=400, detail="Trim range produced empty audio")

            wav_data = np.clip(trimmed_data, -1.0, 1.0)
            if wav_data.ndim == 2:
                wav_data = wav_data.T
            wav_int16 = (wav_data * 32767).astype(np.int16)
            fallback_wav_path = TEMP_DIR / f"trimmed_source_{ref_id}_{uuid.uuid4().hex}.wav"
            wavfile.write(str(fallback_wav_path), sample_rate, wav_int16)

            ffmpeg_path = shutil.which("ffmpeg")
            if not ffmpeg_path:
                try:
                    import imageio_ffmpeg
                    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
                except Exception as ffmpeg_lookup_error:
                    logger.error(f"Could not locate ffmpeg for MP3 trim export: {ffmpeg_lookup_error}")
            if not ffmpeg_path:
                for venv_name in [".venv", ".venv-codex"]:
                    binaries_dir = BASE_DIR / venv_name / "Lib" / "site-packages" / "imageio_ffmpeg" / "binaries"
                    ffmpeg_candidates = sorted(binaries_dir.glob("ffmpeg*.exe")) if binaries_dir.exists() else []
                    if ffmpeg_candidates:
                        ffmpeg_path = str(ffmpeg_candidates[0])
                        logger.info(f"Using bundled imageio-ffmpeg binary: {ffmpeg_path}")
                        break

            if not ffmpeg_path:
                raise HTTPException(
                    status_code=500,
                    detail="MP3 trim export requires ffmpeg. Install ffmpeg or install backend dependency imageio-ffmpeg."
                )

            subprocess.run(
                [
                    ffmpeg_path,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(fallback_wav_path),
                    "-vn",
                    "-codec:a",
                    "libmp3lame",
                    "-b:a",
                    "128k",
                    str(trimmed_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            verified_duration = trimmed_data.shape[-1] / float(sample_rate)

        if ref_record.cloud_storage_type and ref_record.cloud_storage_path:
            from cloud_storage import cloud_storage

            remote_path = ref_record.cloud_storage_path
            if remote_path.startswith("s3://"):
                remote_path = remote_path.replace("s3://", "").split("/", 1)[1]
            remote_path = str(Path(remote_path).with_suffix(".mp3")).replace("\\", "/")
            cloud_url = cloud_storage.upload_file(trimmed_path, remote_path)
            ref_record.cloud_storage_path = cloud_url
            ref_record.file_path = cloud_url
        else:
            local_path = db_reference_library.get_reference_file_path(ref_id, db=db)
            if not local_path:
                raise HTTPException(status_code=404, detail="Reference audio file not found")
            local_path = local_path.with_suffix(".mp3")
            local_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(trimmed_path, local_path)
            ref_record.file_path = str(local_path.relative_to(Path(__file__).parent)).replace("\\", "/")

        current_name = ref_record.filename or f"{ref_id}{ext}"
        ref_record.filename = f"{Path(current_name).stem}.mp3"

        ref_record.duration = float(verified_duration)
        ref_record.file_size = trimmed_path.stat().st_size
        ref_record.upload_date = datetime.utcnow()

        db.query(PitchCache).filter(PitchCache.reference_id == ref_id).delete()

        # Shift existing text segments for the selected Qari/user after trimming the start.
        new_duration = trim_end - trim_start
        segment_query = db.query(TextSegment).filter(TextSegment.reference_id == ref_id)
        if segment_owner_id:
            segment_query = segment_query.filter(TextSegment.user_id == segment_owner_id)
        for segment in segment_query.all():
            new_start = max(0.0, float(segment.start or 0) - trim_start)
            new_end = min(new_duration, float(segment.end or 0) - trim_start)
            if new_end <= 0 or new_start >= new_duration or new_end <= new_start:
                db.delete(segment)
            else:
                segment.start = new_start
                segment.end = new_end

        db.commit()
        db.refresh(ref_record)
        return db_reference_library._reference_to_dict(ref_record)

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error trimming reference audio: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for temp_path in [source_path, trimmed_path, fallback_wav_path]:
            if temp_path and Path(temp_path).exists():
                try:
                    Path(temp_path).unlink()
                except Exception as cleanup_error:
                    logger.warning(f"Could not clean up temp trim file {temp_path}: {cleanup_error}")


@app.delete("/api/references/{ref_id}")
async def delete_reference(
    ref_id: str,
    current_user: User = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """
    Delete a reference from the library.
    - Admin: Can delete any reference
    - Qari: Can only delete their own references
    - Student/Public: Cannot delete
    """
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Authentication required")

        # Check access: Only Admin and Qari can delete
        if current_user.role not in [UserRole.ADMIN, UserRole.QARI]:
            raise HTTPException(status_code=403, detail="Only Admin and Qari can delete references")

        # Get reference to check ownership
        ref_data = db_reference_library.get_reference(ref_id, db=db)
        if not ref_data:
            raise HTTPException(status_code=404, detail="Reference not found")

        # Qari can only delete their own references
        if current_user.role == UserRole.QARI:
            from database import Reference
            ref = db.query(Reference).filter(Reference.id == ref_id).first()
            if not ref or ref.owner_id != current_user.id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only delete your own references"
                )

        success = db_reference_library.delete_reference(ref_id, db=db)
        if not success:
            raise HTTPException(status_code=404, detail="Reference not found")
        return {"success": True, "message": "Reference deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting reference: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Admin Preset Management Endpoints
@app.post("/api/admin/presets")
async def create_preset(
    reference_id: str = Form(...),
    title: str = Form(...),
    text_segments: str = Form(...),  # JSON string
    maqam: Optional[str] = Form(None),
    target_user_id: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Create or update a training preset with text segments."""
    try:
        import json

        # Parse text_segments JSON
        try:
            segments = json.loads(text_segments)
            if not isinstance(segments, list):
                raise ValueError("text_segments must be a JSON array")

            # Validate segment structure
            for seg in segments:
                if not isinstance(seg, dict):
                    raise ValueError("Each segment must be an object")
                if "text" not in seg or "start" not in seg or "end" not in seg:
                    raise ValueError("Each segment must have 'text', 'start', and 'end' fields")
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON in text_segments: {str(e)}")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # Get user_id for text segments ownership. Admin may save on behalf of a Qari.
        user_id = str(current_user.id) if current_user else None
        if target_user_id:
            if not current_user or current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Only Admin can save text segments for another user")
            from uuid import UUID
            try:
                target_user_uuid = UUID(target_user_id)
            except (ValueError, AttributeError):
                raise HTTPException(status_code=404, detail="Target Qari not found")
            target_user = db.query(User).filter(User.id == target_user_uuid).first()
            if not target_user or target_user.role != UserRole.QARI:
                raise HTTPException(status_code=404, detail="Target Qari not found")
            user_id = str(target_user.id)

        # Save preset
        preset = db_reference_library.save_preset(
            reference_id=reference_id,
            title=title,
            text_segments=segments,
            maqam=maqam,
            user_id=user_id,
            db=db
        )

        return preset

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating preset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/presets")
async def list_presets(
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List all admin-created presets (only for the current Admin user)."""
    try:
        admin_user_id = str(current_user.id)
        presets = db_reference_library.list_presets(admin_user_id=admin_user_id, db=db)
        return {"presets": presets, "count": len(presets)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing presets: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/presets/{preset_id}")
async def get_preset(preset_id: str):
    """Get preset metadata including text segments."""
    try:
        preset = db_reference_library.get_reference(preset_id)
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")
        if not preset.get("is_preset", False):
            raise HTTPException(status_code=400, detail="Reference is not a preset")
        return preset
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting preset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/admin/presets/{preset_id}")
async def update_preset(
    preset_id: str,
    text_segments: str = Form(...),  # JSON string
    title: Optional[str] = Form(None),
    maqam: Optional[str] = Form(None),
    target_user_id: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Update preset text segments."""
    try:
        import json

        # Parse text_segments JSON
        try:
            segments = json.loads(text_segments)
            if not isinstance(segments, list):
                raise ValueError("text_segments must be a JSON array")

            # Validate segment structure
            for seg in segments:
                if not isinstance(seg, dict):
                    raise ValueError("Each segment must be an object")
                if "text" not in seg or "start" not in seg or "end" not in seg:
                    raise ValueError("Each segment must have 'text', 'start', and 'end' fields")
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON in text_segments: {str(e)}")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # Get user_id for text segments ownership. Admin may save on behalf of a Qari.
        user_id = str(current_user.id) if current_user else None
        if target_user_id:
            if not current_user or current_user.role != UserRole.ADMIN:
                raise HTTPException(status_code=403, detail="Only Admin can save text segments for another user")
            from uuid import UUID
            try:
                target_user_uuid = UUID(target_user_id)
            except (ValueError, AttributeError):
                raise HTTPException(status_code=404, detail="Target Qari not found")
            target_user = db.query(User).filter(User.id == target_user_uuid).first()
            if not target_user or target_user.role != UserRole.QARI:
                raise HTTPException(status_code=404, detail="Target Qari not found")
            user_id = str(target_user.id)

        # Update preset
        preset = db_reference_library.update_preset_text_segments(
            preset_id=preset_id,
            text_segments=segments,
            user_id=user_id,
            db=db
        )

        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        # Update title and maqam if provided
        # Update title or maqam if provided
        if title or maqam:
            preset = db_reference_library.get_reference(preset_id)
            if preset:
                # Update via database
                from database import SessionLocal, Reference
                db = SessionLocal()
                try:
                    ref = db.query(Reference).filter(Reference.id == preset_id).first()
                    if ref:
                        if title:
                            ref.title = title
                        if maqam:
                            ref.maqam = maqam
                        db.commit()
                        db.refresh(ref)
                        preset = db_reference_library._reference_to_dict(ref)
                finally:
                    db.close()

        return preset

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating preset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/admin/presets/{preset_id}")
async def delete_preset(preset_id: str):
    """Delete a preset (converts back to regular reference)."""
    try:
        # Get preset from database
        preset = db_reference_library.get_reference(preset_id)
        if not preset:
            raise HTTPException(status_code=404, detail="Preset not found")

        if not preset.get("is_preset", False):
            raise HTTPException(status_code=400, detail="Reference is not a preset")

        # Convert back to regular reference (remove preset status)
        from database import SessionLocal, Reference, TextSegment
        db = SessionLocal()
        try:
            ref = db.query(Reference).filter(Reference.id == preset_id).first()
            if ref:
                ref.is_preset = False
                ref.preset_updated = None
                # Delete text segments
                db.query(TextSegment).filter(TextSegment.reference_id == preset_id).delete()
                db.commit()
        finally:
            db.close()

        return {"success": True, "message": "Preset deleted (converted to regular reference)"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting preset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Database Query Endpoints
@app.get("/api/recording-sessions/{client_session_id}/status")
def get_recording_session_status(
    client_session_id: str,
    reference_id: Optional[str] = None,
    current_user: User = Depends(require_registered_user),
    db: Session = Depends(get_db),
):
    try:
        uuid.UUID(client_session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="client_session_id must be a valid UUID")

    completed = get_completed_recording_modes(
        db,
        str(current_user.id),
        client_session_id,
        reference_id,
    )
    assessment = get_recording_assessment_summary(
        db,
        str(current_user.id),
        client_session_id,
        reference_id,
    )
    return {
        "client_session_id": client_session_id,
        "reference_id": reference_id,
        "completed_modes": completed,
        "assessment": assessment,
        "next_mode": "R1" if assessment["baseline"] is None else "R2",
        "complete": assessment["baseline"] is not None,
    }

@app.get("/api/sessions/{session_id}")
def get_session(
    session_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Get user session by ID with access control."""
    try:
        from database import UserSession, StudentQariRelationship
        from uuid import UUID

        session_uuid = UUID(session_id) if isinstance(session_id, str) else session_id
        session = db.query(UserSession).filter(UserSession.id == session_uuid).first()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Access control: Students can only see their own, Qari can see their students', Admin can see all
        user_role = current_user.role if current_user else UserRole.PUBLIC
        user_id = str(current_user.id) if current_user else None

        if user_role == UserRole.PUBLIC:
            raise HTTPException(status_code=403, detail="Authentication required to view sessions")

        if user_role == UserRole.STUDENT:
            if not session.user_id or str(session.user_id) != user_id:
                raise HTTPException(status_code=403, detail="Access denied: Can only view your own sessions")

        elif user_role == UserRole.QARI:
            if session.user_id:
                # Check if this session belongs to one of Qari's students
                relationship = db.query(StudentQariRelationship).filter(
                    and_(
                        StudentQariRelationship.student_id == session.user_id,
                        StudentQariRelationship.qari_id == current_user.id,
                        StudentQariRelationship.is_active == True
                    )
                ).first()
                if not relationship:
                    raise HTTPException(status_code=403, detail="Access denied: Session does not belong to your students")
            else:
                raise HTTPException(status_code=403, detail="Access denied: Cannot view public sessions")

        elif user_role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Access denied")

        return {
            "id": str(session.id),
            "user_id": str(session.user_id) if session.user_id else None,
            "qari_id": str(session.qari_id) if session.qari_id else None,
            "reference_id": session.reference_id,
            "client_session_id": session.client_session_id,
            "recording_mode": session.recording_mode,
            "scoring_version": session.scoring_version,
            "recording_attempt": session.recording_attempt,
            "file_path": session.file_path,
            "score_storage_path": session.score_storage_path,
            "audio_checksum": session.audio_checksum,
            "score_checksum": session.score_checksum,
            "data_schema_version": session.data_schema_version,
            "integrity_status": session.integrity_status,
            "integrity_error": session.integrity_error,
            "duration": session.duration,
            "file_size": session.file_size,
            "created_at": session.created_at.isoformat() if session.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}/audio")
async def get_session_audio(
    session_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Download/playback user session recording with access control."""
    try:
        from database import UserSession, StudentQariRelationship
        from uuid import UUID
        from pathlib import Path
        from fastapi.responses import FileResponse

        session_uuid = UUID(session_id) if isinstance(session_id, str) else session_id
        session = db.query(UserSession).filter(UserSession.id == session_uuid).first()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        if not session.file_path:
            raise HTTPException(status_code=404, detail="Recording file not found for this session")

        # Access control: Students can only download their own, Qari can download their students', Admin can download all
        user_role = current_user.role if current_user else UserRole.PUBLIC
        user_id = str(current_user.id) if current_user else None

        if user_role == UserRole.PUBLIC:
            raise HTTPException(status_code=403, detail="Authentication required to download recordings")

        if user_role == UserRole.STUDENT:
            if not session.user_id or str(session.user_id) != user_id:
                raise HTTPException(status_code=403, detail="Access denied: Can only download your own recordings")

        elif user_role == UserRole.QARI:
            if session.user_id:
                # Check if this session belongs to one of Qari's students
                relationship = db.query(StudentQariRelationship).filter(
                    and_(
                        StudentQariRelationship.student_id == session.user_id,
                        StudentQariRelationship.qari_id == current_user.id,
                        StudentQariRelationship.is_active == True
                    )
                ).first()
                if not relationship:
                    raise HTTPException(status_code=403, detail="Access denied: Recording does not belong to your students")
            else:
                raise HTTPException(status_code=403, detail="Access denied: Cannot download public recordings")

        elif user_role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Access denied")

        # Construct file path. If the recording lives in S3, download a temporary
        # copy after access control has passed. This keeps the audio endpoint as
        # the single protected playback URL for Student/Qari/Admin.
        session_path = session.cloud_storage_path or session.file_path
        if not session_path:
            raise HTTPException(status_code=404, detail="Recording file not found for this session")

        is_temp_session_audio = False
        if str(session_path).startswith("s3://"):
            from cloud_storage import cloud_storage
            import time

            file_ext = Path(session.file_path or session_path).suffix or ".webm"
            file_path = TEMP_DIR / f"session_audio_{session_id}_{int(time.time() * 1000)}{file_ext}"
            if not cloud_storage.download_file(str(session_path), file_path) or not file_path.exists():
                raise HTTPException(status_code=404, detail="Recording file not found in S3")
            is_temp_session_audio = True
        else:
            file_path = Path(session_path)
            if not file_path.is_absolute():
                # If relative path, assume it's in UPLOADS_DIR or TEMP_DIR
                potential_paths = [
                    UPLOADS_DIR / "temp_audio" / file_path.name,
                    TEMP_DIR / file_path.name,
                    file_path
                ]
                file_path = next((p for p in potential_paths if p.exists()), file_path)

            if not file_path.exists():
                raise HTTPException(status_code=404, detail="Recording file not found on server")

        # Determine media type from file extension
        ext = file_path.suffix.lower()
        media_type_map = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.ogg': 'audio/ogg',
            '.webm': 'audio/webm'
        }
        media_type = media_type_map.get(ext, 'audio/mpeg')

        if is_temp_session_audio:
            from starlette.background import BackgroundTask

            return FileResponse(
                path=str(file_path),
                media_type=media_type,
                filename=file_path.name,
                background=BackgroundTask(lambda p=file_path: p.unlink(missing_ok=True))
            )

        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=file_path.name
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session audio: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}/analysis")
def get_analysis_result(session_id: str):
    """Get analysis result by session ID."""
    try:
        result = db_session_service.get_analysis_result(session_id)
        if not result:
            raise HTTPException(status_code=404, detail="Analysis result not found")

        return {
            "id": str(result.id),
            "session_id": str(result.user_session_id),
            "reference_id": result.reference_id,
            "score": result.score,
            "segments": result.segments,
            "pitch_data": result.pitch_data,
            "regions": result.regions,
            "ayat_timing": result.ayat_timing,
            "feedback": result.feedback,
            "score_breakdown": result.score_breakdown,
            "pronunciation_alerts": result.pronunciation_alerts,
            "created_at": result.created_at.isoformat() if result.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting analysis result: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analysis/{analysis_result_id}/ai-notes")
async def generate_analysis_ai_notes(
    analysis_result_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Generate Quran correctness and AI guidance on demand for a saved analysis."""
    try:
        from database import AnalysisResult, StudentQariRelationship, UserSession
        from uuid import UUID

        analysis_uuid = UUID(analysis_result_id) if isinstance(analysis_result_id, str) else analysis_result_id
        analysis = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_uuid).first()
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis result not found")

        session = db.query(UserSession).filter(UserSession.id == analysis.user_session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        user_role = current_user.role if current_user else UserRole.PUBLIC
        user_id = str(current_user.id) if current_user else None

        if user_role == UserRole.PUBLIC:
            raise HTTPException(status_code=403, detail="Authentication required to generate AI notes")

        if user_role == UserRole.STUDENT:
            if not session.user_id or str(session.user_id) != user_id:
                raise HTTPException(status_code=403, detail="Access denied: Can only analyze your own recordings")
        elif user_role == UserRole.QARI:
            if not session.user_id:
                raise HTTPException(status_code=403, detail="Access denied: Cannot analyze public sessions")
            relationship = db.query(StudentQariRelationship).filter(
                and_(
                    StudentQariRelationship.student_id == session.user_id,
                    StudentQariRelationship.qari_id == current_user.id,
                    StudentQariRelationship.is_active == True
                )
            ).first()
            if not relationship:
                raise HTTPException(status_code=403, detail="Access denied: Recording does not belong to your students")
        elif user_role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Access denied")

        session_path = session.cloud_storage_path or session.file_path
        if not session_path:
            raise HTTPException(status_code=404, detail="Recording file not found for this session")

        temp_audio_path: Optional[Path] = None
        audio_path: Path
        if str(session_path).startswith("s3://"):
            from cloud_storage import cloud_storage
            import time

            file_ext = Path(session.file_path or session_path).suffix or ".webm"
            temp_audio_path = TEMP_DIR / f"ai_notes_{analysis_result_id}_{int(time.time() * 1000)}{file_ext}"
            if not cloud_storage.download_file(str(session_path), temp_audio_path) or not temp_audio_path.exists():
                raise HTTPException(status_code=404, detail="Recording file not found in S3")
            audio_path = temp_audio_path
        else:
            candidate_path = Path(str(session_path))
            if not candidate_path.is_absolute():
                potential_paths = [
                    UPLOADS_DIR / "temp_audio" / candidate_path.name,
                    TEMP_DIR / candidate_path.name,
                    candidate_path,
                ]
                candidate_path = next((p for p in potential_paths if p.exists()), candidate_path)
            if not candidate_path.exists():
                raise HTTPException(status_code=404, detail="Recording file not found on server")
            audio_path = candidate_path

        try:
            text_segments = analysis.ayat_timing if isinstance(analysis.ayat_timing, list) else analysis.segments
            text_source = "analysis"
            has_text_segments = bool(
                text_segments
                and any(
                    isinstance(segment, dict)
                    and str(segment.get("text", "")).strip()
                    for segment in text_segments
                )
            )

            if not has_text_segments and session.reference_id:
                from database import TextSegment

                db_text_segments = (
                    db.query(TextSegment)
                    .filter(TextSegment.reference_id == session.reference_id)
                    .order_by(TextSegment.start.asc())
                    .all()
                )
                text_segments = [
                    {
                        "text": segment.text,
                        "start": segment.start,
                        "end": segment.end,
                    }
                    for segment in db_text_segments
                    if segment.text and segment.text.strip()
                ]
                text_source = "reference.text_segments"

            logger.info(
                "AI notes text source=%s reference_id=%s segment_count=%d",
                text_source,
                session.reference_id,
                len(text_segments or []),
            )

            quran_correctness = evaluate_quran_correctness(
                audio_path,
                text_segments,
                float(analysis.score),
            )
            ai_notes = build_ai_recitation_notes(
                quran_correctness,
                float(analysis.score),
                analysis.score_breakdown,
                analysis.segments,
            )
            return {
                "analysis_result_id": str(analysis.id),
                "session_id": str(session.id),
                "quranCorrectness": quran_correctness,
                "aiNotes": ai_notes,
            }
        finally:
            if temp_audio_path:
                try:
                    temp_audio_path.unlink(missing_ok=True)
                except Exception as cleanup_error:
                    logger.warning("Could not delete AI notes temp audio: %s", cleanup_error)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating analysis AI notes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions")
def list_sessions(
    user_id: Optional[str] = None,
    reference_id: Optional[str] = None,
    limit: int = 100
):
    """List user sessions with optional filters."""
    try:
        sessions = db_session_service.list_user_sessions(
            user_id=user_id,
            reference_id=reference_id,
            limit=limit
        )

        return [
            {
                "id": str(session.id),
                "user_id": session.user_id,
                "reference_id": session.reference_id,
                "file_path": session.file_path,
                "duration": session.duration,
                "file_size": session.file_size,
                "created_at": session.created_at.isoformat() if session.created_at else None
            }
            for session in sessions
        ]
    except Exception as e:
        logger.error(f"Error listing sessions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    import os

    # Check if we're in development mode (auto-reload)
    # Set DEV_MODE=1 environment variable to enable auto-reload
    dev_mode = os.getenv("DEV_MODE", "0") == "1"
    port = int(os.getenv("PORT", "8000"))

    if dev_mode:
        # Development mode: auto-reload on code changes
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=port,
            reload=True,
            reload_dirs=[str(Path(__file__).parent)],
            reload_includes=["*.py"],
            log_level="info"
        )
    else:
        # Production mode: no auto-reload
        uvicorn.run(app, host="0.0.0.0", port=port)

