"""
Cloud storage service for audio files and evidence (Milestone 4).
Supports AWS S3, Azure Blob Storage, and Google Cloud Storage.
"""
import os
from pathlib import Path
from typing import Optional, BinaryIO
import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class CloudStorageInterface(ABC):
    """Abstract interface for cloud storage."""
    
    @abstractmethod
    def upload_file(self, local_path: Path, remote_path: str) -> str:
        """Upload file and return cloud URL/path."""
        pass
    
    @abstractmethod
    def download_file(self, remote_path: str, local_path: Path) -> bool:
        """Download file to local path."""
        pass
    
    @abstractmethod
    def get_file_url(self, remote_path: str, expires_in: int = 3600) -> str:
        """Get signed URL for file access (temporary access)."""
        pass
    
    @abstractmethod
    def delete_file(self, remote_path: str) -> bool:
        """Delete file from cloud."""
        pass
    
    @abstractmethod
    def file_exists(self, remote_path: str) -> bool:
        """Check if file exists in cloud storage."""
        pass


class S3Storage(CloudStorageInterface):
    """AWS S3 storage implementation."""
    
    def __init__(self):
        try:
            import boto3
            from botocore.exceptions import ClientError
        except ImportError:
            raise ImportError("boto3 is required for S3 storage. Install with: pip install boto3")
        
        self.bucket = os.getenv("S3_BUCKET_NAME")
        if not self.bucket:
            raise ValueError("S3_BUCKET_NAME environment variable is required")
        
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION", "us-east-1")
        )
        logger.info(f"S3 storage initialized with bucket: {self.bucket}")
    
    def upload_file(self, local_path: Path, remote_path: str) -> str:
        """Upload file to S3."""
        try:
            if not local_path.exists():
                raise FileNotFoundError(f"Local file not found: {local_path}")
            
            self.s3_client.upload_file(
                str(local_path),
                self.bucket,
                remote_path,
                ExtraArgs={'ServerSideEncryption': 'AES256'}  # Enable encryption
            )
            
            cloud_url = f"s3://{self.bucket}/{remote_path}"
            logger.info(f"Uploaded {local_path.name} to {cloud_url}")
            return cloud_url
            
        except Exception as e:
            logger.error(f"S3 upload failed for {local_path}: {e}", exc_info=True)
            raise
    
    def download_file(self, remote_path: str, local_path: Path) -> bool:
        """Download file from S3."""
        import time
        import os
        
        try:
            # Extract key from s3:// URL if provided
            if remote_path.startswith("s3://"):
                parts = remote_path.replace("s3://", "").split("/", 1)
                bucket = parts[0]
                key = parts[1] if len(parts) > 1 else remote_path
            else:
                bucket = self.bucket
                key = remote_path
            
            # Ensure local directory exists
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Windows file locking fix: Delete existing file and any temp files first
            if local_path.exists():
                try:
                    # Try to delete existing file
                    os.remove(local_path)
                    logger.debug(f"Deleted existing file: {local_path}")
                    # Small delay to ensure file handles are released
                    time.sleep(0.1)
                except (PermissionError, OSError) as e:
                    logger.warning(f"Could not delete existing file {local_path}: {e}. Will try to overwrite.")
            
            # Also clean up any temp files that boto3 might have left behind
            temp_pattern = f"{local_path}.*"
            import glob
            for temp_file in glob.glob(temp_pattern):
                try:
                    if os.path.exists(temp_file) and temp_file != str(local_path):
                        os.remove(temp_file)
                        logger.debug(f"Cleaned up temp file: {temp_file}")
                except Exception as e:
                    logger.debug(f"Could not remove temp file {temp_file}: {e}")
            
            # Use get_object and write manually for better Windows compatibility
            # This avoids the rename issue that boto3's download_file has on Windows
            try:
                response = self.s3_client.get_object(Bucket=bucket, Key=key)
                with open(local_path, 'wb') as f:
                    # Download in chunks to handle large files
                    for chunk in response['Body'].iter_chunks(chunk_size=8192):
                        f.write(chunk)
                logger.info(f"Downloaded {key} to {local_path} ({local_path.stat().st_size} bytes)")
                return True
            except Exception as get_object_error:
                # Fallback to download_file if get_object fails
                logger.warning(f"get_object failed, trying download_file: {get_object_error}")
                self.s3_client.download_file(bucket, key, str(local_path))
                logger.info(f"Downloaded {key} to {local_path} (fallback method)")
                return True
            
        except Exception as e:
            logger.error(f"S3 download failed for {remote_path}: {e}", exc_info=True)
            return False
    
    def get_file_url(self, remote_path: str, expires_in: int = 3600) -> str:
        """Get presigned URL for temporary access."""
        try:
            # Extract key from s3:// URL if provided
            if remote_path.startswith("s3://"):
                parts = remote_path.replace("s3://", "").split("/", 1)
                bucket = parts[0]
                key = parts[1] if len(parts) > 1 else remote_path
            else:
                bucket = self.bucket
                key = remote_path
            
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': key},
                ExpiresIn=expires_in
            )
            return url
            
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for {remote_path}: {e}", exc_info=True)
            raise
    
    def delete_file(self, remote_path: str) -> bool:
        """Delete file from S3."""
        try:
            # Extract key from s3:// URL if provided
            if remote_path.startswith("s3://"):
                parts = remote_path.replace("s3://", "").split("/", 1)
                bucket = parts[0]
                key = parts[1] if len(parts) > 1 else remote_path
            else:
                bucket = self.bucket
                key = remote_path
            
            self.s3_client.delete_object(Bucket=bucket, Key=key)
            logger.info(f"Deleted {key} from S3")
            return True
            
        except Exception as e:
            logger.error(f"S3 delete failed for {remote_path}: {e}", exc_info=True)
            return False
    
    def file_exists(self, remote_path: str) -> bool:
        """Check if file exists in S3."""
        try:
            # Extract key from s3:// URL if provided
            if remote_path.startswith("s3://"):
                parts = remote_path.replace("s3://", "").split("/", 1)
                bucket = parts[0]
                key = parts[1] if len(parts) > 1 else remote_path
            else:
                bucket = self.bucket
                key = remote_path
            
            self.s3_client.head_object(Bucket=bucket, Key=key)
            return True
            
        except Exception as e:
            return False


