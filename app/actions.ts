"use server";

import { revalidatePath } from "next/cache";
import { auth, emailAllowed, isAdmin } from "@/auth";
import { db } from "@/lib/db";
import { runWeekly, backfillApis } from "@/lib/jobs";
import { parseReportFile } from "@/lib/parse/detect";
import { importParsed } from "@/lib/importer";
import { logImport } from "@/lib/db";
import { PAID_CHANNELS } from "@/lib/channels";

async function requireUser() {
  const s = await auth();
  const email = s?.user?.email;
  if (!emailAllowed(email)) throw new Error("Sign in first.");
  return email!;
}
async function requireAdmin() {
  const email = await requireUser();
  if (!isAdmin(email)) throw new Error("Only admins can do that.");
  return email;
}

export type ActionState = { ok?: string; error?: string };

/** Anyone signed in can enter or correct a channel's spend for a week (e.g. Indeed). Blank clears it. */
export async function saveSpend(_: ActionState, form: FormData): Promise<ActionState> {
  const email = await requireUser();
  const clientId = Number(form.get("clientId"));
  const week = String(form.get("week"));
  const channel = String(form.get("channel"));
  const raw = String(form.get("amount") ?? "").replace(/[$,\s]/g, "");
  if (!(PAID_CHANNELS as readonly string[]).includes(channel) || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return { error: "Bad request." };
  if (raw === "") {
    await db().query(`DELETE FROM spend_manual WHERE client_id=$1 AND week_start=$2 AND channel=$3`, [clientId, week, channel]);
  } else {
    const amount = Number(raw);
    if (!isFinite(amount) || amount < 0) return { error: "Enter a dollar amount, like 412.50." };
    await db().query(
      `INSERT INTO spend_manual (client_id, week_start, channel, amount, updated_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (client_id, week_start, channel) DO UPDATE SET amount=EXCLUDED.amount, updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [clientId, week, channel, amount, email]);
  }
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function runImportNow(_: ActionState): Promise<ActionState> {
  await requireAdmin();
  const res = await runWeekly("manual");
  revalidatePath("/", "layout");
  return { ok: res.map(r => `${r.source}: ${r.status} — ${r.message}`).join("\n") };
}

export async function uploadReports(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose at least one file." };
  const clientId = Number(form.get("clientId")) || null;
  const lines: string[] = [];
  let failed = false;
  for (const f of files) {
    try {
      const parsed = await parseReportFile(Buffer.from(await f.arrayBuffer()), f.name);
      const msg = await importParsed(parsed, "upload", clientId);
      lines.push(`${f.name}: ${msg}`);
      await logImport("upload", "upload", "ok", `${f.name}: ${msg}`);
    } catch (e) {
      failed = true;
      lines.push(`${f.name}: ${(e as Error).message}`);
      await logImport("upload", "upload", "error", `${f.name}: ${(e as Error).message}`);
    }
  }
  revalidatePath("/", "layout");
  return failed ? { error: lines.join("\n") } : { ok: lines.join("\n") };
}

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/\n|,/).map(s => s.trim()).filter(Boolean);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function saveClient(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = form.get("id") ? Number(form.get("id")) : null;
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  const channels = PAID_CHANNELS.filter(c => form.get(`ch_${c}`) === "on");
  const sourceMap: Record<string, string> = {};
  for (const line of list(form.get("source_map"))) {
    const [k, v] = line.split("=").map(s => s?.trim());
    if (k && v) sourceMap[k] = v;
  }
  const vals = [name, String(form.get("zoho_org") ?? "").trim() || null, channels, list(form.get("meta_match")),
    list(form.get("google_match")), String(form.get("default_position") ?? "").trim() || null, JSON.stringify(sourceMap),
    form.get("active") === "on", list(form.get("position_fields"))];
  if (id) {
    await db().query(`UPDATE clients SET name=$1, zoho_org=$2, channels=$3, meta_match=$4, google_match=$5, default_position=$6,
                      source_map=$7::jsonb, active=$8, position_fields=$9 WHERE id=$10`, [...vals, id]);
  } else {
    await db().query(`INSERT INTO clients (name, zoho_org, channels, meta_match, google_match, default_position, source_map, active, position_fields, slug)
                      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`, [...vals, slugify(name) || `client-${Date.now()}`]);
  }
  revalidatePath("/", "layout");
  return { ok: id ? "Client saved." : "Client added." };
}

/** Assign an unmatched Meta campaign or Google account to a client by adding its exact name to that client's match list. */
export async function assignSpend(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const platform = String(form.get("platform"));
  const key = String(form.get("key"));
  const clientId = Number(form.get("clientId"));
  if (!clientId) return { error: "Pick a client." };
  const col = platform === "Meta" ? "meta_match" : "google_match";
  await db().query(`UPDATE clients SET ${col} = array_append(${col}, $1) WHERE id = $2 AND NOT ($1 = ANY(${col}))`, [key, clientId]);
  revalidatePath("/", "layout");
  return { ok: `Assigned "${key}".` };
}

export async function backfillApiSpend(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const since = String(form.get("since") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return { error: "Pick a start date." };
  const res = await backfillApis(since, "manual");
  revalidatePath("/", "layout");
  const text = res.map(r => `${r.source}: ${r.status} — ${r.message}`).join("\n");
  return res.some(r => r.status === "error") ? { error: text } : { ok: text };
}
