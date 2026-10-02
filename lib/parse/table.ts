import ExcelJS from "exceljs";
import Papa from "papaparse";

export type Cell = string | number | boolean | Date | null;
export type Table = Cell[][];

function normalizeExcelValue(v: unknown): Cell {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return normalizeExcelValue(o.result);          // formula
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join("");
    if ("text" in o) return String(o.text);                           // hyperlink
    if ("error" in o) return null;
  }
  return String(v);
}

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le"); // "CSV (Excel)" exports
  if (buf[0] === 0xfe && buf[1] === 0xff) { const s = Buffer.from(buf.subarray(2)); s.swap16(); return s.toString("utf16le"); }
  const text = buf.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Read the first sheet of an .xlsx, or a .csv/.tsv, into rows of cells. */
export async function readTable(buf: Buffer, filename: string): Promise<Table[]> {
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // xlsx files are zip archives
  if (isZip || /\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const tables: Table[] = [];
    wb.eachSheet(ws => {
      const rows: Table = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => {
        const vals = (row.values as unknown[]).slice(1).map(normalizeExcelValue);
        rows[n - 1] = vals;
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      tables.push(rows);
    });
    return tables;
  }
  if (/\.xls$/i.test(filename)) {
    throw new Error(`${filename} is an old .xls file. Set the report to send CSV or XLSX instead.`);
  }
  const parsed = Papa.parse<string[]>(decodeText(buf), { skipEmptyLines: false });
  return [parsed.data.map(r => r.map(c => (c === "" ? null : c)))];
}

export const clean = (c: Cell): string => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c)).trim();

export function findHeaderRow(t: Table, test: (cells: string[]) => boolean, maxScan = 40): number {
  for (let i = 0; i < Math.min(t.length, maxScan); i++) {
    if (test((t[i] || []).map(c => clean(c).toLowerCase()))) return i;
  }
  return -1;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** Read a date/time cell as written (no time zone shifting). Returns null if it isn't a date. */
export function readDateTime(c: Cell): { date: string; ts: string } | null {
  if (c == null || c === "") return null;
  if (c instanceof Date) {
    if (isNaN(+c)) return null;
    const date = `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())}`;
    return { date, ts: `${date} ${pad(c.getUTCHours())}:${pad(c.getUTCMinutes())}:${pad(c.getUTCSeconds())}` };
  }
  if (typeof c === "number") {
    if (c < 20000 || c > 80000) return null; // Excel serial date range sanity check
    const ms = Math.round((c - 25569) * 86400 * 1000);
    return readDateTime(new Date(ms));
  }
  const s = String(c).trim();
  let y: number, mo: number, d: number, h = 0, mi = 0, se = 0, m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
    [y, mo, d] = [+m[1], +m[2], +m[3]]; if (m[4]) [h, mi, se] = [+m[4], +m[5], +(m[6] || 0)];
  } else if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})(?:,? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?/i))) {
    mo = MONTHS[m[1].toLowerCase()]; if (!mo) return null;
    [y, d] = [+m[3], +m[2]]; if (m[4]) [h, mi, se] = [+m[4], +m[5], +(m[6] || 0)];
    if (m[7]) { const pm = m[7].toUpperCase() === "PM"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?/i))) {
    [mo, d, y] = [+m[1], +m[2], +m[3]]; if (m[4]) [h, mi, se] = [+m[4], +m[5], +(m[6] || 0)];
    if (m[7]) { const pm = m[7].toUpperCase() === "PM"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  return { date, ts: `${date} ${pad(h)}:${pad(mi)}:${pad(se)}` };
}

export function readMoney(c: Cell): number | null {
  if (c == null) return null;
  if (typeof c === "number") return c;
  const s = String(c).replace(/[$,\s]|USD/gi, "");
  if (s === "" || s === "--" || s === "-") return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}
