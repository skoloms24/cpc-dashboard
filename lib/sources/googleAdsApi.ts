// Pulls daily cost for every client account under the Google Ads manager account.
import type { SpendRow } from "../parse/spend";

export const googleConfigured = () =>
  !!(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET &&
     process.env.GOOGLE_ADS_REFRESH_TOKEN && process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!, grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${j.error_description || j.error}`);
  return j.access_token;
}

async function search(token: string, customerId: string, query: string): Promise<any[]> {
  const ver = process.env.GOOGLE_ADS_API_VERSION || "v21";
  const out: any[] = [];
  let pageToken: string | undefined;
  do {
    const res = await fetch(`https://googleads.googleapis.com/${ver}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, ""),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, pageToken }),
    });
    const j = await res.json();
    if (!res.ok) {
      const detail = j.error?.details?.[0]?.errors?.[0]?.message || j.error?.message || res.status;
      throw new Error(`Google Ads API error for ${customerId}: ${detail}`);
    }
    out.push(...(j.results || []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

export async function fetchGoogleSpend(since: string, until: string): Promise<SpendRow[]> {
  const token = await accessToken();
  const manager = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, "");
  const accounts = await search(token, manager,
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status
       FROM customer_client WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'`);
  const rows: SpendRow[] = [];
  for (const a of accounts) {
    const id = String(a.customerClient.id), name = a.customerClient.descriptiveName || id;
    const res = await search(token, id,
      `SELECT segments.date, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`);
    for (const r of res) {
      const amount = Number(r.metrics?.costMicros || 0) / 1e6;
      if (amount > 0) rows.push({ platform: "Google", key: name, accountId: id, day: r.segments.date, amount: Math.round(amount * 100) / 100 });
    }
  }
  return rows;
}
