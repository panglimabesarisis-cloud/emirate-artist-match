import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readWhatsAppConfig, sendWhatsApp } from "./whatsapp-provider.server";
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
      let replyInstructions = '';
      if (audience === 'artist' && kind === 'approval_request') {
        const config = await readWhatsAppConfig();
        if (config.provider === 'fonnte' && process.env['FONNTE_WEBHOOK_SECRET']) {
          const {data:b,error}=await supabaseAdmin.from('bookings').select('artist_invoice_required').eq('id',bookingId).single();
          if(error) throw error;
          replyInstructions = b?.artist_invoice_required
            ? `-----\nReference Order: ${bookingId.slice(0,8)}\n-----\nReply YES\nto confirm availability only; complete invoice items using the link.\n-----\nReply NO\nto decline.\n-----\nUse the link to edit details.`
            : `-----\nReference Order: ${bookingId.slice(0,8)}\n-----\nReply YES\nto approve\n-----\nReply NO\nto decline.\n-----\nUse the link to edit details.`;
        }
      }
      const r = await sendWhatsApp(to.phone, subject, [details,replyInstructions].filter(Boolean).join('\n\n'), link);
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

/**
 * Sends the client the private link of their chat. One send per conversation and number, and at most
 * three a day to a number because the booking form is public. The link itself is never stored.
 */
export async function notifyClientChatLink(conversationId: string, key: string, phone: string, artistName: string) {
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count, error } = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "chat_link").eq("recipient", phone).gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= 3) return;
    const { data: attempt, error: reserveError } = await supabaseAdmin.from("notifications").insert({ conversation_id: conversationId, audience: "client", channel: "whatsapp", kind: "chat_link", recipient: phone, status: "sending" }).select("id").single();
    if (reserveError || !attempt) throw reserveError ?? new Error("Notification reservation failed");
    try {
      const result = await sendWhatsApp(phone, "Link chat Dealmaker Anda", `Chat booking Anda dengan ${artistName}. Simpan pesan ini untuk membukanya kapan pun:`, `https://dealmakertalent.com/chat/${conversationId}?k=${key}`);
      const { error: saveError } = await supabaseAdmin.from("notifications").update({ status: result.status, error: result.error ?? null, provider_message_id: result.messageId ?? null }).eq("id", attempt.id);
      if (saveError) throw saveError;
    } catch {
      await supabaseAdmin.from("notifications").update({ status: "failed", error: "Send or persistence failed; check provider before retrying" }).eq("id", attempt.id);
    }
  } catch { console.error("Chat link message could not be recorded or sent"); }
}

/** Persist reservation before send; never blindly replay an ambiguous provider result. */
export async function notifyConversation(id: string, kind: "booking_inquiry" | "chat_takeover", subject: string, details: string) {
  try {
    const { data: c, error } = await supabaseAdmin.from("conversations").select("artist_id, artists(notify_phone,manager_phone)").eq("id", id).single();
    if (error || !c) throw error ?? new Error("Conversation unavailable");
    const phones = [...new Set([c.artists?.notify_phone, c.artists?.manager_phone].filter((p): p is string => !!p))];
    const link = `https://dealmakertalent.com/dashboard/chat/${id}`;
    for (const phone of phones) {
      const { data: attempt, error: reserveError } = await supabaseAdmin.from("notifications").insert({ conversation_id: id, audience: "artist", channel: "whatsapp", kind, recipient: phone, status: "sending" }).select("id").single();
      if (reserveError?.code === "23505") continue;
      if (reserveError || !attempt) throw reserveError ?? new Error("Notification reservation failed");
      try {
        const result = await sendWhatsApp(phone, subject, details, link);
        const { error: saveError } = await supabaseAdmin.from("notifications").update({ status: result.status, error: result.error ?? null, provider_message_id: result.messageId ?? null }).eq("id", attempt.id);
        if (saveError) throw saveError;
        if (result.messageId && !result.messageId.startsWith("fonnte:")) {
          const { data: events, error: readError } = await supabaseAdmin.from("whatsapp_webhook_events").select("id,event,payload").is("processed_at", null).eq("event", "whatsapp.status").contains("payload", { entry: [{ changes: [{ value: { statuses: [{ id: result.messageId }] } }] }] }).limit(20);
          if (readError) throw readError;
          const { processEvent } = await import("./whatsapp.server");
          for (const event of events ?? []) await processEvent(event.id, event.event, event.payload);
        }
      } catch {
        await supabaseAdmin.from("notifications").update({ status: "failed", error: "Send or persistence failed; check provider before retrying" }).eq("id", attempt.id);
      }
    }
  } catch { console.error("Conversation notification could not be recorded or sent"); }
}
