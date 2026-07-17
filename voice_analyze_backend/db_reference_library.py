"""
Database-backed Reference Audio Library Service.
Replaces JSON file-based storage with PostgreSQL.
"""
import hashlib
import os
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import librosa
import logging
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import and_

from database import (
    Reference, TextSegment, PitchCache, UserSession, AnalysisResult,
    get_db, SessionLocal
)

logger = logging.getLogger(__name__)

# Storage directories (files still stored on disk, metadata in DB)
REFERENCES_DIR = Path(__file__).parent / "uploads" / "references"
REFERENCES_DIR.mkdir(parents=True, exist_ok=True)

# Pitch cache directory (for backward compatibility during migration)
PITCH_CACHE_DIR = Path(__file__).parent / "uploads" / "pitch_cache"
PITCH_CACHE_DIR.mkdir(parents=True, exist_ok=True)


class DBReferenceLibrary:
    """Manages reference audio library storage and retrieval using PostgreSQL."""
    
    def __init__(self):
        self.storage_dir = REFERENCES_DIR
    
    def save_reference(
        self,
        audio_file_path: Path,
        title: str,
        maqam: Optional[str] = None,
        filename: Optional[str] = None,
        owner_id: Optional[str] = None,
        is_public: bool = False,
        db: Optional[Session] = None
    ) -> Dict[str, any]:
        """
        Save a reference audio file to the library.
        Uses filename + file_size + duration to generate deterministic ID for duplicate detection.
        
        Args:
            audio_file_path: Path to the audio file to save
            title: Title/name for the reference
            maqam: Optional maqam/mode identifier
            filename: Optional original filename
            db: Optional database session (creates new if not provided)
        
        Returns:
            Dict with reference metadata including id, file_path, etc.
        """
        db_session = db or SessionLocal()
        try:
            # Ensure storage directory exists
            self.storage_dir.mkdir(parents=True, exist_ok=True)
            
            # Get file size first
            file_size = audio_file_path.stat().st_size
            filename_for_id = filename or audio_file_path.name
            
            # Get audio duration
            try:
                duration = librosa.get_duration(path=str(audio_file_path))
            except Exception as e:
                logger.warning(f"Could not get audio duration for ID generation: {e}")
                duration = 0.0
            
            # Convert owner_id to UUID for querying
            owner_uuid = None
            if owner_id:
                try:
                    from uuid import UUID
                    owner_uuid = UUID(owner_id) if isinstance(owner_id, str) else owner_id
                except ValueError:
                    logger.warning(f"Invalid owner_id format: {owner_id}")
            
            # Check if a file with the same filename exists in the same folder (same owner_id)
            # This allows updating upload_date when re-uploading the same file
            existing_ref = None
            if filename_for_id:
                query = db_session.query(Reference).filter(Reference.filename == filename_for_id)
                # Match owner_id (both None or same UUID)
                if owner_uuid:
                    query = query.filter(Reference.owner_id == owner_uuid)
                else:
                    query = query.filter(Reference.owner_id.is_(None))
                existing_ref = query.first()
            
            if existing_ref:
                logger.info(f"File {filename_for_id} already exists in same folder (owner_id: {owner_id}). Updating upload_date and replacing file.")
                
                # Update upload_date to current time
                existing_ref.upload_date = datetime.utcnow()
                
                # Update other fields that might have changed
                if title:
                    existing_ref.title = title
                if maqam:
                    existing_ref.maqam = maqam
                existing_ref.duration = float(duration)
                existing_ref.file_size = file_size
                
                # Replace the file in S3
                try:
                    from cloud_storage import cloud_storage, S3Storage, get_cloud_storage
                    from storage_path_helper import storage_path_helper
                    
                    storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local").lower()
                    is_s3_storage = isinstance(cloud_storage, S3Storage)
                    
                    if storage_type == "s3" and is_s3_storage:
                        # Generate the same S3 path (using existing reference ID)
                        remote_path = storage_path_helper.generate_reference_path(
                            reference_id=existing_ref.id,
                            owner_id=owner_id,
                            filename=filename_for_id,
                            db=db
                        )
                        
                        # Upload new file to S3 (replaces existing file)
                        cloud_url = cloud_storage.upload_file(audio_file_path, remote_path)
                        
                        if not cloud_url.startswith("s3://"):
                            raise ValueError(f"S3 upload failed: Expected S3 URL, got: {cloud_url}")
                        
                        # Update cloud storage paths
                        existing_ref.cloud_storage_type = "s3"
                        existing_ref.cloud_storage_path = cloud_url
                        existing_ref.file_path = cloud_url
                        
                        logger.info(f"Replaced file in S3: {cloud_url}")
                    else:
                        logger.warning(f"S3 not configured, cannot replace file. Storage type: {storage_type}, is_s3: {is_s3_storage}")
                except Exception as s3_error:
                    logger.error(f"Error replacing file in S3: {s3_error}", exc_info=True)
                    # Don't fail the update if S3 replacement fails - at least update the date
                
                # Commit the update
                db_session.commit()
                db_session.refresh(existing_ref)
                
                logger.info(f"Updated existing reference: {existing_ref.id} - {existing_ref.title} (upload_date: {existing_ref.upload_date})")
                return self._reference_to_dict(existing_ref)
            
            # File doesn't exist, proceed with creating new record
            # Generate deterministic ID from filename + size + duration
            duration_rounded = round(duration, 2)
            id_string = f"{filename_for_id}_{file_size}_{duration_rounded}"
            ref_id = hashlib.md5(id_string.encode('utf-8')).hexdigest()
            
            logger.info(f"Generated ID for {filename_for_id}: {ref_id} (size: {file_size}, duration: {duration_rounded})")
            
            # Check if reference with this ID already exists (defensive check)
            # This can happen if the filename check didn't catch it, or if the same file
            # was uploaded with different metadata
            existing_by_id = db_session.query(Reference).filter(Reference.id == ref_id).first()
            
            if existing_by_id:
                # Reference with this ID already exists
                # If it belongs to the same owner, update it; otherwise, generate a new ID
                if existing_by_id.owner_id == owner_uuid:
                    logger.info(f"Reference with ID {ref_id} already exists for same owner. Updating instead of creating new.")
                    # Update existing reference
                    existing_by_id.title = title
                    existing_by_id.maqam = maqam or ""
                    existing_by_id.filename = filename or audio_file_path.name
                    existing_by_id.duration = float(duration)
                    existing_by_id.file_size = file_size
                    existing_by_id.upload_date = datetime.utcnow()
                    existing_by_id.is_public = is_public
                    
                    # Replace the file in S3
                    try:
                        from cloud_storage import cloud_storage, S3Storage, get_cloud_storage
                        from storage_path_helper import storage_path_helper
                        
                        storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local").lower()
                        is_s3_storage = isinstance(cloud_storage, S3Storage)
                        
                        if storage_type == "s3" and is_s3_storage:
                            # Generate the same S3 path (using existing reference ID)
                            remote_path = storage_path_helper.generate_reference_path(
                                reference_id=existing_by_id.id,
                                owner_id=owner_id,
                                filename=filename_for_id,
                                db=db
                            )
                            
                            # Upload new file to S3 (replaces existing file)
                            cloud_url = cloud_storage.upload_file(audio_file_path, remote_path)
                            
                            if not cloud_url.startswith("s3://"):
                                raise ValueError(f"S3 upload failed: Expected S3 URL, got: {cloud_url}")
                            
                            # Update cloud storage paths
                            existing_by_id.cloud_storage_type = "s3"
                            existing_by_id.cloud_storage_path = cloud_url
                            existing_by_id.file_path = cloud_url
                            
                            logger.info(f"Replaced file in S3: {cloud_url}")
                    except Exception as s3_error:
                        logger.error(f"Error replacing file in S3: {s3_error}", exc_info=True)
                        # Don't fail the update if S3 replacement fails - at least update the date
                    
                    db_session.commit()
                    db_session.refresh(existing_by_id)
                    
                    logger.info(f"Updated existing reference: {ref_id} - {title}")
                    return self._reference_to_dict(existing_by_id)
                else:
                    # Different owner - generate a new unique ID by adding owner_id to the hash
                    logger.warning(f"Reference ID {ref_id} exists but belongs to different owner. Generating new ID.")
                    id_string_with_owner = f"{filename_for_id}_{file_size}_{duration_rounded}_{owner_id or 'none'}"
                    ref_id = hashlib.md5(id_string_with_owner.encode('utf-8')).hexdigest()
                    
                    # Double-check the new ID doesn't exist (very unlikely but possible)
                    while db_session.query(Reference).filter(Reference.id == ref_id).first():
                        # Add timestamp to make it unique
                        import time
                        id_string_with_owner = f"{filename_for_id}_{file_size}_{duration_rounded}_{owner_id or 'none'}_{time.time()}"
                        ref_id = hashlib.md5(id_string_with_owner.encode('utf-8')).hexdigest()
                    
                    logger.info(f"Generated new unique ID: {ref_id}")
            
            # File doesn't exist, proceed with save
            ext = audio_file_path.suffix or ".mp3"
            
            # Upload to S3 ONLY - no local storage fallback
            cloud_storage_type = None
            cloud_storage_path = None
            storage_path = None
            
            try:
                from cloud_storage import cloud_storage, S3Storage, get_cloud_storage
                storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local").lower()
                
                # Check if cloud_storage is actually S3Storage (not LocalStorage fallback)
                is_s3_storage = isinstance(cloud_storage, S3Storage)
                
                # If S3 is configured but we got LocalStorage, try to get the actual error
                s3_init_error = None
                if storage_type == "s3" and not is_s3_storage:
                    # Try to initialize S3Storage directly to get the actual error
                    try:
                        test_s3 = S3Storage()
                    except Exception as init_err:
                        s3_init_error = str(init_err)
                
                if storage_type == "s3" and is_s3_storage:
                    # Generate structured S3 path with owner UUID
                    from storage_path_helper import storage_path_helper
                    remote_path = storage_path_helper.generate_reference_path(
                        reference_id=ref_id,
                        owner_id=owner_id,  # Pass owner_id to include in path
                        filename=filename,
                        db=db
                    )
                    
                    # Upload directly to S3 from temp file (S3 ONLY - no local storage)
                    cloud_url = cloud_storage.upload_file(audio_file_path, remote_path)
                    
                    # Verify it's an S3 URL, not a local path
                    if not cloud_url.startswith("s3://"):
                        raise ValueError(
                            f"S3 upload failed: Expected S3 URL (s3://...), got: {cloud_url}. "
                            f"File was NOT saved. Please check S3 configuration."
                        )
                    
                    # Success - file is in S3
                    cloud_storage_type = "s3"
                    cloud_storage_path = cloud_url
                    
                    # Log detailed S3 upload information
                    bucket_name = os.getenv("S3_BUCKET_NAME", "N/A")
                    logger.info("=" * 60)
                    logger.info("✓ S3 Upload Successful")
                    logger.info(f"  S3 Bucket: {bucket_name}")
                    logger.info(f"  S3 File Path: {cloud_url}")
                    logger.info(f"  Reference ID: {ref_id}")
                    logger.info(f"  File Size: {file_size} bytes")
                    logger.info(f"  Status: Successfully uploaded to S3 ONLY (no local copy)")
                    logger.info("=" * 60)
                    
                elif storage_type == "s3" and not is_s3_storage:
                    # S3 configured but initialization failed
                    error_details = s3_init_error or "Unknown error (check logs for details)"
                    missing_vars = []
                    if not os.getenv("S3_BUCKET_NAME"):
                        missing_vars.append("S3_BUCKET_NAME")
                    if not os.getenv("AWS_ACCESS_KEY_ID"):
                        missing_vars.append("AWS_ACCESS_KEY_ID")
                    if not os.getenv("AWS_SECRET_ACCESS_KEY"):
                        missing_vars.append("AWS_SECRET_ACCESS_KEY")
                    
                    error_msg = (
                        f"S3 is configured (CLOUD_STORAGE_TYPE=s3) but S3 initialization failed. "
                        f"File was NOT saved.\n\n"
                        f"Error: {error_details}\n\n"
                    )
                    
                    if missing_vars:
                        error_msg += f"Missing environment variables: {', '.join(missing_vars)}\n\n"
                    
                    error_msg += (
                        f"Required S3 environment variables:\n"
                        f"  - CLOUD_STORAGE_TYPE=s3\n"
                        f"  - S3_BUCKET_NAME=tarannum-audio-prod\n"
                        f"  - AWS_ACCESS_KEY_ID=...\n"
                        f"  - AWS_SECRET_ACCESS_KEY=...\n"
                        f"  - AWS_REGION=ap-southeast-1\n\n"
                        f"Note: On Railway, these should be set in the service Variables."
                    )
                    
                    raise RuntimeError(error_msg)
                else:
                    # S3 not configured
                    raise RuntimeError(
                        f"S3 is not configured. CLOUD_STORAGE_TYPE must be set to 's3'. "
                        f"Current value: '{storage_type}'. "
                        f"File was NOT saved. Please configure S3 storage."
                    )
                    
            except ImportError:
                raise RuntimeError(
                    "cloud_storage module not available. File was NOT saved. "
                    "Please install required dependencies."
                )
            except (ValueError, RuntimeError):
                # Re-raise these as-is (they're already formatted error messages)
                raise
            except Exception as cloud_error:
                # Unexpected error during S3 upload
                raise RuntimeError(
                    f"S3 upload failed with unexpected error: {str(cloud_error)}. "
                    f"File was NOT saved. Please check S3 configuration and try again."
                ) from cloud_error
            
            # Verify duration (use temp file - no local storage)
            try:
                verified_duration = librosa.get_duration(path=str(audio_file_path))
                if abs(verified_duration - duration) > 0.01:
                    logger.warning(f"Duration mismatch: calculated {duration}, verified {verified_duration}")
                    duration = verified_duration
            except Exception as e:
                logger.warning(f"Could not verify audio duration: {e}")
            
            # owner_uuid already set above if we didn't find existing_ref
            if not owner_uuid and owner_id:
                try:
                    from uuid import UUID
                    owner_uuid = UUID(owner_id) if isinstance(owner_id, str) else owner_id
                except ValueError:
                    logger.warning(f"Invalid owner_id format: {owner_id}")
            
            # Create database record
            # File MUST be in S3 (no local storage fallback)
            if not cloud_storage_path or not cloud_storage_path.startswith("s3://"):
                raise RuntimeError(
                    f"File was not uploaded to S3. cloud_storage_path: {cloud_storage_path}. "
                    f"Upload failed - file was NOT saved."
                )
            
            # File is in S3, use S3 URL as file_path
            file_path_value = cloud_storage_path
            
            new_ref = Reference(
                id=ref_id,
                title=title,
                maqam=maqam or "",
                filename=filename or audio_file_path.name,
                file_path=file_path_value,
                duration=float(duration),
                file_size=file_size,
                is_preset=False,
                upload_date=datetime.utcnow(),
                owner_id=owner_uuid,
                is_public=is_public,
                cloud_storage_type=cloud_storage_type,
                cloud_storage_path=cloud_storage_path
            )
            
            db_session.add(new_ref)
            db_session.commit()
            db_session.refresh(new_ref)
            
            logger.info(f"Saved reference audio: {ref_id} - {title}")
            
            return self._reference_to_dict(new_ref)
            
        except Exception as e:
            if db_session:
                db_session.rollback()
            logger.error(f"Error saving reference audio: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    def get_reference(
        self,
        ref_id: str,
        user_role: Optional[str] = None,
        user_id: Optional[str] = None,
        student_qari_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Optional[Dict[str, any]]:
        """
        Get reference metadata by ID with access control.
        
        Args:
            ref_id: Reference ID
            user_role: User role for access control
            user_id: User ID (for Qari to check ownership)
            student_qari_id: Qari ID if user is a student
            db: Optional database session
        """
        db_session = db or SessionLocal()
        try:
            from uuid import UUID
            from database import UserRole
            
            ref = db_session.query(Reference).filter(Reference.id == ref_id).first()
            if not ref:
                logger.warning(f"Reference {ref_id} not found in database")
                return None
            
            # Log reference details for debugging
            logger.debug(
                f"Reference {ref_id} access check: "
                f"is_public={ref.is_public}, is_preset={ref.is_preset}, "
                f"owner_id={ref.owner_id}, user_role={user_role}, user_id={user_id}"
            )
            
            # Determine which user_id to use for filtering text_segments
            # Students should see their Qari's text segments, Qaris see their own, Admins see all (or their own)
            text_segments_user_id = None
            if user_role == UserRole.STUDENT and student_qari_id:
                # Student: show text segments from their Qari
                text_segments_user_id = student_qari_id
            elif user_role == UserRole.QARI and user_id:
                # Qari: show their own text segments
                text_segments_user_id = user_id
            elif user_role == UserRole.ADMIN and user_id:
                # Admin: show their own text segments (or None to see all)
                text_segments_user_id = user_id
            
            # Preset references (admin-created demo content) should be accessible to public
            if ref.is_preset:
                logger.debug(f"Reference {ref_id} is a preset - allowing access")
                return self._reference_to_dict(ref, user_id=text_segments_user_id)
            
            # References with no owner (demo/public content) should be accessible to all
            if ref.owner_id is None:
                logger.debug(f"Reference {ref_id} has no owner - allowing access as demo content")
                return self._reference_to_dict(ref, user_id=text_segments_user_id)
            
            # Access control check
            if user_role == UserRole.ADMIN:
                # Admin can access all
                return self._reference_to_dict(ref, user_id=text_segments_user_id)
            elif user_role == UserRole.QARI:
                # Qari can access their own or public
                if user_id:
                    user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
                    if ref.owner_id == user_uuid or ref.is_public:
                        return self._reference_to_dict(ref, user_id=text_segments_user_id)
                elif ref.is_public:
                    return self._reference_to_dict(ref, user_id=text_segments_user_id)
            elif user_role == UserRole.STUDENT:
                # Student can access their Qari's or public
                if student_qari_id:
                    qari_uuid = UUID(student_qari_id) if isinstance(student_qari_id, str) else student_qari_id
                    # Check if reference is owned by student's Qari
                    if ref.owner_id == qari_uuid:
                        logger.debug(f"Student access granted: Reference owned by student's Qari")
                        return self._reference_to_dict(ref, user_id=text_segments_user_id)
                    # Check if reference is in Qari's Content Library (even if not owned by Qari)
                    from database import QariContent
                    qari_content = db_session.query(QariContent).filter(
                        QariContent.qari_id == qari_uuid,
                        QariContent.reference_id == ref_id,
                        QariContent.is_active == True
                    ).first()
                    if qari_content:
                        logger.debug(f"Student access granted: Reference in Qari's Content Library")
                        return self._reference_to_dict(ref, user_id=text_segments_user_id)
                    # Check if reference is public
                    if ref.is_public:
                        logger.debug(f"Student access granted: Public reference")
                        return self._reference_to_dict(ref, user_id=text_segments_user_id)
                    else:
                        logger.debug(f"Student access denied: Reference not in Qari's library, not owned by Qari, and not public")
                elif ref.is_public:
                    logger.debug(f"Student access granted: Public reference (no Qari assigned)")
                    return self._reference_to_dict(ref, user_id=text_segments_user_id)
                else:
                    logger.debug(f"Student access denied: Not assigned to Qari and reference is not public")
            elif user_role == UserRole.PUBLIC or not user_role:
                # Public can access: public references, ownerless (demo) references, or Admin-owned references
                if ref.is_public or ref.owner_id is None:
                    return self._reference_to_dict(ref, user_id=text_segments_user_id)
                # Check if owner is Admin (Admin uploads should be accessible to public users)
                elif ref.owner_id:
                    from database import User
                    owner_user = db_session.query(User).filter(User.id == ref.owner_id).first()
                    if owner_user and owner_user.role == UserRole.ADMIN:
                        logger.debug(f"Public access granted: Reference owned by Admin")
                        return self._reference_to_dict(ref, user_id=text_segments_user_id)
            
            # Access denied
            return None
        finally:
            if not db:
                db_session.close()
    
    def get_reference_file_path(self, ref_id: str, db: Optional[Session] = None) -> Optional[Path]:
        """Get the file path for a reference by ID."""
        db_session = db or SessionLocal()
        try:
            ref = db_session.query(Reference).filter(Reference.id == ref_id).first()
            if not ref:
                logger.warning(f"Reference {ref_id} not found in database")
                return None
            
            # Check if this is a cloud storage reference
            if ref.cloud_storage_type and ref.cloud_storage_path:
                logger.info(f"Reference {ref_id} is stored in cloud: {ref.cloud_storage_type}")
                # For cloud storage, we return None and let the endpoint handle it
                # The endpoint should use cloud_storage service to get a presigned URL
                return None
            
            # Try the stored file_path first
            if ref.file_path:
                # Skip if file_path is an S3 URL (cloud storage)
                if ref.file_path.startswith("s3://"):
                    logger.debug(f"Reference {ref_id} file_path is S3 URL, skipping local lookup")
                    return None
                
                # Normalize path (handle both forward and backslashes)
                normalized_path = ref.file_path.replace('\\', '/')
                file_path = Path(__file__).parent / normalized_path
                
                if file_path.exists():
                    logger.debug(f"Found reference file at stored path: {file_path}")
                    return file_path
                else:
                    logger.warning(f"Stored path does not exist: {file_path}")
            
            # Try alternative: direct storage path with multiple extensions
            possible_extensions = ['.mp3', '.wav', '.m4a', '.ogg']
            for ext in possible_extensions:
                storage_path = self.storage_dir / f"{ref_id}{ext}"
                if storage_path.exists():
                    logger.info(f"Found reference file at storage path: {storage_path}")
                    return storage_path
            
            # Try with filename from database
            if ref.filename:
                filename_ext = Path(ref.filename).suffix or '.mp3'
                storage_path = self.storage_dir / f"{ref_id}{filename_ext}"
                if storage_path.exists():
                    logger.info(f"Found reference file using filename: {storage_path}")
                    return storage_path
            
            # If the underlying audio file is missing, log warning but don't delete (might be cloud stored)
            logger.error(
                f"Reference file for ID {ref_id} not found. "
                f"Checked paths: stored={ref.file_path if ref.file_path else 'None'}, "
                f"storage_dir={self.storage_dir}, cloud_storage={ref.cloud_storage_type or 'None'}"
            )
            # Don't delete - might be in cloud storage or temporarily unavailable
            return None
            
        except Exception as e:
            logger.error(f"Error getting reference file path for {ref_id}: {e}", exc_info=True)
            return None
        finally:
            if not db:
                db_session.close()
    
    def list_references(
        self,
        owner_id: Optional[str] = None,
        is_public: Optional[bool] = None,
        user_role: Optional[str] = None,
        student_qari_id: Optional[str] = None,
        admin_user_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> List[Dict[str, any]]:
        """
        List references with role-based filtering.
        
        Args:
            owner_id: Filter by owner (for Qari to see their own)
            is_public: Filter by public status
            user_role: User role (admin, qari, student, public)
            student_qari_id: Qari ID if user is a student
            db: Optional database session
        """
        db_session = db or SessionLocal()
        try:
            from uuid import UUID
            from database import UserRole
            
            query = db_session.query(Reference)
            
            # Role-based filtering
            if user_role == UserRole.ADMIN:
                # Admin sees only their own uploaded files (filtered by owner_id)
                if admin_user_id:
                    admin_uuid = UUID(admin_user_id) if isinstance(admin_user_id, str) else admin_user_id
                    query = query.filter(Reference.owner_id == admin_uuid)
                else:
                    # No admin_user_id provided - return empty list
                    query = query.filter(False)  # Return no results
            elif user_role == UserRole.QARI:
                # Qari sees only their own uploaded files (filtered by owner_id)
                if owner_id:
                    owner_uuid = UUID(owner_id) if isinstance(owner_id, str) else owner_id
                    query = query.filter(Reference.owner_id == owner_uuid)
                else:
                    # No owner_id provided - return empty list
                    query = query.filter(False)  # Return no results
            elif user_role == UserRole.STUDENT:
                # Student sees their Qari's content + public
                if student_qari_id:
                    qari_uuid = UUID(student_qari_id) if isinstance(student_qari_id, str) else student_qari_id
                    query = query.filter(
                        (Reference.owner_id == qari_uuid) | (Reference.is_public == True)
                    )
                else:
                    # No Qari assigned - only public
                    query = query.filter(Reference.is_public == True)
            elif user_role == UserRole.PUBLIC or not user_role:
                # Public users see: public references, ownerless (demo) references, or Admin-owned references
                from database import User
                # Get all Admin user IDs
                admin_users = db_session.query(User.id).filter(User.role == UserRole.ADMIN).all()
                admin_ids = [admin[0] for admin in admin_users]
                
                # Build filter: is_public OR owner_id is None OR owner_id is Admin
                if admin_ids:
                    query = query.filter(
                        (Reference.is_public == True) |
                        (Reference.owner_id.is_(None)) |
                        (Reference.owner_id.in_(admin_ids))
                    )
                else:
                    # No admins found, fallback to public/demo only
                    query = query.filter(
                        (Reference.is_public == True) |
                        (Reference.owner_id.is_(None))
                    )
            
            # Sort by last used (most recent session using this reference) instead of upload date
            from database import UserSession
            from sqlalchemy import func
            
            # Get the most recent usage time for each reference
            # Use a subquery to get max created_at from user_sessions for each reference
            subquery = db_session.query(
                UserSession.reference_id,
                func.max(UserSession.created_at).label('last_used')
            ).filter(
                UserSession.reference_id.isnot(None)
            ).group_by(UserSession.reference_id).subquery()
            
            # Join with the subquery to get last_used, then order by it (most recent first)
            # References without usage will have NULL last_used and appear at the end
            refs_query = db_session.query(
                Reference,
                subquery.c.last_used.label('last_used')
            ).outerjoin(
                subquery, Reference.id == subquery.c.reference_id
            ).options(
                # Load all ayah/text segments in one additional query instead of
                # issuing one lazy query per reference (the N+1 query pattern).
                selectinload(Reference.text_segments)
            )
            
            # Apply the same filters from the original query
            if query.whereclause is not None:
                refs_query = refs_query.filter(query.whereclause)
            
            # Order by upload_date (latest first) for Admin and Qari to show newest uploads first
            # For other roles, use last_used then upload_date
            if user_role == UserRole.ADMIN or user_role == UserRole.QARI:
                # Admin and Qari: Show latest uploaded files first
                refs = refs_query.order_by(
                    Reference.upload_date.desc()  # Latest uploads first
                ).all()
            else:
                # Other roles: Order by last_used (most recent first), then by upload_date for unused references
                refs = refs_query.order_by(
                    subquery.c.last_used.desc().nullslast(),
                    Reference.upload_date.desc()  # Fallback to upload_date for unused references
                ).all()
            
            # Determine which user_id to use for filtering text_segments
            # All users (Admin, Qari, Student) should see text segments filtered by reference_id AND user_id
            text_segments_user_id = None
            if user_role == UserRole.STUDENT and student_qari_id:
                # Student: show text segments from their Qari (filtered by reference_id AND Qari's user_id)
                text_segments_user_id = student_qari_id
            elif user_role == UserRole.QARI and owner_id:
                # Qari: show their own text segments (filtered by reference_id AND user_id)
                text_segments_user_id = owner_id
            elif user_role == UserRole.ADMIN and admin_user_id:
                # Admin: show their own text segments (filtered by reference_id AND user_id)
                text_segments_user_id = admin_user_id
            
            # Extract Reference objects and add last_used to dict
            result = []
            for row in refs:
                # SQLAlchemy returns Row objects which can be accessed by index or attribute
                ref = row[0] if hasattr(row, '__getitem__') else row
                ref_dict = self._reference_to_dict(ref, user_id=text_segments_user_id)
                # Add last_used timestamp if available
                try:
                    last_used = row[1] if len(row) > 1 else None
                    if last_used:
                        ref_dict['last_used'] = last_used.isoformat() if hasattr(last_used, 'isoformat') else str(last_used)
                except (IndexError, AttributeError):
                    pass
                result.append(ref_dict)
            
            return result
        finally:
            if not db:
                db_session.close()
    
    def delete_reference(self, ref_id: str, db: Optional[Session] = None) -> bool:
        """Delete a reference from the library."""
        db_session = db or SessionLocal()
        try:
            ref = db_session.query(Reference).filter(Reference.id == ref_id).first()
            if not ref:
                return False
            
            # Delete file
            file_path = Path(__file__).parent / ref.file_path
            if file_path.exists():
                file_path.unlink()
            
            # Delete from database (cascade will handle related records)
            db_session.delete(ref)
            db_session.commit()
            
            logger.info(f"Deleted reference audio: {ref_id}")
            return True
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error deleting reference: {e}", exc_info=True)
            return False
        finally:
            if not db:
                db_session.close()
    
    def save_preset(
        self,
        reference_id: str,
        title: str,
        text_segments: List[Dict[str, any]],
        maqam: Optional[str] = None,
        user_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Dict[str, any]:
        """
        Save or update a training preset with text segments.
        
        Args:
            reference_id: ID of existing reference audio
            title: Preset title
            text_segments: List of {text, start, end} segments
            maqam: Optional maqam/mode identifier
            user_id: Optional user ID (Qari/Admin) who owns these text segments
            db: Optional database session
        
        Returns:
            Dict with preset metadata
        """
        db_session = db or SessionLocal()
        try:
            from uuid import UUID
            
            ref = db_session.query(Reference).filter(Reference.id == reference_id).first()
            if not ref:
                raise ValueError(f"Reference {reference_id} not found")
            
            # Update reference to be a preset
            ref.is_preset = True
            ref.title = title
            if maqam:
                ref.maqam = maqam
            ref.preset_updated = datetime.utcnow()
            
            # Convert user_id to UUID if provided
            user_uuid = None
            if user_id:
                user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            
            # Delete existing text segments for THIS user and reference
            query = db_session.query(TextSegment).filter(TextSegment.reference_id == reference_id)
            if user_uuid:
                query = query.filter(TextSegment.user_id == user_uuid)
            query.delete()
            
            # Add new text segments with user_id
            for seg in text_segments:
                text_seg = TextSegment(
                    reference_id=reference_id,
                    user_id=user_uuid,  # Associate with user/Qari
                    text=seg.get("text", ""),
                    start=float(seg.get("start", 0.0)),
                    end=float(seg.get("end", 0.0))
                )
                db_session.add(text_seg)
            
            db_session.commit()
            db_session.refresh(ref)
            
            logger.info(f"Saved preset: {reference_id} - {title} ({len(text_segments)} segments)")
            
            return self._reference_to_dict(ref, user_id=user_id)
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error saving preset: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    def list_presets(self, admin_user_id: Optional[str] = None, db: Optional[Session] = None) -> List[Dict[str, any]]:
        """List presets filtered by admin user's owner_id."""
        db_session = db or SessionLocal()
        try:
            query = db_session.query(Reference).filter(Reference.is_preset == True)
            
            # Filter by owner_id if admin_user_id is provided
            if admin_user_id:
                from uuid import UUID
                admin_uuid = UUID(admin_user_id) if isinstance(admin_user_id, str) else admin_user_id
                query = query.filter(Reference.owner_id == admin_uuid)
            else:
                # If no admin_user_id provided, return empty list (shouldn't happen for authenticated Admin)
                return []
            
            presets = query.order_by(
                Reference.preset_updated.desc().nulls_last(),
                Reference.upload_date.desc()
            ).all()
            
            # Get user_id for text segment filtering (Admin's own segments)
            return [self._reference_to_dict(preset, user_id=admin_user_id) for preset in presets]
        finally:
            if not db:
                db_session.close()
    
    def update_preset_text_segments(
        self,
        preset_id: str,
        text_segments: List[Dict[str, any]],
        user_id: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Optional[Dict[str, any]]:
        """
        Update text segments for an existing preset.
        
        Args:
            preset_id: ID of preset to update
            text_segments: New list of {text, start, end} segments
            user_id: Optional user ID (Qari/Admin) who owns these text segments
            db: Optional database session
        
        Returns:
            Updated preset metadata or None if not found
        """
        db_session = db or SessionLocal()
        try:
            from uuid import UUID
            
            ref = db_session.query(Reference).filter(Reference.id == preset_id).first()
            if not ref:
                return None
            
            if not ref.is_preset:
                raise ValueError(f"Reference {preset_id} is not a preset")
            
            # Convert user_id to UUID if provided
            user_uuid = None
            if user_id:
                user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            
            # Delete existing text segments for THIS user and reference
            query = db_session.query(TextSegment).filter(TextSegment.reference_id == preset_id)
            if user_uuid:
                query = query.filter(TextSegment.user_id == user_uuid)
            query.delete()
            
            # Add new text segments with user_id
            for seg in text_segments:
                text_seg = TextSegment(
                    reference_id=preset_id,
                    user_id=user_uuid,  # Associate with user/Qari
                    text=seg.get("text", ""),
                    start=float(seg.get("start", 0.0)),
                    end=float(seg.get("end", 0.0))
                )
                db_session.add(text_seg)
            
            ref.preset_updated = datetime.utcnow()
            db_session.commit()
            db_session.refresh(ref)
            
            logger.info(f"Updated preset text segments: {preset_id} ({len(text_segments)} segments)")
            
            return self._reference_to_dict(ref)
            
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error updating preset: {e}", exc_info=True)
            raise
        finally:
            if not db:
                db_session.close()
    
    def cache_pitch_data(self, ref_id: str, pitch_data: List[Dict], db: Optional[Session] = None) -> bool:
        """
        Cache extracted pitch data to database.
        
        Args:
            ref_id: Reference ID
            pitch_data: List of pitch data points [{time, f_hz, midi, confidence}, ...]
            db: Optional database session
        
        Returns:
            True if cached successfully, False otherwise
        """
        db_session = db or SessionLocal()
        try:
            # Check if cache already exists
            existing_cache = db_session.query(PitchCache).filter(PitchCache.reference_id == ref_id).first()
            
            if existing_cache:
                # Update existing cache
                existing_cache.pitch_data = pitch_data
                existing_cache.updated_at = datetime.utcnow()
            else:
                # Create new cache
                new_cache = PitchCache(
                    reference_id=ref_id,
                    pitch_data=pitch_data
                )
                db_session.add(new_cache)
            
            db_session.commit()
            
            # Upload pitch data to S3 (Milestone 4 requirement)
            try:
                from cloud_storage import cloud_storage, S3Storage
                storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local").lower()
                is_s3_storage = isinstance(cloud_storage, S3Storage)
                
                if storage_type == "s3" and is_s3_storage:
                    from storage_path_helper import storage_path_helper
                    import tempfile
                    import json
                    
                    # Save pitch data to temp file
                    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_file:
                        json.dump(pitch_data, tmp_file, indent=2)
                        tmp_path = Path(tmp_file.name)
                    
                    try:
                        # Generate structured S3 path
                        s3_path = storage_path_helper.generate_pitch_data_path(
                            reference_id=ref_id,
                            db=db_session
                        )
                        
                        # Upload to S3
                        s3_url = cloud_storage.upload_file(tmp_path, s3_path)
                        
                        if s3_url and s3_url.startswith("s3://"):
                            logger.info(f"✓ Pitch data uploaded to S3: {s3_url}")
                        else:
                            logger.warning(f"S3 upload returned invalid URL: {s3_url}")
                    finally:
                        # Clean up temp file
                        if tmp_path.exists():
                            tmp_path.unlink()
                            
            except Exception as s3_error:
                logger.warning(f"Could not upload pitch data to S3: {s3_error}. Data stored in database only.")
            
            logger.info(f"Cached pitch data for {ref_id} ({len(pitch_data)} points)")
            return True
        except Exception as e:
            db_session.rollback()
            logger.error(f"Error caching pitch data for {ref_id}: {e}", exc_info=True)
            return False
        finally:
            if not db:
                db_session.close()
    
    def get_cached_pitch_data(self, ref_id: str, db: Optional[Session] = None) -> Optional[List[Dict]]:
        """
        Retrieve cached pitch data for a reference ID.
        
        Args:
            ref_id: Reference ID
            db: Optional database session
        
        Returns:
            List of pitch data points or None if not found
        """
        db_session = db or SessionLocal()
        try:
            cache = db_session.query(PitchCache).filter(PitchCache.reference_id == ref_id).first()
            if cache:
                logger.info(f"Loaded cached pitch data for {ref_id} ({len(cache.pitch_data)} points)")
                return cache.pitch_data
            return None
        finally:
            if not db:
                db_session.close()
    
    def _reference_to_dict(self, ref: Reference, user_id: Optional[str] = None) -> Dict[str, any]:
        """
        Convert Reference model to dictionary format.
        
        Args:
            ref: Reference model instance
            user_id: Optional user ID to filter text_segments by (if None, returns all segments)
        """
        from uuid import UUID
        
        result = {
            "id": ref.id,
            "title": ref.title,
            "maqam": ref.maqam or "",
            "filename": ref.filename,
            "file_path": ref.file_path,
            "duration": float(ref.duration),
            "upload_date": ref.upload_date.isoformat() if ref.upload_date else "",
            "file_size": ref.file_size,
            "is_preset": ref.is_preset,
            "text_segments": []
        }
        
        # Add text segments if they exist, optionally filtered by user_id
        if ref.text_segments:
            user_uuid = None
            if user_id:
                user_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            
            segments = ref.text_segments
            if user_uuid:
                # Filter by user_id - only return segments owned by this user
                segments = [seg for seg in segments if seg.user_id == user_uuid]
            
            # Sort segments by 'start' field (ascending order - earliest first)
            segments = sorted(segments, key=lambda seg: seg.start or 0)
            
            result["text_segments"] = [
                {
                    "text": seg.text,
                    "start": float(seg.start),
                    "end": float(seg.end)
                }
                for seg in segments
            ]
        
        # Add preset_updated if it's a preset
        if ref.is_preset and ref.preset_updated:
            result["preset_updated"] = ref.preset_updated.isoformat()
        
        return result


# Global instance
db_reference_library = DBReferenceLibrary()