class LocalStorage(CloudStorageInterface):
    """Local file storage (fallback for development)."""
    
    def __init__(self, base_path: Optional[Path] = None):
        self.base_path = base_path or Path(__file__).parent / "uploads" / "cloud"
        self.base_path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Local storage initialized at: {self.base_path}")
    
    def upload_file(self, local_path: Path, remote_path: str) -> str:
        """Copy file to local storage directory."""
        target_path = self.base_path / remote_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        import shutil
        shutil.copy2(local_path, target_path)
        
        return str(target_path)
    
    def download_file(self, remote_path: str, local_path: Path) -> bool:
        """Copy file from local storage."""
        source_path = self.base_path / remote_path
        if not source_path.exists():
            return False
        
        import shutil
        local_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, local_path)
        return True
    
    def get_file_url(self, remote_path: str, expires_in: int = 3600) -> str:
        """Return local file path as URL."""
        file_path = self.base_path / remote_path
        # In production, this should return a proper URL
        return f"/api/files/{remote_path}"
    
    def delete_file(self, remote_path: str) -> bool:
        """Delete file from local storage."""
        file_path = self.base_path / remote_path
        if file_path.exists():
            file_path.unlink()
            return True
        return False
    
    def file_exists(self, remote_path: str) -> bool:
        """Check if file exists."""
        file_path = self.base_path / remote_path
        return file_path.exists()


def get_cloud_storage() -> CloudStorageInterface:
    """
    Factory function to get cloud storage instance.
    
    Returns:
        CloudStorageInterface instance based on CLOUD_STORAGE_TYPE env var
    """
    storage_type = os.getenv("CLOUD_STORAGE_TYPE", "local").lower()
    
    if storage_type == "s3":
        try:
            return S3Storage()
        except Exception as e:
            logger.warning(f"Failed to initialize S3 storage: {e}. Falling back to local storage.")
            return LocalStorage()
    
    elif storage_type == "azure":
        # TODO: Implement Azure Blob Storage
        logger.warning("Azure Blob Storage not yet implemented. Using local storage.")
        return LocalStorage()
    
    elif storage_type == "gcs":
        # TODO: Implement Google Cloud Storage
        logger.warning("Google Cloud Storage not yet implemented. Using local storage.")
        return LocalStorage()
    
    else:
        # Default to local storage for development
        logger.info("Using local file storage (development mode)")
        return LocalStorage()


# Global instance
cloud_storage = get_cloud_storage()
