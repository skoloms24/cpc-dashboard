import { Table, clean, findHeaderRow, readDateTime, readMoney } from "./table";

/** One job from Indeed's job performance export ("JobsCampaigns_YYYYMMDD_YYYYMMDD.csv"). Spend is the total for the export's date range. */
export type IndeedJob = { company: string; job: string; created: string | null; lastUpdated: string | null; open: boolean; spend: number };
export type IndeedExport = { rangeStart: string | null; rangeEnd: string | null; jobs: IndeedJob[] };

const header = (c: string[]) => c.includes("job") && c.includes("company name") && c.includes("spend") && (c.includes("apply starts") || c.includes("impressions"));
export const looksLikeIndeed = (t: Table) => findHeaderRow(t, header) >= 0;

/** Indeed puts the export's date range in the file name, e.g. JobsCampaigns_20250901_20250907.csv. */
export function rangeFromFilename(filename: string): { start: string; end: string } | null {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})[_-](\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return { start: `${m[1]}-${m[2]}-${m[3]}`, end: `${m[4]}-${m[5]}-${m[6]}` };
}

export function parseIndeed(t: Table, filename: string): IndeedExport {
  const hi = findHeaderRow(t, header);
  const h = (t[hi] || []).map(c => clean(c).toLowerCase());
  const col = (name: string) => h.indexOf(name);
  const [ji, ci, si, cri, ui, sti] = [col("job"), col("company name"), col("spend"), col("created"), col("last updated"), col("job status")];
  const jobs: IndeedJob[] = [];
  for (const r of t.slice(hi + 1)) {
    const company = clean(r?.[ci] ?? null), spend = readMoney(r?.[si] ?? null);
    if (!company || spend == null) continue;
    jobs.push({
      company, job: clean(r?.[ji] ?? null), spend,
      created: readDateTime(r?.[cri] ?? null)?.date ?? null,
      lastUpdated: readDateTime(r?.[ui] ?? null)?.date ?? null,
      open: sti >= 0 && /open|active/i.test(clean(r?.[sti] ?? null)),
    });
  }
  const range = rangeFromFilename(filename);
  return { rangeStart: range?.start ?? null, rangeEnd: range?.end ?? null, jobs };
}
