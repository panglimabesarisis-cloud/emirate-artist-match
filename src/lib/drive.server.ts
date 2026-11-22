/** Google Drive through the Lovable connector gateway. Server only; credentials never leave the server. */

const BASE = "https://connector-gateway.lovable.dev/google_drive";

function credentials() {
  const lovable = process.env["LOVABLE_API_KEY"], drive = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable || !drive) throw new Error("Google Drive is not connected");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": drive };
}

async function call(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...credentials(), ...(init.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DriveError(res.status, `Drive ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}) ${body.slice(0, 200)}`);
  }
  return res;
}

export class DriveError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
type DriveFile = { id: string; name: string; createdTime?: string };

/** Oldest non-trashed child with this name, so concurrent runs converge on the same folder or file. */
async function findChild(parentId: string, name: string, folder: boolean): Promise<DriveFile | null> {
  const query = `'${q(parentId)}' in parents and name = '${q(name)}' and trashed = false${folder ? " and mimeType = 'application/vnd.google-apps.folder'" : ""}`;
  const res = await call(`/drive/v3/files?${new URLSearchParams({ q: query, fields: "files(id,name,createdTime)", orderBy: "createdTime", pageSize: "10", supportsAllDrives: "true", includeItemsFromAllDrives: "true" })}`);
  const json = (await res.json()) as { files?: DriveFile[] };
  return json.files?.[0] ?? null;
}

export async function ensureChildFolder(parentId: string, name: string): Promise<string> {
  const existing = await findChild(parentId, name, true);
  if (existing) return existing.id;
  const res = await call("/drive/v3/files?fields=id,name&supportsAllDrives=true", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const created = (await res.json()) as DriveFile;
  // If another run created the same folder at the same moment, both settle on the oldest one.
  return (await findChild(parentId, name, true))?.id ?? created.id;
}

/** Uploads a PDF unless a file with this name is already in the folder (a retried job must not duplicate it). */
export async function uploadPdf(parentId: string, name: string, bytes: Uint8Array): Promise<{ id: string; name: string; existed: boolean }> {
  const existing = await findChild(parentId, name, false);
  if (existing) return { id: existing.id, name: existing.name, existed: true };
  const boundary = `dealmaker-${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId], mimeType: "application/pdf" })}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const res = await call("/upload/drive/v3/files?uploadType=multipart&fields=id,name&supportsAllDrives=true", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  const file = (await res.json()) as DriveFile;
  return { id: file.id, name: file.name, existed: false };
}
