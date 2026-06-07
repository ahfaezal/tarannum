"""
Fix public references - Mark references as public for demo/public access.
This is useful for ensuring demo content is accessible to public users.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from database import SessionLocal, Reference
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def make_reference_public(ref_id: str):
    """Mark a specific reference as public."""
    db = SessionLocal()
    try:
        ref = db.query(Reference).filter(Reference.id == ref_id).first()
        if not ref:
            logger.error(f"Reference {ref_id} not found in database")
            return False

        ref.is_public = True
        db.commit()
        logger.info(f"✅ Reference {ref_id} ({ref.title or 'Untitled'}) is now public")
        return True

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error making reference {ref_id} public: {e}", exc_info=True)
        return False
    finally:
        db.close()


def make_all_presets_public():
    """Mark all preset references as public."""
    db = SessionLocal()
    try:
        presets = db.query(Reference).filter(Reference.is_preset == True).all()
        updated = 0
        
        for ref in presets:
            if not ref.is_public:
                ref.is_public = True
                updated += 1
        
        db.commit()
        logger.info(f"✅ Marked {updated} preset references as public")
        return updated

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error making presets public: {e}", exc_info=True)
        return 0
    finally:
        db.close()


def make_references_without_owner_public():
    """Mark all references without an owner as public (demo content)."""
    db = SessionLocal()
    try:
        refs = db.query(Reference).filter(Reference.owner_id == None).all()
        updated = 0
        
        for ref in refs:
            if not ref.is_public:
                ref.is_public = True
                updated += 1
        
        db.commit()
        logger.info(f"✅ Marked {updated} references without owner as public")
        return updated

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error making references without owner public: {e}", exc_info=True)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python fix_public_references.py <reference_id>  # Make specific reference public")
        print("  python fix_public_references.py --presets       # Make all presets public")
        print("  python fix_public_references.py --no-owner     # Make all references without owner public")
        print("  python fix_public_references.py --all           # Make presets + no-owner public")
        sys.exit(1)
    
    arg = sys.argv[1]
    
    if arg == "--presets":
        make_all_presets_public()
    elif arg == "--no-owner":
        make_references_without_owner_public()
    elif arg == "--all":
        make_all_presets_public()
        make_references_without_owner_public()
    else:
        # Assume it's a reference ID
        make_reference_public(arg)
