/**
 * File-based JSON database (simple, no dependencies)
 * Used as the durable fallback when PostgreSQL is not configured/unreachable.
 *
 * Architecture: the Node API process and the Python video worker are SEPARATE
 * processes that share this one JSON file. The worker writes progress; the API
 * reads it. Therefore every read re-reads fresh from disk so the API sees the
 * worker's updates. Memory is only a fallback when the file is unreadable.
 *
 * Other notes:
 *  - Picks a writable location automatically (cwd -> os.tmpdir()) so it never
 *    crashes with EROFS on serverless platforms that expose a read-only fs.
 *  - Writes are atomic (temp file + rename) so a crash can't corrupt the store.
 */
import fs from "fs";
import os from "os";
import path from "path";

const DB_FILENAME = "clipgenius-db.json";

function resolveDbPath(): string {
  // 1. Explicit override wins
  if (process.env.DB_FILE_PATH) return process.env.DB_FILE_PATH;

  const candidates: string[] = [];

  // 2. Known serverless platforms provide a writable /tmp only
  if (
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.NETLIFY ||
    process.env.NETLIFY_DEV
  ) {
    candidates.push(path.join("/tmp", DB_FILENAME));
  }

  // 3. The app working directory (Render, DO App Platform, VPS, local)
  candidates.push(path.join(process.cwd(), DB_FILENAME));

  // 4. OS temp dir as a last-resort writable location
  candidates.push(path.join(os.tmpdir(), DB_FILENAME));

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
      const probe = `${candidate}.wtest`;
      fs.writeFileSync(probe, "");
      fs.unlinkSync(probe);
      return candidate;
    } catch {
      // not writable, try the next candidate
    }
  }

  // Absolute last resort
  return path.join(os.tmpdir(), DB_FILENAME);
}

const DB_PATH = resolveDbPath();
console.log(`[JSON-DB] Using store at ${DB_PATH}`);

/** Expose the resolved store path so the Python worker can be pointed at the
 *  exact same file (passed via the DB_FILE_PATH env var when spawning it). */
export function getDbFilePath(): string {
  return DB_PATH;
}

interface JobRecord {
  id: string;
  youtube_url: string;
  video_title?: string | null;
  caption_style: string;
  status: string;
  progress: number;
  progress_message?: string | null;
  error_message?: string | null;
  clips?: any;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface DbData {
  jobs: JobRecord[];
}

// Last-known-good in-memory copy. Used only as a fallback when the file is
// missing or unreadable; reads normally re-read fresh from disk so the API
// process observes updates written by the separate Python worker process.
let memory: DbData | null = null;

function readDbFromDisk(): DbData {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return { jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [] };
    }
  } catch (e) {
    console.error("[JSON-DB] Read error:", e);
  }
  return { jobs: [] };
}

function load(): DbData {
  // Always read fresh from disk when the file exists, so we pick up writes made
  // by other processes (the Python video worker). Fall back to the in-memory
  // copy only when the file is missing or unreadable.
  try {
    if (fs.existsSync(DB_PATH)) {
      memory = readDbFromDisk();
      return memory;
    }
  } catch {
    // ignore, use memory
  }
  if (!memory) memory = { jobs: [] };
  return memory;
}

function writeDbToDisk(data: DbData) {
  try {
    // Atomic write: temp file + rename so a crash mid-write can't corrupt the DB
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, DB_PATH);
  } catch (e) {
    // Non-fatal: in-memory copy still holds the latest state for this instance.
    console.error("[JSON-DB] Write error (non-fatal, state kept in memory):", e);
  }
}

function commit(data: DbData) {
  memory = data;
  writeDbToDisk(data);
}

/**
 * Parse simple SQL UPDATE statement
 * Supports: UPDATE jobs SET col1 = ?, col2 = ?, ... WHERE id = ?
 * Also: UPDATE jobs SET col1 = ?, clips = ?, updated_at = datetime('now') WHERE id = ?
 */
