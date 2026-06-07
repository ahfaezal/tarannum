"""Add qari_id column to user_sessions table."""
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from database import DATABASE_URL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def add_qari_id_column():
    """Add qari_id column to user_sessions table."""
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        logger.info("Starting migration to add qari_id column to user_sessions table...")
        
        # Add qari_id column
        try:
            conn.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN qari_id UUID REFERENCES users(id) ON DELETE SET NULL
            """))
            conn.commit()
            logger.info("✔ Added qari_id column")
        except ProgrammingError as e:
            if "already exists" in str(e) or "duplicate" in str(e).lower():
                logger.info("qari_id column already exists, skipping.")
                conn.rollback()
            else:
                logger.error(f"Error adding qari_id column: {e}", exc_info=True)
                conn.rollback()
                raise
        
        # Add index to qari_id for faster lookups
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_qari_id ON user_sessions (qari_id)"))
            conn.commit()
            logger.info("✔ Created index on qari_id")
        except ProgrammingError as e:
            if "already exists" in str(e):
                logger.info("Index ix_user_sessions_qari_id already exists, skipping.")
                conn.rollback()
            else:
                logger.error(f"Error creating index on qari_id: {e}", exc_info=True)
                conn.rollback()
                raise
        
        # Add is_public_demo column
        try:
            conn.execute(text("""
                ALTER TABLE user_sessions 
                ADD COLUMN is_public_demo BOOLEAN DEFAULT FALSE
            """))
            conn.commit()
            logger.info("✔ Added is_public_demo column")
        except ProgrammingError as e:
            if "already exists" in str(e) or "duplicate" in str(e).lower():
                logger.info("is_public_demo column already exists, skipping.")
                conn.rollback()
            else:
                logger.error(f"Error adding is_public_demo column: {e}", exc_info=True)
                conn.rollback()
                raise
        
        logger.info("Migration completed successfully!")

if __name__ == "__main__":
    try:
        add_qari_id_column()
        logger.info("Migration finished!")
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise
