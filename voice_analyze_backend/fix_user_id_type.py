"""Fix user_id column type in user_sessions table from VARCHAR to UUID."""
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from database import DATABASE_URL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_user_id_type():
    """Convert user_id column from VARCHAR to UUID."""
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as conn:
        logger.info("Starting migration to convert user_id from VARCHAR to UUID...")
        
        # First, check if there are any invalid UUIDs
        try:
            invalid_count = conn.execute(text("""
                SELECT COUNT(*) 
                FROM user_sessions 
                WHERE user_id IS NOT NULL 
                AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            """)).scalar()
            
            if invalid_count > 0:
                logger.warning(f"Found {invalid_count} rows with invalid UUID format. These will be set to NULL.")
                conn.execute(text("""
                    UPDATE user_sessions 
                    SET user_id = NULL 
                    WHERE user_id IS NOT NULL 
                    AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                """))
                conn.commit()
        except Exception as e:
            logger.warning(f"Could not check for invalid UUIDs: {e}")
        
        # Check current type
        result = conn.execute(text("""
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'user_sessions' AND column_name = 'user_id'
        """)).first()
        
        if result and result[0] == 'uuid':
            logger.info("user_id is already UUID type, skipping migration.")
            return
        
        # Convert the column type
        try:
            # PostgreSQL requires casting through text first
            conn.execute(text("""
                ALTER TABLE user_sessions 
                ALTER COLUMN user_id TYPE uuid USING user_id::uuid
            """))
            conn.commit()
            logger.info("✔ Converted user_id column to UUID type")
        except ProgrammingError as e:
            if "already" in str(e).lower() or "does not exist" in str(e).lower():
                logger.info("user_id column type conversion not needed or column doesn't exist.")
                conn.rollback()
            else:
                logger.error(f"Error converting user_id column type: {e}", exc_info=True)
                conn.rollback()
                raise
        
        logger.info("Migration completed successfully!")

if __name__ == "__main__":
    try:
        fix_user_id_type()
        logger.info("Migration finished!")
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise
