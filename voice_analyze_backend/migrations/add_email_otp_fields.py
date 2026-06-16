"""
Migration script to add email OTP verification fields to users table.

Existing users are marked as verified so current admin/qari/student accounts are
not locked out after this migration.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def column_exists_sql(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists using information_schema."""
    result = db.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = :table_name
        AND column_name = :column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone() is not None


def add_column_if_missing(db, column_name: str, column_def: str) -> bool:
    """Add a users column if it does not already exist."""
    if column_exists_sql(db, "users", column_name):
        logger.info("  - %s column already exists", column_name)
        return False

    db.execute(text(f"ALTER TABLE users ADD COLUMN {column_name} {column_def}"))
    logger.info("  [OK] Added %s column", column_name)
    return True


def migrate():
    """Run the email OTP migration."""
    db = SessionLocal()
    try:
        logger.info("Starting migration: Add email OTP verification fields...")

        added_email_verified = add_column_if_missing(
            db, "email_verified", "BOOLEAN DEFAULT TRUE NOT NULL"
        )
        add_column_if_missing(db, "email_verified_at", "TIMESTAMP")
        add_column_if_missing(db, "otp_code_hash", "VARCHAR")
        add_column_if_missing(db, "otp_expires_at", "TIMESTAMP")
        add_column_if_missing(db, "otp_consumed_at", "TIMESTAMP")
        add_column_if_missing(db, "otp_attempt_count", "INTEGER DEFAULT 0 NOT NULL")
        add_column_if_missing(db, "otp_last_sent_at", "TIMESTAMP")
        add_column_if_missing(db, "otp_resend_count", "INTEGER DEFAULT 0 NOT NULL")
        add_column_if_missing(db, "pending_referral_code", "VARCHAR")

        if added_email_verified:
            db.execute(text("""
                UPDATE users
                SET email_verified = TRUE,
                    email_verified_at = COALESCE(email_verified_at, created_at, NOW())
                WHERE email_verified IS TRUE
            """))
            db.execute(text("ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE"))
            logger.info("  [OK] Existing users marked as email verified")

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
    print("Database Migration: Add email OTP verification fields")
    print("=" * 70)

    if migrate():
        print("\n[SUCCESS] Migration completed successfully!")
        sys.exit(0)

    print("\n[ERROR] Migration failed. Please check the error messages above.")
    sys.exit(1)
