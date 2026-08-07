import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure-schema";
import { jobQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || id.length < 10) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const schemaOk = await ensureSchema();
    if (!schemaOk) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const databaseUrl = process.env.DATABASE_URL;
    let job: any = null;

    if (databaseUrl) {
      // PostgreSQL
      const { getDb } = await import("@/db");
      const { jobs } = await import("@/db/schema");
      const db = getDb()!;
      const result = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      if (result.length === 0) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      job = result[0];
    } else {
      // SQLite
      const { sqliteQuery } = await import("@/db");
      if (!sqliteQuery) {
        return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      }
      const rows = await sqliteQuery("SELECT * FROM jobs WHERE id = ?", [id]);
      if (rows.length === 0) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      job = rows[0];
      // Map SQLite columns to expected format
      job = {
        id: job.id,
        youtubeUrl: job.youtube_url,
        videoTitle: job.video_title,
        captionStyle: job.caption_style,
        status: job.status,
        progress: job.progress,
        progressMessage: job.progress_message,
        errorMessage: job.error_message,
        clips: job.clips,
        expiresAt: job.expires_at,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      };
    }

    // Check if expired
    if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
      return NextResponse.json({
        error: "Job expired",
        details: "This job has expired. Clips are automatically deleted after 1 hour.",
      }, { status: 410 });
    }

    // Get queue position if queued
    let queuePosition = 0;
    if (job.status === "queued") {
      queuePosition = jobQueue.getQueuePosition(id);
    }

    // Calculate time remaining
    let expiresIn: number | null = null;
    if (job.expiresAt) {
      expiresIn = Math.max(0, Math.floor((new Date(job.expiresAt).getTime() - Date.now()) / 1000));
    }

    return NextResponse.json({
      id: job.id,
      youtubeUrl: job.youtubeUrl,
      videoTitle: job.videoTitle,
      captionStyle: job.captionStyle,
      status: job.status,
      progress: job.progress,
      progressMessage: job.progressMessage,
      errorMessage: job.errorMessage,
      clips: job.clips,
      queuePosition,
      expiresAt: job.expiresAt,
      expiresIn,
      createdAt: job.createdAt,
    });
  } catch (error) {
    console.error("[API] Error fetching job:", error);
    return NextResponse.json({ error: "Failed to fetch job status" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const schemaOk = await ensureSchema();
    if (!schemaOk) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      const { getDb } = await import("@/db");
      const { jobs } = await import("@/db/schema");
      const db = getDb()!;
      await db.delete(jobs).where(eq(jobs.id, id));
    } else {
      const { sqliteRun } = await import("@/db");
      if (sqliteRun) {
        await sqliteRun("DELETE FROM jobs WHERE id = ?", [id]);
      }
    }

    // Clean up files
    const fs = await import("fs");
    const path = await import("path");
    const clipDir = path.join(process.cwd(), "public", "clips", id);

    try {
      fs.rmSync(clipDir, { recursive: true, force: true });
    } catch {
      // Ignore file cleanup errors
    }

    jobQueue.failJob(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting job:", error);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
