#!/usr/bin/env python3
"""
ClipGenius - Real video processing (yt-dlp + ffmpeg + faster-whisper)

Downloads a YouTube video, crops it into 1080x1920 vertical clips, transcribes
the audio with faster-whisper, and burns captions with ffmpeg drawtext.

Database: writes job progress back to the SAME store the Node API uses:
  - DB_MODE=postgres  -> PostgreSQL via DATABASE_URL (psycopg2)
  - DB_MODE=file (or unset) -> the shared JSON file at DB_FILE_PATH
    (defaults to ./clipgenius-db.json). This keeps Node and Python in sync.

Probing uses ffmpeg itself (no ffprobe dependency). The AI model load is
non-fatal: if faster-whisper / the model cannot be reached, captioning is
skipped and the clips are still produced without text.
"""

import sys, os, json, subprocess, re, traceback, signal, time, tempfile

os.environ["PATH"] = "/usr/local/bin:/usr/bin:" + os.environ.get("PATH", "")

DB_MODE = os.environ.get("DB_MODE", "file").strip().lower()
DATABASE_URL = os.environ.get("DATABASE_URL", "")
_JSON_PATH = os.environ.get("DB_FILE_PATH") or os.path.join(os.getcwd(), "clipgenius-db.json")

_model = None
_model_tried = False

def log(msg):
    print(f"[ClipGenius] {msg}", flush=True)

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
def _update_json_store(jid, kw):
    """Update a job record in the shared JSON store (read-modify-write)."""
    data = {"jobs": []}
    try:
        if os.path.exists(_JSON_PATH):
            with open(_JSON_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
                if isinstance(raw, dict) and isinstance(raw.get("jobs"), list):
                    data = raw
    except Exception as e:
        log(f"JSON read: {e}")

    found = False
    for j in data["jobs"]:
        if j.get("id") == jid:
            for k, val in kw.items():
                key = _snake(k)
                if key == "clips":
                    # Store as a JSON string; Node's reader parses it back to an array.
                    j["clips"] = json.dumps(val)
                else:
                    j[key] = val
            j["updated_at"] = _now_iso()
            found = True
            break

    if not found:
        log(f"JSON store: job {jid[:8]} not found on disk; update skipped")

    # Atomic write (temp + rename) so a crash can't corrupt the store
    try:
        d = os.path.dirname(os.path.abspath(_JSON_PATH)) or "."
        os.makedirs(d, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, _JSON_PATH)
    except Exception as e:
        log(f"JSON write: {e}")


def _update_postgres(jid, kw):
    import psycopg2
    conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
    try:
        cur = conn.cursor()
        s, v = [], []
        for k, val in kw.items():
            key = _snake(k)
            if key == "clips":
                s.append(f"{key}=%s::jsonb")
                v.append(json.dumps(val))
            else:
                s.append(f"{key}=%s")
                v.append(val)
        s.append("updated_at=NOW()")
        v.append(jid)
        cur.execute(f"UPDATE jobs SET {','.join(s)} WHERE id = %s", v)
        conn.commit()
        cur.close()
    finally:
        conn.close()


def update_job(jid, **kw):
    try:
        if DB_MODE == "postgres" and DATABASE_URL:
            _update_postgres(jid, kw)
        else:
            _update_json_store(jid, kw)
    except Exception as e:
        log(f"DB update error: {e}")


def _snake(name):
    """videoTitle -> video_title, progressMessage -> progress_message"""
    return re.sub(r'([A-Z])', r'_\1', name).lower()


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

# --------------------------------------------------------------------------
# Media probing (ffmpeg only, no ffprobe)
# --------------------------------------------------------------------------
def _probe(path):
    """Return (width, height, duration) by parsing `ffmpeg -i` stderr."""
    w = h = 0
    dur = 0.0
    try:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path],
                           capture_output=True, text=True, timeout=15)
        out = r.stderr or ""
        vm = re.search(r'Stream #\d+:\d+.*?Video:.*?(\d{2,5})x(\d{2,5})', out)
        if vm:
            w, h = int(vm.group(1)), int(vm.group(2))
        dm = re.search(r'Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)', out)
        if dm:
            dur = int(dm.group(1)) * 3600 + int(dm.group(2)) * 60 + float(dm.group(3))
    except Exception:
        pass
    return w, h, dur

