"""
Optional startup script to download model if not present.
Can be called from main.py on startup.
"""
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def ensure_model_available():
    """Ensure Vosk model is available, download if needed."""
    from scoring_engine import VOSK_MODEL_AVAILABLE, VOSK_MODEL_PATH
    
    if VOSK_MODEL_AVAILABLE:
        logger.info("Vosk model already available")
        return True
    
    # Check if auto-download is enabled
    auto_download = os.getenv("AUTO_DOWNLOAD_MODEL", "false").lower() == "true"
    
    if not auto_download:
        logger.info("Auto-download disabled. Model will not be available.")
        logger.info("To enable: set AUTO_DOWNLOAD_MODEL=true environment variable")
        return False
    
    try:
        logger.info("Model not found, downloading...")
        from download_model import setup_model
        
        model_key = os.getenv("VOSK_MODEL_TYPE", "ar-mgb2")  # Default to smaller model
        success = setup_model(model_key=model_key, model_dir=Path(VOSK_MODEL_PATH))
        
        if success:
            logger.info("Model downloaded successfully")
            return True
        else:
            logger.warning("Model download failed")
            return False
            
    except Exception as e:
        logger.error(f"Error downloading model: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    ensure_model_available()

