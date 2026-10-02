import { redirect } from "next/navigation";
import { auth, isAdmin } from "@/auth";
import { db, getClients } from "@/lib/db";
import { loadWeeks } from "@/lib/metrics";
import { addDays, lastCompletedWeek, weekLabel } from "@/lib/week";
import { money } from "@/lib/format";
import { outlookConfigured } from "@/lib/sources/outlook";
import { metaConfigured } from "@/lib/sources/metaApi";
import { googleConfigured } from "@/lib/sources/googleAdsApi";
import { RunImportButton, UploadForm, ClientForm, AssignForm, BackfillForm } from "@/components/Forms";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/");

  const clients = await getClients(true);
  const latest = lastCompletedWeek();
  const { unmatched: unmatchedWeeks } = await loadWeeks(addDays(latest, -51 * 7), latest);
  // One row per campaign/account, totalled across weeks
  const grouped = new Map<string, { platform: string; key: string; amount: number; weeks: number; last: string; matches: string[] }>();
  for (const u of unmatchedWeeks) {
    const k = `${u.platform}|${u.key}`;
    const g = grouped.get(k) ?? { platform: u.platform, key: u.key, amount: 0, weeks: 0, last: u.weekStart, matches: u.matches };
    g.amount += u.amount; g.weeks += 1; if (u.weekStart > g.last) g.last = u.weekStart;
    grouped.set(k, g);
  }
  const unmatched = [...grouped.values()].sort((a, b) => b.amount - a.amount);
  const log = (await db().query(`SELECT ran_at, trigger, source, status, message FROM import_log ORDER BY ran_at DESC LIMIT 25`)) as any[];

  const sources = [
    { name: "Outlook report emails", on: outlookConfigured(), note: outlookConfigured() ? `${process.env.GRAPH_MAILBOX} → “${process.env.GRAPH_FOLDER || "CPC Reports"}” folder` : "Optional. Without it, upload the weekly exports below." },
    { name: "Meta API", on: metaConfigured(), note: "Daily campaign spend, replaces the emailed Meta report" },
    { name: "Google Ads API", on: googleConfigured(), note: "Daily cost for every account under the manager account" },
  ];

  return (
    <main>
      <div className="pagehead"><div><div className="eyebrow">Settings</div><h1>Admin</h1></div></div>

      <section className="section">
        <h2>Data sources</h2>
        <div className="tablebox">
          <table>
            <tbody>
              {sources.map(s => (
                <tr key={s.name}><td className="strong">{s.name}</td>
                  <td>{s.on ? <span className="pill good">Connected</span> : <span className="pill neutral">Not set up</span>}</td>
                  <td className="wrap dim">{s.note}</td></tr>
              ))}
              <tr><td className="strong">Indeed</td><td><span className="pill neutral">Entered by hand</span></td>
                <td className="wrap dim">Type each week&apos;s Indeed spend on the client page</td></tr>
            </tbody>
          </table>
        </div>
        <p className="hint">The import runs by itself every Monday around 9 AM Pacific and pulls the last two full weeks.</p>
      </section>

      <div className="grid2">
        <section className="card">
          <div><h3>Run import now</h3><p className="hint">Reads new report emails and pulls API spend for the last two weeks.</p></div>
          <RunImportButton />
        </section>
        <section className="card">
          <div><h3>Upload report files</h3><p className="hint">Drop in any mix of files, any date range; everything is split into Sunday–Saturday weeks. Zoho candidate exports, Meta reports (Campaign name, Day, Amount spent), Google Ads reports (Account, Day, Cost), or a spend sheet with columns Client, Week, Channel, Amount (for Indeed and other past spend). CSV or XLSX.</p></div>
          <UploadForm clients={clients.map(c => ({ id: c.id, name: c.name }))} />
        </section>
      </div>

      <section className="card">
        <div><h3>Backfill history</h3><p className="hint">To fill in past weeks: upload an all-time Zoho export for each client (Created Time from the start, same columns as the weekly report), then either pull past Meta and Google spend from the APIs below or upload all-time Meta and Google reports. Add Indeed history with a spend sheet (<a href="/templates/spend-sheet-template.csv">template</a>). Re-uploading a week replaces it, so nothing is double counted.</p></div>
        <BackfillForm defaultSince="2025-01-01" />
      </section>

      <section className="section">
        <div className="section-head"><h2>Spend that needs a client</h2><span className="tag">Last 12 months</span></div>
        {unmatched.length ? (
          <div className="tablebox">
            <table>
              <thead><tr><th>Platform</th><th>Campaign or account</th><th>Latest week</th><th className="r">Weeks</th><th className="r">Spend</th><th>Problem</th><th></th></tr></thead>
              <tbody>
                {unmatched.map((u, i) => (
                  <tr key={i}>
                    <td>{u.platform}</td><td className="wrap strong">{u.key}</td><td className="dim">{weekLabel(u.last)}</td>
                    <td className="r num">{u.weeks}</td><td className="r num">{money(u.amount)}</td>
                    <td className="wrap">{u.matches.length > 1 ? <span className="pill warn">Matches {u.matches.join(" and ")}</span> : <span className="pill bad">No client</span>}</td>
                    <td><AssignForm platform={u.platform} k={u.key} clients={clients.map(c => ({ id: c.id, name: c.name }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">Every Meta campaign and Google account with spend is matched to a client.</div>}
      </section>

      <section className="section">
        <h2>Clients</h2>
        {clients.map(c => (
          <details key={c.id} className="card">
            <summary>{c.name} {!c.active && <span className="pill neutral">Inactive</span>} <span className="tag">{c.channels.join(" · ") || "no paid channels"}</span></summary>
            <ClientForm c={{ ...c }} />
          </details>
        ))}
        <details className="card">
          <summary>Add a client</summary>
          <ClientForm />
        </details>
      </section>

      <section className="section">
        <h2>Import history</h2>
        {log.length ? (
          <div className="tablebox">
            <table>
              <thead><tr><th>When</th><th>Source</th><th>Result</th><th>Details</th></tr></thead>
              <tbody>
                {log.map((l, i) => (
                  <tr key={i}>
                    <td className="dim">{new Date(l.ran_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{l.source}<div className="tag">{l.trigger}</div></td>
                    <td><span className={`pill ${l.status === "ok" ? "good" : l.status === "error" ? "bad" : "neutral"}`}>{l.status}</span></td>
                    <td className="wrap"><pre className="log">{l.message}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">Nothing imported yet.</div>}
      </section>
    </main>
  );
}