def get_resolution(path):
    w, h, _ = _probe(path)
    return w, h

def get_duration(path):
    _, _, d = _probe(path)
    return d if d > 0 else 60.0

# --------------------------------------------------------------------------
# Download
# --------------------------------------------------------------------------
def extract_video_id(url):
    m = re.search(r'(?:youtu\.be/|youtube\.com/watch\?v=|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else None

def download_1080p(url, outdir, jid):
    """Download at TRUE 1080p using separate video+audio streams."""
    out = os.path.join(outdir, "source.mp4")
    yt_url = url

    update_job(jid, status="downloading", progress=5,
               progressMessage="Downloading in 1080p...")

    format_strings = [
        "137+140/137+139",
        "bestvideo[height>=1080][ext=mp4]+bestaudio[ext=m4a]",
        "bestvideo[height>=1080]+bestaudio",
        "bestvideo[height>=720]+bestaudio",
        "bestvideo+bestaudio",
    ]

    for fmt in format_strings:
        if os.path.exists(out):
            os.remove(out)

        log(f"Trying format: {fmt}")
        r = subprocess.run(
            ["yt-dlp",
             "-f", fmt,
             "--merge-output-format", "mp4",
             "-o", out,
             "--no-playlist",
             "--no-warnings",
             "--retries", "3",
             yt_url],
            capture_output=True, text=True, timeout=300)

        if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 500000:
            w, h = get_resolution(out)
            size_mb = os.path.getsize(out) // (1024 * 1024)
            log(f"Downloaded: {w}x{h} ({size_mb}MB)")

            try:
                tr = subprocess.run(
                    ["yt-dlp", "--get-title", "--no-warnings", yt_url],
                    capture_output=True, text=True, timeout=15)
                title = tr.stdout.strip()[:80] if tr.returncode == 0 else "Video"
            except Exception:
                title = "Video"

            return out, title, w, h

        err = r.stderr.lower() if r.stderr else ""
        if "confirm" in err or "bot" in err or "sign in" in err:
            log("YouTube bot check triggered, retrying...")
            time.sleep(2)
            continue

    raise Exception("Could not download video. Please try again or try a different video.")

# --------------------------------------------------------------------------
# Clip selection + cropping
# --------------------------------------------------------------------------
def find_clips(dur, n=3, cl=30):
    if dur < cl * n:
        cl = max(12, int(dur / (n + 1)))
    start = dur * 0.10
    end = dur * 0.90
    usable = end - start
    if usable < cl * n:
        start, usable = 0, dur
    spacing = usable / (n + 1)
    result = []
    for i in range(n):
        s = start + spacing * (i + 1)
        e = min(s + cl, dur)
        result.append((s, e))
    return result

def crop_1080(inp, out, t0, t1, w, h):
    """Crop source to 1080x1920 vertical."""
    ratio = 9.0 / 16.0
    if w / h > ratio:
        nw, nh = int(h * ratio), h
        xo, yo = (w - nw) // 2, 0
    else:
        nw, nh = w, int(w / ratio)
        xo, yo = 0, (h - nh) // 2
    nw -= nw % 2
    nh -= nh % 2

    subprocess.run(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-ss", str(t0), "-t", str(t1 - t0),
         "-i", inp,
         "-vf", f"crop={nw}:{nh}:{xo}:{yo},scale=1080:1920:flags=lanczos",
         "-c:v", "libx264", "-preset", "fast", "-crf", "20",
         "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k",
         "-movflags", "+faststart",
         out],
        capture_output=True, timeout=120, check=True)

