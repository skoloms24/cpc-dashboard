import { db, Client, getClients } from "./db";
import { channelFor } from "./channels";
import { weekStartOf } from "./week";
import type { ZohoReport } from "./parse/zoho";
import type { SpendRow } from "./parse/spend";
import type { ParsedReport } from "./parse/detect";

const norm = (s: string) => s.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");

export function findClientForZoho(report: ZohoReport, clients: Client[]): Client | null {
  if (!report.org) return null;
  const org = norm(report.org);
  return clients.find(c => c.zoho_org && norm(c.zoho_org) === org) ?? clients.find(c => norm(c.name) === org) ?? null;
}

/** Replace each week's candidates for this client with the rows in the report. */
export async function importZoho(report: ZohoReport, clientOverride?: Client): Promise<string> {
  const clients = await getClients(true);
  const client = clientOverride ?? findClientForZoho(report, clients);
  if (!client) throw new Error(`No client is set up for the Zoho account "${report.org ?? "unknown"}". Add it on the Admin page (Zoho account name must match).`);
  const byWeek = new Map<string, typeof report.candidates>();
  for (const c of report.candidates) {
    const w = weekStartOf(c.date);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(c);
  }
  const sql = db();
  const parts: string[] = [];
  for (const [week, rows] of byWeek) {
    const positions = rows.map(r => (r.positions.length ? r.positions : client.default_position ? [client.default_position] : []).join("|"));
    await sql.tx([
      [`DELETE FROM candidates WHERE client_id = $1 AND week_start = $2`, [client.id, week]],
      [
        `INSERT INTO candidates (client_id, week_start, created_at, utm_source, channel, positions)
         SELECT $1, $2, t.created_at, t.utm, t.channel, string_to_array(t.pos, '|')
           FROM unnest($3::timestamp[], $4::text[], $5::text[], $6::text[]) AS t(created_at, utm, channel, pos)`,
        [client.id, week, rows.map(r => r.createdAt), rows.map(r => r.utmSource || "(none)"),
         rows.map(r => channelFor(r.utmSource, client.source_map)), positions]],
    ]);
    parts.push(`${rows.length} candidates for week of ${week}`);
  }
  return `${client.name}: ${parts.join(", ") || "no candidates in file"}`;
}

export async function importSpend(rows: SpendRow[], source: "api" | "email" | "upload"): Promise<string> {
  if (!rows.length) return "no spend rows";
  await db().query(
    `INSERT INTO spend_raw (platform, key, account_id, day, amount, source, updated_at)
     SELECT * , now() FROM unnest($1::text[], $2::text[], $3::text[], $4::date[], $5::numeric[], $6::text[])
     ON CONFLICT (platform, key, day) DO UPDATE
       SET amount = EXCLUDED.amount, account_id = COALESCE(EXCLUDED.account_id, spend_raw.account_id),
           source = EXCLUDED.source, updated_at = now()`,
    [rows.map(r => r.platform), rows.map(r => r.key), rows.map(r => r.accountId), rows.map(r => r.day),
     rows.map(r => r.amount), rows.map(() => source)]);
  const days = rows.map(r => r.day).sort();
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return `${rows[0].platform}: ${rows.length} daily rows, $${total.toFixed(2)} from ${days[0]} to ${days[days.length - 1]}`;
}

export async function importParsed(p: ParsedReport, source: "email" | "upload"): Promise<string> {
  if (p.kind === "zoho") return importZoho(p.report);
  if (p.kind === "spend") return importSpend(p.rows, source);
  throw new Error(`${p.filename}: ${p.reason}`);
}
