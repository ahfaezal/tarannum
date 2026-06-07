"""
Migration script to add referral_code and commission_rate columns to users table.
Run this script once to update the database schema.
"""
import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_database_url():
    """Get database URL from environment."""
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        # Try constructing from individual components
        db_user = os.getenv("DB_USER", "postgres")
        db_password = os.getenv("DB_PASSWORD", "")
        db_host = os.getenv("DB_HOST", "localhost")
        db_port = os.getenv("DB_PORT", "5432")
        db_name = os.getenv("DB_NAME", "tarannum")
        
        db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    return db_url

def add_referral_columns():
    """Add referral_code and commission_rate columns to users table."""
    db_url = get_database_url()
    
    if not db_url:
        logger.error("DATABASE_URL not found in environment variables")
        sys.exit(1)
    
    try:
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            # Check if columns already exist
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name IN ('referral_code', 'commission_rate')
            """)
            
            result = conn.execute(check_query)
            existing_columns = [row[0] for row in result]
            
            # Add referral_code if it doesn't exist
            if 'referral_code' not in existing_columns:
                logger.info("Adding referral_code column...")
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN referral_code VARCHAR UNIQUE
                """))
                conn.commit()
                logger.info("✓ Added referral_code column")
            else:
                logger.info("referral_code column already exists")
            
            # Add commission_rate if it doesn't exist
            if 'commission_rate' not in existing_columns:
                logger.info("Adding commission_rate column...")
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN commission_rate FLOAT DEFAULT 0.0
                """))
                conn.commit()
                logger.info("✓ Added commission_rate column")
            else:
                logger.info("commission_rate column already exists")
            
            # Create index on referral_code if it doesn't exist
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_users_referral_code 
                    ON users(referral_code)
                """))
                conn.commit()
                logger.info("✓ Created index on referral_code")
            except Exception as e:
                logger.warning(f"Index creation (may already exist): {e}")
            
            logger.info("Migration completed successfully!")
            
    except Exception as e:
        logger.error(f"Error during migration: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    logger.info("Starting migration to add referral_code and commission_rate columns...")
    add_referral_columns()
    logger.info("Migration finished!")
