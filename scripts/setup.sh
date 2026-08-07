#!/bin/bash
# Setup script to ensure runtime dependencies are installed
set -e

# Install system packages
if ! command -v ffmpeg &> /dev/null; then
    sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg 2>/dev/null || true
fi

# Install Python packages
pip3 install --break-system-packages --quiet yt-dlp moviepy psycopg2-binary 2>/dev/null || true

# Create output directory
mkdir -p public/clips

echo "Setup complete"
