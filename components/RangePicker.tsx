import Link from "next/link";
import { RANGES, RangeKey } from "@/lib/range";

export function RangePicker({ current, basePath, week }: { current: RangeKey; basePath: string; week: string }) {
  return (
    <div className="seg" role="group" aria-label="Chart range">
      {RANGES.map(r => (
        <Link key={r.key} href={`${basePath}?week=${week}&range=${r.key}`} aria-current={r.key === current ? "true" : undefined}
          className={r.key === current ? "on" : ""} scroll={false}>{r.label}</Link>
      ))}
    </div>
  );
}
