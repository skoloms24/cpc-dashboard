import Link from "next/link";
import { availableWeeks, loadWeeks, blankWeek, ClientWeek } from "@/lib/metrics";
import { addDays, weekLabel, lastCompletedWeek } from "@/lib/week";
import { ALL_CHANNELS, CHANNEL_COLORS, PAID_CHANNELS } from "@/lib/channels";
import { money, int } from "@/lib/format";
import { clientColor } from "@/lib/palette";
import { WeekPicker } from "@/components/WeekPicker";
import { RangePicker } from "@/components/RangePicker";
import { parseRange, rangeStart, weekTick, RANGES } from "@/lib/range";
import { TrendLines, StackedBars } from "@/components/Charts";

export const dynamic = "force-dynamic";

function Status({ cw }: { cw: ClientWeek }) {
  if (cw.total === 0 && cw.spendTotal == null) return <span className="pill neutral">No data</span>;
  if (cw.total === 0) return <span className="pill warn">No Zoho report</span>;
  if (cw.missing.length) return <span className="pill warn">Needs {cw.missing.join(" + ")} spend</span>;
  return <span className="pill good">Complete</span>;
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ week?: string; range?: string }> }) {
  const weeks = await availableWeeks();
  if (!weeks.length) {
    return (
      <main>
        <div className="pagehead"><div><div className="eyebrow">Weekly cost per candidate</div><h1>Overview</h1></div></div>
        <div className="empty"><strong>No data yet</strong>The first numbers arrive Monday morning from the Outlook reports. An admin can also upload the Zoho, Meta and Google exports on the Admin page.</div>
      </main>
    );
  }
  const sp = await searchParams;
  // Default to the last finished week; the week in progress is one click forward.
  const current = sp.week && weeks.includes(sp.week) ? sp.week : (weeks.find(w => w <= lastCompletedWeek()) ?? weeks[0]);
  const range = parseRange(sp.range);
  const from = rangeStart(range, current, weeks[weeks.length - 1]);
  const prevWeekStart = addDays(current, -7);
  const { weeks: data, clients } = await loadWeeks(from < prevWeekStart ? from : prevWeekStart, current);

  const thisWeek = clients.map(c => data.find(d => d.client.id === c.id && d.weekStart === current) ?? blankWeek(c, current));
  const prev = new Map(data.filter(d => d.weekStart === prevWeekStart).map(d => [d.client.id, d]));

  const totalCands = thisWeek.reduce((a, c) => a + c.total, 0);
  const prevCands = [...prev.values()].reduce((a, c) => a + c.total, 0);
  const withSpend = thisWeek.filter(c => c.spendTotal != null);
  const totalSpend = withSpend.reduce((a, c) => a + (c.spendTotal || 0), 0);
  const paidCands = withSpend.reduce((a, c) => a + c.paidCandidates, 0);
  const needs = thisWeek.filter(c => c.missing.length || c.total === 0).length;

  // Chart: paid CPC per client per week across the chosen range, plus all clients combined
  const weekList: string[] = [];
  for (let w = from; w <= current; w = addDays(w, 7)) weekList.push(w);
  const long = weekList.length > 52;
  const activeClients = clients.filter(c => data.some(d => d.client.id === c.id && d.paidCPC != null));
  const cpcTrend = weekList
    .map(w => {
      const row: Record<string, string | number | null> = { week: weekTick(w, long) };
      let spend = 0, cands = 0, any = false;
      for (const c of activeClients) {
        const d = data.find(x => x.client.id === c.id && x.weekStart === w);
        row[c.slug] = d?.paidCPC ?? null;
        if (d?.paidCPC != null) { any = true; spend += d.spendTotal || 0; cands += d.paidCandidates; }
      }
      row.__all = any && cands ? Math.round((spend / cands) * 100) / 100 : null;
      return any ? row : null;
    })
    .filter((r): r is Record<string, string | number | null> => !!r);
  const clientSeries = [
    { key: "__all", label: "All clients", color: "#5d6b7c", dashed: true, width: 2.5 },
    ...activeClients.map((c, i) => ({ key: c.slug, label: c.name, color: clientColor(i) })),
  ];
  const firstWithData = cpcTrend.length ? weekList.find(w => weekTick(w, long) === cpcTrend[0].week) : undefined;
  const rangeLabel = RANGES.find(r => r.key === range)!.label;

  // Chart: candidates by source this week
  const channelsPresent = ALL_CHANNELS.filter(ch => thisWeek.some(c => c.byChannel[ch]));
  const bySource = thisWeek.filter(c => c.total).map(c => {
    const row: Record<string, string | number> = { client: c.client.name };
    for (const ch of channelsPresent) row[ch] = c.byChannel[ch] || 0;
    return row;
  });

  return (
    <main>
      <div className="pagehead">
        <div><div className="eyebrow">Weekly cost per candidate · Sun–Sat</div><h1>Overview</h1></div>
        <WeekPicker weeks={weeks} current={current} basePath="/" extra={`&range=${range}`} />
      </div>

      <div className="kpis">
        <div className="kpi"><div className="k">Candidates</div><div className="v">{int(totalCands)}</div>
          <div className="d">{prev.size ? `${totalCands - prevCands >= 0 ? "+" : ""}${totalCands - prevCands} vs prior week` : "All clients"}</div></div>
        <div className="kpi"><div className="k">Ad spend</div><div className="v">{withSpend.length ? money(totalSpend, 0) : "—"}</div>
          <div className="d">{withSpend.length} of {thisWeek.length} clients reported</div></div>
        <div className="kpi"><div className="k">Paid CPC</div><div className="v">{paidCands && withSpend.length ? money(totalSpend / paidCands) : "—"}</div>
          <div className="d">Spend ÷ candidates from paid sources</div></div>
        <div className="kpi"><div className="k">Need attention</div><div className="v">{needs}</div>
          <div className="d">{needs ? "Missing spend or Zoho report" : "Every client is complete"}</div></div>
      </div>

      <section className="card">
        <div className="card-head">
          <div><h3>Paid CPC over time</h3>
            <p className="hint">{range === "all" && firstWithData ? `Every week since ${new Date(firstWithData + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : rangeLabel} through {weekLabel(current)} · dashed line is all clients combined</p></div>
          <RangePicker current={range} basePath="/" week={current} />
        </div>
        <TrendLines data={cpcTrend} series={clientSeries} height={320} />
      </section>

      <section className="section">
        <div className="section-head"><h2>Clients, {weekLabel(current)}</h2></div>
        <div className="tablebox">
          <table>
            <thead><tr>
              <th>Client</th><th className="r">Candidates</th>
              {PAID_CHANNELS.map(ch => <th key={ch} className="r">{ch} CPC</th>)}
              <th className="r">Spend</th><th className="r">Paid CPC</th><th className="r">Blended CPC</th><th>Status</th>
            </tr></thead>
            <tbody>
              {thisWeek.map(cw => {
                const p = prev.get(cw.client.id);
                const delta = p ? cw.total - p.total : null;
                return (
                  <tr key={cw.client.id}>
                    <td className="strong"><Link href={`/clients/${cw.client.slug}?week=${current}&range=${range}`}>{cw.client.name}</Link></td>
                    <td className="r"><span className="big">{cw.total}</span>{delta != null && <span className="tag"> {delta >= 0 ? "+" : ""}{delta}</span>}</td>
                    {PAID_CHANNELS.map(ch => (
                      <td key={ch} className="r num">{ch in cw.channelCPC ? (cw.channelCPC[ch] == null ? <span className="dim">{cw.spend[ch] ? "—" : "needs spend"}</span> : money(cw.channelCPC[ch]!)) : <span className="zero">·</span>}</td>
                    ))}
                    <td className="r num">{money(cw.spendTotal)}</td>
                    <td className="r big">{money(cw.paidCPC)}</td>
                    <td className="r num">{money(cw.blendedCPC)}</td>
                    <td><Status cw={cw} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div>
        <section className="card">
          <div><h3>Candidates by source</h3><p className="hint">{weekLabel(current)}</p></div>
          <StackedBars data={bySource} xKey="client" horizontal height={Math.max(200, 70 + bySource.length * 48)}
            series={channelsPresent.map(ch => ({ key: ch, label: ch, color: CHANNEL_COLORS[ch] }))} />
        </section>
      </div>
    </main>
  );
}
