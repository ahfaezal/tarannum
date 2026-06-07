"""
Script to download Vosk Arabic model for deployment.
Can be run during build or startup.
"""
import os
import sys
import zipfile
import urllib.request
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Model URLs - Arabic Vosk models
MODEL_URLS = {
    "ar-mgb2": {
        "url": "https://alphacephei.com/vosk/models/vosk-model-ar-mgb2-0.4.zip",
        "size": "318M",
        "name": "vosk-model-ar-mgb2-0.4"
    },
    "ar-linto": {
        "url": "https://alphacephei.com/vosk/models/vosk-model-ar-0.22-linto-1.1.0.zip",
        "size": "1.3G",
        "name": "vosk-model-ar-0.22-linto-1.1.0"
    }
}

def download_file(url: str, dest_path: Path, chunk_size: int = 8192):
    """Download file with progress indication."""
    try:
        logger.info(f"Downloading from: {url}")
        logger.info(f"Destination: {dest_path}")
        
        # Create parent directory if needed
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Download with progress
        def show_progress(block_num, block_size, total_size):
            if total_size > 0:
                percent = min(100, (block_num * block_size * 100) // total_size)
                sys.stdout.write(f"\rProgress: {percent}% ({block_num * block_size // 1024 // 1024}MB)")
                sys.stdout.flush()
        
        urllib.request.urlretrieve(url, dest_path, reporthook=show_progress)
        sys.stdout.write("\n")
        logger.info(f"Download complete: {dest_path}")
        return True
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return False

def extract_zip(zip_path: Path, extract_to: Path):
    """Extract zip file."""
    try:
        logger.info(f"Extracting {zip_path} to {extract_to}")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        logger.info("Extraction complete")
        return True
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return False

def setup_model(model_key: str = "ar-mgb2", model_dir: Path = None):
    """
    Download and setup Vosk Arabic model.
    
    Args:
        model_key: Which model to download ("ar-mgb2" or "ar-linto")
        model_dir: Directory to install model (default: backend/models)
    """
    if model_dir is None:
        model_dir = Path(__file__).parent / "models"
    
    model_dir = Path(model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)
    
    # Check if model already exists
    if (model_dir / "am" / "final.mdl").exists():
        logger.info(f"Model already exists at {model_dir}")
        return True
    
    # Get model info
    if model_key not in MODEL_URLS:
        logger.error(f"Unknown model key: {model_key}. Available: {list(MODEL_URLS.keys())}")
        return False
    
    model_info = MODEL_URLS[model_key]
    model_url = model_info["url"]
    model_name = model_info["name"]
    
    logger.info(f"Setting up model: {model_name} ({model_info['size']})")
    
    # Download to temp location
    temp_dir = model_dir / "temp"
    temp_dir.mkdir(exist_ok=True)
    zip_path = temp_dir / f"{model_name}.zip"
    
    # Download
    if not download_file(model_url, zip_path):
        return False
    
    # Extract
    extract_dir = temp_dir / "extract"
    extract_dir.mkdir(exist_ok=True)
    
    if not extract_zip(zip_path, extract_dir):
        return False
    
    # Move model files to models directory
    extracted_model_dir = extract_dir / model_name
    if not extracted_model_dir.exists():
        # Sometimes zip extracts to current directory
        extracted_model_dir = extract_dir
    
    # Copy/move model files
    import shutil
    try:
        # Move all model files to target directory
        for item in extracted_model_dir.iterdir():
            dest = model_dir / item.name
            if dest.exists():
                if dest.is_dir():
                    shutil.rmtree(dest)
                else:
                    dest.unlink()
            shutil.move(str(item), str(dest))
        
        logger.info(f"Model installed successfully at {model_dir}")
        
        # Cleanup
        shutil.rmtree(temp_dir)
        
        return True
    except Exception as e:
        logger.error(f"Failed to move model files: {e}")
        return False

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Download Vosk Arabic model")
    parser.add_argument(
        "--model",
        choices=list(MODEL_URLS.keys()),
        default="ar-mgb2",
        help="Model to download (default: ar-mgb2)"
    )
    parser.add_argument(
        "--dir",
        type=str,
        default=None,
        help="Directory to install model (default: backend/models)"
    )
    
    args = parser.parse_args()
    
    model_dir = Path(args.dir) if args.dir else None
    success = setup_model(args.model, model_dir)
    
    sys.exit(0 if success else 1)

