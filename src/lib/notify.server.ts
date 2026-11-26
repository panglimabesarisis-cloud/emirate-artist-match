import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readWhatsAppConfig, sendWhatsApp } from "./whatsapp-provider.server";
import { internationalPhone } from "./whatsapp-provider";
import { artistInquiry, clientWelcome, type ChatSource } from "./new-chat-message";
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
 * Email stays `pending_setup` until Settings → Email has a key and sender; WhatsApp until the connector is linked.
 */
export async function notifyBooking(bookingId: string, audience: "client" | "artist", kind: string, to: Target, subject: string, details: string, link: string) {
  if (to.email) {
    const { sendEmail } = await import("./email-provider.server");
    const sent = await sendEmail(to.email, subject, [details, link].filter(Boolean).join("\n\n"));
    await log(bookingId, "email", audience, kind, to.email, sent.status, sent.error);
  }
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
export async function notifyClientChatLink(conversationId: string, key: string, phone: string, source: ChatSource) {
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count, error } = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "chat_link").eq("recipient", phone).gte("created_at", since);
    if (error) throw error;
    if ((count ?? 0) >= 3) return;
    const { data: attempt, error: reserveError } = await supabaseAdmin.from("notifications").insert({ conversation_id: conversationId, audience: "client", channel: "whatsapp", kind: "chat_link", recipient: phone, status: "sending" }).select("id").single();
    if (reserveError || !attempt) throw reserveError ?? new Error("Notification reservation failed");
    try {
      const message = clientWelcome(source);
      const result = await sendWhatsApp(phone, message.headline, message.details, `https://dealmakertalent.com/chat/${conversationId}?k=${key}`, message.footer);
      const { error: saveError } = await supabaseAdmin.from("notifications").update({ status: result.status, error: result.error ?? null, provider_message_id: result.messageId ?? null }).eq("id", attempt.id);
      if (saveError) throw saveError;
    } catch {
      await supabaseAdmin.from("notifications").update({ status: "failed", error: "Send or persistence failed; check provider before retrying" }).eq("id", attempt.id);
    }
  } catch { console.error("Chat link message could not be recorded or sent"); }
}

/** Persist reservation before send; never blindly replay an ambiguous provider result. */
export async function notifyConversation(id: string, kind: "booking_inquiry" | "chat_takeover", subject: string, details: string, footer?: string) {
  try {
    const { data: c, error } = await supabaseAdmin.from("conversations").select("artist_id, artists(notify_phone,manager_phone)").eq("id", id).single();
    if (error || !c) throw error ?? new Error("Conversation unavailable");
    const phones = [...new Set([c.artists?.notify_phone, c.artists?.manager_phone].filter((p): p is string => !!p))];
    const link = `https://dealmakertalent.com/dashboard/chat/${id}`;
    for (const phone of phones) {
      await deliverOnce({ conversationId: id, audience: "artist", kind, phone, subject, details, link, footer });
    }
  } catch { console.error("Conversation notification could not be recorded or sent"); }
}

/** Tells the artist and manager a chat opened, with the link to monitor it. */
export async function notifyNewInquiry(conversationId: string, source: ChatSource) {
  const message = artistInquiry(source);
  await notifyConversation(conversationId, "booking_inquiry", message.headline, message.details, message.footer);
}

type Delivery = { conversationId: string; audience: "client" | "artist"; kind: string; phone: string; subject: string; details: string; link: string; footer?: string | undefined };

/** At most one message per conversation, kind and number. */
async function deliverOnce({ conversationId, audience, kind, phone, subject, details, link, footer }: Delivery) {
  const { data: attempt, error: reserveError } = await supabaseAdmin.from("notifications").insert({ conversation_id: conversationId, audience, channel: "whatsapp", kind, recipient: phone, status: "sending" }).select("id").single();
  if (reserveError?.code === "23505") return;
  if (reserveError || !attempt) throw reserveError ?? new Error("Notification reservation failed");
  try {
    const result = await sendWhatsApp(phone, subject, details, link, ...(footer ? [footer] as const : []));
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

/** Public chats can name any number, so flow messages to one client number are capped per day. */
export const FLOW_CLIENT_DAILY_LIMIT = 5;

/** A flow may name the assistant's number, so that number is capped too. */
export const FLOW_ASSISTANT_DAILY_LIMIT = 50;

export type FlowNotice = { nodeId: string; audience: "client" | "artist" | "assistant"; text: string; phone?: string | null | undefined };
export type FlowChat = { id: string; access_key: string; artist_id: string; client_user_id: string | null; quote_request_id: string | null };

/** The client's number: from the booking form, the verified chat number, or the verified account. */
async function clientPhone(chat: FlowChat) {
  if (chat.quote_request_id) {
    const { data, error } = await supabaseAdmin.from("quote_requests").select("phone").eq("id", chat.quote_request_id).maybeSingle();
    if (error) throw error;
    if (data?.phone) return data.phone;
  }
  const { data: link, error } = await supabaseAdmin.from("notifications").select("recipient").eq("conversation_id", chat.id).eq("kind", "chat_link").limit(1).maybeSingle();
  if (error) throw error;
  if (link?.recipient) return link.recipient;
  if (!chat.client_user_id) return null;
  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("phone,phone_verified_at").eq("id", chat.client_user_id).maybeSingle();
  if (profileError) throw profileError;
  return profile?.phone_verified_at ? profile.phone : null;
}

/** Flow messages this number was sent in the last day. */
async function sentToday(phone: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error } = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).eq("recipient", phone).like("kind", "flow:%").gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/** Sends the WhatsApp steps an AI flow reached. A failure never ends the chat turn. */
export async function notifyFlowSteps(chat: FlowChat, artistName: string, notices: FlowNotice[]) {
  for (const notice of notices) {
    try {
      const kind = `flow:${notice.nodeId}`;
      if (notice.audience === "artist") {
        const { data: artist, error } = await supabaseAdmin.from("artists").select("notify_phone,manager_phone").eq("id", chat.artist_id).single();
        if (error) throw error;
        for (const phone of new Set([artist?.notify_phone, artist?.manager_phone].filter((p): p is string => !!p))) {
          await deliverOnce({ conversationId: chat.id, audience: "artist", kind, phone, subject: "Dealmaker AI Agent", details: notice.text, link: `https://dealmakertalent.com/dashboard/chat/${chat.id}` });
        }
        continue;
      }
      if (notice.audience === "assistant") {
        let phone = notice.phone?.trim() ? `+${internationalPhone(notice.phone.trim())}` : null;
        if (!phone) {
          const { data: artist, error } = await supabaseAdmin.from("artists").select("manager_phone").eq("id", chat.artist_id).single();
          if (error) throw error;
          phone = artist?.manager_phone ?? null;
        }
        if (!phone || await sentToday(phone) >= FLOW_ASSISTANT_DAILY_LIMIT) continue;
        await deliverOnce({ conversationId: chat.id, audience: "artist", kind, phone, subject: "Dealmaker AI Agent", details: notice.text, link: `https://dealmakertalent.com/dashboard/chat/${chat.id}` });
        continue;
      }
      const phone = await clientPhone(chat);
      if (!phone) continue;
      if (await sentToday(phone) >= FLOW_CLIENT_DAILY_LIMIT) continue;
      await deliverOnce({ conversationId: chat.id, audience: "client", kind, phone, subject: `Dealmaker · ${artistName}`, details: notice.text, link: `https://dealmakertalent.com/chat/${chat.id}?k=${chat.access_key}` });
    } catch { console.error("Flow WhatsApp message could not be recorded or sent"); }
  }
}
