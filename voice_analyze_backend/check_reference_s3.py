"""
Diagnostic script to check reference S3 status.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from database import SessionLocal, Reference
from cloud_storage import cloud_storage

def check_reference(ref_id: str):
    """Check reference S3 status."""
    db = SessionLocal()
    try:
        ref = db.query(Reference).filter(Reference.id == ref_id).first()
        if not ref:
            print(f"❌ Reference {ref_id} not found in database")
            return
        
        print(f"Reference ID: {ref_id}")
        print(f"Title: {ref.title}")
        print(f"Filename: {ref.filename}")
        print(f"File Path: {ref.file_path}")
        print(f"Cloud Storage Type: {ref.cloud_storage_type}")
        print(f"Cloud Storage Path: {ref.cloud_storage_path}")
        print()
        
        if ref.cloud_storage_type == "s3" and ref.cloud_storage_path:
            print("Checking S3...")
            exists = cloud_storage.file_exists(ref.cloud_storage_path)
            if exists:
                print(f"✅ File exists in S3: {ref.cloud_storage_path}")
            else:
                print(f"❌ File NOT found in S3: {ref.cloud_storage_path}")
                print()
                print("Possible issues:")
                print("1. File was uploaded before S3 was configured")
                print("2. S3 path is incorrect")
                print("3. File was deleted from S3")
        else:
            print("⚠️  Reference is not in S3 (cloud_storage_type is not 's3')")
        
        # Always check local storage as fallback
        print()
        print("Checking local storage...")
        local_path = Path(__file__).parent / "uploads" / "references" / f"{ref_id}.mp3"
        if local_path.exists():
            print(f"✅ File exists in local storage: {local_path}")
            print(f"   File size: {local_path.stat().st_size} bytes")
            
            # If marked as S3 but not in S3, offer to upload
            if ref.cloud_storage_type == "s3" and not exists:
                print()
                print("⚠️  File is marked as S3 but not found in S3!")
                print("   You can upload it to S3 using:")
                print(f"   python upload_to_s3.py {ref_id}")
        else:
            print(f"❌ File NOT found in local storage: {local_path}")
        
    except Exception as e:
        print(f"Error: {e}", exc_info=True)
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        ref_id = sys.argv[1]
    else:
        ref_id = "fc1042de37b894deeaf84feabaea0ed0"  # Default from error
    
    check_reference(ref_id)
