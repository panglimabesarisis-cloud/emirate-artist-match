import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskContacts } from "./masking";
import { priceBreakdown, refundAmount, canComplete } from "./booking-rules";

const uuid = (v: unknown) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw new Error("Invalid id");
  return v;
};
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

const BOOKING_COLS = "id, artist_id, conversation_id, client_name, client_email, package_title, notes, event_date, amount, vat_amount, total, paid_amount, escrow_status, status, invoice_no, contract_accepted_at, paid_at, completed_at, cancelled_at, cancelled_by, cancel_reason, refund_amount, created_at, event_types(name), artists(stage_name, slug, trn), reviews(id, rating, body)";

async function bookingByKey(id: string, key: string) {
  const db = await admin();
  const { data } = await db.from("bookings").select(BOOKING_COLS).eq("id", id).eq("access_key", key).maybeSingle();
  if (!data) throw new Error("Booking not found");
  return data;
}

async function assertArtistOwns(supabase: any, userId: string, artistId: string) {
  const { data } = await supabase.from("artists").select("id").eq("id", artistId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Artist: send a formal booking offer from a quote conversation. */
export const createBookingOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { conversationId: string; title: string; amount: number; eventDate: string; notes?: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.eventDate)) throw new Error("Event date required");
    const amount = Number(i.amount);
    if (!(amount > 0 && amount < 10_000_000)) throw new Error("Invalid amount");
    return { conversationId: uuid(i.conversationId), title: String(i.title ?? "").trim().slice(0, 120) || "Performance", amount, eventDate: i.eventDate, notes: maskContacts(String(i.notes ?? "").slice(0, 1000)) || null };
  })
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase.from("conversations").select("id, artist_id, quote_requests(name, email, event_type_id, client_user_id)").eq("id", data.conversationId).maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    await assertArtistOwns(context.supabase, context.userId, conv.artist_id);
    const q = conv.quote_requests;
    const p = priceBreakdown(data.amount);
    const db = await admin();
    const { data: b, error } = await db.from("bookings").insert({
      artist_id: conv.artist_id, conversation_id: conv.id, client_name: q?.name ?? "Client", client_email: q?.email ?? null,
      client_user_id: q?.client_user_id ?? null, event_type_id: q?.event_type_id ?? null, event_date: data.eventDate,
      package_title: data.title, notes: data.notes, amount: p.subtotal, vat_amount: p.vat, total: p.total, status: "quoted",
    }).select("id").single();
    if (error || !b) throw new Error("Could not create offer");
    await db.from("messages").insert({ conversation_id: conv.id, sender: "system", body: `Booking offer sent: ${data.title} on ${data.eventDate} — AED ${p.total.toLocaleString("en-US")} incl. VAT. Open it below to review the contract and pay.` });
    await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
    return { id: b.id };
  });

/** Public (secret link): bookings attached to a chat. */
export const getConversationBookings = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string }) => ({ id: uuid(i.id), key: uuid(i.key) }))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: c } = await db.from("conversations").select("id").eq("id", data.id).eq("access_key", data.key).maybeSingle();
    if (!c) throw new Error("Not found");
    const { data: rows } = await db.from("bookings").select("id, access_key, package_title, event_date, total, status").eq("conversation_id", c.id).order("created_at", { ascending: false });
    return rows ?? [];
  });

export const getBooking = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string }) => ({ id: uuid(i.id), key: uuid(i.key) }))
  .handler(async ({ data }) => bookingByKey(data.id, data.key));

/** Client: accept the contract and pay into demo escrow. */
export const acceptAndPay = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; agree: boolean }) => {
    if (i.agree !== true) throw new Error("Please accept the contract");
    return { id: uuid(i.id), key: uuid(i.key) };
  })
  .handler(async ({ data }) => {
    const b = await bookingByKey(data.id, data.key);
    if (b.status !== "quoted") throw new Error("This offer can no longer be paid");
    const db = await admin();
    const { data: inv } = await db.rpc("next_invoice_no");
    const now = new Date().toISOString();
    await db.from("bookings").update({ status: "confirmed", contract_accepted_at: now, paid_at: now, paid_amount: b.total, escrow_status: "held", invoice_no: inv as string }).eq("id", b.id).eq("status", "quoted");
    await db.from("availability").upsert({ artist_id: b.artist_id, date: b.event_date, note: "Booked" }, { onConflict: "artist_id,date", ignoreDuplicates: true });
    return { ok: true };
  });

async function doCancel(id: string, by: "client" | "artist", reason: string | null) {
  const db = await admin();
  const { data: b } = await db.from("bookings").select("id, status, paid_amount, event_date").eq("id", id).single();
  if (!b || !["quoted", "confirmed"].includes(b.status)) throw new Error("This booking cannot be cancelled");
  const refund = refundAmount(Number(b.paid_amount), by, b.event_date);
  await db.from("bookings").update({
    status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: by, cancel_reason: reason, refund_amount: refund,
    escrow_status: Number(b.paid_amount) > 0 ? (refund >= Number(b.paid_amount) ? "refunded" : "partially_refunded") : "none",
  }).eq("id", id);
  return { refund };
}

export const cancelBookingAsClient = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; reason?: string }) => ({ id: uuid(i.id), key: uuid(i.key), reason: String(i.reason ?? "").slice(0, 500) || null }))
  .handler(async ({ data }) => { await bookingByKey(data.id, data.key); return doCancel(data.id, "client", data.reason); });

export const cancelBookingAsArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason?: string }) => ({ id: uuid(i.id), reason: String(i.reason ?? "").slice(0, 500) || null }))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase.from("bookings").select("artist_id").eq("id", data.id).maybeSingle();
    if (!b) throw new Error("Not found");
    await assertArtistOwns(context.supabase, context.userId, b.artist_id);
    return doCancel(data.id, "artist", data.reason);
  });

/** Artist: mark the event done; escrow is released. */
export const completeBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: uuid(i.id) }))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase.from("bookings").select("artist_id, status, event_date").eq("id", data.id).maybeSingle();
    if (!b) throw new Error("Not found");
    await assertArtistOwns(context.supabase, context.userId, b.artist_id);
    if (!canComplete(b.status, b.event_date)) throw new Error("Only paid bookings on or after the event date can be completed");
    const db = await admin();
    await db.from("bookings").update({ status: "completed", completed_at: new Date().toISOString(), escrow_status: "released" }).eq("id", data.id);
    return { ok: true };
  });

/** Client: one verified review per completed booking. */
export const submitBookingReview = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; rating: number; body: string }) => {
    const rating = Math.round(Number(i.rating));
    if (rating < 1 || rating > 5) throw new Error("Rating 1–5");
    const body = maskContacts(String(i.body ?? "").trim().slice(0, 1500));
    if (body.length < 10) throw new Error("Please write at least a short sentence");
    return { id: uuid(i.id), key: uuid(i.key), rating, body };
  })
  .handler(async ({ data }) => {
    const b = await bookingByKey(data.id, data.key);
    if (b.status !== "completed") throw new Error("Reviews open after the event is completed");
    if (b.reviews?.length) throw new Error("You already reviewed this booking");
    const db = await admin();
    const { error } = await db.from("reviews").insert({ artist_id: b.artist_id, booking_id: b.id, client_name: b.client_name.split(" ")[0] ?? "Client", event_label: b.event_types?.name ?? b.package_title, rating: data.rating, body: data.body, status: "published" });
    if (error) throw new Error("Could not save review");
    return { ok: true };
  });
