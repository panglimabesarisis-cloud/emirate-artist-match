// Sends a verified booking or invoice payment back to its chat. Callers prove access first; the order must already be paid.
import { invoiceMoney } from "./invoice";
import { maskContacts } from "./masking";
import { orderReceipt } from "./receipt.server";
import { encodeReceipt } from "./receipt-message";
import { eventDetails, noteDetails, paymentConfirmation } from "./payment-confirmation";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

async function paidChat(orderId: string) {
  const database = await db();
  const { data: order, error } = await database.from("payment_orders").select("id, kind, target_id, status, amount_minor").eq("id", orderId).single();
  if (error) throw error;
  if (!order?.target_id || order.status !== "paid") return null;
  if (order.kind === "booking") {
    const { data: booking, error: readError } = await database.from("bookings").select("conversation_id, total, paid_amount").eq("id", order.target_id).single();
    if (readError) throw readError;
    return booking?.conversation_id ? { conversationId: booking.conversation_id, booking, bookingId: order.target_id, amount: Number(order.amount_minor) / 100 } : null;
  }
  if (order.kind !== "invoice") return null;
  const { data: invoice, error: readError } = await database.from("service_invoices").select("conversation_id").eq("id", order.target_id).single();
  if (readError) throw readError;
  return invoice?.conversation_id ? { conversationId: invoice.conversation_id, booking: null, bookingId: null, amount: 0 } : null;
}

/** Where the payer goes after paying: the chat the booking or invoice came from. */
export async function paymentChatPath(orderId: string) {
  const target = await paidChat(orderId);
  if (!target) return null;
  const { data: chat, error } = await (await db()).from("conversations").select("access_key, deleted_at").eq("id", target.conversationId).single();
  if (error) throw error;
  return chat && !chat.deleted_at ? `/chat/${target.conversationId}?k=${chat.access_key}` : null;
}

/** Posts the paid invoice once: the message takes the order's id, so a repeated check cannot add another. */
export async function postPaymentProof(orderId: string) {
  const target = await paidChat(orderId);
  if (!target) return;
  const receipt = await orderReceipt(orderId);
  if (!receipt) return;
  const { booking } = target;
  const balance = booking ? Math.max(0, Math.round((Number(booking.total) - Number(booking.paid_amount)) * 100) / 100) : 0;
  const progress = booking ? `Booking total ${invoiceMoney(Number(booking.total))} · Paid ${invoiceMoney(Number(booking.paid_amount))} · Balance ${invoiceMoney(balance)}` : null;
  // The artist reads this chat too, so no contact details travel with the proof.
  const proof = {
    ...receipt,
    billTo: maskContacts(receipt.billTo),
    billEmail: null,
    lines: receipt.lines.map(line => ({ ...line, label: maskContacts(line.label).slice(0, 200), ...(progress ? { detail: progress } : {}) })),
  };
  await postOnce(orderId, target.conversationId, "system", encodeReceipt(proof));
  if (target.bookingId) await postOnce(await followingId(orderId), target.conversationId, "ai", await confirmationText(target.bookingId, target.amount));
}

async function postOnce(id: string, conversationId: string, sender: "system" | "ai", body: string) {
  const database = await db();
  const { error } = await database.from("messages").insert({ id, conversation_id: conversationId, sender, body });
  if (error?.code === "23505") return;
  if (error) throw error;
  await database.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
}

/** A second fixed id per order, for the confirmation that follows the paid invoice. */
async function followingId(orderId: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`confirmation:${orderId}`)));
  const hex = Array.from(hash.slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function confirmationText(bookingId: string, amount: number) {
  const database = await db();
  const { data: booking, error } = await database.from("bookings").select("artist_id, conversation_id, client_name, package_title, job_detail, notes, event_date, start_time, end_time, event_type_id").eq("id", bookingId).single();
  if (error || !booking) throw error ?? new Error("Booking unavailable");
  const [{ data: saved }, { data: artist }, { data: eventType }, { data: chat }] = await Promise.all([
    // Read on its own: a booking without this field still gets its confirmation.
    database.from("bookings").select("event_details").eq("id", bookingId).maybeSingle(),
    database.from("artists").select("stage_name").eq("id", booking.artist_id).single(),
    booking.event_type_id ? database.from("event_types").select("name").eq("id", booking.event_type_id).maybeSingle() : Promise.resolve({ data: null }),
    database.from("conversations").select("quote_requests(start_time, end_time, perform_minutes, areas(name), event_types(name))").eq("id", booking.conversation_id ?? "").maybeSingle(),
  ]);
  const quote = chat?.quote_requests;
  const minutes = quote?.perform_minutes ? { performDuration: `${quote.perform_minutes} minutes` } : {};
  return paymentConfirmation({
    clientName: booking.client_name, amount, artistName: artist?.stage_name ?? "your artist", eventDate: booking.event_date,
    jobDetail: booking.job_detail ?? booking.package_title, eventName: eventType?.name ?? quote?.event_types?.name ?? null,
    startTime: booking.start_time ?? quote?.start_time ?? null, endTime: booking.end_time ?? quote?.end_time ?? null, area: quote?.areas?.name ?? null,
    details: { ...minutes, ...noteDetails(booking.notes), ...eventDetails((saved as { event_details?: Record<string, unknown> } | null)?.event_details) },
  });
}
