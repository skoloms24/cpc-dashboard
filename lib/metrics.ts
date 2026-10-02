import { db, Client, getClients } from "./db";
import { PAID_CHANNELS, PaidChannel } from "./channels";
import { addDays, lastCompletedWeek } from "./week";

export type SpendCell = { amount: number; source: "manual" | "api" | "email" | "upload" | "estimate" | "mixed"; updatedBy?: string };
export type ClientWeek = {
  client: Client;
  weekStart: string;
  total: number;
  byChannel: Record<string, number>;
  spend: Partial<Record<PaidChannel, SpendCell>>;
  spendTotal: number | null;
  missing: PaidChannel[];
  /** Paid channels that were running this week (had spend, or are switched on with no spend entered yet). */
  running: PaidChannel[];
  /** Paid channels that brought candidates this week but weren't running; those candidates were free. */
  off: PaidChannel[];
  paidCandidates: number;
  paidCPC: number | null;
  blendedCPC: number | null;
  channelCPC: Partial<Record<PaidChannel, number | null>>;
};
export type Unmatched = { platform: string; key: string; accountId: string | null; weekStart: string; amount: number; matches: string[] };

const lc = (s: string) => s.trim().toLowerCase();

/** Which clients a Meta campaign or Google account belongs to. Longest matching pattern wins. */
export function matchSpend(platform: string, key: string, accountId: string | null, clients: Client[]): { client: Client | null; all: Client[] } {
  const k = lc(key), id = (accountId || "").replace(/-/g, "");
  // Indeed spend is stored under the client's own name when it's imported.
  if (platform === "Indeed") {
    const c = clients.find(x => lc(x.name) === k || (x.zoho_org && lc(x.zoho_org) === k)) ?? null;
    return { client: c, all: c ? [c] : [] };
  }
  const scored: { c: Client; len: number }[] = [];
  for (const c of clients) {
    const pats = platform === "Meta" ? c.meta_match : c.google_match;
    let best = 0;
    for (const p of pats) {
      const pl = lc(p); if (!pl) continue;
      const pid = pl.replace(/-/g, "");
      if (platform === "Meta" ? k.includes(pl) : (k === pl || (id && pid === id) || k.includes(pl))) best = Math.max(best, pl.length);
    }
    if (best) scored.push({ c, len: best });
  }
  scored.sort((a, b) => b.len - a.len);
  return { client: scored[0]?.c ?? null, all: scored.map(s => s.c) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Metrics for every active client for each week in [fromWeek, toWeek]. */
export async function loadWeeks(fromWeek: string, toWeek: string): Promise<{ weeks: ClientWeek[]; unmatched: Unmatched[]; clients: Client[] }> {
  const sql = db();
  const clients = await getClients();
  const [counts, raw, manual] = await Promise.all([
    sql.query(`SELECT client_id, to_char(week_start,'YYYY-MM-DD') AS week_start, channel, count(*)::int AS n
                 FROM candidates WHERE week_start BETWEEN $1 AND $2 GROUP BY 1,2,3`, [fromWeek, toWeek]),
    sql.query(`SELECT platform, key, account_id, to_char(day - EXTRACT(DOW FROM day)::int,'YYYY-MM-DD') AS week_start,
                      SUM(amount)::float AS amount, array_agg(DISTINCT source) AS sources
                 FROM spend_raw WHERE day BETWEEN $1 AND $2 GROUP BY 1,2,3,4`, [fromWeek, addDays(toWeek, 6)]),
    sql.query(`SELECT client_id, to_char(week_start,'YYYY-MM-DD') AS week_start, channel, amount::float AS amount, updated_by
                 FROM spend_manual WHERE week_start BETWEEN $1 AND $2`, [fromWeek, toWeek]),
  ]);

  const key = (cid: number, w: string) => `${cid}|${w}`;
  const map = new Map<string, ClientWeek>();
  const get = (c: Client, w: string) => {
    const k = key(c.id, w);
    if (!map.has(k)) map.set(k, { client: c, weekStart: w, total: 0, byChannel: {}, spend: {}, spendTotal: null, missing: [],
      running: [], off: [], paidCandidates: 0, paidCPC: null, blendedCPC: null, channelCPC: {} });
    return map.get(k)!;
  };
  const byId = new Map(clients.map(c => [c.id, c]));

  for (const r of counts as any[]) {
    const c = byId.get(r.client_id); if (!c) continue;
    const cw = get(c, r.week_start);
    cw.byChannel[r.channel] = (cw.byChannel[r.channel] || 0) + r.n;
    cw.total += r.n;
  }

  const unmatched: Unmatched[] = [];
  for (const r of raw as any[]) {
    const { client, all } = matchSpend(r.platform, r.key, r.account_id, clients);
    if (!client || all.length > 1) unmatched.push({ platform: r.platform, key: r.key, accountId: r.account_id, weekStart: r.week_start,
      amount: r2(r.amount), matches: all.map(c => c.name) });
    if (!client) continue;
    const cw = get(client, r.week_start);
    const ch = r.platform as PaidChannel;
    const src = (r.sources as string[]).length > 1 ? "mixed" : (r.sources[0] as SpendCell["source"]);
    const prev = cw.spend[ch];
    cw.spend[ch] = { amount: r2((prev?.amount || 0) + r.amount), source: prev && prev.source !== src ? "mixed" : src };
  }
  for (const r of manual as any[]) {
    const c = byId.get(r.client_id); if (!c) continue;
    get(c, r.week_start).spend[r.channel as PaidChannel] = { amount: r2(r.amount), source: "manual", updatedBy: r.updated_by };
  }

  for (const cw of map.values()) classifyWeek(cw);

  const weeks = [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.client.name.localeCompare(b.client.name));
  return { weeks, unmatched: unmatched.sort((a, b) => b.amount - a.amount), clients };
}

/**
 * Decide, for one client-week, which paid channels were running and what CPC is.
 * - Spend above $0 in a week: the channel was running.
 * - Spend of exactly $0 entered: the channel was switched off that week.
 * - No spend at all: missing if the channel is switched on for this client (from its start week, or from the
 *   latest finished week if no start week is set), otherwise off.
 * Paid CPC uses only channels with spend, so a missing number never makes CPC look cheaper than it was.
 * Blended CPC (spend ÷ every candidate) is shown only when nothing is missing.
 */
function classifyWeek(cw: ClientWeek) {
  let total = 0, any = false;
  for (const ch of PAID_CHANNELS) {
    const s = cw.spend[ch];
    const n = cw.byChannel[ch] || 0;
    // Without a start week, only flag missing spend from the latest finished week on, never across history.
    const since = cw.client.channel_since?.[ch] ?? lastCompletedWeek();
    const switchedOn = cw.client.channels.includes(ch) && cw.weekStart >= since;
    if (s && s.amount > 0) {
      cw.running.push(ch);
      total += s.amount; any = true; cw.paidCandidates += n;
      cw.channelCPC[ch] = n ? r2(s.amount / n) : null;
    } else if (!s && switchedOn) {
      cw.running.push(ch); cw.missing.push(ch); cw.channelCPC[ch] = null;
    } else if (n) {
      cw.off.push(ch);
    }
  }
  cw.spendTotal = any ? r2(total) : null;
  cw.paidCPC = any && cw.paidCandidates ? r2(total / cw.paidCandidates) : null;
  cw.blendedCPC = any && !cw.missing.length && cw.total ? r2(total / cw.total) : null;
}

/** All weeks that have any candidates or spend, newest first. */
export async function availableWeeks(): Promise<string[]> {
  const rows = await db().query(
    `SELECT DISTINCT w FROM (
       SELECT to_char(week_start,'YYYY-MM-DD') AS w FROM candidates
       UNION SELECT to_char(day - EXTRACT(DOW FROM day)::int,'YYYY-MM-DD') FROM spend_raw
     ) x ORDER BY w DESC`);
  return (rows as any[]).map(r => r.w);
}

export async function positionsFor(clientId: number, weekStart: string) {
  const rows = await db().query(
    `SELECT COALESCE(p, '(none marked)') AS position, channel, count(*)::int AS n
       FROM candidates LEFT JOIN LATERAL unnest(CASE WHEN cardinality(positions) = 0 THEN ARRAY[NULL::text] ELSE positions END) AS p ON true
      WHERE client_id = $1 AND week_start = $2 GROUP BY 1,2`, [clientId, weekStart]);
  return rows as { position: string; channel: string; n: number }[];
}

/** A placeholder week for a client with no candidates or spend yet. */
export function blankWeek(client: Client, weekStart: string): ClientWeek {
  const cw: ClientWeek = { client, weekStart, total: 0, byChannel: {}, spend: {}, spendTotal: null, missing: [], running: [], off: [],
    paidCandidates: 0, paidCPC: null, blendedCPC: null, channelCPC: {} };
  classifyWeek(cw);
  return cw;
}
