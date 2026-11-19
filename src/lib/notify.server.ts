import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsApp } from "./whatsapp-provider.server";
export { WHATSAPP_TEMPLATE } from "./whatsapp-provider.server";

type Target = { email?: string | null; phone?: string | null };

async function log(bookingId: string, channel: "email" | "whatsapp", audience: "client" | "artist", kind: string, recipient: string, status: string, error?: string, messageId?: string) {
  const { error: writeError } = await supabaseAdmin.from("notifications").insert({ booking_id: bookingId, channel, audience, kind, recipient, status, error: error?.slice(0, 500) ?? null, provider_message_id: messageId ?? null });
  if (writeError) throw writeError;
  // A delivery status can arrive before this row exists — apply any that were stored meanwhile.
  if (messageId && !messageId.startsWith("fonnte:")) {
    const { data: events, error } = await supabaseAdmin.from("whatsapp_webhook_events").select("id,event,payload").is("processed_at", null).eq("event", "whatsapp.status").contains("payload", { entry: [{ changes: [{ value: { statuses: [{ id: messageId }] } }] }] }).limit(20);
    if (error) throw error;
    const { processEvent } = await import("./whatsapp.server");
    for (const event of events ?? []) await processEvent(event.id, event.event, event.payload);
  }
}

/**
 * Sends a booking link by email and WhatsApp. Every attempt is logged in `notifications`.
 * Email stays `pending_setup` until a sender domain is configured; WhatsApp until the connector is linked.
 */
export async function notifyBooking(bookingId: string, audience: "client" | "artist", kind: string, to: Target, subject: string, details: string, link: string) {
  if (to.email) await log(bookingId, "email", audience, kind, to.email, "pending_setup");
  if (to.phone) {
    try {
      const r = await sendWhatsApp(to.phone, subject, details, link);
      await log(bookingId, "whatsapp", audience, kind, to.phone, r.status, r.error, r.messageId);
    } catch (e) { await log(bookingId, "whatsapp", audience, kind, to.phone, "failed", String(e)); }
  }
}

export async function artistContact(artistId: string) {
  const { data: a } = await supabaseAdmin.from("artists").select("user_id, notify_phone, stage_name").eq("id", artistId).single();
  let email: string | null = null;
  if (a?.user_id) email = (await supabaseAdmin.auth.admin.getUserById(a.user_id)).data.user?.email ?? null;
  return { email, phone: a?.notify_phone ?? null, name: a?.stage_name ?? "Artist" };
}

export function siteOrigin(req: Request | undefined) {
  try { return req ? new URL(req.url).origin : ""; } catch { return ""; }
}
