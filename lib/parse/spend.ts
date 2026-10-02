import { Table, clean, findHeaderRow, readDateTime, readMoney } from "./table";

export type SpendRow = { platform: "Meta" | "Google" | "Indeed"; key: string; accountId: string | null; day: string; amount: number };

/** Index of the first column matching the patterns, trying patterns in priority order. */
const idx = (cells: string[], ...names: RegExp[]) => {
  for (const n of names) { const i = cells.findIndex(c => n.test(c)); if (i >= 0) return i; }
  return -1;
};

// ---------- Meta Ads Manager export: Campaign name, Day, Amount spent (USD) ----------
const metaHeader = (c: string[]) => idx(c, /^campaign name$/) >= 0 && idx(c, /^amount spent/) >= 0;
export const looksLikeMeta = (t: Table) => findHeaderRow(t, metaHeader) >= 0;

export function parseMeta(t: Table): SpendRow[] {
  const hi = findHeaderRow(t, metaHeader);
  const h = (t[hi] || []).map(c => clean(c).toLowerCase());
  const camp = idx(h, /^campaign name$/), amt = idx(h, /^amount spent/);
  const day = idx(h, /^day$/, /^date$/, /^reporting starts$/);
  const acct = idx(h, /^account id$/, /^ad account id$/);
  if (day < 0) throw new Error("Meta report needs a Day column (add Day as a breakdown).");
  const out: SpendRow[] = [];
  for (const r of t.slice(hi + 1)) {
    const key = clean(r?.[camp] ?? null);
    const d = readDateTime(r?.[day] ?? null);
    const a = readMoney(r?.[amt] ?? null);
    if (!key || !d || a == null) continue;
    out.push({ platform: "Meta", key, accountId: acct >= 0 ? clean(r[acct] ?? null) || null : null, day: d.date, amount: a });
  }
  return merge(out);
}

// ---------- Google Ads report: Account (name), Day, Cost ----------
const googleHeader = (c: string[]) =>
  idx(c, /^account( name)?$/) >= 0 && idx(c, /^cost$/, /^cost \(.*\)$/) >= 0 && idx(c, /^day$/, /^date$/) >= 0;
export const looksLikeGoogle = (t: Table) => findHeaderRow(t, googleHeader) >= 0;

export function parseGoogle(t: Table): SpendRow[] {
  const hi = findHeaderRow(t, googleHeader);
  const h = (t[hi] || []).map(c => clean(c).toLowerCase());
  const acct = idx(h, /^account( name)?$/), cost = idx(h, /^cost$/, /^cost \(.*\)$/), day = idx(h, /^day$/, /^date$/);
  const cid = idx(h, /^customer id$/);
  const out: SpendRow[] = [];
  for (const r of t.slice(hi + 1)) {
    const key = clean(r?.[acct] ?? null);
    const d = readDateTime(r?.[day] ?? null);
    const a = readMoney(r?.[cost] ?? null);
    if (!key || /^total/i.test(key) || !d || a == null) continue;
    out.push({ platform: "Google", key, accountId: cid >= 0 ? clean(r[cid] ?? null).replace(/-/g, "") || null : null, day: d.date, amount: a });
  }
  return merge(out);
}

/** Combine duplicate (platform, key, day) rows. */
function merge(rows: SpendRow[]): SpendRow[] {
  const m = new Map<string, SpendRow>();
  for (const r of rows) {
    const k = `${r.platform}|${r.key}|${r.day}`;
    const e = m.get(k);
    if (e) e.amount = Math.round((e.amount + r.amount) * 100) / 100; else m.set(k, { ...r });
  }
  return [...m.values()];
}
