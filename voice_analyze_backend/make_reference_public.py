"""
Script to mark a reference as public (accessible to all users).
Usage: python make_reference_public.py <reference_id>
"""
import sys
from database import SessionLocal, Reference

def make_reference_public(ref_id: str):
    """Mark a reference as public."""
    db = SessionLocal()
    try:
        ref = db.query(Reference).filter(Reference.id == ref_id).first()
        if not ref:
            print(f"[ERROR] Reference {ref_id} not found")
            return False
        
        ref.is_public = True
        db.commit()
        print(f"[SUCCESS] Reference {ref_id} ({ref.title}) is now public")
        return True
    except Exception as e:
        db.rollback()
        print(f"[ERROR] {e}")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python make_reference_public.py <reference_id>")
        print("Example: python make_reference_public.py ca8acbfa43f5def14355861746d9a541")
        sys.exit(1)
    
    ref_id = sys.argv[1]
    make_reference_public(ref_id)
