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

> 🆓 **Free tier**: Works fully in demo mode (UI + simulated processing)  
> 💎 **Pro plan**: Full FFmpeg + Python video processing with paid plans

---

## 🖥️ Run on Your Laptop

```bash
git clone https://github.com/wd7887bm-wq/ClipGenius5.git
cd ClipGenius5
npm install
npm run dev
# Open http://localhost:3000
```

For **real video processing**, also install:
```bash
# Ubuntu/Debian
sudo apt install ffmpeg
pip3 install yt-dlp faster-whisper

# macOS  
brew install ffmpeg
pip3 install yt-dlp faster-whisper
```

---

## 🗄️ Database

- **Auto mode**: Uses local JSON file (no setup needed)
- **PostgreSQL**: Set `DATABASE_URL` env variable for production

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Processing**: Python (yt-dlp, faster-whisper, FFmpeg)
- **Database**: PostgreSQL (optional) / JSON fallback

---

Made with ❤️ | [Deploy on Railway](https://railway.app/new/template?template=https://github.com/wd7887bm-wq/ClipGenius5)
