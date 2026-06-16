"""
Migration script to add append-only student activity events.

This table is intentionally separate from student_progress so existing scoring
and progress calculations remain unchanged.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate():
    """Create the student_activity_events table and indexes."""
    db = SessionLocal()
    try:
        logger.info("Starting migration: Add student_activity_events table...")

        db.execute(text("""
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
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_student_id ON student_activity_events (student_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_qari_id ON student_activity_events (qari_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_reference_id ON student_activity_events (reference_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_session_id ON student_activity_events (session_id)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_event_type ON student_activity_events (event_type)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_student_activity_events_occurred_at ON student_activity_events (occurred_at)"))

        db.commit()
        logger.info("Migration completed successfully!")
        return True
    except Exception as e:
        db.rollback()
        logger.error("Migration failed: %s", e, exc_info=True)
        return False
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 70)
    print("Database Migration: Add student_activity_events table")
    print("=" * 70)

    if migrate():
        print("\n[SUCCESS] Migration completed successfully!")
        sys.exit(0)

    print("\n[ERROR] Migration failed. Please check the error messages above.")
    sys.exit(1)
