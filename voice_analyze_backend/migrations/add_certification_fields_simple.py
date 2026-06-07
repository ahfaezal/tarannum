"""
Simple Migration: Add certification and subscription fields for Milestone 4
Uses direct SQL queries instead of SQLAlchemy inspector for better performance.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import engine, SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def column_exists_sql(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists using direct SQL (faster)."""
    try:
        result = db.execute(text(f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = :table_name 
            AND column_name = :column_name
        """), {"table_name": table_name, "column_name": column_name})
        return result.fetchone() is not None
    except Exception as e:
        logger.error(f"Error checking column {column_name} in {table_name}: {e}")
        return False


def table_exists_sql(db, table_name: str) -> bool:
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


def migrate():
    """Run the migration."""
    db = SessionLocal()
    try:
        logger.info("Starting Milestone 4 database migration (simple version)...")
        
        # 1. Add columns to user_sessions table
        logger.info("Adding certification fields to user_sessions...")
        if not column_exists_sql(db, "user_sessions", "is_assessment"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN is_assessment BOOLEAN DEFAULT FALSE
            """))
            logger.info("  ✓ Added is_assessment column")
        else:
            logger.info("  - is_assessment column already exists")
        
        if not column_exists_sql(db, "user_sessions", "is_immutable"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN is_immutable BOOLEAN DEFAULT FALSE
            """))
            logger.info("  ✓ Added is_immutable column")
        else:
            logger.info("  - is_immutable column already exists")
        
        if not column_exists_sql(db, "user_sessions", "assessment_marked_at"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN assessment_marked_at TIMESTAMP
            """))
            logger.info("  ✓ Added assessment_marked_at column")
        else:
            logger.info("  - assessment_marked_at column already exists")
        
        if not column_exists_sql(db, "user_sessions", "assessment_marked_by"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN assessment_marked_by UUID REFERENCES users(id)
            """))
            logger.info("  ✓ Added assessment_marked_by column")
        else:
            logger.info("  - assessment_marked_by column already exists")
        
        # Add cloud storage fields
        if not column_exists_sql(db, "user_sessions", "cloud_storage_type"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN cloud_storage_type VARCHAR
            """))
            logger.info("  ✓ Added cloud_storage_type column")
        else:
            logger.info("  - cloud_storage_type column already exists")
        
        if not column_exists_sql(db, "user_sessions", "cloud_storage_path"):
            db.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN cloud_storage_path VARCHAR
            """))
            logger.info("  ✓ Added cloud_storage_path column")
        else:
            logger.info("  - cloud_storage_path column already exists")
        
        db.commit()
        logger.info("✓ user_sessions table updated")
        
        # 2. Add columns to student_progress table
        logger.info("Adding immutability field to student_progress...")
        if not column_exists_sql(db, "student_progress", "is_immutable"):
            db.execute(text("""
                ALTER TABLE student_progress 
                ADD COLUMN is_immutable BOOLEAN DEFAULT FALSE
            """))
            logger.info("  ✓ Added is_immutable column")
        else:
            logger.info("  - is_immutable column already exists")
        
        db.commit()
        logger.info("✓ student_progress table updated")
        
        # 3. Add columns to users table
        logger.info("Adding subscription fields to users...")
        if not column_exists_sql(db, "users", "subscription_status"):
            db.execute(text("""
                ALTER TABLE users
                ADD COLUMN subscription_status VARCHAR
            """))
            logger.info("  ✓ Added subscription_status column")
        else:
            logger.info("  - subscription_status column already exists")
        
        if not column_exists_sql(db, "users", "subscription_start"):
            db.execute(text("""
                ALTER TABLE users
                ADD COLUMN subscription_start TIMESTAMP
            """))
            logger.info("  ✓ Added subscription_start column")
        else:
            logger.info("  - subscription_start column already exists")
        
        if not column_exists_sql(db, "users", "subscription_end"):
            db.execute(text("""
                ALTER TABLE users
                ADD COLUMN subscription_end TIMESTAMP
            """))
            logger.info("  ✓ Added subscription_end column")
        else:
            logger.info("  - subscription_end column already exists")
        
        if not column_exists_sql(db, "users", "subscription_tier"):
            db.execute(text("""
                ALTER TABLE users
                ADD COLUMN subscription_tier VARCHAR
            """))
            logger.info("  ✓ Added subscription_tier column")
        else:
            logger.info("  - subscription_tier column already exists")
        
        db.commit()
        logger.info("✓ users table updated")
        
        # 4. Add columns to references table (quoted because "references" is a reserved keyword)
        logger.info("Adding cloud storage fields to references...")
        if not column_exists_sql(db, "references", "cloud_storage_type"):
            db.execute(text('''
                ALTER TABLE "references"
                ADD COLUMN cloud_storage_type VARCHAR
            '''))
            logger.info("  ✓ Added cloud_storage_type column")
        else:
            logger.info("  - cloud_storage_type column already exists")
        
        if not column_exists_sql(db, "references", "cloud_storage_path"):
            db.execute(text('''
                ALTER TABLE "references"
                ADD COLUMN cloud_storage_path VARCHAR
            '''))
            logger.info("  ✓ Added cloud_storage_path column")
        else:
            logger.info("  - cloud_storage_path column already exists")
        
        db.commit()
        logger.info("✓ references table updated")
        
        # 5. Create audit_logs table
        logger.info("Creating audit_logs table...")
        if not table_exists_sql(db, "audit_logs"):
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
        logger.info("  2. Test registration/login")
        logger.info("  3. Proceed with testing Milestone 4 features")
        
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
