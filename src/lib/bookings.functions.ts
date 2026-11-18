import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskContacts } from "./masking";
import { getRequest } from "@tanstack/react-start/server";
import { priceBreakdown, refundAmount, canComplete, canDispute } from "./booking-rules";

const uuid = (v: unknown) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw new Error("Invalid id");
  return v;
};
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

const BOOKING_COLS = "id, guests, client_phone, revision_note, drafted_by, disputes(id, status, reason, resolution, opened_by), artist_id, conversation_id, client_name, client_email, package_title, notes, event_date, amount, vat_amount, total, paid_amount, escrow_status, status, invoice_no, contract_accepted_at, paid_at, completed_at, cancelled_at, cancelled_by, cancel_reason, refund_amount, created_at, event_types(name), artists(stage_name, slug, trn), reviews(id, rating, body)";

async function bookingByKey(id: string, key: string) {
  const db = await admin();
  const { data } = await db.from("bookings").select(BOOKING_COLS).eq("id", id).eq("access_key", key).maybeSingle();
  if (!data) throw new Error("Booking not found");
  return data;
}

async function assertArtistOwns(supabase: any, userId: string, artistId: string) {
  // Owner or an active team member (manager/assistant).
  void userId;
  const { data } = await supabase.rpc("is_artist_team", { _artist: artistId });
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
    await sendClientLink(b.id);
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
    if (b.status !== "quoted") throw new Error(b.status === "inquiry" ? "Waiting for the artist to approve" : "This offer can no longer be paid");
    const db = await admin();
    const { data: inv } = await db.rpc("next_invoice_no");
    const now = new Date().toISOString();
    await db.from("bookings").update({ status: "confirmed", contract_accepted_at: now, paid_at: now, paid_amount: b.total, escrow_status: "held", invoice_no: inv as string }).eq("id", b.id).eq("status", "quoted");
    await db.from("availability").upsert({ artist_id: b.artist_id, date: b.event_date, note: "Booked" }, { onConflict: "artist_id,date", ignoreDuplicates: true });
    await notifyTeamPaid(b.id).catch((e) => console.error("paid notify failed", e));
    return { ok: true };
  });

async function doCancel(id: string, by: "client" | "artist", reason: string | null) {
  const db = await admin();
  const { data: b } = await db.from("bookings").select("id, status, paid_amount, event_date").eq("id", id).single();
  if (!b || !["inquiry", "quoted", "confirmed"].includes(b.status)) throw new Error("This booking cannot be cancelled");
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
    await db.from("bookings").update({ status: "completed", completed_at: new Date().toISOString(), escrow_status: "release_pending" }).eq("id", data.id);
    return { ok: true };
  });

/** Client: one verified review per completed booking. */
export const submitBookingReview = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; rating: number; body: string; performance?: number; punctuality?: number; communication?: number }) => {
    const rating = Math.round(Number(i.rating));
    if (rating < 1 || rating > 5) throw new Error("Rating 1–5");
    const sr = (v: unknown) => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : null; };
    const body = maskContacts(String(i.body ?? "").trim().slice(0, 1500));
    if (body.length < 10) throw new Error("Please write at least a short sentence");
    return { id: uuid(i.id), key: uuid(i.key), rating, body, performance: sr(i.performance), punctuality: sr(i.punctuality), communication: sr(i.communication) };
  })
  .handler(async ({ data }) => {
    const b = await bookingByKey(data.id, data.key);
    if (b.status !== "completed") throw new Error("Reviews open after the event is completed");
    if (b.reviews?.length) throw new Error("You already reviewed this booking");
    const db = await admin();
    const { error } = await db.from("reviews").insert({ artist_id: b.artist_id, booking_id: b.id, client_name: b.client_name.split(" ")[0] ?? "Client", event_label: b.event_types?.name ?? b.package_title, rating: data.rating, body: data.body, status: "published", rating_performance: data.performance, rating_punctuality: data.punctuality, rating_communication: data.communication });
    if (error) throw new Error("Could not save review");
    return { ok: true };
  });

/** After payment: send the full booking details to the artist's and manager's WhatsApp. */
async function notifyTeamPaid(bookingId: string) {
  const db = await admin();
  const { notifyBooking, siteOrigin } = await import("./notify.server");
  const { data: b } = await db.from("bookings").select("id, client_name, client_phone, client_email, guests, package_title, notes, event_date, amount, total, invoice_no, event_types(name), artists(stage_name, notify_phone, manager_phone), conversations(quote_requests(start_time, end_time, perform_minutes, areas(name)))").eq("id", bookingId).single();
  if (!b) return;
  const q = b.conversations?.quote_requests;
  const details = [
    `Artist: ${b.artists?.stage_name}`, `Event: ${b.event_types?.name ?? "-"} on ${b.event_date}`,
    q?.start_time ? `Time: ${q.start_time.slice(0, 5)}${q.end_time ? ` - ${q.end_time.slice(0, 5)}` : ""}` : null,
    q?.areas?.name ? `Venue: ${q.areas.name}` : null, q?.perform_minutes ? `Performance: ${q.perform_minutes} min` : null,
    b.guests ? `Guests: ${b.guests}` : null, `Package: ${b.package_title ?? "-"}`,
    `Client: ${b.client_name}${b.client_phone ? ` ${b.client_phone}` : ""}${b.client_email ? ` ${b.client_email}` : ""}`,
    `Paid: AED ${Number(b.total).toLocaleString("en-US")} (invoice ${b.invoice_no ?? "-"})`, b.notes ? `Notes: ${b.notes}` : null,
  ].filter(Boolean).join("\n");
  const link = `${siteOrigin(getRequest())}/dashboard`;
  const phones = [...new Set([b.artists?.notify_phone, b.artists?.manager_phone].filter((x): x is string => !!x))];
  for (const phone of phones) await notifyBooking(b.id, "artist", "booking_paid", { phone }, "New paid booking confirmed", details, link);
}

