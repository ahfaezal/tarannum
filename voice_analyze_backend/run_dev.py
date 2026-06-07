#!/usr/bin/env python3
"""
Development server with auto-reload.
Run this script to start the backend with automatic restart on code changes.
"""
import uvicorn
import os
from pathlib import Path

if __name__ == "__main__":
    # Get the directory of this script
    script_dir = Path(__file__).parent
    
    # Change to the script directory
    os.chdir(script_dir)
    
    # Run with auto-reload enabled
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Enable auto-reload on code changes
        reload_dirs=[str(script_dir)],  # Watch this directory for changes
        reload_includes=["*.py"],  # Only watch Python files
        log_level="info"
    )
