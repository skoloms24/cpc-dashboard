// Reads report attachments from an Outlook folder through Microsoft Graph (app-only, Mail.Read).
import { db } from "../db";
import { parseReportFile } from "../parse/detect";
import { importParsed } from "../importer";

export const outlookConfigured = () =>
  !!(process.env.GRAPH_TENANT_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET && process.env.GRAPH_MAILBOX);

async function graphToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Microsoft sign-in for mailbox access failed: ${j.error_description || j.error || res.status}`);
  return j.access_token;
}

async function graph<T = any>(token: string, path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  if (!res.ok) throw new Error(`Outlook request failed (${res.status}): ${j.error?.message || "unknown error"}`);
  return j;
}

async function findFolder(token: string, mailbox: string, name: string): Promise<string> {
  const q = `$filter=${encodeURIComponent(`displayName eq '${name.replace(/'/g, "''")}'`)}`;
  const top = await graph(token, `/users/${encodeURIComponent(mailbox)}/mailFolders?${q}`);
  if (top.value?.[0]) return top.value[0].id;
  const inInbox = await graph(token, `/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/childFolders?${q}`);
  if (inInbox.value?.[0]) return inInbox.value[0].id;
  throw new Error(`Couldn't find an Outlook folder named "${name}" in ${mailbox}. Create it (top level or inside Inbox) and route the reports there.`);
}

/** Import every new report attachment received in the last `days` days. Returns one line per file. */
export async function ingestOutlook(days = 9): Promise<string[]> {
  const mailbox = process.env.GRAPH_MAILBOX!;
  const folderName = process.env.GRAPH_FOLDER || "CPC Reports";
  const token = await graphToken();
  const folderId = await findFolder(token, mailbox, folderName);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const filter = encodeURIComponent(`receivedDateTime ge ${since}`);
  let next: string | null =
    `/users/${encodeURIComponent(mailbox)}/mailFolders/${folderId}/messages?$filter=${filter}&$select=id,subject,receivedDateTime,hasAttachments&$orderby=receivedDateTime asc&$top=50`;
  const out: string[] = [];
  const sql = db();
  while (next) {
    const page: any = await graph(token, next);
    for (const m of page.value || []) {
      if (!m.hasAttachments) { out.push(`"${m.subject}": no attachment (if this is a Meta report, set it to attach the file)`); continue; }
      const atts = await graph(token, `/users/${encodeURIComponent(mailbox)}/messages/${m.id}/attachments`);
      for (const a of atts.value || []) {
        if (a["@odata.type"] !== "#microsoft.graph.fileAttachment" || !/\.(csv|tsv|xlsx|xls)$/i.test(a.name || "")) continue;
        const key = `${m.id}:${a.id}`;
        const seen = await sql.query(`SELECT 1 FROM imported_files WHERE file_key = $1`, [key]);
        if (seen.length) continue;
        try {
          const parsed = await parseReportFile(Buffer.from(a.contentBytes, "base64"), a.name);
          const msg = await importParsed(parsed, "email");
          await sql.query(`INSERT INTO imported_files (file_key) VALUES ($1) ON CONFLICT DO NOTHING`, [key]);
          out.push(`${a.name}: ${msg}`);
        } catch (e) {
          out.push(`${a.name}: ERROR ${(e as Error).message}`);
        }
      }
    }
    next = page["@odata.nextLink"] || null;
  }
  return out;
}
