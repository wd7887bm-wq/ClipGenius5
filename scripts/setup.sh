#!/bin/bash
# Installs the REAL video-processing toolchain.
#
# Strategy: PyPI-first so this works on Render free tier, DigitalOcean App
# Platform, and any VPS WITHOUT needing apt or sudo for the ffmpeg binary:
#   - ffmpeg binary      -> bundled inside the `imageio-ffmpeg` wheel
#   - yt-dlp             -> YouTube downloader
#   - faster-whisper     -> AI transcription (captioning)
#   - moviepy, psycopg2  -> helpers / Postgres driver
# Probing is done with ffmpeg itself, so ffprobe is not required.
set -u

PIP_INSTALL="pip3 install --break-system-packages --quiet --upgrade"
if ! command -v pip3 >/dev/null 2>&1; then
  echo "[setup] pip3 not found; skipping Python deps" >&2
else
  $PIP_INSTALL yt-dlp imageio-ffmpeg faster-whisper moviepy psycopg2-binary || \
    echo "[setup] some pip packages failed to install (continuing)" >&2
fi

# Expose the ffmpeg binary from the imageio-ffmpeg wheel on PATH.
# Falls back to apt if a system ffmpeg is preferred/available.
if ! command -v ffmpeg >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    (sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg) 2>/dev/null || true
  fi
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  BIN=$(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" 2>/dev/null || true)
  if [ -n "${BIN:-}" ] && [ -x "$BIN" ]; then
    # Prefer /usr/local/bin; fall back to a user-local bin dir.
    if [ -w /usr/local/bin ] || sudo ln -sf "$BIN" /usr/local/bin/ffmpeg 2>/dev/null; then
      ln -sf "$BIN" /usr/local/bin/ffmpeg 2>/dev/null || true
    fi
    mkdir -p "$HOME/.local/bin"
    ln -sf "$BIN" "$HOME/.local/bin/ffmpeg"
    echo "[setup] ffmpeg -> $BIN (symlinked to PATH)"
  fi
fi

mkdir -p public/clips

echo "[setup] done: ffmpeg=$(command -v ffmpeg || echo MISSING) yt-dlp=$(command -v yt-dlp || echo MISSING) python=$(command -v python3 || echo MISSING)"
