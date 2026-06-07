#!/bin/bash
# Build script for Render deployment
# This script downloads the Vosk model during build

set -e

echo "Starting build process..."

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Download Vosk Arabic model if not present
echo "Checking for Vosk model..."
if [ ! -f "models/am/final.mdl" ]; then
    echo "Model not found. Downloading Arabic Vosk model..."
    python download_model.py --model ar-mgb2 --dir models
else
    echo "Model already exists, skipping download."
fi

echo "Build complete!"

