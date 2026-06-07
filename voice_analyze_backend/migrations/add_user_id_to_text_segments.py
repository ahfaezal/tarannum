import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import engine, SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def column_exists_sql(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists using direct SQL."""
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

def migrate():
    """Add user_id column to text_segments table."""
    db = SessionLocal()
    try:
        logger.info("Starting migration: Add user_id to text_segments table...")

        if not column_exists_sql(db, "text_segments", "user_id"):
            # Add user_id column
            db.execute(text("""
                ALTER TABLE text_segments
                ADD COLUMN user_id UUID
            """))
            
            # Add foreign key constraint
            db.execute(text("""
                ALTER TABLE text_segments
                ADD CONSTRAINT fk_text_segments_user_id
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            """))
            
            # Create index for faster queries
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_text_segments_user_id 
                ON text_segments(user_id)
            """))
            
            # Create composite index for reference_id + user_id queries
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_text_segments_ref_user 
                ON text_segments(reference_id, user_id)
            """))
            
            logger.info("  ✓ Added user_id column to text_segments")
            logger.info("  ✓ Added foreign key constraint")
            logger.info("  ✓ Created indexes")
        else:
            logger.info("  - user_id column already exists")

        db.commit()
        logger.info("Migration completed successfully!")

    except Exception as e:
        db.rollback()
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
