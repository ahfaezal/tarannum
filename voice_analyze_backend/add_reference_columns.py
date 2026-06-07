"""
Migration script to add owner_id and is_public columns to references table.
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

def add_reference_columns():
    """Add owner_id and is_public columns to references table."""
    db_url = get_database_url()
    
    if not db_url:
        logger.error("DATABASE_URL not found in environment variables")
        sys.exit(1)
    
    try:
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            # Check if columns already exist (references is a reserved word, need to quote it)
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'references' 
                AND column_name IN ('owner_id', 'is_public')
            """)
            
            result = conn.execute(check_query)
            existing_columns = [row[0] for row in result]
            
            # Add owner_id if it doesn't exist (quote "references" as it's a reserved word)
            if 'owner_id' not in existing_columns:
                logger.info("Adding owner_id column...")
                conn.execute(text('ALTER TABLE "references" ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE SET NULL'))
                conn.commit()
                logger.info("✓ Added owner_id column")
                
                # Create index
                try:
                    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_references_owner_id ON "references"(owner_id)'))
                    conn.commit()
                    logger.info("✓ Created index on owner_id")
                except Exception as e:
                    logger.warning(f"Index creation (may already exist): {e}")
            else:
                logger.info("owner_id column already exists")
            
            # Add is_public if it doesn't exist
            if 'is_public' not in existing_columns:
                logger.info("Adding is_public column...")
                conn.execute(text('ALTER TABLE "references" ADD COLUMN is_public BOOLEAN DEFAULT FALSE'))
                conn.commit()
                logger.info("✓ Added is_public column")
            else:
                logger.info("is_public column already exists")
            
            logger.info("Migration completed successfully!")
            
    except Exception as e:
        logger.error(f"Error during migration: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    logger.info("Starting migration to add owner_id and is_public columns to references table...")
    add_reference_columns()
    logger.info("Migration finished!")
