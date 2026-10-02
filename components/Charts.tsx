"use client";

import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

export type Series = { key: string; label: string; color: string };
type Row = Record<string, string | number | null>;

const axis = { stroke: "currentColor", tick: { fill: "currentColor", fontSize: 12 }, tickLine: false } as const;
const fmtMoney = (v: unknown) => (typeof v === "number" ? "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : "—");
const fmtInt = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US") : "—");
const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", fontSize: 13 },
  labelStyle: { color: "var(--muted)", fontWeight: 600 },
};

export function TrendLines({ data, series, money = true, height = 280 }: { data: Row[]; series: Series[]; money?: boolean; height?: number }) {
  if (!data.length || !series.length) return <p className="hint">Trends appear once there's more than one week of data.</p>;
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="week" {...axis} />
          <YAxis {...axis} width={money ? 64 : 44} tickFormatter={v => (money ? "$" + v : String(v))} />
          <Tooltip {...tooltipStyle} formatter={(v) => (money ? fmtMoney(v) : fmtInt(v))} />
          <Legend wrapperStyle={{ fontSize: 12.5 }} />
          {series.map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.25}
              dot={{ r: 3, fill: s.color, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StackedBars({ data, series, xKey, money = false, height = 280, horizontal = false }:
  { data: Row[]; series: Series[]; xKey: string; money?: boolean; height?: number; horizontal?: boolean }) {
  if (!data.length) return <p className="hint">No data for this week yet.</p>;
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={v => (money ? "$" + v : String(v))} />
              <YAxis type="category" dataKey={xKey} {...axis} width={170} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axis} />
              <YAxis {...axis} width={money ? 64 : 40} tickFormatter={v => (money ? "$" + v : String(v))} />
            </>
          )}
          <Tooltip {...tooltipStyle} cursor={{ fill: "currentColor", fillOpacity: 0.06 }} formatter={(v) => (money ? fmtMoney(v) : fmtInt(v))} />
          <Legend wrapperStyle={{ fontSize: 12.5 }} />
          {series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} isAnimationActive={false} maxBarSize={44} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
