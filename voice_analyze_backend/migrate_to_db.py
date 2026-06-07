"""
Migration script to move existing JSON/file-based data to PostgreSQL database.
Run this once to migrate existing data.
"""
import json
import logging
from pathlib import Path
from database import init_db, SessionLocal, Reference, TextSegment, PitchCache
from db_reference_library import db_reference_library

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

METADATA_FILE = Path(__file__).parent / "uploads" / "references.json"
PITCH_CACHE_DIR = Path(__file__).parent / "uploads" / "pitch_cache"


def migrate_references():
    """Migrate references from JSON file to database."""
    logger.info("Starting migration of references...")
    
    if not METADATA_FILE.exists():
        logger.info("No references.json file found. Nothing to migrate.")
        return
    
    db = SessionLocal()
    try:
        # Load existing metadata
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        
        migrated_count = 0
        skipped_count = 0
        
        for ref_id, ref_data in metadata.items():
            # Check if already exists in database
            existing = db.query(Reference).filter(Reference.id == ref_id).first()
            if existing:
                logger.info(f"Reference {ref_id} already exists in database, skipping...")
                skipped_count += 1
                continue
            
            # Create reference record
            try:
                from datetime import datetime
                upload_date = datetime.fromisoformat(ref_data.get("upload_date", datetime.utcnow().isoformat()))
                preset_updated = None
                if ref_data.get("preset_updated"):
                    preset_updated = datetime.fromisoformat(ref_data["preset_updated"])
                
                new_ref = Reference(
                    id=ref_id,
                    title=ref_data.get("title", ""),
                    maqam=ref_data.get("maqam", ""),
                    filename=ref_data.get("filename", ""),
                    file_path=ref_data.get("file_path", ""),
                    duration=float(ref_data.get("duration", 0.0)),
                    file_size=int(ref_data.get("file_size", 0)),
                    is_preset=ref_data.get("is_preset", False),
                    upload_date=upload_date,
                    preset_updated=preset_updated
                )
                
                db.add(new_ref)
                
                # Migrate text segments if they exist
                text_segments = ref_data.get("text_segments", [])
                if text_segments:
                    for seg in text_segments:
                        text_seg = TextSegment(
                            reference_id=ref_id,
                            text=seg.get("text", ""),
                            start=float(seg.get("start", 0.0)),
                            end=float(seg.get("end", 0.0))
                        )
                        db.add(text_seg)
                
                db.commit()
                migrated_count += 1
                logger.info(f"Migrated reference: {ref_id} - {ref_data.get('title', 'N/A')}")
                
            except Exception as e:
                db.rollback()
                logger.error(f"Error migrating reference {ref_id}: {e}", exc_info=True)
        
        logger.info(f"Migration complete: {migrated_count} references migrated, {skipped_count} skipped")
        
    except Exception as e:
        logger.error(f"Error during reference migration: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


def migrate_pitch_cache():
    """Migrate pitch cache from JSON files to database."""
    logger.info("Starting migration of pitch cache...")
    
    if not PITCH_CACHE_DIR.exists():
        logger.info("No pitch_cache directory found. Nothing to migrate.")
        return
    
    db = SessionLocal()
    try:
        cache_files = list(PITCH_CACHE_DIR.glob("*_pitch.json"))
        migrated_count = 0
        skipped_count = 0
        
        for cache_file in cache_files:
            # Extract ref_id from filename (format: {ref_id}_pitch.json)
            ref_id = cache_file.stem.replace("_pitch", "")
            
            # Check if already exists in database
            existing = db.query(PitchCache).filter(PitchCache.reference_id == ref_id).first()
            if existing:
                logger.info(f"Pitch cache for {ref_id} already exists in database, skipping...")
                skipped_count += 1
                continue
            
            # Load pitch data
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    pitch_data = json.load(f)
                
                # Create pitch cache record
                new_cache = PitchCache(
                    reference_id=ref_id,
                    pitch_data=pitch_data
                )
                
                db.add(new_cache)
                db.commit()
                migrated_count += 1
                logger.info(f"Migrated pitch cache: {ref_id} ({len(pitch_data)} points)")
                
            except Exception as e:
                db.rollback()
                logger.error(f"Error migrating pitch cache {cache_file}: {e}", exc_info=True)
        
        logger.info(f"Pitch cache migration complete: {migrated_count} caches migrated, {skipped_count} skipped")
        
    except Exception as e:
        logger.error(f"Error during pitch cache migration: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


def main():
    """Run all migrations."""
    logger.info("=" * 60)
    logger.info("Starting database migration...")
    logger.info("=" * 60)
    
    # Initialize database (create tables)
    logger.info("Initializing database tables...")
    init_db()
    
    # Migrate references
    migrate_references()
    
    # Migrate pitch cache
    migrate_pitch_cache()
    
    logger.info("=" * 60)
    logger.info("Migration complete!")
    logger.info("=" * 60)
    logger.info("You can now use the database-backed reference library.")
    logger.info("The old JSON files are preserved for backup.")


if __name__ == "__main__":
    main()
