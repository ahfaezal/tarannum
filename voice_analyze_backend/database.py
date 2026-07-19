"""
Database connection and session management for PostgreSQL.
"""
import os
from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, DateTime, Text, JSON, ForeignKey, UniqueConstraint, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from typing import Optional
import uuid
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

Base = declarative_base()

# User Roles Enum
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    QARI = "qari"
    STUDENT = "student"
    PUBLIC = "public"  # Not registered, demo access only

# Database URL from environment variable or default
# If DATABASE_URL is not set, try to use the connection from test_database.py
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Default connection (user can override with .env file)
    DB_PASSWORD = os.getenv("DB_PASSWORD", "#1113tencom")
    DB_NAME = os.getenv("DB_NAME", "tarannum_db1koljkl")
    DATABASE_URL = f"postgresql+psycopg2://postgres:{DB_PASSWORD}@127.0.0.1:5432/{DB_NAME}"

# Create engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using
    pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
    pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "10")),
    pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "1800")),
    pool_use_lifo=True,
    connect_args={"connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "10"))},
    echo=False  # Set to True for SQL query logging
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Database Models
class User(Base):
    """User accounts with authentication and roles."""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)  # Nullable for public users
    role = Column(String, nullable=False, default=UserRole.STUDENT)
    is_active = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=False)  # For Qari approval by Admin
    full_name = Column(String, nullable=True)
    ic_number = Column(String, nullable=True)  # IC/Identity Card Number
    address = Column(String, nullable=True)  # Address
    phone_number = Column(String, nullable=True)
    avatar_path = Column(String, nullable=True)
    organization = Column(String, nullable=True)
    state = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    maqam_specialization = Column(String, nullable=True)
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verified_at = Column(DateTime, nullable=True)
    otp_code_hash = Column(String, nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    otp_consumed_at = Column(DateTime, nullable=True)
    otp_attempt_count = Column(Integer, default=0, nullable=False)
    otp_last_sent_at = Column(DateTime, nullable=True)
    otp_resend_count = Column(Integer, default=0, nullable=False)
    password_reset_otp_hash = Column(String, nullable=True)
    password_reset_expires_at = Column(DateTime, nullable=True)
    password_reset_consumed_at = Column(DateTime, nullable=True)
    password_reset_attempt_count = Column(Integer, default=0, nullable=False)
    password_reset_last_sent_at = Column(DateTime, nullable=True)
    password_reset_resend_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    
    # Qari-specific fields
    referral_code = Column(String, unique=True, nullable=True, index=True)  # Unique referral code for Qari
    pending_referral_code = Column(String, nullable=True, index=True)  # Referral captured before email verification
    commission_rate = Column(Float, nullable=True, default=0.0)  # Default commission rate
    
    # Subscription fields (Milestone 4)
    subscription_status = Column(String, nullable=True)  # 'active', 'expired', 'trial', 'none'
    subscription_start = Column(DateTime, nullable=True)
    subscription_end = Column(DateTime, nullable=True)
    subscription_tier = Column(String, nullable=True)  # 'basic', 'premium', etc.
    
    # Relationships
    qari_content = relationship("QariContent", back_populates="qari", foreign_keys="QariContent.qari_id")
    student_relationships = relationship("StudentQariRelationship", back_populates="student", foreign_keys="StudentQariRelationship.student_id")
    qari_relationships = relationship("StudentQariRelationship", back_populates="qari", foreign_keys="StudentQariRelationship.qari_id")
    user_sessions = relationship("UserSession", back_populates="user", foreign_keys="UserSession.user_id")
    student_progress = relationship("StudentProgress", back_populates="student", foreign_keys="StudentProgress.student_id")


class QariContent(Base):
    """Qari's private content library (their own reference audios)."""
    __tablename__ = "qari_content"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    qari_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reference_id = Column(String, ForeignKey("references.id", ondelete="CASCADE"), nullable=False)
    surah_number = Column(Integer, nullable=True)
    surah_name = Column(String, nullable=True)
    ayah_number = Column(Integer, nullable=True)
    maqam = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    visibility_status = Column(String, nullable=False, default="students_only", index=True)
    public_demo_approved = Column(Boolean, nullable=False, default=False)
    public_demo_approved_at = Column(DateTime, nullable=True)
    public_demo_approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    qari = relationship("User", back_populates="qari_content", foreign_keys=[qari_id])
    reference = relationship("Reference")


class StudentQariRelationship(Base):
    """Student-Qari relationship and affiliate tracking."""
    __tablename__ = "student_qari_relationships"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    qari_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_active = Column(Boolean, default=True)  # Current active Qari for student
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    
    # Affiliate tracking
    referral_code = Column(String, nullable=True)  # Qari's referral code used
    commission_rate = Column(Float, nullable=True, default=0.0)  # Commission percentage
    
    # Relationships
    student = relationship("User", back_populates="student_relationships", foreign_keys=[student_id])
    qari = relationship("User", back_populates="qari_relationships", foreign_keys=[qari_id])


class StudentProgress(Base):
    """Student progress tracking with verse-level scoring."""
    __tablename__ = "student_progress"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("user_sessions.id", ondelete="CASCADE"), nullable=False)
    qari_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reference_id = Column(String, ForeignKey("references.id", ondelete="SET NULL"), nullable=True)
    
    # Overall score
    overall_score = Column(Float, nullable=False)
    
    # Verse-level data (stored as JSON for flexibility)
    verse_scores = Column(JSON, nullable=True)  # [{ayah_number, start, end, score, text}, ...]
    
    # Improvement tracking
    previous_score = Column(Float, nullable=True)
    improvement = Column(Float, nullable=True)  # Difference from previous
    
    # Weak verses identification
    weakest_verses = Column(JSON, nullable=True)  # [{ayah_number, score, text}, ...]
    
    # Certification-grade immutability (Milestone 4)
    is_immutable = Column(Boolean, default=False)  # Read-only flag for assessment sessions
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    student = relationship("User", back_populates="student_progress", foreign_keys=[student_id])
    session = relationship("UserSession", foreign_keys=[session_id])


class StudentActivityEvent(Base):
    """Append-only student learning activity events."""
    __tablename__ = "student_activity_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    qari_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reference_id = Column(String, ForeignKey("references.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("user_sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String, nullable=False, index=True)
    duration_seconds = Column(Float, nullable=True)
    playback_position = Column(Float, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    occurred_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    student = relationship("User", foreign_keys=[student_id])
    qari = relationship("User", foreign_keys=[qari_id])
    reference = relationship("Reference", foreign_keys=[reference_id])
    session = relationship("UserSession", foreign_keys=[session_id])


class Reference(Base):
    """Reference audio file metadata."""
    __tablename__ = "references"
    
    id = Column(String, primary_key=True, index=True)  # MD5 hash ID
    title = Column(String, nullable=False)
    maqam = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)  # Path (can be local or cloud URL)
    cloud_storage_type = Column(String, nullable=True)  # 's3', 'azure', 'gcs', or None for local
    cloud_storage_path = Column(String, nullable=True)  # Cloud storage path/URL
    duration = Column(Float, nullable=False)
    file_size = Column(Integer, nullable=False)
    is_preset = Column(Boolean, default=False)
    upload_date = Column(DateTime, default=datetime.utcnow)
    preset_updated = Column(DateTime, nullable=True)
    
    # Ownership and access control
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_public = Column(Boolean, default=False)  # True if accessible to public/students
    
    # Relationships
    text_segments = relationship("TextSegment", back_populates="reference", cascade="all, delete-orphan")
    pitch_cache = relationship("PitchCache", back_populates="reference", uselist=False, cascade="all, delete-orphan")
    analysis_results = relationship("AnalysisResult", back_populates="reference", cascade="all, delete-orphan")


class TextSegment(Base):
    """Text segments for presets (ayah timing)."""
    __tablename__ = "text_segments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_id = Column(String, ForeignKey("references.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # Which user/Qari owns this text segment
    text = Column(Text, nullable=False)
    start = Column(Float, nullable=False)
    end = Column(Float, nullable=False)
    
    # Relationships
    reference = relationship("Reference", back_populates="text_segments")
    user = relationship("User", foreign_keys=[user_id])


class PitchCache(Base):
    """Cached pitch extraction data for references."""
    __tablename__ = "pitch_cache"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_id = Column(String, ForeignKey("references.id", ondelete="CASCADE"), unique=True, nullable=False)
    pitch_data = Column(JSON, nullable=False)  # List of pitch points
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship
    reference = relationship("Reference", back_populates="pitch_cache")


class UserSession(Base):
    """User recording sessions."""
    __tablename__ = "user_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reference_id = Column(String, ForeignKey("references.id", ondelete="SET NULL"), nullable=True)
    qari_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Which Qari's content was used
    file_path = Column(String, nullable=True)  # Path to user recording file (can be cloud URL)
    cloud_storage_type = Column(String, nullable=True)  # 's3', 'azure', 'gcs', or None for local
    cloud_storage_path = Column(String, nullable=True)  # Cloud storage path/URL
    duration = Column(Float, nullable=True)
    file_size = Column(Integer, nullable=True)
    is_public_demo = Column(Boolean, default=False)  # True if from public demo content
    client_session_id = Column(String, nullable=True, index=True)
    recording_mode = Column(String, nullable=True, index=True)  # R1, R2, or R3
    scoring_version = Column(String, nullable=True, index=True)
    recording_attempt = Column(Integer, nullable=True)
    score_storage_path = Column(String, nullable=True)
    audio_checksum = Column(String, nullable=True)
    score_checksum = Column(String, nullable=True)
    data_schema_version = Column(String, nullable=True, index=True)
    integrity_status = Column(String, nullable=True, index=True)
    integrity_error = Column(Text, nullable=True)
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("training_challenges.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Certification-grade fields (Milestone 4)
    is_assessment = Column(Boolean, default=False)  # Marks certification sessions
    is_immutable = Column(Boolean, default=False)  # Read-only flag
    assessment_marked_at = Column(DateTime, nullable=True)  # When marked as assessment
    assessment_marked_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Who marked it
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="user_sessions", foreign_keys=[user_id])
    reference = relationship("Reference", foreign_keys=[reference_id])
    analysis_result = relationship("AnalysisResult", back_populates="user_session", uselist=False, cascade="all, delete-orphan")


class AnalysisResult(Base):
    """Analysis/scoring results for user recordings."""
    __tablename__ = "analysis_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_session_id = Column(UUID(as_uuid=True), ForeignKey("user_sessions.id", ondelete="CASCADE"), unique=True, nullable=False)
    reference_id = Column(String, ForeignKey("references.id", ondelete="SET NULL"), nullable=True)
    
    score = Column(Float, nullable=False)
    segments = Column(JSON, nullable=True)  # List of segment scores
    pitch_data = Column(JSON, nullable=True)  # Pitch comparison data
    regions = Column(JSON, nullable=True)  # Region coloring data
    ayat_timing = Column(JSON, nullable=True)  # Ayah timing data
    feedback = Column(JSON, nullable=True)  # Training feedback
    score_breakdown = Column(JSON, nullable=True)  # Score breakdown (pitch, timing, pronunciation)
    pronunciation_alerts = Column(JSON, nullable=True)  # Pronunciation alerts
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user_session = relationship("UserSession", back_populates="analysis_result")
    reference = relationship("Reference", back_populates="analysis_results")


class ScoringJob(Base):
    """Durable asynchronous scoring job.

    The uploaded recording is staged in S3 before the API acknowledges the
    request. Celery workers update this row so an iPad can safely reconnect,
    refresh, or resume polling without resubmitting the audio.
    """
    __tablename__ = "scoring_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reference_id = Column(String, ForeignKey("references.id", ondelete="SET NULL"), nullable=True, index=True)
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("training_challenges.id", ondelete="SET NULL"), nullable=True, index=True)
    client_session_id = Column(String, nullable=False, index=True)
    recording_mode = Column(String, nullable=False, index=True)
    scoring_version = Column(String, nullable=False, default="V2.3")
    recording_attempt = Column(Integer, nullable=False, default=1)
    status = Column(String, nullable=False, default="queued", index=True)  # queued | processing | completed | failed
    stage = Column(String, nullable=False, default="queued")
    staging_path = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)
    content_type = Column(String, nullable=True)
    celery_task_id = Column(String, nullable=True, index=True)
    result_json = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    queued_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    reference = relationship("Reference", foreign_keys=[reference_id])


class TrainingChallenge(Base):
    """A time-bounded Qari practice challenge using one reference."""
    __tablename__ = "training_challenges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    qari_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reference_id = Column(String, ForeignKey("references.id", ondelete="RESTRICT"), nullable=False, index=True)
    title = Column(String, nullable=False)
    start_at = Column(DateTime, nullable=False, index=True)
    end_at = Column(DateTime, nullable=False, index=True)
    status = Column(String, nullable=False, default="scheduled", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    qari = relationship("User", foreign_keys=[qari_id])
    reference = relationship("Reference", foreign_keys=[reference_id])
    participants = relationship("TrainingChallengeParticipant", back_populates="challenge", cascade="all, delete-orphan")


class TrainingChallengeParticipant(Base):
    """A student selected by a Qari for a Training Challenge."""
    __tablename__ = "training_challenge_participants"
    __table_args__ = (UniqueConstraint("challenge_id", "student_id", name="uq_training_challenge_student"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    challenge_id = Column(UUID(as_uuid=True), ForeignKey("training_challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    challenge = relationship("TrainingChallenge", back_populates="participants")
    student = relationship("User", foreign_keys=[student_id])


class StudentSelectedRecording(Base):
    """Curated student recordings for dashboard and Qari review.

    Each student/reference keeps at most one selected session per slot:
    lowest, median, and highest. The audio remains stored on the UserSession;
    this table only points to the selected session and analysis result.
    """
    __tablename__ = "student_selected_recordings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reference_id = Column(String, ForeignKey("references.id", ondelete="SET NULL"), nullable=True, index=True)
    slot_type = Column(String, nullable=False, index=True)  # lowest | median | highest
    session_id = Column(UUID(as_uuid=True), ForeignKey("user_sessions.id", ondelete="CASCADE"), nullable=False)
    analysis_result_id = Column(UUID(as_uuid=True), ForeignKey("analysis_results.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, nullable=False)
    cloud_storage_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student = relationship("User", foreign_keys=[student_id])
    reference = relationship("Reference", foreign_keys=[reference_id])
    session = relationship("UserSession", foreign_keys=[session_id])
    analysis_result = relationship("AnalysisResult", foreign_keys=[analysis_result_id])


class AuditLog(Base):
    """Audit trail for certification-grade data integrity (Milestone 4)."""
    __tablename__ = "audit_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action = Column(String, nullable=False)  # 'create', 'update', 'delete', 'mark_assessment', etc.
    entity_type = Column(String, nullable=False)  # 'session', 'progress', 'score', 'user', etc.
    entity_id = Column(String, nullable=False)  # ID of the entity being audited
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)  # Who performed the action
    old_values = Column(JSON, nullable=True)  # Previous values (for updates)
    new_values = Column(JSON, nullable=True)  # New values (for creates/updates)
    ip_address = Column(String, nullable=True)  # IP address of the request
    user_agent = Column(String, nullable=True)  # User agent string
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationship
    user = relationship("User", foreign_keys=[user_id])


# Database dependency for FastAPI
def get_db():
    """Dependency for getting database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Initialize database

def ensure_student_selected_recordings_table():
    """Create the selected recording table if older deployments missed create_all."""
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS student_selected_recordings (
                    id UUID PRIMARY KEY,
                    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    reference_id VARCHAR REFERENCES "references"(id) ON DELETE SET NULL,
                    slot_type VARCHAR NOT NULL,
                    session_id UUID NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
                    analysis_result_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
                    score FLOAT NOT NULL,
                    cloud_storage_path VARCHAR,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_student_selected_recordings_slot
                ON student_selected_recordings (student_id, reference_id, slot_type)
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_selected_recordings_student_id ON student_selected_recordings (student_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_selected_recordings_reference_id ON student_selected_recordings (reference_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_selected_recordings_slot_type ON student_selected_recordings (slot_type)"))
            conn.commit()
        logger.info("Student selected recordings table verified")
    except Exception as e:
        logger.warning(f"Could not verify student_selected_recordings table: {e}", exc_info=True)

def init_db():
    """Create all tables in the database."""
    try:
        Base.metadata.create_all(bind=engine)
        ensure_email_otp_columns()
        ensure_student_selected_recordings_table()
        ensure_user_profile_columns()
        ensure_student_activity_events_table()
        ensure_user_session_metadata_columns()
        ensure_qari_dashboard_columns()
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating database tables: {e}", exc_info=True)
        raise


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists using information_schema."""
    result = conn.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = :table_name
        AND column_name = :column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone() is not None


def ensure_email_otp_columns():
    """Safely add email verification columns for existing databases."""
    columns = {
        "email_verified": "BOOLEAN DEFAULT TRUE NOT NULL",
        "email_verified_at": "TIMESTAMP",
        "otp_code_hash": "VARCHAR",
        "otp_expires_at": "TIMESTAMP",
        "otp_consumed_at": "TIMESTAMP",
        "otp_attempt_count": "INTEGER DEFAULT 0 NOT NULL",
        "otp_last_sent_at": "TIMESTAMP",
        "otp_resend_count": "INTEGER DEFAULT 0 NOT NULL",
        "pending_referral_code": "VARCHAR",
        "password_reset_otp_hash": "VARCHAR",
        "password_reset_expires_at": "TIMESTAMP",
        "password_reset_consumed_at": "TIMESTAMP",
        "password_reset_attempt_count": "INTEGER DEFAULT 0 NOT NULL",
        "password_reset_last_sent_at": "TIMESTAMP",
        "password_reset_resend_count": "INTEGER DEFAULT 0 NOT NULL",
    }

    with engine.begin() as conn:
        added_email_verified = False
        for column_name, column_def in columns.items():
            if not _column_exists(conn, "users", column_name):
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {column_name} {column_def}"))
                added_email_verified = added_email_verified or column_name == "email_verified"

        if added_email_verified:
            conn.execute(text("""
                UPDATE users
                SET email_verified = TRUE,
                    email_verified_at = COALESCE(email_verified_at, created_at, NOW())
                WHERE email_verified IS TRUE
            """))
            conn.execute(text("ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE"))


def ensure_qari_dashboard_columns():
    """Add Qari content visibility and Training Challenge links safely."""
    qari_content_columns = {
        "visibility_status": "VARCHAR DEFAULT 'students_only' NOT NULL",
        "public_demo_approved": "BOOLEAN DEFAULT FALSE NOT NULL",
        "public_demo_approved_at": "TIMESTAMP",
        "public_demo_approved_by": "UUID",
    }
    user_session_columns = {"challenge_id": "UUID"}
    scoring_job_columns = {"challenge_id": "UUID"}

    with engine.begin() as conn:
        for column_name, column_def in qari_content_columns.items():
            if not _column_exists(conn, "qari_content", column_name):
                conn.execute(text(f"ALTER TABLE qari_content ADD COLUMN {column_name} {column_def}"))
        for column_name, column_def in user_session_columns.items():
            if not _column_exists(conn, "user_sessions", column_name):
                conn.execute(text(f"ALTER TABLE user_sessions ADD COLUMN {column_name} {column_def}"))
        for column_name, column_def in scoring_job_columns.items():
            if not _column_exists(conn, "scoring_jobs", column_name):
                conn.execute(text(f"ALTER TABLE scoring_jobs ADD COLUMN {column_name} {column_def}"))

        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_qari_content_visibility_status ON qari_content (visibility_status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_challenge_id ON user_sessions (challenge_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_scoring_jobs_challenge_id ON scoring_jobs (challenge_id)"))


def ensure_user_profile_columns():
    """Safely add profile columns for existing user tables."""
    columns = {
        "phone_number": "VARCHAR",
        "avatar_path": "VARCHAR",
        "organization": "VARCHAR",
        "state": "VARCHAR",
        "bio": "TEXT",
        "maqam_specialization": "VARCHAR",
    }

    with engine.begin() as conn:
        for column_name, column_def in columns.items():
            if not _column_exists(conn, "users", column_name):
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {column_name} {column_def}"))


def ensure_user_session_metadata_columns():
    """Add recording verification metadata without changing historical scores."""
    columns = {
        "client_session_id": "VARCHAR",
        "recording_mode": "VARCHAR",
        "scoring_version": "VARCHAR",
        "recording_attempt": "INTEGER",
        "score_storage_path": "VARCHAR",
        "audio_checksum": "VARCHAR",
        "score_checksum": "VARCHAR",
        "data_schema_version": "VARCHAR",
        "integrity_status": "VARCHAR",
        "integrity_error": "TEXT",
    }

    with engine.begin() as conn:
        for column_name, column_def in columns.items():
            if not _column_exists(conn, "user_sessions", column_name):
                conn.execute(text(f"ALTER TABLE user_sessions ADD COLUMN {column_name} {column_def}"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_client_session_id ON user_sessions (client_session_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_recording_mode ON user_sessions (recording_mode)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_scoring_version ON user_sessions (scoring_version)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_data_schema_version ON user_sessions (data_schema_version)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_integrity_status ON user_sessions (integrity_status)"))


def ensure_student_activity_events_table():
    """Safely create the append-only student activity events table."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS student_activity_events (
                id UUID PRIMARY KEY,
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                qari_id UUID REFERENCES users(id) ON DELETE SET NULL,
                reference_id VARCHAR REFERENCES "references"(id) ON DELETE SET NULL,
                session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
                event_type VARCHAR NOT NULL,
                duration_seconds DOUBLE PRECISION,
                playback_position DOUBLE PRECISION,
                metadata_json JSON,
                occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_student_id ON student_activity_events (student_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_qari_id ON student_activity_events (qari_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_reference_id ON student_activity_events (reference_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_session_id ON student_activity_events (session_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_event_type ON student_activity_events (event_type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_occurred_at ON student_activity_events (occurred_at)"))


# Health check
def check_db_connection() -> bool:
    """Check if database connection is working."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database connection check failed: {e}")
        return False
