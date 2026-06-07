"""
Reference Audio Library Service
Manages storage and retrieval of reference audio files for reuse.
"""
import json
import uuid
import hashlib
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import librosa
import logging

logger = logging.getLogger(__name__)

# Storage directories
REFERENCES_DIR = Path(__file__).parent / "uploads" / "references"
REFERENCES_DIR.mkdir(parents=True, exist_ok=True)

METADATA_FILE = Path(__file__).parent / "uploads" / "references.json"

# Pitch cache directory
PITCH_CACHE_DIR = Path(__file__).parent / "uploads" / "pitch_cache"
PITCH_CACHE_DIR.mkdir(parents=True, exist_ok=True)


class ReferenceLibrary:
    """Manages reference audio library storage and retrieval."""
    
    def __init__(self):
        self.metadata_file = METADATA_FILE
        self.storage_dir = REFERENCES_DIR
        self._load_metadata()
    
    def _load_metadata(self) -> Dict[str, Dict]:
        """Load metadata from JSON file."""
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Error loading reference metadata: {e}")
                return {}
        return {}
    
    def _save_metadata(self, metadata: Dict[str, Dict]):
        """Save metadata to JSON file."""
        try:
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Error saving reference metadata: {e}")
            raise
    
    def save_reference(
        self,
        audio_file_path: Path,
        title: str,
        maqam: Optional[str] = None,
        filename: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Save a reference audio file to the library.
        Uses filename + file_size + duration to generate deterministic ID for duplicate detection.
        
        Args:
            audio_file_path: Path to the audio file to save
            title: Title/name for the reference
            maqam: Optional maqam/mode identifier
            filename: Optional original filename
        
        Returns:
            Dict with reference metadata including id, file_path, etc.
        """
        try:
            # Ensure storage directory exists (safety check)
            self.storage_dir.mkdir(parents=True, exist_ok=True)
            
            # Get file size first (before copying)
            file_size = audio_file_path.stat().st_size
            filename_for_id = filename or audio_file_path.name
            
            # Get audio duration (we need this to generate ID)
            try:
                duration = librosa.get_duration(path=str(audio_file_path))
            except Exception as e:
                logger.warning(f"Could not get audio duration for ID generation: {e}")
                duration = 0.0
            
            # Generate deterministic ID from filename + size + duration
            # Round duration to 2 decimal places to handle slight variations
            duration_rounded = round(duration, 2)
            id_string = f"{filename_for_id}_{file_size}_{duration_rounded}"
            ref_id = hashlib.md5(id_string.encode('utf-8')).hexdigest()
            
            logger.info(f"Generated ID for {filename_for_id}: {ref_id} (size: {file_size}, duration: {duration_rounded})")
            
            # Check if this ID already exists (duplicate file)
            all_metadata = self._load_metadata()
            if ref_id in all_metadata:
                existing_ref = all_metadata[ref_id]
                logger.info(f"File {filename_for_id} (size: {file_size}, duration: {duration_rounded}) already exists with ID: {ref_id}")
                logger.info(f"Returning existing reference: {existing_ref.get('title', 'N/A')}")
                return existing_ref
            
            # File doesn't exist, proceed with save
            # Determine file extension
            ext = audio_file_path.suffix or ".mp3"
            
            # Create storage path
            storage_path = self.storage_dir / f"{ref_id}{ext}"
            
            # Copy file to storage
            import shutil
            shutil.copy2(audio_file_path, storage_path)
            
            logger.info(f"File copied to storage: {storage_path}")
            
            # Verify duration matches (should be same as we calculated earlier)
            # This is just a verification step
            try:
                verified_duration = librosa.get_duration(path=str(storage_path))
                if abs(verified_duration - duration) > 0.01:  # Allow 0.01s difference
                    logger.warning(f"Duration mismatch: calculated {duration}, verified {verified_duration}")
                    duration = verified_duration
            except Exception as e:
                logger.warning(f"Could not verify audio duration: {e}")
            
            # Create metadata
            metadata_entry = {
                "id": ref_id,
                "title": title,
                "maqam": maqam or "",
                "filename": filename or audio_file_path.name,
                "file_path": str(storage_path.relative_to(Path(__file__).parent)),
                "duration": float(duration),
                "upload_date": datetime.now().isoformat(),
                "file_size": file_size,
                "is_preset": False,  # Regular reference, not admin preset
                "text_segments": []  # Empty text segments for regular references
            }
            
            # Add new entry
            all_metadata[ref_id] = metadata_entry
            
            # Save metadata
            self._save_metadata(all_metadata)
            
            logger.info(f"Saved reference audio: {ref_id} - {title}")
            
            return metadata_entry
            
        except Exception as e:
            logger.error(f"Error saving reference audio: {e}", exc_info=True)
            raise
    
    def get_reference(self, ref_id: str) -> Optional[Dict[str, any]]:
        """Get reference metadata by ID."""
        metadata = self._load_metadata()
        return metadata.get(ref_id)
    
    def get_reference_file_path(self, ref_id: str) -> Optional[Path]:
        """Get the file path for a reference by ID."""
        # Load full metadata so we can clean up stale entries
        metadata = self._load_metadata()
        ref_data = metadata.get(ref_id)
        if not ref_data:
            return None

        file_path = Path(__file__).parent / ref_data.get("file_path", "")

        # If the file still exists, return it normally
        if file_path.exists():
            return file_path

        # If the underlying audio file is missing, clean up the stale metadata entry.
        # This can happen if the uploads folder was cleared manually.
        logger.warning(
            f"Reference file for ID {ref_id} not found at {file_path}. "
            "Removing stale metadata entry."
        )
        try:
            metadata.pop(ref_id, None)
            self._save_metadata(metadata)
        except Exception as e:
            logger.error(f"Failed to remove stale reference metadata for {ref_id}: {e}", exc_info=True)

        return None
    
    def list_references(self) -> List[Dict[str, any]]:
        """List all saved references."""
        metadata = self._load_metadata()
        # Return as list sorted by upload date (newest first)
        references = list(metadata.values())
        references.sort(key=lambda x: x.get("upload_date", ""), reverse=True)
        return references
    
    def delete_reference(self, ref_id: str) -> bool:
        """Delete a reference from the library."""
        try:
            metadata = self._load_metadata()
            
            if ref_id not in metadata:
                return False
            
            # Get file path
            ref_data = metadata[ref_id]
            file_path = Path(__file__).parent / ref_data["file_path"]
            
            # Delete file
            if file_path.exists():
                file_path.unlink()
            
            # Remove from metadata
            del metadata[ref_id]
            self._save_metadata(metadata)
            
            logger.info(f"Deleted reference audio: {ref_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting reference: {e}", exc_info=True)
            return False
    
    def save_preset(
        self,
        reference_id: str,
        title: str,
        text_segments: List[Dict[str, any]],
        maqam: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Save or update a training preset with text segments.
        
        Args:
            reference_id: ID of existing reference audio
            title: Preset title
            text_segments: List of {text, start, end} segments
            maqam: Optional maqam/mode identifier
        
        Returns:
            Dict with preset metadata
        """
        try:
            metadata = self._load_metadata()
            
            # Check if reference exists
            if reference_id not in metadata:
                raise ValueError(f"Reference {reference_id} not found")
            
            ref_data = metadata[reference_id]
            
            # Update reference to be a preset
            ref_data["is_preset"] = True
            ref_data["title"] = title
            ref_data["text_segments"] = text_segments
            if maqam:
                ref_data["maqam"] = maqam
            ref_data["preset_updated"] = datetime.now().isoformat()
            
            # Save metadata
            metadata[reference_id] = ref_data
            self._save_metadata(metadata)
            
            logger.info(f"Saved preset: {reference_id} - {title} ({len(text_segments)} segments)")
            
            return ref_data
            
        except Exception as e:
            logger.error(f"Error saving preset: {e}", exc_info=True)
            raise
    
    def list_presets(self) -> List[Dict[str, any]]:
        """List all admin-created presets."""
        metadata = self._load_metadata()
        presets = [
            ref for ref in metadata.values()
            if ref.get("is_preset", False)
        ]
        presets.sort(key=lambda x: x.get("preset_updated", x.get("upload_date", "")), reverse=True)
        return presets
    
    def update_preset_text_segments(
        self,
        preset_id: str,
        text_segments: List[Dict[str, any]]
    ) -> Optional[Dict[str, any]]:
        """
        Update text segments for an existing preset.
        
        Args:
            preset_id: ID of preset to update
            text_segments: New list of {text, start, end} segments
        
        Returns:
            Updated preset metadata or None if not found
        """
        try:
            metadata = self._load_metadata()
            
            if preset_id not in metadata:
                return None
            
            preset_data = metadata[preset_id]
            
            if not preset_data.get("is_preset", False):
                raise ValueError(f"Reference {preset_id} is not a preset")
            
            preset_data["text_segments"] = text_segments
            preset_data["preset_updated"] = datetime.now().isoformat()
            
            metadata[preset_id] = preset_data
            self._save_metadata(metadata)
            
            logger.info(f"Updated preset text segments: {preset_id} ({len(text_segments)} segments)")
            
            return preset_data
            
        except Exception as e:
            logger.error(f"Error updating preset: {e}", exc_info=True)
            raise
    
    def cache_pitch_data(self, ref_id: str, pitch_data: List[Dict]) -> bool:
        """
        Cache extracted pitch data to a JSON file.
        
        Args:
            ref_id: Reference ID
            pitch_data: List of pitch data points [{time, f_hz, midi, confidence}, ...]
        
        Returns:
            True if cached successfully, False otherwise
        """
        try:
            cache_file = PITCH_CACHE_DIR / f"{ref_id}_pitch.json"
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(pitch_data, f, indent=2, ensure_ascii=False)
            logger.info(f"Cached pitch data for {ref_id} to {cache_file} ({len(pitch_data)} points)")
            return True
        except Exception as e:
            logger.error(f"Error caching pitch data for {ref_id}: {e}", exc_info=True)
            return False
    
    def get_cached_pitch_data(self, ref_id: str) -> Optional[List[Dict]]:
        """
        Retrieve cached pitch data for a reference ID.
        
        Args:
            ref_id: Reference ID
        
        Returns:
            List of pitch data points or None if not found
        """
        cache_file = PITCH_CACHE_DIR / f"{ref_id}_pitch.json"
        if cache_file.exists():
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    pitch_data = json.load(f)
                logger.info(f"Loaded cached pitch data for {ref_id} from {cache_file} ({len(pitch_data)} points)")
                return pitch_data
            except Exception as e:
                logger.warning(f"Error loading cached pitch data for {ref_id}: {e}", exc_info=True)
                # Delete corrupted cache file
                try:
                    cache_file.unlink()
                except:
                    pass
        return None


# Global instance
reference_library = ReferenceLibrary()

