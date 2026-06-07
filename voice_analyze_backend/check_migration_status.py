"""
Check if Milestone 4 database migration has been run.
This script checks if the required columns and tables exist.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_column_exists(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists using direct SQL."""
    try:
        result = db.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = :table_name 
            AND column_name = :column_name
        """), {"table_name": table_name, "column_name": column_name})
        return result.fetchone() is not None
    except Exception as e:
        logger.error(f"Error checking column {column_name} in {table_name}: {e}")
        return False


def check_table_exists(db, table_name: str) -> bool:
    """Check if a table exists using direct SQL."""
    try:
        result = db.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = :table_name
        """), {"table_name": table_name})
        return result.fetchone() is not None
    except Exception as e:
        logger.error(f"Error checking table {table_name}: {e}")
        return False


def check_migration_status():
    """Check if Milestone 4 migration has been run."""
    db = SessionLocal()
    try:
        logger.info("Checking Milestone 4 migration status...\n")
        
        all_checks_passed = True
        
        # Check user_sessions columns
        logger.info("Checking user_sessions table...")
        checks = [
            ("user_sessions", "is_assessment"),
            ("user_sessions", "is_immutable"),
            ("user_sessions", "assessment_marked_at"),
            ("user_sessions", "assessment_marked_by"),
            ("user_sessions", "cloud_storage_type"),
            ("user_sessions", "cloud_storage_path"),
        ]
        
        for table, column in checks:
            exists = check_column_exists(db, table, column)
            status = "✅" if exists else "❌"
            logger.info(f"  {status} {table}.{column}")
            if not exists:
                all_checks_passed = False
        
        # Check users columns
        logger.info("\nChecking users table...")
        checks = [
            ("users", "subscription_status"),
            ("users", "subscription_start"),
            ("users", "subscription_end"),
            ("users", "subscription_tier"),
        ]
        
        for table, column in checks:
            exists = check_column_exists(db, table, column)
            status = "✅" if exists else "❌"
            logger.info(f"  {status} {table}.{column}")
            if not exists:
                all_checks_passed = False
        
        # Check student_progress columns
        logger.info("\nChecking student_progress table...")
        exists = check_column_exists(db, "student_progress", "is_immutable")
        status = "✅" if exists else "❌"
        logger.info(f"  {status} student_progress.is_immutable")
        if not exists:
            all_checks_passed = False
        
        # Check references columns
        logger.info("\nChecking references table...")
        checks = [
            ("references", "cloud_storage_type"),
            ("references", "cloud_storage_path"),
        ]
        
        for table, column in checks:
            exists = check_column_exists(db, table, column)
            status = "✅" if exists else "❌"
            logger.info(f"  {status} {table}.{column}")
            if not exists:
                all_checks_passed = False
        
        # Check audit_logs table
        logger.info("\nChecking audit_logs table...")
        exists = check_table_exists(db, "audit_logs")
        status = "✅" if exists else "❌"
        logger.info(f"  {status} audit_logs table")
        if not exists:
            all_checks_passed = False
        
        # Summary
        logger.info("\n" + "="*50)
        if all_checks_passed:
            logger.info("✅ Migration Status: COMPLETE")
            logger.info("All Milestone 4 database fields and tables exist.")
        else:
            logger.info("❌ Migration Status: INCOMPLETE")
            logger.info("Some Milestone 4 fields are missing.")
            logger.info("\nRun the migration:")
            logger.info("  python migrations/add_certification_fields_simple.py")
        logger.info("="*50)
        
        return all_checks_passed
        
    except Exception as e:
        logger.error(f"Error checking migration status: {e}", exc_info=True)
        return False
    finally:
        db.close()


if __name__ == "__main__":
    check_migration_status()
