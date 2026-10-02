// Weeks run Sunday through Saturday. Dates are plain "YYYY-MM-DD" strings so time zones never shift them.

export type ISODate = string;

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Sunday that starts the week containing this date. */
export function weekStartOf(iso: ISODate): ISODate {
  const d = new Date(iso + "T00:00:00Z");
  return addDays(iso, -d.getUTCDay());
}

export function weekEndOf(weekStart: ISODate): ISODate {
  return addDays(weekStart, 6);
}

/** Today's date in a time zone, as YYYY-MM-DD. */
export function todayIn(tz = "America/Los_Angeles", now = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The most recent Sunday–Saturday week that has fully ended. */
export function lastCompletedWeek(tz = "America/Los_Angeles", now = new Date()): ISODate {
  return addDays(weekStartOf(todayIn(tz, now)), -7);
}

export function weekLabel(weekStart: ISODate): string {
  const a = new Date(weekStart + "T12:00:00Z");
  const b = new Date(weekEndOf(weekStart) + "T12:00:00Z");
  const m = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${m(a)} ${a.getUTCDate()}–${b.getUTCDate()}, ${b.getUTCFullYear()}`
    : `${m(a)} ${a.getUTCDate()} – ${m(b)} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
}

export function shortWeek(weekStart: ISODate): string {
  const a = new Date(weekStart + "T12:00:00Z");
  return a.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
