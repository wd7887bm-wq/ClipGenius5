/**
 * Database layer - uses PostgreSQL when DATABASE_URL is set, falls back to SQLite
 */
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { query as sqliteQuery, run as sqliteRun } from "./sqlite-db";

const sqliteAvailable = true; // Always available since sql.js is pure JS

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDrizzleDb?: NodePgDatabase;
};

export function getDb(): NodePgDatabase | null {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  if (globalForDb.__arenaNextJsDrizzleDb) {
    return globalForDb.__arenaNextJsDrizzleDb;
  }

  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
    });
  }

  globalForDb.__arenaNextJsDrizzleDb = drizzle(globalForDb.__arenaNextJsPostgresqlPool);
  return globalForDb.__arenaNextJsDrizzleDb;
}

// Create a proxy that delegates to SQLite when no PostgreSQL
export const db = new Proxy({} as any, {
  get(_target, prop: string | symbol) {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (databaseUrl) {
      const instance = getDb()!;
      const value = instance[prop as keyof NodePgDatabase];
      if (typeof value === "function") {
        return value.bind(instance);
      }
      return value;
    }

    // SQLite fallback methods
    if (prop === "select") {
      return () => ({
        from: (table: any) => ({
          where: async (condition: any) => {
            const tableName = table?.config?.name || "jobs";
            const col = condition?.left?.name || "id";
            const val = condition?.right?.value ?? condition?.right;
            return await sqliteQuery(`SELECT * FROM ${tableName} WHERE ${col} = ?`, [val]);
          },
          limit: (_n: number) => ({
            // chainable
          }),
          then: async (resolve: any) => {
            const rows = await sqliteQuery("SELECT * FROM jobs ORDER BY created_at DESC");
            resolve(rows);
            return rows;
          }
        }),
        then: async (resolve: any) => {
          const rows = await sqliteQuery("SELECT * FROM jobs ORDER BY created_at DESC");
          resolve(rows);
          return rows;
        }
      });
    }

    if (prop === "insert") {
      return (table: any) => ({
        values: async (data: any) => {
          const tableName = table?.config?.name || "jobs";
          const keys = Object.keys(data);
          const vals = Object.values(data).map(v => 
            typeof v === 'object' ? JSON.stringify(v) : v
          );
          const placeholders = keys.map(() => "?").join(", ");
          await sqliteRun(
            `INSERT OR REPLACE INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
            vals
          );
        }
      });
    }

    if (prop === "update") {
      return (table: any) => ({
        set: (data: any) => ({
          where: async (condition: any) => {
            const tableName = table?.config?.name || "jobs";
            const col = condition?.left?.name || "id";
            const val = condition?.right?.value ?? condition?.right;
            const setClauses = Object.entries(data).map(([k]) => `${k} = ?`);
            const values = Object.values(data).map(v =>
              typeof v === 'object' ? JSON.stringify(v) : v
            );
            await sqliteRun(
              `UPDATE ${tableName} SET ${setClauses.join(", ")}, updated_at = datetime('now') WHERE ${col} = ?`,
              [...values, val]
            );
          }
        })
      });
    }

    if (prop === "delete") {
      return (table: any) => ({
        where: async (condition: any) => {
          const tableName = table?.config?.name || "jobs";
          const col = condition?.left?.name || "id";
          const val = condition?.right?.value ?? condition?.right;
          await sqliteRun(`DELETE FROM ${tableName} WHERE ${col} = ?`, [val]);
        }
      });
    }

    return undefined;
  }
});

export { sqliteQuery, sqliteRun, sqliteAvailable };
