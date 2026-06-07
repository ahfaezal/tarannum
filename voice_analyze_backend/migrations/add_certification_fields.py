"""
Migration: Add certification and subscription fields for Milestone 4
Run this script to add all necessary fields for certification-grade infrastructure.

Usage:
    python migrations/add_certification_fields.py
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text, inspect
from database import engine, SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def column_exists(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def table_exists(db, table_name: str) -> bool:
    """Check if a table exists."""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def migrate():
    """Run the migration."""
    db = SessionLocal()
    try:
        logger.info("Starting Milestone 4 database migration...")
        
        # 1. Add columns to user_sessions table
        logger.info("Adding certification fields to user_sessions...")
        if not column_exists(db, "user_sessions", "is_assessment"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN is_assessment BOOLEAN DEFAULT FALSE
            """))
            logger.info("  ✓ Added is_assessment column")
        else:
            logger.info("  - is_assessment column already exists")
        
        if not column_exists(db, "user_sessions", "is_immutable"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN is_immutable BOOLEAN DEFAULT FALSE
            """))
            logger.info("  ✓ Added is_immutable column")
        else:
            logger.info("  - is_immutable column already exists")
        
        if not column_exists(db, "user_sessions", "assessment_marked_at"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN assessment_marked_at TIMESTAMP
            """))
            logger.info("  ✓ Added assessment_marked_at column")
        else:
            logger.info("  - assessment_marked_at column already exists")
        
        if not column_exists(db, "user_sessions", "assessment_marked_by"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN assessment_marked_by UUID REFERENCES users(id)
            """))
            logger.info("  ✓ Added assessment_marked_by column")
        else:
            logger.info("  - assessment_marked_by column already exists")
        
        # Add cloud storage fields
        if not column_exists(db, "user_sessions", "cloud_storage_type"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN cloud_storage_type VARCHAR
            """))
            logger.info("  ✓ Added cloud_storage_type column")
        else:
            logger.info("  - cloud_storage_type column already exists")
        
        if not column_exists(db, "user_sessions", "cloud_storage_path"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN cloud_storage_path VARCHAR
            """))
            logger.info("  ✓ Added cloud_storage_path column")
        else:
            logger.info("  - cloud_storage_path column already exists")
        
        # 2. Add columns to student_progress table
        logger.info("Adding immutability field to student_progress...")
        if not column_exists(db, "student_progress", "is_immutable"):
            db.execute(text("""
                ALTER TABLE student_progress 
                ADD COLUMN is_immutable BOOLEAN DEFAULT FALSE
            """))
            logger.info("  ✓ Added is_immutable column")
        else:
            logger.info("  - is_immutable column already exists")
        
        # 3. Add columns to users table
        logger.info("Adding subscription fields to users...")
        if not column_exists(db, "users", "subscription_status"):
            db.execute(text("""
                ALTER TABLE users
                ADD COLUMN subscription_status VARCHAR
            """))
            logger.info("  ✓ Added subscription_status column")
        else:
            logger.info("  - subscription_status column already exists")
        
        if not column_exists(db, "users", "subscription_start"):
            db.execute(text("""
                ALTER TABLE users
                ADD COLUMN subscription_start TIMESTAMP
            """))
            logger.info("  ✓ Added subscription_start column")
        else:
            logger.info("  - subscription_start column already exists")
        
        if not column_exists(db, "users", "subscription_end"):
            db.execute(text("""
                ALTER TABLE users
                ADD COLUMN subscription_end TIMESTAMP
            """))
            logger.info("  ✓ Added subscription_end column")
        else:
            logger.info("  - subscription_end column already exists")
        
        if not column_exists(db, "users", "subscription_tier"):
            db.execute(text("""
                ALTER TABLE users
                ADD COLUMN subscription_tier VARCHAR
            """))
            logger.info("  ✓ Added subscription_tier column")
        else:
            logger.info("  - subscription_tier column already exists")
        
        # 4. Add columns to references table
        logger.info("Adding cloud storage fields to references...")
        if not column_exists(db, "references", "cloud_storage_type"):
            db.execute(text("""
                ALTER TABLE references
                ADD COLUMN cloud_storage_type VARCHAR
            """))
            logger.info("  ✓ Added cloud_storage_type column")
        else:
            logger.info("  - cloud_storage_type column already exists")
        
        if not column_exists(db, "references", "cloud_storage_path"):
            db.execute(text("""
                ALTER TABLE references
                ADD COLUMN cloud_storage_path VARCHAR
            """))
            logger.info("  ✓ Added cloud_storage_path column")
        else:
            logger.info("  - cloud_storage_path column already exists")
        
        # 5. Create audit_logs table
        logger.info("Creating audit_logs table...")
        if not table_exists(db, "audit_logs"):
            db.execute(text("""
                CREATE TABLE audit_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    action VARCHAR NOT NULL,
                    entity_type VARCHAR NOT NULL,
                    entity_id VARCHAR NOT NULL,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    old_values JSONB,
                    new_values JSONB,
                    ip_address VARCHAR,
                    user_agent VARCHAR,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            # Create indexes for better query performance
            db.execute(text("""
                CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id)
            """))
            db.execute(text("""
                CREATE INDEX idx_audit_logs_user ON audit_logs(user_id)
            """))
            db.execute(text("""
                CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at)
            """))
            
            logger.info("  ✓ Created audit_logs table with indexes")
        else:
            logger.info("  - audit_logs table already exists")
        
        db.commit()
        logger.info("\n✅ Migration completed successfully!")
        logger.info("\nNext steps:")
        logger.info("  1. Verify new columns exist in database")
        logger.info("  2. Test assessment marking functionality")
        logger.info("  3. Proceed with cloud storage integration")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Migration failed: {e}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        logger.error(f"Migration script failed: {e}")
        sys.exit(1)
