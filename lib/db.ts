import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

type Row = Record<string, any>;
export type Sql = {
  query: (text: string, params?: unknown[]) => Promise<Row[]>;
  /** Run statements in order inside one transaction. */
  tx: (statements: [string, unknown[]][]) => Promise<void>;
};

let _sql: Sql | null = null;

/**
 * Database client. Uses Neon's HTTP driver for Neon URLs (Vercel), and a normal
 * Postgres connection for anything else (local development).
 */
export function db(): Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (/neon\.tech|neon\.build/.test(url) || process.env.DB_DRIVER === "neon") {
    const sql = neon(url);
    _sql = {
      query: (text, params = []) => sql.query(text, params) as Promise<Row[]>,
      tx: async statements => { await sql.transaction(statements.map(([t, p]) => sql.query(t, p))); },
    };
  } else {
    const pool = new Pool({ connectionString: url, max: 5 });
    _sql = {
      query: async (text, params = []) => (await pool.query(text, params)).rows,
      tx: async statements => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          for (const [t, p] of statements) await c.query(t, p);
          await c.query("COMMIT");
        } catch (e) { await c.query("ROLLBACK"); throw e; }
        finally { c.release(); }
      },
    };
  }
  return _sql;
}

export type Client = {
  id: number; slug: string; name: string; zoho_org: string | null;
  channels: string[]; meta_match: string[]; google_match: string[];
  default_position: string | null; source_map: Record<string, string>; active: boolean;
};

export async function getClients(includeInactive = false): Promise<Client[]> {
  const rows = await db().query(
    `SELECT id, slug, name, zoho_org, channels, meta_match, google_match, default_position, source_map, active
       FROM clients ${includeInactive ? "" : "WHERE active"} ORDER BY name`);
  return rows as Client[];
}

export async function logImport(trigger: string, source: string, status: "ok" | "skipped" | "error", message: string) {
  await db().query(`INSERT INTO import_log (trigger, source, status, message) VALUES ($1,$2,$3,$4)`, [trigger, source, status, message.slice(0, 2000)]);
}
