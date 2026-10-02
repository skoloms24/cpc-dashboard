import { db, Client, getClients } from "./db";
import { channelFor } from "./channels";
import { weekStartOf } from "./week";
import { parseZoho, type ZohoReport } from "./parse/zoho";
import type { Table } from "./parse/table";
import type { SpendRow } from "./parse/spend";
import type { ParsedReport } from "./parse/detect";
import type { SheetSpendRow } from "./parse/spendSheet";
import { PAID_CHANNELS } from "./channels";

const norm = (s: string) => s.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");

export function findClientForZoho(report: ZohoReport, clients: Client[]): Client | null {
  if (!report.org) return null;
  const org = norm(report.org);
  return clients.find(c => c.zoho_org && norm(c.zoho_org) === org) ?? clients.find(c => norm(c.name) === org) ?? null;
}

/** Replace each week's candidates for this client with the rows in the report. */
export async function importZoho(parsed: ZohoReport, table: Table | null, clientId?: number | null): Promise<string> {
  const clients = await getClients(true);
  const byOrg = findClientForZoho(parsed, clients);
  const client = byOrg ?? (clientId ? clients.find(c => c.id === clientId) ?? null : null);
  if (!client) {
    throw new Error(parsed.org
      ? `No client is set up for the Zoho account "${parsed.org}". Add it on the Admin page (Zoho account name must match).`
      : `This Zoho file doesn't say which account it came from. Pick the client in "Client for Zoho files" and upload it again.`);
  }
  // Re-read with this client's position columns when it has them (full module exports have dozens of unrelated Yes/No fields).
  const report = table && client.position_fields.length ? parseZoho(table, { positionFields: client.position_fields }) : parsed;
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
  const notes: string[] = [];
  if (report.usedLeadSource) notes.push(`${report.usedLeadSource} had no UTM Source, so Lead Source was used`);
  if (!report.positionColumns.length && !client.default_position && report.columnCount > 15)
    notes.push("no position columns set for this client, so positions weren't counted (set them under Admin → Clients)");
  const tail = notes.length ? `. Note: ${notes.join("; ")}.` : "";
  if (!byWeek.size) return `${client.name}: no candidates in file`;
  if (byWeek.size <= 3) return `${client.name}: ${parts.join(", ")}${tail}`;
  const ws = [...byWeek.keys()].sort();
  return `${client.name}: ${report.candidates.length} candidates across ${byWeek.size} weeks (${ws[0]} to ${ws[ws.length - 1]})${tail}`;
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

/** Spend typed into a sheet (Indeed history, past numbers). Rows for the same client, week and channel are added together. */
export async function importSpendSheet(rows: SheetSpendRow[], filename: string): Promise<string> {
  const clients = await getClients(true);
  const totals = new Map<string, { clientId: number; week: string; channel: string; amount: number }>();
  const unknownClients = new Set<string>(), unknownChannels = new Set<string>();
  for (const r of rows) {
    const c = clients.find(x => norm(x.name) === norm(r.client) || norm(x.slug) === norm(r.client) || (x.zoho_org && norm(x.zoho_org) === norm(r.client)));
    const ch = PAID_CHANNELS.find(p => p.toLowerCase() === r.channel.trim().toLowerCase())
      ?? (/^(facebook|fb|instagram|ig)/i.test(r.channel) ? "Meta" : /^(google|adwords|youtube)/i.test(r.channel) ? "Google" : undefined);
    if (!c) { unknownClients.add(r.client); continue; }
    if (!ch) { unknownChannels.add(r.channel); continue; }
    const week = weekStartOf(r.date), k = `${c.id}|${week}|${ch}`;
    const e = totals.get(k);
    if (e) e.amount += r.amount; else totals.set(k, { clientId: c.id, week, channel: ch, amount: r.amount });
  }
  if (!totals.size) throw new Error(`No usable rows.${unknownClients.size ? ` Unknown clients: ${[...unknownClients].join(", ")}.` : ""}${unknownChannels.size ? ` Unknown channels: ${[...unknownChannels].join(", ")} (use Meta, Google or Indeed).` : ""}`);
  const v = [...totals.values()];
  await db().query(
    `INSERT INTO spend_manual (client_id, week_start, channel, amount, updated_by)
     SELECT * FROM unnest($1::int[], $2::date[], $3::text[], $4::numeric[], $5::text[])
     ON CONFLICT (client_id, week_start, channel) DO UPDATE SET amount = EXCLUDED.amount, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [v.map(x => x.clientId), v.map(x => x.week), v.map(x => x.channel), v.map(x => Math.round(x.amount * 100) / 100), v.map(() => `sheet: ${filename}`.slice(0, 200))]);
  const weeks = v.map(x => x.week).sort();
  let msg = `Spend sheet: ${v.length} client-weeks from ${weeks[0]} to ${weeks[weeks.length - 1]}`;
  if (unknownClients.size) msg += `; skipped unknown clients: ${[...unknownClients].join(", ")}`;
  if (unknownChannels.size) msg += `; skipped unknown channels: ${[...unknownChannels].join(", ")}`;
  return msg;
}

export async function importParsed(p: ParsedReport, source: "email" | "upload", clientId?: number | null): Promise<string> {
  if (p.kind === "zoho") return importZoho(p.report, p.table, clientId);
  if (p.kind === "sheet") return importSpendSheet(p.rows, p.filename);
  if (p.kind === "spend") return importSpend(p.rows, source);
  throw new Error(`${p.filename}: ${p.reason}`);
}
