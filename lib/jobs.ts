import { logImport } from "./db";
import { importSpend } from "./importer";
import { addDays, lastCompletedWeek } from "./week";
import { outlookConfigured, ingestOutlook } from "./sources/outlook";
import { metaConfigured, fetchMetaSpend } from "./sources/metaApi";
import { googleConfigured, fetchGoogleSpend } from "./sources/googleAdsApi";

export type JobResult = { source: string; status: "ok" | "skipped" | "error"; message: string };

/** Pull API spend for any past date range, in 90-day chunks (Meta keeps about 37 months of history). */
export async function backfillApis(since: string, trigger: "manual"): Promise<JobResult[]> {
  const until = addDays(lastCompletedWeek(), 6);
  const results: JobResult[] = [];
  for (const [source, configured, fetcher] of [
    ["meta-api", metaConfigured(), fetchMetaSpend],
    ["google-api", googleConfigured(), fetchGoogleSpend],
  ] as const) {
    let r: JobResult;
    if (!configured) r = { source, status: "skipped", message: "API keys not added yet." };
    else {
      try {
        const lines: string[] = [];
        for (let a = since; a <= until; a = addDays(a, 90)) {
          const b = addDays(a, 89) < until ? addDays(a, 89) : until;
          lines.push(await importSpend(await fetcher(a, b), "api"));
        }
        r = { source, status: "ok", message: `Backfill since ${since}:\n` + lines.join("\n") };
      } catch (e) { r = { source, status: "error", message: (e as Error).message }; }
    }
    results.push(r);
    await logImport(trigger, source, r.status, r.message);
  }
  return results;
}

/** Pull everything for the last two completed weeks (re-pulling catches late spend adjustments). */
export async function runWeekly(trigger: "cron" | "manual"): Promise<JobResult[]> {
  const until = addDays(lastCompletedWeek(), 6);
  const since = addDays(lastCompletedWeek(), -7);
  const results: JobResult[] = [];

  const step = async (source: string, configured: boolean, why: string, fn: () => Promise<string>) => {
    let r: JobResult;
    if (!configured) r = { source, status: "skipped", message: why };
    else {
      try { r = { source, status: "ok", message: await fn() }; }
      catch (e) { r = { source, status: "error", message: (e as Error).message }; }
    }
    results.push(r);
    await logImport(trigger, source, r.status, r.message);
  };

  await step("outlook", outlookConfigured(), "Outlook mailbox settings not added yet.", async () => {
    const lines = await ingestOutlook(10);
    return lines.length ? lines.join("\n") : "No new report emails.";
  });
  await step("meta-api", metaConfigured(), "Meta API keys not added yet; using emailed reports.", async () =>
    importSpend(await fetchMetaSpend(since, until), "api"));
  await step("google-api", googleConfigured(), "Google Ads API keys not added yet; using emailed reports.", async () =>
    importSpend(await fetchGoogleSpend(since, until), "api"));
  return results;
}
