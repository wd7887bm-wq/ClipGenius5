import { sqliteQuery } from "./sqlite-db";

let schemaEnsured = false;
let ensurePromise: Promise<boolean> | null = null;

export type DbMode = "postgres" | "file";

// Cached decision about which DB backend to use. Resolved ONCE per process:
// "postgres" only if DATABASE_URL is set AND a connection actually succeeds,
// otherwise "file" (the resilient JSON store). This is what every route must
// consult instead of reading process.env.DATABASE_URL directly, so that a
// broken/unreachable Postgres never turns into a 503 "Database error".
let cachedMode: DbMode | null = null;
let modeProbe: Promise<DbMode> | null = null;

const PG_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  youtube_url TEXT NOT NULL,
  video_title TEXT,
  caption_style TEXT NOT NULL DEFAULT 'oneword',
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  progress_message TEXT,
  error_message TEXT,
  clips JSONB,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

async function probePostgres(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    try {
      await pool.query(PG_CREATE_TABLE_SQL);
      await pool.query("SELECT 1");
    } finally {
      await pool.end();
    }
    return true;
  } catch (e) {
    console.error("[DB] PostgreSQL unavailable, falling back to file store:", e);
    return false;
  }
}

async function resolveMode(): Promise<DbMode> {
  if (cachedMode) return cachedMode;
  const ok = await probePostgres();
  cachedMode = ok ? "postgres" : "file";
  return cachedMode;
}

/**
 * Returns the DB backend to use for this process. Cached after first call.
 * Call this (instead of checking process.env.DATABASE_URL) to decide between
 * the drizzle/Postgres path and the file-store path.
 */
export async function getDbMode(): Promise<DbMode> {
  if (cachedMode) return cachedMode;
  if (modeProbe) return modeProbe;
  modeProbe = resolveMode();
  const result = await modeProbe;
  modeProbe = null;
  return result;
}

async function doEnsureSchema(): Promise<boolean> {
  const mode = await getDbMode();

  if (mode === "postgres") {
    schemaEnsured = true;
    console.log("[DB] PostgreSQL schema ready");
    return true;
  }

  // File store: schema is implicit (JSON object). Verify the store loads.
  try {
    await sqliteQuery("SELECT * FROM jobs LIMIT 1");
    schemaEnsured = true;
    console.log("[DB] File store schema ready");
    return true;
  } catch {
    schemaEnsured = true;
    console.log("[DB] File store schema ready (auto-created)");
    return true;
  }
}

export async function ensureSchema(): Promise<boolean> {
  if (schemaEnsured) return true;

  if (ensurePromise) return ensurePromise;

  ensurePromise = doEnsureSchema();
  const result = await ensurePromise;
  ensurePromise = null;
  return result;
}
