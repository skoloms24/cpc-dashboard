// Runs every file in fixtures/ through the report parsers and prints a summary.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { parseReportFile } from "../lib/parse/detect";
import { channelFor } from "../lib/channels";
import { weekStartOf } from "../lib/week";

(async () => {
  if (!existsSync("fixtures")) { console.log("No fixtures/ folder; add sample exports to test."); return; }
  for (const f of readdirSync("fixtures").sort()) {
    const p = await parseReportFile(readFileSync(`fixtures/${f}`), f);
    if (p.kind === "zoho") {
      const r = p.report, by: Record<string, number> = {}, pos: Record<string, number> = {}, weeks = new Set<string>();
      for (const c of r.candidates) {
        by[channelFor(c.utmSource)] = (by[channelFor(c.utmSource)] || 0) + 1;
        for (const x of c.positions) pos[x] = (pos[x] || 0) + 1;
        weeks.add(weekStartOf(c.date));
      }
      console.log(`${f}: ZOHO org="${r.org}" n=${r.candidates.length} weeks=${[...weeks]} channels=${JSON.stringify(by)} positions=${JSON.stringify(pos)}`);
    } else if (p.kind === "spend") {
      const tot: Record<string, number> = {};
      for (const r of p.rows) tot[r.key] = Math.round(((tot[r.key] || 0) + r.amount) * 100) / 100;
      console.log(`${f}: ${p.platform} rows=${p.rows.length} totals=${JSON.stringify(tot)}`);
    } else if (p.kind === "sheet") {
      console.log(`${f}: SPEND SHEET rows=${p.rows.length} first=${JSON.stringify(p.rows[0])}`);
    } else console.log(`${f}: UNKNOWN (${p.reason})`);
  }
})();
