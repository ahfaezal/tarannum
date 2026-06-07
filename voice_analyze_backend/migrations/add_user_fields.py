"""
Migration script to add ic_number and address fields to users table.
Run this script to update your database schema.
"""
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text, inspect
from database import SessionLocal, engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def column_exists_sql(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table using SQL."""
    try:
        result = db.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = :table_name 
            AND column_name = :column_name
        """), {"table_name": table_name, "column_name": column_name})
        return result.fetchone() is not None
    except Exception as e:
        logger.error(f"Error checking column {table_name}.{column_name}: {e}")
        return False


def add_user_fields():
    """Add ic_number and address columns to users table."""
    db = SessionLocal()
    try:
        logger.info("Starting migration: Add ic_number and address to users table...")
        
        # Check and add ic_number column
        if not column_exists_sql(db, "users", "ic_number"):
            logger.info("Adding ic_number column to users table...")
            db.execute(text("""
                ALTER TABLE users 
                ADD COLUMN ic_number VARCHAR NULL
            """))
            db.commit()
            logger.info("  [OK] Added ic_number column")
        else:
            logger.info("  - ic_number column already exists")
        
        # Check and add address column
        if not column_exists_sql(db, "users", "address"):
            logger.info("Adding address column to users table...")
            db.execute(text("""
                ALTER TABLE users 
                ADD COLUMN address VARCHAR NULL
            """))
            db.commit()
            logger.info("  [OK] Added address column")
        else:
            logger.info("  - address column already exists")
        
        logger.info("Migration completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        db.rollback()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("Database Migration: Add ic_number and address to users table")
    print("=" * 60)
    print()
    
    success = add_user_fields()
    
    if success:
        print("\n[SUCCESS] Migration completed successfully!")
        sys.exit(0)
    else:
        print("\n[ERROR] Migration failed. Please check the error messages above.")
        sys.exit(1)
