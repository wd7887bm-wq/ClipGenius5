import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ensureSchema } from "@/db/ensure-schema";
import { eq, lt } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Cleanup endpoint - removes expired jobs and their files
 * Can be called by a cron job or scheduler
 */
export async function POST() {
  try {
    await ensureSchema();

    const databaseUrl = process.env.DATABASE_URL;
    let expiredJobIds: string[] = [];
    let dbDeleted = 0;

    if (databaseUrl) {
      // PostgreSQL
      const { getDb } = await import("@/db");
      const { jobs } = await import("@/db/schema");
      const db = getDb()!;

      const expiredJobs = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(lt(jobs.expiresAt, new Date()));

      expiredJobIds = expiredJobs.map(j => j.id);

      for (const job of expiredJobs) {
        await db.delete(jobs).where(eq(jobs.id, job.id));
        dbDeleted++;
      }
    } else {
      // SQLite
      const { sqliteQuery, sqliteRun } = await import("@/db");
      if (sqliteQuery && sqliteRun) {
        const expired = await sqliteQuery(
          "SELECT id FROM jobs WHERE expires_at < datetime('now')"
        );
        expiredJobIds = expired.map((j: any) => j.id);

        for (const id of expiredJobIds) {
          await sqliteRun("DELETE FROM jobs WHERE id = ?", [id]);
          dbDeleted++;
        }
      }
    }

    // Clean up files from both possible locations
    let filesCleaned = 0;
    for (const id of expiredJobIds) {
      for (const clipDir of [
        path.join(process.cwd(), "public", "clips", id),
        path.join("/tmp", "clips", id),
      ]) {
        try {
          fs.rmSync(clipDir, { recursive: true, force: true });
          filesCleaned++;
        } catch {
          // ignore
        }
      }
    }

    return NextResponse.json({
      success: true,
      expiredJobsFound: expiredJobIds.length,
      filesCleaned,
      dbDeleted,
    });
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const clipsDir = path.join(process.cwd(), "public", "clips");
    let totalSize = 0;
    let folderCount = 0;

    if (fs.existsSync(clipsDir)) {
      const entries = fs.readdirSync(clipsDir);
      folderCount = entries.length;
      for (const entry of entries) {
        const entryPath = path.join(clipsDir, entry);
        try {
          const stat = fs.statSync(entryPath);
          if (stat.isDirectory()) {
            const files = fs.readdirSync(entryPath);
            for (const f of files) {
              totalSize += fs.statSync(path.join(entryPath, f)).size;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    return NextResponse.json({
      storage: {
        folderCount,
        totalSizeMB: Math.round(totalSize / (1024 * 1024)),
        totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to get storage stats" }, { status: 500 });
  }
}
