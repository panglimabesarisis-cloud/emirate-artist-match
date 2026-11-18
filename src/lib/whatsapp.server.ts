import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RANK: Record<string, number> = { accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5 };

type StatusItem = { id?: string; status?: string; timestamp?: string; errors?: { title?: string; message?: string; code?: number }[] };

/** Applies one WhatsApp status callback to the outbound message log. Returns false when the message isn't known yet. */
async function applyStatus(s: StatusItem): Promise<boolean> {
  if (!s.id || !s.status) return true;
  const { data: row, error } = await supabaseAdmin.from("notifications").select("id, status").eq("provider_message_id", s.id).maybeSingle();
  if (error) throw error;
  if (!row) return false;
  const cur = RANK[row.status] ?? 0, next = RANK[s.status] ?? 0;
  if (next <= cur && s.status !== "failed") return true; // an older "sent" never overwrites "delivered"/"read"
  const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null;
  const err = s.errors?.length ? s.errors.map((e) => `${e.code ?? ""} ${e.title ?? ""} ${e.message ?? ""}`.trim()).join("; ") : null;
  const { error: uerr } = await supabaseAdmin.from("notifications").update({ status: s.status, status_at: at, ...(err ? { error: err.slice(0, 500) } : {}) }).eq("id", row.id);
  if (uerr) throw uerr;
  return true;
}

/** Processes one stored webhook event. Unknown events are acknowledged and kept. */
export async function processEvent(id: string, event: string, payload: any) {
  let done = true;
  if (event === "whatsapp.status") {
    const statuses: StatusItem[] = payload?.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];
    for (const s of statuses) if (!(await applyStatus(s))) done = false;
  }
  if (done) await supabaseAdmin.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null }).eq("id", id);
  return done;
}

/** Retries pending events. Status callbacks that never match after a day are closed so they can't block newer work. */
export async function processPending(limit = 20) {
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  await supabaseAdmin.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: "unmatched after 24h" }).is("processed_at", null).lt("received_at", dayAgo);
  const { data } = await supabaseAdmin.from("whatsapp_webhook_events").select("id, event, payload").is("processed_at", null).order("received_at", { ascending: false }).limit(limit);
  for (const e of data ?? []) {
    try { await processEvent(e.id, e.event, e.payload); }
    catch (err) { await supabaseAdmin.from("whatsapp_webhook_events").update({ processing_error: String(err).slice(0, 500) }).eq("id", e.id); }
  }
}
