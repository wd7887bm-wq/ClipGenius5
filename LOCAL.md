# 🖥️ ClipGenius — Apne Laptop Par Chalayein (Local)

Kisi company/cloud ki zaroorat nahi. Sab kuch aapke laptop par chalega.

---

## ✅ Database ka masla — SOLVED (zero setup)

Local par **KOI database install/setup ki zaroorat nahi**. App apne aap ek local file use karta hai:

- 📄 File: `clipgenius-db.json` (project folder me, pehli job ke saath automatic banti hai)
- 🔍 Status check karein: http://localhost:3000/api/health
  → `{"ok":true,"db":"file"}` (matlab database chal raha hai)
- 🗑️ Reset karna ho to bas `clipgenius-db.json` delete kar dein.

**Agar "database error" aaye** to yaad rakhein:
- `DATABASE_URL` env variable **set mat karein** agar aapke paas Postgres nahi chal raha. (Agar set ho aur Postgres down ho, to app apne aap file-store par fall back karta hai — koi error nahi.)
- Windows par agar koi purana `.env` file hai jisme `DATABASE_URL=...` hai, usay delete karein.

**Optional — asli Postgres chahiye to:**
```bash
# PostgreSQL install + chale raho, phir:
export DATABASE_URL="postgresql://user:password@localhost:5432/clipgenius"
npm run dev
```
App apne aap table bana dega.

---

## 🚀 Quick Start

### Linux / macOS
```bash
git clone https://github.com/wd7887bm-wq/ClipGenius5.git
cd ClipGenius5
npm install
npm run setup     # ffmpeg + yt-dlp + faster-whisper install karta hai
npm run dev       # http://localhost:3000 par khul jayega
```

### Windows
1. **Node.js 22+** install karein: https://nodejs.org
2. **Python 3.10+** install karein: https://python.org (install par "Add to PATH" zaroor tick karein)
3. **ffmpeg** install karein:
   ```powershell
   winget install Gyan.FFmpeg
   ```
4. Phir:
   ```powershell
   git clone https://github.com/wd7887bm-wq/ClipGenius5.git
   cd ClipGenius5
   npm install
   pip install yt-dlp faster-whisper moviepy
   npm run dev
   ```
5. Browser me http://localhost:3000 kholen.

---

## 🎬 Real vs Demo mode

| Tools installed? | Result |
|---|---|
| ffmpeg + yt-dlp + faster-whisper ✅ | **Real clips** — YouTube se download, 1080×1920 vertical, AI captions |
| Tools nahi hain ❌ | **Demo mode** — UI chalta hai, placeholder clips bante hain (testing ke liye theek) |

Real mode confirm karne ke liye job submit karne ke baad server logs me dekhein:
```
[ClipGenius] Job xxxxxxxx | Style: oneword | DB: file | Store: .../clipgenius-db.json
[ClipGenius] Downloaded: 1920x1080 (..MB)
[ClipGenius] Clip 1: 1080x1920
```

---

## 🛠️ Common Problems

**"python3 not found"** → Python install nahi hai, ya PATH me nahi hai. `python --version` try karein.

**"ffmpeg not found"** → `npm run setup` (Linux/Mac) ya `winget install Gyan.FFmpeg` (Windows) chalayein.

**Job "downloading" par atka rehta hai** → YouTube se download slow hai ya network issue. 1-2 minute wait karein.

**Job "error" deta hai** → Server terminal/logs kholen, `[ClipGenius]` wali lines dekhein — wahan exact reason likha hota hai.

**Database reset karna ho** → `rm clipgenius-db.json` (Linux/Mac) ya delete file (Windows), app restart karein.

---

## 📁 Local par files kahan bante hain

- `clipgenius-db.json` — jobs ka data
- `public/clips/<job-id>/` — generated video clips (1 ghante baad auto-delete)

---

Koi aur masla ho to server terminal ka error copy karke bhejein — debug kar denge.
