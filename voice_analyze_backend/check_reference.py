"""Check reference file path in database"""
from database import SessionLocal, Reference
from pathlib import Path

db = SessionLocal()
try:
    ref = db.query(Reference).filter(Reference.id == '9e0e7ab1fbc643926df53247c7137551').first()
    if ref:
        print(f"ID: {ref.id}")
        print(f"Title: {ref.title}")
        print(f"File path in DB: {ref.file_path}")
        print(f"Is Public: {ref.is_public}")
        print(f"Owner ID: {ref.owner_id}")
        
        # Check what the resolved path would be
        resolved_path = Path(__file__).parent / ref.file_path
        print(f"Resolved path: {resolved_path}")
        print(f"File exists: {resolved_path.exists()}")
        
        # Check path normalization
        normalized = Path(ref.file_path)
        print(f"Normalized path: {normalized}")
        print(f"Path parts: {normalized.parts}")
    else:
        print("Reference not found in database")
finally:
    db.close()
