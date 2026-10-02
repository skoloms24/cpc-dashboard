export const money = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const int = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
export const pctChange = (now: number | null, prev: number | null) =>
  now == null || prev == null || prev === 0 ? null : Math.round(((now - prev) / prev) * 100);
