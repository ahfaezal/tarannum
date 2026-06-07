"""
Upload a reference file to S3 if it exists locally but not in S3.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from database import SessionLocal, Reference
from cloud_storage import cloud_storage

def upload_reference_to_s3(ref_id: str):
    """Upload reference to S3 if it exists locally."""
    db = SessionLocal()
    try:
        ref = db.query(Reference).filter(Reference.id == ref_id).first()
        if not ref:
            print(f"❌ Reference {ref_id} not found in database")
            return False
        
        print(f"Reference ID: {ref_id}")
        print(f"Title: {ref.title}")
        print()
        
        # Check if already in S3
        if ref.cloud_storage_type == "s3" and ref.cloud_storage_path:
            exists = cloud_storage.file_exists(ref.cloud_storage_path)
            if exists:
                print(f"✅ File already exists in S3: {ref.cloud_storage_path}")
                return True
            else:
                print(f"⚠️  File marked as S3 but not found. Will re-upload...")
        
        # Check local storage
        local_path = Path(__file__).parent / "uploads" / "references" / f"{ref_id}.mp3"
        if not local_path.exists():
            # Try with filename extension
            if ref.filename:
                ext = Path(ref.filename).suffix or ".mp3"
                local_path = Path(__file__).parent / "uploads" / "references" / f"{ref_id}{ext}"
        
        if not local_path.exists():
            print(f"❌ File not found in local storage: {local_path}")
            print("   Cannot upload to S3 - file doesn't exist locally")
            return False
        
        print(f"✅ Found file in local storage: {local_path}")
        print(f"   File size: {local_path.stat().st_size} bytes")
        print()
        
        # Upload to S3
        print("Uploading to S3...")
        remote_path = f"references/{ref_id}{local_path.suffix}"
        cloud_url = cloud_storage.upload_file(local_path, remote_path)
        
        print(f"✅ Uploaded to S3: {cloud_url}")
        
        # Update database
        ref.cloud_storage_type = "s3"
        ref.cloud_storage_path = cloud_url
        ref.file_path = cloud_url  # Update file_path too
        db.commit()
        
        print(f"✅ Database updated with S3 path")
        print()
        print("=" * 60)
        print("✓ Upload Complete!")
        print(f"  S3 Path: {cloud_url}")
        print(f"  Reference ID: {ref_id}")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}", exc_info=True)
        return False
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        ref_id = sys.argv[1]
    else:
        print("Usage: python upload_to_s3.py <reference_id>")
        print("Example: python upload_to_s3.py fc1042de37b894deeaf84feabaea0ed0")
        sys.exit(1)
    
    upload_reference_to_s3(ref_id)