# --------------------------------------------------------------------------
# AI transcription (non-fatal)
# --------------------------------------------------------------------------
def get_model():
    global _model, _model_tried
    if _model_tried:
        return _model
    _model_tried = True
    try:
        from faster_whisper import WhisperModel
        log("Loading AI model...")
        _model = WhisperModel("tiny", device="cpu", compute_type="int8")
        log("AI ready")
    except Exception as e:
        log(f"AI model unavailable (captions will be skipped): {e}")
        _model = None
    return _model

def transcribe(video_path, max_sec=45):
    model = get_model()
    if model is None:
        return []

    audio = video_path + ".wav"

    def cleanup():
        try:
            os.remove(audio)
        except Exception:
            pass

    def handler(s, f):
        raise TimeoutError()

    old = signal.signal(signal.SIGALRM, handler)
    signal.alarm(max_sec)

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", video_path,
             "-vn", "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
             audio],
            capture_output=True, timeout=30, check=True)

        segs, info = model.transcribe(audio, word_timestamps=True)

        words = []
        for seg in segs:
            if seg.words:
                for w in seg.words:
                    t = w.word.strip()
                    if t:
                        words.append({"w": t, "s": round(w.start, 3), "e": round(w.end, 3)})

        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)
        cleanup()
        log(f"Transcribed {len(words)} words")
        return words
    except Exception as e:
        try:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old)
        except Exception:
            pass
        cleanup()
        log(f"Transcribe skipped: {e}")
        return []

# --------------------------------------------------------------------------
# Captioning
# --------------------------------------------------------------------------
def esc(text):
    for c in ["\\", "'", '"', ":", ";", "[", "]", "%", ","]:
        text = text.replace(c, "")
    return text.strip()

