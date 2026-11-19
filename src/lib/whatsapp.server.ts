import { supabaseAdmin } from "@/integrations/supabase/client.server";

type StatusItem = { id?: string; status?: string; timestamp?: string; errors?: { title?: string; message?: string; code?: number }[] };

/** Applies one WhatsApp status callback to the outbound message log. Returns false when the message isn't known yet. */
async function applyStatus(s: StatusItem): Promise<boolean> {
  if (!s.id || !s.status) return true;
  const date = new Date(Number(s.timestamp) * 1000);
  const at = s.timestamp && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  const err = s.errors?.map(e => `${e.code ?? ""} ${e.title ?? ""} ${e.message ?? ""}`.trim()).join("; ") ?? "";
  const { data, error } = await supabaseAdmin.rpc("apply_whatsapp_status", { _message: s.id, _status: s.status, _at: at as unknown as string, _error: err });
  if (error) throw error;
  return data;
}

/** Processes one stored webhook event. Unknown events are acknowledged and kept. */
export async function processEvent(id: string, event: string, payload: any) {
  let done = true;
  if (event === "whatsapp.status") {
    const statuses: StatusItem[] = payload?.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];
    for (const s of statuses) if (!(await applyStatus(s))) done = false;
  }
  const { error } = await supabaseAdmin.from("whatsapp_webhook_events").update(done ? { processed_at: new Date().toISOString(), processing_error: null } : { retry_at: new Date(Date.now() + 60_000).toISOString(), processing_error: "Awaiting outbound message record" }).eq("id", id);
  if (error) throw error;
  return done;
}

/** Fair retries on subsequent traffic; unmatched callbacks remain durable until their send is stored. */
export async function processPending(limit = 20) {
  const { data, error } = await supabaseAdmin.from("whatsapp_webhook_events").select("id, event, payload").is("processed_at", null).lte("retry_at", new Date().toISOString()).order("retry_at").limit(limit);
  if (error) throw error;
  for (const e of data ?? []) {
    try { await processEvent(e.id, e.event, e.payload); }
    catch (err) { const { error } = await supabaseAdmin.from("whatsapp_webhook_events").update({ processing_error: String(err).slice(0, 500), retry_at: new Date(Date.now() + 60_000).toISOString() }).eq("id", e.id); if (error) throw error; }
  }
}
