import { Table, clean, findHeaderRow, readDateTime, readMoney } from "./table";

/** A hand-kept spend sheet: one row per client, week (or any date in it), channel, amount. Used for Indeed history and past numbers. */
export type SheetSpendRow = { client: string; date: string; channel: string; amount: number };

const has = (c: string[], ...re: RegExp[]) => re.some(r => c.some(x => r.test(x)));
const header = (c: string[]) =>
  has(c, /^client( name)?$/) && has(c, /^channel$/, /^source$/, /^platform$/) && has(c, /^(amount|spend|cost)( \(.*\))?$/) &&
  has(c, /^week( start(ing)?| of)?$/, /^date$/, /^day$/);
export const looksLikeSpendSheet = (t: Table) => findHeaderRow(t, header) >= 0;

export function parseSpendSheet(t: Table): SheetSpendRow[] {
  const hi = findHeaderRow(t, header);
  const h = (t[hi] || []).map(c => clean(c).toLowerCase());
  const find = (...re: RegExp[]) => { for (const r of re) { const i = h.findIndex(x => r.test(x)); if (i >= 0) return i; } return -1; };
  const ci = find(/^client( name)?$/), chi = find(/^channel$/, /^source$/, /^platform$/);
  const ai = find(/^(amount|spend|cost)( \(.*\))?$/), wi = find(/^week( start(ing)?| of)?$/, /^date$/, /^day$/);
  const out: SheetSpendRow[] = [];
  for (const r of t.slice(hi + 1)) {
    const client = clean(r?.[ci] ?? null), channel = clean(r?.[chi] ?? null);
    const d = readDateTime(r?.[wi] ?? null), amount = readMoney(r?.[ai] ?? null);
    if (!client || !channel || !d || amount == null) continue;
    out.push({ client, date: d.date, channel, amount });
  }
  return out;
}
