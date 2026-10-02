import { readTable } from "./table";
import { looksLikeZoho, parseZoho, ZohoReport } from "./zoho";
import { looksLikeMeta, looksLikeGoogle, parseMeta, parseGoogle, SpendRow } from "./spend";

export type ParsedReport =
  | { kind: "zoho"; filename: string; report: ZohoReport }
  | { kind: "spend"; filename: string; platform: "Meta" | "Google"; rows: SpendRow[] }
  | { kind: "unknown"; filename: string; reason: string };

export async function parseReportFile(buf: Buffer, filename: string): Promise<ParsedReport> {
  let tables;
  try { tables = await readTable(buf, filename); }
  catch (e) { return { kind: "unknown", filename, reason: (e as Error).message }; }
  for (const t of tables) {
    if (looksLikeZoho(t)) return { kind: "zoho", filename, report: parseZoho(t) };
    if (looksLikeMeta(t)) return { kind: "spend", filename, platform: "Meta", rows: parseMeta(t) };
    if (looksLikeGoogle(t)) return { kind: "spend", filename, platform: "Google", rows: parseGoogle(t) };
  }
  return { kind: "unknown", filename, reason: "Not a Zoho candidate report, Meta spend report, or Google Ads cost report." };
}
