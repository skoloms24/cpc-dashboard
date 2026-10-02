import Link from "next/link";
import { weekLabel } from "@/lib/week";

export function WeekPicker({ weeks, current, basePath, extra = "" }: { weeks: string[]; current: string; basePath: string; extra?: string }) {
  const i = weeks.indexOf(current); // weeks are newest first
  const older = weeks[i + 1], newer = i > 0 ? weeks[i - 1] : undefined;
  return (
    <div className="weekpick" aria-label="Week">
      {older ? <Link href={`${basePath}?week=${older}${extra}`} aria-label="Previous week">←</Link> : <span className="off">←</span>}
      <div className="label">{weekLabel(current)}</div>
      {newer ? <Link href={`${basePath}?week=${newer}${extra}`} aria-label="Next week">→</Link> : <span className="off">→</span>}
    </div>
  );
}