def caption(inp, out, words, style, max_sec=55):
    if not words or len(words) < 2:
        subprocess.run(["cp", inp, out], check=True)
        return

    filters = []

    if style == "oneword":
        for w in words[:40]:
            txt = esc(w["w"].upper())
            if not txt or len(txt) > 18:
                continue
            en = f"between(t\\,{w['s']:.2f}\\,{w['e']:.2f})"
            filters.append(
                f"drawtext=text='{txt}'"
                f":fontsize=95:fontcolor=0x22C55E:"
                f"borderw=4:bordercolor=black:"
                f"shadowcolor=0x22C55E@0.5:"
                f"shadowx=0:shadowy=3:"
                f"x=(w-text_w)/2:y=h*0.72:"
                f"enable='{en}'"
            )
    else:
        phrases = []
        i = 0
        while i < len(words) and len(phrases) < 20:
            pw, ps = [], words[i]["s"]
            while i < len(words) and len(pw) < 5:
                pw.append(words[i]["w"])
                pe = words[i]["e"]
                i += 1
                if i < len(words) and words[i]["s"] - pe > 0.5:
                    break
            if pw:
                phrases.append({"t": " ".join(pw), "s": ps, "e": pe})

        for p in phrases:
            txt = esc(p["t"])
            if not txt or len(txt) > 50:
                continue
            en = f"between(t\\,{p['s']:.2f}\\,{p['e']:.2f})"
            filters.append(
                f"drawbox=x=0:y=h*0.84:w=w:h=h*0.08:"
                f"color=black@0.7:t=fill:"
                f"enable='{en}'"
            )
            filters.append(
                f"drawtext=text='{txt}'"
                f":fontsize=42:fontcolor=white:"
                f"borderw=2:bordercolor=black:"
                f"shadowcolor=white@0.3:"
                f"shadowx=0:shadowy=2:"
                f"x=(w-text_w)/2:y=h*0.865:"
                f"enable='{en}'"
            )

    if not filters:
        subprocess.run(["cp", inp, out], check=True)
        return

    vf = ",".join(filters)

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", inp,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart", out,
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        _, err = proc.communicate(timeout=max_sec)
        if proc.returncode != 0:
            log(f"Caption drawtext failed, falling back: {err.decode(errors='ignore')[:200]}")
            subprocess.run(["cp", inp, out], check=True)
        else:
            log("Captions done")
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        subprocess.run(["cp", inp, out], check=True)
    except Exception:
        try:
            proc.kill()
            proc.wait()
        except Exception:
            pass
        subprocess.run(["cp", inp, out], check=True)

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    if len(sys.argv) < 4:
        sys.exit(1)

    jid, url, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    style = sys.argv[4] if len(sys.argv) > 4 else "oneword"

    log(f"Job {jid[:8]} | Style: {style} | DB: {DB_MODE} | Store: {_JSON_PATH}")
    os.makedirs(outdir, exist_ok=True)

    try:
        video_id = extract_video_id(url)
        if not video_id:
            raise Exception("Invalid YouTube URL")

        # Step 1: Download TRUE 1080p
        src, title, sw, sh = download_1080p(url, outdir, jid)
        update_job(jid, videoTitle=title, progress=25,
                   progressMessage=f"Downloaded {sw}x{sh}!")

        dur = get_duration(src)
        log(f"Duration: {dur:.0f}s")

        # Step 2: Find clips
        update_job(jid, status="processing", progress=30,
                   progressMessage="Creating 1080x1920 clips...")
        clip_times = find_clips(dur)
        all_clips = []

        # Step 3: Crop to 1080x1920
        for idx, (t0, t1) in enumerate(clip_times):
            fn = f"clip_{idx + 1}.mp4"
            p = os.path.join(outdir, fn)
            prog = 35 + (idx * 10)
            update_job(jid, progress=prog,
                       progressMessage=f"Creating clip {idx + 1}/3...")

            crop_1080(src, p, t0, t1, sw, sh)

            cw, ch = get_resolution(p)
            mb = os.path.getsize(p) // (1024 * 1024)
            log(f"Clip {idx + 1}: {cw}x{ch} ({mb}MB)")

            all_clips.append({
                "index": idx + 1,
                "filename": fn,
                "captionedFilename": f"clip_{idx + 1}_captioned.mp4",
                "startTime": round(t0, 2),
                "endTime": round(t1, 2),
                "duration": round(t1 - t0, 2),
            })

        # Step 4: Caption each clip (AI model load is non-fatal)
        update_job(jid, status="captioning", progress=65,
                   progressMessage="Loading AI model...")
        get_model()

        for idx, cl in enumerate(all_clips):
            inp_p = os.path.join(outdir, cl["filename"])
            out_p = os.path.join(outdir, cl["captionedFilename"])
            prog = 70 + (idx * 10)
            update_job(jid, progress=prog,
                       progressMessage=f"Captioning clip {idx + 1}/3...")

            try:
                words = transcribe(inp_p, 45)
                caption(inp_p, out_p, words, style, 50)
                log(f"Clip {idx + 1} done")
            except Exception as e:
                log(f"Clip {idx + 1} error: {e}")
                subprocess.run(["cp", inp_p, out_p], check=True)

            new_prog = min(95, 75 + (idx * 10))
            update_job(jid, progress=new_prog,
                       progressMessage=f"Clip {idx + 1}/{len(all_clips)} done")

        # Done
        update_job(jid, status="done", progress=100,
                   progressMessage="All clips ready!",
                   clips=all_clips)

        try:
            os.remove(src)
        except Exception:
            pass

        log(f"DONE! {len(all_clips)} clips at 1080x1920")

    except Exception as ex:
        log(f"FATAL: {ex}")
        traceback.print_exc()
        update_job(jid, status="error", progress=0,
                   progressMessage="Processing failed",
                   errorMessage=str(ex)[:300])
        sys.exit(1)

if __name__ == "__main__":
    main()
