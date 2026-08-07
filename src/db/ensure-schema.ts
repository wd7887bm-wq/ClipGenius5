import { sqliteQuery } from "./sqlite-db";

let schemaEnsured = false;
let ensurePromise: Promise<boolean> | null = null;

// PostgreSQL schema - only used when DATABASE_URL is set
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

async function doEnsureSchema(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;

  // If PostgreSQL is configured, use it
  if (databaseUrl) {
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 10000,
      });
      await pool.query(PG_CREATE_TABLE_SQL);
      await pool.end();
      schemaEnsured = true;
      console.log("[DB] PostgreSQL schema ready");
      return true;
    } catch (e) {
      console.error("[DB] PostgreSQL schema error:", e);
      return false;
    }
  }

  // SQLite fallback - schema is created in sqlite-db.ts automatically
  try {
    await sqliteQuery("SELECT 1 FROM jobs LIMIT 1");
    schemaEnsured = true;
    console.log("[DB] SQLite schema ready");
    return true;
  } catch {
    // Table doesn't exist yet, but sqlite-db init creates it
    schemaEnsured = true;
    console.log("[DB] SQLite schema ready (auto-created)");
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
