/**
 * Archives every issued invoice to the master admin's Google Drive as a PDF:
 *   <root> / <Artist name> / <Year> / <MM-Month> / ArtistName-InvoiceNo-Client-Date-Amount.pdf
 * A second file with the suffix -PAID is added when the invoice is paid. Jobs come from the invoice_archive_jobs queue,
 * which database triggers fill for every invoice (including hidden or expired ones).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { archiveFileName, archiveFolders, dubaiDate } from "./invoice-archive-names";
import { buildInvoicePdf, type ArchiveInvoice } from "./invoice-pdf";
import { BudgetExceeded, DriveError, ensureChildFolder, uploadPdf, type Guard } from "./drive.server";
import type { Invoice } from "./invoice";

const MAX_ATTEMPTS = 8;
type Job = { id: string; invoice_id: string; kind: string; attempts: number };

async function rootFolderId(): Promise<string> {
  const { data, error } = await supabaseAdmin.from("admin_secrets").select("value").eq("key", "invoice_archive_root_folder_id").single();
  if (error || !data?.value) throw new Error("Invoice archive root folder is not configured");
  return data.value;
}

/** One level of the artist/year/month tree: remembered in drive_folders so it is created only once. */
async function folderFor(key: string, parentId: string, name: string, fresh: boolean, guard: Guard): Promise<string> {
  if (!fresh) {
    const { data } = await supabaseAdmin.from("drive_folders").select("drive_id").eq("key", key).maybeSingle();
    if (data?.drive_id) return data.drive_id;
  }
  const id = await ensureChildFolder(parentId, name, guard);
  await supabaseAdmin.from("drive_folders").upsert({ key, drive_id: id }, { onConflict: "key" });
  return id;
}

async function folderChain(artistId: string, names: [string, string, string], root: string, fresh: boolean, guard: Guard) {
  const [a, y, m] = names;
  const artist = await folderFor(`artist:${artistId}`, root, a, fresh, guard);
  const year = await folderFor(`artist:${artistId}:${y}`, artist, y, fresh, guard);
  return folderFor(`artist:${artistId}:${y}-${m.slice(0, 2)}`, year, m, fresh, guard);
}

async function loadInvoice(job: Job): Promise<{ data: ArchiveInvoice; artistId: string }> {
  const { data: inv, error } = await supabaseAdmin
    .from("service_invoices")
    .select("id, number, document, total, status, paid_at, created_at, artist_id, bookings(client_name, client_email, paid_amount), conversations(client_name, quote_requests(name, email)), artists(stage_name, trn)")
    .eq("id", job.invoice_id).single();
  if (error || !inv) throw new Error("Invoice not found");
  const doc = (inv.document ?? {}) as unknown as Partial<Invoice>;
  const paidKind = job.kind === "paid";
  const client = [inv.bookings?.client_name, inv.conversations?.client_name, inv.conversations?.quote_requests?.name].find((n) => n && !/^(client|direct chat)$/i.test(n.trim())) ?? "Client";
  return {
    artistId: inv.artist_id,
    data: {
      number: inv.number, artistName: inv.artists?.stage_name ?? "Artist", client, clientEmail: inv.bookings?.client_email ?? inv.conversations?.quote_requests?.email ?? null,
      issued: dubaiDate(inv.created_at), due: doc.due ?? null, items: doc.items ?? [], subtotal: Number(doc.subtotal ?? 0), vat: Number(doc.vat ?? 0), total: Number(inv.total),
      // The "issued" copy shows the invoice as it was sent; the "paid" copy shows it settled.
      paid: paidKind ? Number(inv.total) : 0, paidAt: paidKind ? inv.paid_at : null, status: paidKind ? "paid" : "unpaid", notes: doc.notes ?? null, trn: inv.artists?.trn ?? null,
    },
  };
}

