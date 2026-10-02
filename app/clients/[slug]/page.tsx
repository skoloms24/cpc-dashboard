import Link from "next/link";
import { notFound } from "next/navigation";
import { availableWeeks, loadWeeks, positionsFor, blankWeek } from "@/lib/metrics";
import { addDays, shortWeek, weekLabel } from "@/lib/week";
import { ALL_CHANNELS, CHANNEL_COLORS, PAID_CHANNELS, PaidChannel, isPaid } from "@/lib/channels";
import { money, int } from "@/lib/format";
import { WeekPicker } from "@/components/WeekPicker";
import { TrendLines, StackedBars } from "@/components/Charts";
import { SpendForm } from "@/components/Forms";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = { manual: "entered by hand", api: "from API", email: "from emailed report", upload: "from uploaded file", mixed: "from several sources" };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ week?: string }> }) {
  const { slug } = await params;
  const { week } = await searchParams;
  const weeks = await availableWeeks();
  const current = week && weeks.includes(week) ? week : weeks[0];
  if (!current) notFound();
  const from = addDays(current, -7 * 11);
  const { weeks: data, clients } = await loadWeeks(from, current);
  const client = clients.find(c => c.slug === slug);
  if (!client) notFound();

  const mine = data.filter(d => d.client.id === client.id);
  const cw = mine.find(d => d.weekStart === current) ?? blankWeek(client, current);
  const prev = mine.find(d => d.weekStart === addDays(current, -7));
  const positions = await positionsFor(client.id, current);

  const paidChannels = [...new Set([...client.channels.filter(isPaid), ...(Object.keys(cw.spend) as PaidChannel[])])]
    .sort((a, b) => PAID_CHANNELS.indexOf(a) - PAID_CHANNELS.indexOf(b));
  const sourceRows = [...paidChannels, ...ALL_CHANNELS.filter(ch => !isPaid(ch) && cw.byChannel[ch])];

  // Position × channel matrix
  const posNames = [...new Set(positions.map(p => p.position))].sort((a, b) =>
    a === "(none marked)" ? 1 : b === "(none marked)" ? -1 : a.localeCompare(b));
  const posChannels = ALL_CHANNELS.filter(ch => positions.some(p => p.channel === ch));
  const cell = (pos: string, ch: string) => positions.find(p => p.position === pos && p.channel === ch)?.n ?? 0;

  // Trends
  const weekList: string[] = [];
  for (let w = from; w <= current; w = addDays(w, 7)) weekList.push(w);
  const trendChannels = ALL_CHANNELS.filter(ch => mine.some(d => d.byChannel[ch]));
  const candTrend = weekList.map(w => {
    const d = mine.find(x => x.weekStart === w);
    const row: Record<string, string | number> = { week: shortWeek(w) };
    for (const ch of trendChannels) row[ch] = d?.byChannel[ch] || 0;
    return row;
  });
  const cpcChannels = PAID_CHANNELS.filter(ch => mine.some(d => d.channelCPC[ch] != null));
  const cpcTrend = weekList.map(w => {
    const d = mine.find(x => x.weekStart === w);
    const row: Record<string, string | number | null> = { week: shortWeek(w), Blended: d?.paidCPC ?? null };
    for (const ch of cpcChannels) row[ch] = d?.channelCPC[ch] ?? null;
    return row;
  }).filter(r => Object.entries(r).some(([k, v]) => k !== "week" && v != null));


  return (
    <main>
      <div className="pagehead">
        <div>
          <div className="eyebrow"><Link href={`/?week=${current}`}>Overview</Link> / Client</div>
          <h1>{client.name}</h1>
        </div>
        <WeekPicker weeks={weeks} current={current} basePath={`/clients/${client.slug}`} />
      </div>

      <div className="kpis">
        <div className="kpi"><div className="k">Candidates</div><div className="v">{int(cw.total)}</div>
          <div className="d">{prev ? `${cw.total - prev.total >= 0 ? "+" : ""}${cw.total - prev.total} vs prior week` : weekLabel(current)}</div></div>
        <div className="kpi"><div className="k">Ad spend</div><div className="v">{money(cw.spendTotal)}</div>
          <div className="d">{cw.missing.length ? `Missing ${cw.missing.join(" + ")}` : "All channels in"}</div></div>
        <div className="kpi"><div className="k">Paid CPC</div><div className="v">{money(cw.paidCPC)}</div>
          <div className="d">{prev?.paidCPC != null && cw.paidCPC != null ? `${money(prev.paidCPC)} prior week` : `${cw.paidCandidates} paid candidates`}</div></div>
        <div className="kpi"><div className="k">Blended CPC</div><div className="v">{money(cw.blendedCPC)}</div>
          <div className="d">Spend ÷ all candidates</div></div>
      </div>

      <div className="stack">
        <section className="section">
          <div className="section-head"><h2>By source</h2><span className="tag">Type spend into any box; it saves when you click away</span></div>
          <div className="tablebox">
            <table>
              <thead><tr><th>Source</th><th className="r">Candidates</th><th className="r">Spend</th><th className="r">CPC</th></tr></thead>
              <tbody>
                {sourceRows.map(ch => {
                  const paid = isPaid(ch);
                  const s = paid ? cw.spend[ch] : undefined;
                  return (
                    <tr key={ch}>
                      <td><span className="swatch" style={{ background: CHANNEL_COLORS[ch] }} />{ch}
                        {s && <div className="tag">{SOURCE_LABEL[s.source] ?? s.source}{s.updatedBy ? ` · ${s.updatedBy}` : ""}</div>}</td>
                      <td className="r big">{cw.byChannel[ch] || 0}</td>
                      <td className="r">{paid
                        ? <SpendForm key={`${current}-${ch}-${s?.amount ?? "x"}`} clientId={client.id} week={current} channel={ch} amount={s?.amount ?? null} missing={!s} label={`${ch} spend`} />
                        : <span className="dim">no spend</span>}</td>
                      <td className="r big">{paid ? money(cw.channelCPC[ch] ?? null) : <span className="dim">—</span>}</td>
                    </tr>
                  );
                })}
                <tr><td className="strong">Total</td><td className="r big">{cw.total}</td><td className="r big">{money(cw.spendTotal)}</td><td className="r big">{money(cw.paidCPC)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>By position</h2>
            <span className="tag">Someone interested in two positions counts in both</span></div>
          {posNames.length ? (
            <div className="tablebox">
              <table>
                <thead><tr><th>Position</th>{posChannels.map(ch => <th key={ch} className="r">{ch}</th>)}<th className="r">Total</th></tr></thead>
                <tbody>
                  {posNames.map(p => {
                    const t = posChannels.reduce((a, ch) => a + cell(p, ch), 0);
                    return (
                      <tr key={p}><td className={p === "(none marked)" ? "dim" : ""}>{p}</td>
                        {posChannels.map(ch => { const n = cell(p, ch); return <td key={ch} className={`r num${n ? "" : " zero"}`}>{n}</td>; })}
                        <td className="r big">{t}</td></tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">No candidates this week.</div>}
        </section>
      </div>

      <div className="grid2">
        <section className="card">
          <div><h3>Candidates per week</h3><p className="hint">By source, last 12 weeks</p></div>
          <StackedBars data={candTrend} xKey="week" series={trendChannels.map(ch => ({ key: ch, label: ch, color: CHANNEL_COLORS[ch] }))} />
        </section>
        <section className="card">
          <div><h3>Cost per candidate</h3><p className="hint">Each paid channel and the paid total</p></div>
          <TrendLines data={cpcTrend} series={[
            ...cpcChannels.map(ch => ({ key: ch, label: ch, color: CHANNEL_COLORS[ch] })),
            { key: "Blended", label: "All paid", color: "#5d6b7c" },
          ]} />
        </section>
      </div>
    </main>
  );
}
