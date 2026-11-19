import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Target = { email?: string | null; phone?: string | null };
const GATEWAY = "https://connector-gateway.lovable.dev/whatsapp";

async function log(bookingId: string, channel: "email" | "whatsapp", audience: "client" | "artist", kind: string, recipient: string, status: string, error?: string, messageId?: string) {
  const { error: writeError } = await supabaseAdmin.from("notifications").insert({ booking_id: bookingId, channel, audience, kind, recipient, status, error: error?.slice(0, 500) ?? null, provider_message_id: messageId ?? null });
  if (writeError) throw writeError;
  // A delivery status can arrive before this row exists — apply any that were stored meanwhile.
  if (messageId) {
    const { data: events, error } = await supabaseAdmin.from("whatsapp_webhook_events").select("id,event,payload").is("processed_at", null).eq("event", "whatsapp.status").contains("payload", { entry: [{ changes: [{ value: { statuses: [{ id: messageId }] } }] }] }).limit(20);
    if (error) throw error;
    const { processEvent } = await import("./whatsapp.server");
    for (const event of events ?? []) await processEvent(event.id, event.event, event.payload);
  }
}

export const WHATSAPP_TEMPLATE = "dealmaker_booking_update";

/** Business-initiated WhatsApp messages must use the Meta-approved template (3 body variables). */
async function sendWhatsApp(phone: string, headline: string, details: string, link: string): Promise<{ status: string; error?: string; messageId?: string }> {
  const lk = process.env["LOVABLE_API_KEY"], wk = process.env["WHATSAPP_API_KEY"];
  if (!lk || !wk) return { status: "pending_setup" };
  const to = phone.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(to)) return { status: "failed", error: "Invalid international WhatsApp number" };
  const r = await fetch(`${GATEWAY}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": wk, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: { name: WHATSAPP_TEMPLATE, language: { code: "en_US" }, components: [{ type: "body", parameters: [headline, details, link].map((t) => ({ type: "text", text: t.replace(/\s*\n+\s*/g, " · ").slice(0, 900) })) }] },
    }),
  });
  const body = await r.text();
  if (!r.ok) return { status: "failed", error: `${r.status} ${body}` };
  let messageId: string | undefined;
  try { messageId = JSON.parse(body)?.messages?.[0]?.id; } catch { /* keep undefined */ }
  return messageId ? { status: "accepted", messageId } : { status: "failed", error: "WhatsApp response did not include a message id" };
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