async function archiveOne(job: Job, guard: Guard) {
  const { data, artistId } = await loadInvoice(job);
  const bytes = buildInvoicePdf(data);
  const name = archiveFileName({ artistName: data.artistName, number: data.number, client: data.client, issued: data.issued, total: data.total, paid: job.kind === "paid" });
  const names = archiveFolders(data.artistName, data.issued);
  const root = await rootFolderId();
  let file;
  try {
    file = await uploadPdf(await folderChain(artistId, names, root, false, guard), name, bytes, guard);
  } catch (e) {
    // A remembered folder may have been deleted in Drive: look the folders up again once and retry.
    if (!(e instanceof DriveError) || ![403, 404].includes(e.status)) throw e;
    file = await uploadPdf(await folderChain(artistId, names, root, true, guard), name, bytes, guard);
  }
  await supabaseAdmin.from("invoice_archive_jobs").update({ status: "done", last_error: null, drive_file_id: file.id, drive_file_name: file.name, drive_folder_path: names.join(" / ") }).eq("id", job.id);
}

/** Backoff: 2, 4, 8 … minutes, capped at 6 hours. */
const delayMs = (attempts: number) => Math.min(6 * 3_600_000, 2 ** Math.max(1, attempts) * 60_000);

/** Re-creates any job a failed trigger missed, for invoices of the last 14 days. */
async function reconcile() {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: invoices } = await supabaseAdmin.from("service_invoices").select("id, status").gte("created_at", since).limit(500);
  if (!invoices?.length) return;
  const { data: jobs } = await supabaseAdmin.from("invoice_archive_jobs").select("invoice_id, kind").in("invoice_id", invoices.map((i) => i.id));
  const have = new Set((jobs ?? []).map((j) => `${j.invoice_id}:${j.kind}`));
  const missing = invoices.flatMap((i) => {
    const kinds = i.status === "paid" ? ["issued", "paid"] : ["issued"];
    return kinds.filter((kind) => !have.has(`${i.id}:${kind}`)).map((kind) => ({ invoice_id: i.id, kind }));
  });
  if (missing.length) await supabaseAdmin.from("invoice_archive_jobs").upsert(missing, { onConflict: "invoice_id,kind", ignoreDuplicates: true });
}

/**
 * Processes due archive jobs, one at a time, inside a small time budget: the scheduler gives up on a request after 5 seconds,
 * and every Drive call takes a second or two. Progress is saved after each step (folders are remembered, finished files are
 * recorded), so a job that runs out of time goes back to the queue without using up an attempt and continues on the next run.
 */
export async function runInvoiceArchive(budgetMs = 2500): Promise<{ done: number; retried: number; failed: number; paused: number }> {
  const started = Date.now();
  const guard: Guard = () => { if (Date.now() - started > budgetMs) throw new BudgetExceeded(); };
  const out = { done: 0, retried: 0, failed: 0, paused: 0 };
  await reconcile();
  while (Date.now() - started < budgetMs) {
    const { data: jobs, error } = await supabaseAdmin.rpc("claim_invoice_archive_jobs", { _limit: 1 });
    if (error) throw error;
    const job = jobs?.[0];
    if (!job) break;
    try {
      await archiveOne(job, guard);
      out.done++;
    } catch (e) {
      if (e instanceof BudgetExceeded) {
        // Not a failure: put it back as it was and carry on next run.
        await supabaseAdmin.from("invoice_archive_jobs").update({ status: "pending", attempts: Math.max(0, job.attempts - 1), locked_at: null, run_after: new Date().toISOString() }).eq("id", job.id);
        out.paused++;
        break;
      }
      const final = job.attempts >= MAX_ATTEMPTS;
      await supabaseAdmin.from("invoice_archive_jobs").update({ status: final ? "failed" : "pending", locked_at: null, run_after: new Date(Date.now() + delayMs(job.attempts)).toISOString(), last_error: (e instanceof Error ? e.message : "Unknown error").slice(0, 500) }).eq("id", job.id);
      if (final) out.failed++; else out.retried++;
    }
  }
  return out;
}
