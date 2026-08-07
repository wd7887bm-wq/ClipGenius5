# 🎬 ClipGenius - YouTube to Viral Shorts

Convert long YouTube videos into **9:16 vertical clips** with AI-powered captions.  
Perfect for TikTok, Instagram Reels & YouTube Shorts.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/wd7887bm-wq/ClipGenius5)

---

## ✨ Features

- 🎯 **Paste any YouTube URL** and get 3 viral-ready clips
- 📱 **9:16 Vertical** format (1080x1920)
- 🎨 **Two Caption Styles**: Green "One Word" or White "Mono Line"
- 🤖 **AI Transcription**: Real captions from video audio
- ⚡ **Real-time Progress**: Watch processing live
- 💾 **Download Clips**: Save before they expire in 1 hour

---

## 🚀 Deploy on Railway (FREE)

### One-Click Deploy:
👉 **[Click here to deploy on Railway](https://railway.app/new/template?template=https://github.com/wd7887bm-wq/ClipGenius5)**

### Manual Steps:
1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"** then **"Deploy from GitHub repo"**
3. Select `wd7887bm-wq/ClipGenius5`
4. Click **Deploy** and you're done!

> 🆓 **Free tier**: Works fully in demo mode (UI + simulated processing)  
> 💎 **Pro plan ($5/mo)**: Full FFmpeg + Python video processing

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
