# 🎬 ClipGenius - YouTube to Viral Shorts

Convert long YouTube videos into **9:16 vertical clips** with AI-powered captions.  
Perfect for TikTok, Instagram Reels & YouTube Shorts.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/wd7887bm-wq/ClipGenius5)

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/wd7887bm-wq/ClipGenius5/tree/main)

---

## ✨ Features

- 🎯 **Paste any YouTube URL** and get 3 viral-ready clips
- 📱 **9:16 Vertical** format (1080x1920)
- 🎨 **Two Caption Styles**: Green "One Word" or White "Mono Line"
- 🤖 **AI Transcription**: Real captions from video audio
- ⚡ **Real-time Progress**: Watch processing live
- 💾 **Download Clips**: Save before they expire in 1 hour

---

## 🚀 Free Deploy - One Click

### Render.com ⭐ Recommended
👉 **[Deploy to Render](https://render.com/deploy?repo=https://github.com/wd7887bm-wq/ClipGenius5)**
- Free tier, no credit card required
- Auto-builds from GitHub
- `clipgenius.onrender.com` URL

### DigitalOcean App Platform
👉 **[Deploy to DigitalOcean](https://cloud.digitalocean.com/apps/new?repo=https://github.com/wd7887bm-wq/ClipGenius5/tree/main)**
- $5/month (or free trial credits)
- Vertical scaling available
- Best for production workloads

### Manual Deploy Steps:
1. Sign in to **[render.com](https://render.com)** or **[cloud.digitalocean.com](https://cloud.digitalocean.com)** with GitHub
2. Click **"New Web Service"** / **"Create App"**
3. Select repository `wd7887bm-wq/ClipGenius5`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Click **Deploy** 🎉

> 🆓 **Free tier**: Real FFmpeg + yt-dlp + faster-whisper processing via `scripts/setup.sh` (auto-runs on start). The UI also has a graceful demo fallback if the tools can't be installed.

---

## 🖥️ Run on Your Laptop

```bash
git clone https://github.com/wd7887bm-wq/ClipGenius5.git
cd ClipGenius5
npm install
npm run dev
# Open http://localhost:3000
```

For **real video processing**, the toolchain installs itself — just run:
```bash
bash scripts/setup.sh
```
This installs (PyPI-first, no apt/sudo required for ffmpeg):
- `ffmpeg` (static binary bundled in the `imageio-ffmpeg` wheel)
- `yt-dlp` (YouTube downloader)
- `faster-whisper` (AI transcription for captions)
- `moviepy`, `psycopg2-binary`

Render / DigitalOcean deploys run `scripts/setup.sh` automatically on start (see `render.yaml` / `.do/app.yaml`).

---

## 🗄️ Database

The database layer is resilient and **never hard-fails**:

- **PostgreSQL (recommended for production):** `render.yaml` / `.do/app.yaml` auto-provision a free Postgres and wire `DATABASE_URL` for you. Just set `DATABASE_URL` manually for any other host.
- **File-store fallback (zero setup):** If `DATABASE_URL` is missing or Postgres can't be reached, the app automatically falls back to a memory-backed JSON store with atomic disk writes — so the UI and jobs keep working instead of showing "Database error".

Which backend is in use is resolved once per process; `/api/health` reports it as `"db": "postgresql"` or `"file"`.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Processing**: Python (yt-dlp, faster-whisper, FFmpeg)
- **Database**: PostgreSQL (auto-provisioned on Render/DO) / resilient JSON fallback

---

Made with ❤️ | [Deploy on Railway](https://railway.app/new/template?template=https://github.com/wd7887bm-wq/ClipGenius5)
