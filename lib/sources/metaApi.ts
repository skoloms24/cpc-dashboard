// Pulls daily campaign spend from the Meta Marketing API.
import type { SpendRow } from "../parse/spend";

export const metaConfigured = () => !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_IDS);

export async function fetchMetaSpend(since: string, until: string): Promise<SpendRow[]> {
  const ver = process.env.META_API_VERSION || "v23.0";
  const ids = process.env.META_AD_ACCOUNT_IDS!.split(",").map(s => s.trim().replace(/^act_/, "")).filter(Boolean);
  const rows: SpendRow[] = [];
  for (const id of ids) {
    const params = new URLSearchParams({
      level: "campaign",
      fields: "campaign_name,spend,account_id",
      time_increment: "1",
      time_range: JSON.stringify({ since, until }),
      limit: "500",
      access_token: process.env.META_ACCESS_TOKEN!,
    });
    let url: string | null = `https://graph.facebook.com/${ver}/act_${id}/insights?${params}`;
    while (url) {
      const res: Response = await fetch(url);
      const j: any = await res.json();
      if (!res.ok) throw new Error(`Meta API error for act_${id}: ${j.error?.message || res.status}`);
      for (const r of j.data || []) {
        const amount = Number(r.spend);
        if (!r.campaign_name || !isFinite(amount)) continue;
        rows.push({ platform: "Meta", key: r.campaign_name, accountId: r.account_id || id, day: r.date_start, amount });
      }
      url = j.paging?.next || null;
    }
  }
  return rows;
}
