import { addDays } from "./week";

export const RANGES = [
  { key: "12w", label: "12 weeks", weeks: 12 },
  { key: "6m", label: "6 months", weeks: 26 },
  { key: "1y", label: "1 year", weeks: 52 },
  { key: "all", label: "All time", weeks: null },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export function parseRange(v?: string): RangeKey {
  return (RANGES.find(r => r.key === v)?.key ?? "12w") as RangeKey;
}

/** First week shown for a range ending at `current`. `earliest` is the oldest week with any data. */
export function rangeStart(range: RangeKey, current: string, earliest: string): string {
  const r = RANGES.find(x => x.key === range)!;
  if (r.weeks == null) return earliest < current ? earliest : current;
  return addDays(current, -7 * (r.weeks - 1));
}

/** Axis label for a week: "Sep 20" for short ranges, "9/20/25" once the chart spans more than a year's worth of labels. */
export function weekTick(weekStart: string, long: boolean): string {
  const d = new Date(weekStart + "T12:00:00Z");
  return long
    ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