async function sendClientLink(bookingId: string) {
  const db = await admin();
  const { notifyBooking, siteOrigin } = await import("./notify.server");
  const { data: b } = await db.from("bookings").select("id, access_key, client_email, client_phone, package_title, event_date, total, conversation_id, artists(stage_name)").eq("id", bookingId).single();
  if (!b) return;
  let phone = b.client_phone;
  if (!phone && b.conversation_id) {
    const { data: c } = await db.from("conversations").select("quote_requests(phone)").eq("id", b.conversation_id).single();
    phone = c?.quote_requests?.phone ?? null;
  }
  const link = `${siteOrigin(getRequest())}/booking/${b.id}?k=${b.access_key}`;
  await notifyBooking(b.id, "client", "booking_link", { email: b.client_email, phone },
    `${b.artists?.stage_name} approved your booking`,
    `${b.package_title} on ${b.event_date}, AED ${Number(b.total).toLocaleString("en-US")} incl. VAT`, link);
}

async function bookingByArtistKey(id: string, key: string) {
  const db = await admin();
  const { data } = await db.from("bookings").select("id, artist_id, conversation_id, client_name, guests, package_title, notes, event_date, amount, vat_amount, total, status, drafted_by, revision_note, event_types(name), artists(stage_name), conversations(quote_requests(areas(name), message, budget))").eq("id", id).eq("artist_key", key).maybeSingle();
  if (!data) throw new Error("Approval link not found");
  return data;
}

/** Artist approval link (from email/WhatsApp): view the AI-drafted booking. */
export const getApproval = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string }) => ({ id: uuid(i.id), key: uuid(i.key) }))
  .handler(async ({ data }) => {
    const b = await bookingByArtistKey(data.id, data.key);
    const db = await admin();
    const { data: msgs } = b.conversation_id ? await db.from("messages").select("sender, body").eq("conversation_id", b.conversation_id).neq("sender", "system").order("created_at", { ascending: false }).limit(8) : { data: [] };
    return { ...b, recent: (msgs ?? []).reverse() };
  });

/** Artist approves (optionally after editing). The client then receives the payment link. */
export const approveBooking = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; title: string; amount: number; eventDate: string; notes?: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.eventDate)) throw new Error("Event date required");
    const amount = Number(i.amount);
    if (!(amount > 0 && amount < 10_000_000)) throw new Error("Invalid amount");
    return { id: uuid(i.id), key: uuid(i.key), title: String(i.title ?? "").trim().slice(0, 120) || "Performance", amount, eventDate: i.eventDate, notes: maskContacts(String(i.notes ?? "").slice(0, 1000)) || null };
  })
  .handler(async ({ data }) => {
    const b = await bookingByArtistKey(data.id, data.key);
    if (b.status !== "inquiry") throw new Error("This booking was already handled");
    const p = priceBreakdown(data.amount);
    const edited = p.subtotal !== Number(b.amount) || data.eventDate !== b.event_date || data.title !== b.package_title;
    const db = await admin();
    await db.from("bookings").update({ status: "quoted", package_title: data.title, amount: p.subtotal, vat_amount: p.vat, total: p.total, event_date: data.eventDate, notes: data.notes, revision_note: edited ? "Edited by artist before approval" : null }).eq("id", b.id).eq("status", "inquiry");
    if (b.conversation_id) await db.from("messages").insert({ conversation_id: b.conversation_id, sender: "system", body: `${b.artists?.stage_name} approved your booking${edited ? " with some changes" : ""}: ${data.title} on ${data.eventDate} — AED ${p.total.toLocaleString("en-US")} incl. VAT. Open the offer below to pay.` });
    await sendClientLink(b.id);
    return { ok: true };
  });

