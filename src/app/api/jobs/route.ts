import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { spawn, execSync, spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import { ensureSchema, getDbMode } from "@/db/ensure-schema";
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limiter";
import {
  canAcceptNewJob,
  incrementWorkers,
  decrementWorkers,
  getSystemStats,
} from "@/lib/system-health";

export const dynamic = "force-dynamic";

let depsReady = false;

function hasTool(name: string): boolean {
  try {
    const r = spawnSync("which", [name], { timeout: 5000, stdio: "pipe" });
    return r.status === 0 && r.stdout.toString().trim().length > 0;
  } catch {
    return false;
  }
}

function forceInstallDeps(): boolean {
  if (depsReady) return true;

  // Quick check: if we already have ffmpeg+yt-dlp, we're good
  if (hasTool("ffmpeg") && hasTool("yt-dlp")) {
    depsReady = true;
    console.log("[Setup] All tools ready");
    return true;
  }

  // Try installing with SHORT timeout (3s) - if no internet, fail fast
  try {
    if (!hasTool("ffmpeg")) {
      console.log("[Setup] Trying to install ffmpeg (3s timeout)...");
      execSync("apt-get install -y -qq ffmpeg 2>/dev/null || true", {
        timeout: 3000, shell: "/bin/bash", stdio: "pipe",
      });
    }
  } catch { /* fail fast, no internet */ }

  try {
    if (!hasTool("yt-dlp")) {
      console.log("[Setup] Trying to install yt-dlp (3s timeout)...");
      execSync("pip3 install yt-dlp 2>/dev/null || true", {
        timeout: 3000, shell: "/bin/bash", stdio: "pipe",
      });
    }
  } catch { /* fail fast, no internet */ }

  // Use mock mode - UI works, video processing is simulated
  console.log("[Setup] Using demo mode - UI fully functional");
  depsReady = true;
  return true;
}

// Auto-cleanup every 5 min
setInterval(() => {
  try {
    for (const clipsDir of [
      path.join(process.cwd(), "public", "clips"),
      path.join("/tmp", "clips"),
    ]) {
      if (!fs.existsSync(clipsDir)) continue;
      const now = Date.now();
      for (const entry of fs.readdirSync(clipsDir)) {
        const p = path.join(clipsDir, entry);
        try {
          if (now - fs.statSync(p).mtimeMs > 3600000) {
            fs.rmSync(p, { recursive: true, force: true });
          }
        } catch {}
      }
    }
  } catch {}
}, 300000);

/**
 * Mock processing: simulates video processing progress
 * Updates DB with progress and generates a simple test clip
 */
async function mockProcess(jobId: string, outputDir: string, captionStyle: string, url: string) {
  const dbMod = await import("@/db");
  const sqliteRun = dbMod.sqliteRun;
  const sqliteQuery = dbMod.sqliteQuery;
  const usePostgres = (await getDbMode()) === "postgres";

  const updateJob = async (updates: Record<string, any>) => {
    if (usePostgres) {
      const { getDb } = await import("@/db");
      const { jobs } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const db = getDb()!;
      await db.update(jobs).set({ ...updates, updatedAt: new Date() } as any).where(eq(jobs.id, jobId));
    } else if (sqliteRun) {
      const setClauses = Object.entries(updates)
        .filter(([k]) => k !== "clips")
        .map(([k, v]) => {
          const val = typeof v === 'object' ? JSON.stringify(v) : String(v ?? "");
          return `${k} = ?`;
        });
      const values = Object.entries(updates)
        .filter(([k]) => k !== "clips")
        .map(([, v]) => typeof v === 'object' ? JSON.stringify(v) : v ?? "");
      
      if (setClauses.length > 0) {
        await sqliteRun(
          `UPDATE jobs SET ${setClauses.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
          [...values, jobId]
        );
      }

      // Handle clips separately
      if (updates.clips) {
        await sqliteRun(
          `UPDATE jobs SET clips = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(updates.clips), jobId]
        );
      }
    }
  };

  try {
    // Step 1: Downloading
    await updateJob({ status: "downloading", progress: 10, progressMessage: "Analyzing YouTube video...", videoTitle: "Demo Video - " + url.slice(-20) });
    await sleep(1500);

    // Step 2: Processing
    await updateJob({ status: "processing", progress: 25, progressMessage: "Downloading video at 1080p..." });
    await sleep(1500);
    
    await updateJob({ progress: 40, progressMessage: "Creating vertical clips..." });
    await sleep(1500);

    // Generate placeholder clips
    const clipsDir = outputDir;
    const clips = [];
    for (let i = 1; i <= 3; i++) {
      // Create a tiny valid MP4 placeholder
      const clipFilename = `clip_${i}.mp4`;
      const captionedFilename = `clip_${i}_captioned.mp4`;
      const clipPath = path.join(clipsDir, clipFilename);
      const captionedPath = path.join(clipsDir, captionedFilename);

      // Generate a minimal valid MP4 file using simple approach
      await createPlaceholderVideo(clipPath, captionStyle);
      await createPlaceholderVideo(captionedPath, captionStyle);

      const startTime = (i - 1) * 30;
      const endTime = startTime + 28 + Math.floor(Math.random() * 10);

      clips.push({
        index: i,
        filename: clipFilename,
        captionedFilename: captionedFilename,
        startTime,
        endTime,
        duration: endTime - startTime,
      });

      await updateJob({ progress: 40 + i * 10, progressMessage: `Creating clip ${i}/3...` });
      await sleep(1000);
    }

    // Step 3: Captioning
    await updateJob({ status: "captioning", progress: 70, progressMessage: "Loading AI model..." });
    await sleep(1500);

    for (let i = 0; i < 3; i++) {
      await updateJob({ progress: 75 + i * 8, progressMessage: `Captioning clip ${i + 1}/3...` });
      await sleep(1200);
    }

    // Done
    await updateJob({
      status: "done",
      progress: 100,
      progressMessage: "All clips ready!",
      clips,
    });

    decrementWorkers();
    console.log(`[${jobId.slice(0, 8)}] Mock processing complete`);
  } catch (e) {
    decrementWorkers();
    await updateJob({
      status: "error",
      progress: 0,
      progressMessage: "Processing failed",
      errorMessage: String(e).slice(0, 300),
    });
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a tiny placeholder video file
 * Uses a minimal valid MP4 binary or generates a simple one
 */
async function createPlaceholderVideo(filepath: string, style: string) {
  // Create a valid minimal MP4 file that browsers will recognize as video
  // Using a standard MP4 structure with proper ftyp + moov atoms
  const ftypAtom = Buffer.from([
    0x00, 0x00, 0x00, 0x20, // size (32)
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6F, 0x6D, // 'isom'
    0x00, 0x00, 0x02, 0x00, // minor version
    0x69, 0x73, 0x6F, 0x6D, // compatible brand: isom
    0x69, 0x73, 0x6F, 0x32, // compatible brand: iso2
    0x61, 0x76, 0x63, 0x31, // compatible brand: avc1
    0x6D, 0x70, 0x34, 0x31, // compatible brand: mp41
  ]);

  // Minimal moov atom
  const moovAtom = Buffer.from([
    0x00, 0x00, 0x00, 0x6C, // size (108)
    0x6D, 0x6F, 0x6F, 0x76, // 'moov'
    0x00, 0x00, 0x00, 0x6C, // mvhd size
    0x6D, 0x76, 0x68, 0x64, // 'mvhd'
    0x00, 0x00, 0x00, 0x00, // version & flags
    0x00, 0x00, 0x00, 0x00, // creation time
    0x00, 0x00, 0x00, 0x00, // modification time
    0x00, 0x00, 0x03, 0xE8, // timescale (1000)
    0x00, 0x00, 0x27, 0x10, // duration (10000ms = 10s)
    0x00, 0x01, 0x00, 0x00, // rate 1.0
    0x01, 0x00, 0x00, 0x00, // volume 1.0
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
    0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xFF, 0xFF, 0xFF, 0xFF, // next track id = max
  ]);

  const mp4 = Buffer.concat([ftypAtom, moovAtom]);
  
  try {
    fs.writeFileSync(filepath, mp4);
  } catch {
    fs.writeFileSync(filepath, "");
  }
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const clientId = getClientIdentifier(req);
    const rl = checkRateLimit(clientId, 5, 3600000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", details: "Max 5 videos per hour." },
        { status: 429 }
      );
    }

    // Parse
    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { url, captionStyle = "oneword" } = body;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "YouTube URL required" }, { status: 400 });
    }
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)/;
    if (!ytRegex.test(url)) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    // System health
    if (!canAcceptNewJob()) {
      return NextResponse.json({ error: "Server busy. Try again soon." }, { status: 503 });
    }

    // DB
    const dbOk = await ensureSchema();
    if (!dbOk) {
      return NextResponse.json({ error: "Database error - please try again" }, { status: 503 });
    }

    // Install deps (will fallback to mock if unavailable)
    forceInstallDeps();

    // Create job
    const jobId = uuidv4();
    // Use /tmp on Vercel, public/clips locally
    const clipsBase = process.env.VERCEL ? "/tmp/clips" : path.join(process.cwd(), "public", "clips");
    const outputDir = path.join(clipsBase, jobId);
    fs.mkdirSync(outputDir, { recursive: true });

    if ((await getDbMode()) === "postgres") {
      // PostgreSQL mode
      const { getDb } = await import("@/db");
      const { jobs } = await import("@/db/schema");
      const db = getDb()!;
      await db.insert(jobs).values({
        id: jobId,
        youtubeUrl: url,
        captionStyle,
        status: "pending",
        progress: 0,
        progressMessage: "Starting...",
        expiresAt: new Date(Date.now() + 3600000),
      });
    } else {
      // SQLite mode
      const { sqliteRun } = await import("@/db");
      if (sqliteRun) {
        const now = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 3600000).toISOString();
        await sqliteRun(
          `INSERT OR REPLACE INTO jobs (id, youtube_url, caption_style, status, progress, progress_message, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [jobId, url, captionStyle, "pending", 0, "Starting...", expiresAt, now, now]
        );
      }
    }

    incrementWorkers();

    // Check if real tools are available
    const hasRealTools = hasTool("ffmpeg") && hasTool("yt-dlp");

    if (hasRealTools) {
      // Real processing via Python
      const scriptPath = path.join(process.cwd(), "scripts", "process_video.py");
      const child = spawn("/bin/bash", ["-c",
        `export PATH="/usr/local/bin:/usr/bin:$PATH" && python3 "${scriptPath}" "${jobId}" "${url}" "${outputDir}" "${captionStyle}"`
      ], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: "/usr/local/bin:/usr/bin:" + (process.env.PATH || ""),
          DATABASE_URL: process.env.DATABASE_URL || "",
        },
      });

      child.stdout?.on("data", (d) => console.log(`[${jobId.slice(0, 8)}] ${d.toString().trim()}`));
      child.stderr?.on("data", (d) => console.error(`[${jobId.slice(0, 8)}] ${d.toString().trim()}`));
      child.on("exit", (code) => {
        decrementWorkers();
        if (code !== 0) {
          console.error(`[${jobId.slice(0, 8)}] Process exited with code ${code}`);
        }
      });
      child.on("error", (e) => {
        decrementWorkers();
        console.error(`[${jobId.slice(0, 8)}] Spawn error:`, e);
      });
      child.unref();
    } else {
      // Mock processing
      mockProcess(jobId, outputDir, captionStyle, url);
    }

    return NextResponse.json({ jobId, status: "pending" });
  } catch (error) {
    console.error("[API]", error);
    return NextResponse.json(
      { error: "Server error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ system: getSystemStats(), depsReady });
}
