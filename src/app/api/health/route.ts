import { sql } from "drizzle-orm";
import { ensureSchema, getDbMode } from "@/db/ensure-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();

    const mode = await getDbMode();

    if (mode === "postgres") {
      const { getDb } = await import("@/db");
      const db = getDb()!;
      await db.execute(sql`select 1`);
    } else {
      // File store check
      const { sqliteQuery } = await import("@/db");
      if (sqliteQuery) {
        await sqliteQuery("SELECT 1");
      } else {
        return Response.json({ ok: false, error: "No database available" }, { status: 500 });
      }
    }

    return Response.json({ ok: true, db: mode === "postgres" ? "postgresql" : "file" });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