/** Artist declines the draft and tells the client what needs to change. */
export const declineBooking = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; note: string }) => {
    const note = maskContacts(String(i.note ?? "").trim().slice(0, 600));
    if (note.length < 5) throw new Error("Tell the client what needs to change");
    return { id: uuid(i.id), key: uuid(i.key), note };
  })
  .handler(async ({ data }) => {
    const b = await bookingByArtistKey(data.id, data.key);
    if (b.status !== "inquiry") throw new Error("This booking was already handled");
    const db = await admin();
    await db.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "artist", cancel_reason: data.note, revision_note: data.note }).eq("id", b.id);
    if (b.conversation_id) {
      await db.from("messages").insert({ conversation_id: b.conversation_id, sender: "artist", body: data.note });
      await db.from("conversations").update({ mode: "human", last_message_at: new Date().toISOString() }).eq("id", b.conversation_id);
    }
    return { ok: true };
  });

async function openDispute(bookingId: string, by: "client" | "artist", reason: string) {
  const db = await admin();
  const { data: b } = await db.from("bookings").select("status, escrow_status").eq("id", bookingId).single();
  if (!b || !canDispute(b.status, b.escrow_status)) throw new Error("A dispute can only be opened on a paid booking before funds are released");
  const { count } = await db.from("disputes").select("id", { count: "exact", head: true }).eq("booking_id", bookingId).eq("status", "open");
  if ((count ?? 0) > 0) throw new Error("A dispute is already open");
  await db.from("disputes").insert({ booking_id: bookingId, opened_by: by, reason });
  await db.from("bookings").update({ status: "disputed", escrow_status: "frozen" }).eq("id", bookingId);
  return { ok: true };
}
const reasonOf = (r: unknown) => { const s = maskContacts(String(r ?? "").trim().slice(0, 1500)); if (s.length < 10) throw new Error("Please describe the problem"); return s; };

export const openDisputeAsClient = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; reason: string }) => ({ id: uuid(i.id), key: uuid(i.key), reason: reasonOf(i.reason) }))
  .handler(async ({ data }) => { await bookingByKey(data.id, data.key); return openDispute(data.id, "client", data.reason); });

export const openDisputeAsArtist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; reason: string }) => ({ id: uuid(i.id), reason: reasonOf(i.reason) }))
  .handler(async ({ data, context }) => {
    const { data: b } = await context.supabase.from("bookings").select("artist_id").eq("id", data.id).maybeSingle();
    if (!b) throw new Error("Not found");
    await assertArtistOwns(context.supabase, context.userId, b.artist_id);
    return openDispute(data.id, "artist", data.reason);
  });

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Admin: escrow overview (also releases holds older than 48h without a dispute). */
export const adminEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await admin();
    await db.rpc("release_due_escrow");
    const { data: rows } = await db.from("bookings").select("id, client_name, package_title, event_date, total, paid_amount, refund_amount, status, escrow_status, invoice_no, completed_at, artists(stage_name), disputes(id, opened_by, reason, status, resolution, refund_amount, admin_note, created_at, resolved_at)").neq("escrow_status", "none").eq("is_seed", false).order("created_at", { ascending: false }).limit(200);
    const { data: notes } = await db.from("notifications").select("id, channel, audience, kind, recipient, status, error, created_at").order("created_at", { ascending: false }).limit(50);
    return { bookings: rows ?? [], notifications: notes ?? [] };
  });

export const adminReleaseEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: uuid(i.id) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await admin();
    await db.from("bookings").update({ escrow_status: "released" }).eq("id", data.id).eq("status", "completed").eq("escrow_status", "release_pending");
    return { ok: true };
  });

export const adminResolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { disputeId: string; resolution: "release_to_artist" | "refund_full" | "refund_partial"; refund?: number; note?: string }) => {
    if (!["release_to_artist", "refund_full", "refund_partial"].includes(i.resolution)) throw new Error("Invalid resolution");
    return { disputeId: uuid(i.disputeId), resolution: i.resolution, refund: Math.max(0, Number(i.refund ?? 0)), note: String(i.note ?? "").slice(0, 1000) || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await admin();
    const { data: d } = await db.from("disputes").select("id, status, booking_id, bookings(paid_amount, completed_at)").eq("id", data.disputeId).single();
    if (!d || d.status !== "open") throw new Error("Dispute already resolved");
    const paid = Number(d.bookings?.paid_amount ?? 0);
    const refund = data.resolution === "refund_full" ? paid : data.resolution === "refund_partial" ? Math.min(paid, data.refund) : 0;
    if (data.resolution === "refund_partial" && !(refund > 0 && refund < paid)) throw new Error("Partial refund must be between 0 and the paid amount");
    const now = new Date().toISOString();
    await db.from("disputes").update({ status: "resolved", resolution: data.resolution, refund_amount: refund, admin_note: data.note, resolved_at: now }).eq("id", d.id);
    await db.from("bookings").update(refund >= paid
      ? { status: "cancelled", cancelled_at: now, cancelled_by: "admin", cancel_reason: "Dispute resolved: full refund", refund_amount: refund, escrow_status: "refunded" }
      : { status: "completed", completed_at: d.bookings?.completed_at ?? now, refund_amount: refund, escrow_status: refund > 0 ? "partially_refunded" : "released" }).eq("id", d.booking_id);
    return { ok: true };
  });
