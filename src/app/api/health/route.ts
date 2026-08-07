import { sql } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();

    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      const { getDb } = await import("@/db");
      const db = getDb()!;
      await db.execute(sql`select 1`);
    } else {
      // SQLite check
      const { sqliteQuery } = await import("@/db");
      if (sqliteQuery) {
        await sqliteQuery("SELECT 1");
      } else {
        return Response.json({ ok: false, error: "No database available" }, { status: 500 });
      }
    }

    return Response.json({ ok: true, db: databaseUrl ? "postgresql" : "sqlite" });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
