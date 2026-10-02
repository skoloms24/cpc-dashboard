import { logImport } from "./db";
import { importSpend } from "./importer";
import { addDays, lastCompletedWeek } from "./week";
import { outlookConfigured, ingestOutlook } from "./sources/outlook";
import { metaConfigured, fetchMetaSpend } from "./sources/metaApi";
import { googleConfigured, fetchGoogleSpend } from "./sources/googleAdsApi";

export type JobResult = { source: string; status: "ok" | "skipped" | "error"; message: string };

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