function parseUpdate(sql: string, params: any[]): { sets: Record<string, any>; whereCol: string; whereVal: string } | null {
  // Match: UPDATE jobs SET ... WHERE col = ?
  // Use [\s\S] instead of . with /s flag (dotAll) for cross-platform compat
  const match = sql.match(/UPDATE\s+jobs\s+SET\s+([\s\S]+?)\s+WHERE\s+(\w+)\s*=\s*\?\s*$/i);
  if (!match) return null;

  const setPart = match[1];
  const whereCol = match[2].toLowerCase();
  const whereVal = String(params[params.length - 1]);

  // Parse SET clauses: col1 = ?, col2 = ?, col3 = datetime('now')
  const setClauses: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of setPart) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      setClauses.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) setClauses.push(current.trim());

  const sets: Record<string, any> = {};
  let paramIdx = 0;

  for (const clause of setClauses) {
    const eqIdx = clause.indexOf("=");
    if (eqIdx === -1) continue;
    
    const key = clause.substring(0, eqIdx).trim();
    const valuePart = clause.substring(eqIdx + 1).trim();

    if (valuePart === "?") {
      // Parameterized value
      const val = params[paramIdx++];
      sets[key] = val;
    } else if (valuePart.includes("datetime('now')")) {
      sets[key] = new Date().toISOString();
    } else if (valuePart.includes("NOW()")) {
      sets[key] = new Date().toISOString();
    } else {
      // Try to parse as literal
      const cleaned = valuePart.replace(/^['"]|['"]$/g, "");
      sets[key] = cleaned;
    }
  }

  return { sets, whereCol, whereVal };
}

/**
 * Parse INSERT statement
 */
function parseInsert(sql: string, params: any[]): { record: Record<string, any> } | null {
  // Match: INSERT OR REPLACE INTO jobs (col1, col2, ...) VALUES (?, ?, ...)
  const match = sql.match(/INSERT\s+(OR\s+REPLACE\s+)?INTO\s+jobs\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!match) return null;

  const cols = match[2].split(",").map(c => c.trim());
  const valsPlaceholder = match[3];
  
  const record: Record<string, any> = {};
  let paramIdx = 0;

  cols.forEach(col => {
    // Find corresponding value: if parameterized (?), use param; otherwise parse literal
    // Simple approach: just assign params in order
    if (paramIdx < params.length) {
      let val = params[paramIdx++];
      record[col] = val;
    }
  });

  return { record };
}

export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const data = load();
  const upperSql = sql.trim().toUpperCase();

  if (upperSql.startsWith("SELECT")) {
    // SELECT * FROM jobs WHERE col = ?
    if (upperSql.includes("WHERE")) {
      const colMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?\s*(LIMIT\s+\d+)?/i);
      if (colMatch) {
        const col = colMatch[1].toLowerCase();
        const val = String(params[0]);
        
        let results = data.jobs.filter(j => {
          const rowVal = String(j[col as keyof JobRecord] ?? "");
          return rowVal === val;
        });

        // Check for LIMIT
        const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
          results = results.slice(0, parseInt(limitMatch[1]));
        }

        return results.map(normalizeJob);
      }
    }

    // Check for expires_at condition: WHERE expires_at < datetime('now')
    if (upperSql.includes("EXPIRES_AT")) {
      const now = new Date().toISOString();
      const results = data.jobs.filter(j => {
        if (!j.expires_at) return false;
        return j.expires_at < now;
      });
      return results.map(normalizeJob);
    }

    // SELECT * FROM jobs (ordered by created_at DESC)
    const sortMatch = sql.match(/ORDER\s+BY\s+(\w+)\s*(DESC|ASC)?/i);
    let results = [...data.jobs];
    if (sortMatch) {
      const sortCol = sortMatch[1].toLowerCase();
      const sortDir = sortMatch[2]?.toUpperCase() === "ASC" ? 1 : -1;
      results.sort((a, b) => {
        const aVal = a[sortCol as keyof JobRecord] ?? "";
        const bVal = b[sortCol as keyof JobRecord] ?? "";
        return String(aVal).localeCompare(String(bVal)) * sortDir;
      });
    }

    // Handle LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]));
    }

    return results.map(normalizeJob);
  }

  return [];
}

