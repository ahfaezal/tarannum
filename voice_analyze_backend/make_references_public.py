"""Make all existing references public so public users can access them"""
from database import SessionLocal, Reference

db = SessionLocal()
try:
    refs = db.query(Reference).all()
    print(f"Total references: {len(refs)}")
    
    updated_count = 0
    for ref in refs:
        print(f"  {ref.id}: is_public={ref.is_public}, owner={ref.owner_id}, title={ref.title}")
        if not ref.is_public and ref.owner_id is None:
            # Make references without owner public (these are likely old admin uploads)
            ref.is_public = True
            updated_count += 1
            print(f"    -> Marking as public")
    
    if updated_count > 0:
        db.commit()
        print(f"\nUpdated {updated_count} references to be public")
    else:
        print("\nNo references needed updating")
finally:
    db.close()
