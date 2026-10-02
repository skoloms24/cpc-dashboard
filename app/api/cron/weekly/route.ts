import { NextResponse } from "next/server";
import { runWeekly } from "@/lib/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Vercel Cron calls this every Monday. It sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await runWeekly("cron");
  return NextResponse.json({ results });
}