export async function run(sql: string, params: any[] = []): Promise<{ changes: number }> {
  const data = load();
  const upperSql = sql.trim().toUpperCase();

  if (upperSql.startsWith("UPDATE")) {
    const parsed = parseUpdate(sql, params);
    if (parsed) {
      const { sets, whereCol, whereVal } = parsed;
      let changes = 0;

      // Map common column names
      const colMap: Record<string, keyof JobRecord> = {
        id: "id",
        youtube_url: "youtube_url",
        video_title: "video_title",
        videoTitle: "video_title",
        caption_style: "caption_style",
        captionStyle: "caption_style",
        status: "status",
        progress: "progress",
        progress_message: "progress_message",
        progressMessage: "progress_message",
        error_message: "error_message",
        errorMessage: "error_message",
        clips: "clips",
        expires_at: "expires_at",
        expiresAt: "expires_at",
        created_at: "created_at",
        createdAt: "created_at",
        updated_at: "updated_at",
        updatedAt: "updated_at",
      };

      const actualCol = colMap[whereCol] || whereCol;

      data.jobs = data.jobs.map(j => {
        const jVal = String(j[actualCol] ?? "");
        if (jVal === whereVal) {
          const updated = { ...j };
          for (const [key, val] of Object.entries(sets)) {
            const actualKey = colMap[key] || key;
            (updated as any)[actualKey] = val;
          }
          updated.updated_at = new Date().toISOString();
          changes++;
          return updated;
        }
        return j;
      });

      if (changes > 0) commit(data);
      return { changes };
    }
  }

  if (upperSql.startsWith("INSERT") || upperSql.startsWith("INSERT OR REPLACE")) {
    const parsed = parseInsert(sql, params);
    if (parsed) {
      const { record } = parsed;
      // Remove existing record with same id
      data.jobs = data.jobs.filter(j => j.id !== record.id);
      data.jobs.push({
        id: record.id || "",
        youtube_url: record.youtube_url || "",
        video_title: record.video_title || null,
        caption_style: record.caption_style || "oneword",
        status: record.status || "pending",
        progress: Number(record.progress) || 0,
        progress_message: record.progress_message || null,
        error_message: record.error_message || null,
        clips: record.clips || null,
        expires_at: record.expires_at || null,
        created_at: record.created_at || new Date().toISOString(),
        updated_at: record.updated_at || new Date().toISOString(),
      });
      commit(data);
      return { changes: 1 };
    }
  }

  if (upperSql.startsWith("DELETE")) {
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
    if (whereMatch) {
      const whereCol = whereMatch[1].toLowerCase();
      const whereVal = String(params[0]);
      const before = data.jobs.length;

      const colMap: Record<string, string> = { id: "id" };
      const actualCol = colMap[whereCol] || whereCol;

      data.jobs = data.jobs.filter(j => {
        const jVal = String(j[actualCol as keyof JobRecord] ?? "");
        return jVal !== whereVal;
      });

      if (data.jobs.length < before) {
        commit(data);
        return { changes: before - data.jobs.length };
      }
    }
  }

  return { changes: 0 };
}

function normalizeJob(j: JobRecord): any {
  let clips = j.clips;
  if (typeof clips === "string") {
    try { clips = JSON.parse(clips); } catch { clips = null; }
  }
  return {
    ...j,
    clips,
    youtubeUrl: j.youtube_url,
    videoTitle: j.video_title,
    captionStyle: j.caption_style,
    progressMessage: j.progress_message,
    errorMessage: j.error_message,
    expiresAt: j.expires_at,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
  };
}

// Aliases for compatibility
export const sqliteQuery = query;
export const sqliteRun = run;
export const sqliteAvailable = true;
