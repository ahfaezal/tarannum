"""Quick script to verify ic_number and address columns exist."""
from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    result = db.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name IN ('ic_number', 'address')
    """))
    cols = [r[0] for r in result]
    print("Columns found:", cols)
    if 'ic_number' in cols and 'address' in cols:
        print("[SUCCESS] Both columns exist!")
    else:
        print("[WARNING] Some columns missing:", 
              "ic_number" if 'ic_number' not in cols else "",
              "address" if 'address' not in cols else "")
finally:
    db.close()
