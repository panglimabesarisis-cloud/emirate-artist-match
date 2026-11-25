// Sends a verified booking or invoice payment back to its chat. Callers prove access first; the order must already be paid.
import { invoiceMoney } from "./invoice";
import { maskContacts } from "./masking";
import { orderReceipt } from "./receipt.server";
import { encodeReceipt } from "./receipt-message";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

async function paidChat(orderId: string) {
  const database = await db();
  const { data: order, error } = await database.from("payment_orders").select("id, kind, target_id, status").eq("id", orderId).single();
  if (error) throw error;
  if (!order?.target_id || order.status !== "paid") return null;
  if (order.kind === "booking") {
    const { data: booking, error: readError } = await database.from("bookings").select("conversation_id, total, paid_amount").eq("id", order.target_id).single();
    if (readError) throw readError;
    return booking?.conversation_id ? { conversationId: booking.conversation_id, booking } : null;
  }
  if (order.kind !== "invoice") return null;
  const { data: invoice, error: readError } = await database.from("service_invoices").select("conversation_id").eq("id", order.target_id).single();
  if (readError) throw readError;
  return invoice?.conversation_id ? { conversationId: invoice.conversation_id, booking: null } : null;
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
  const database = await db();
  const { error } = await database.from("messages").insert({ id: orderId, conversation_id: target.conversationId, sender: "system", body: encodeReceipt(proof) });
  if (error?.code === "23505") return;
  if (error) throw error;
  await database.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", target.conversationId);
}
