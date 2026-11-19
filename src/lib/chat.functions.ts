import { formatBookingMessage } from "./booking-message";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskContacts, MAX_CLIENT_MESSAGE_LENGTH, TOPUP_PACKAGES } from "./masking";

const uuid = (v: unknown) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) throw new Error("Invalid id");
  return v;
};
const str = (v: unknown, max: number, required = false) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  if (required && !s) throw new Error("Missing field");
  return s || null;
};

export type QuoteInput = {
  artistId: string; clientUserId: string | null; name: string; email: string; phone: string | null;
  eventTypeId: string | null; eventDate: string | null; areaId: string | null; guests: number | null; budget: number | null; message: string | null;
  startTime?: string | null; endTime?: string | null; performMinutes?: number | null; packageIds?: string[];
};

/** Public: stores a quote request, opens a conversation and gets the first AI reply. */
export const submitQuote = createServerFn({ method: "POST" })
  .inputValidator((i: QuoteInput): QuoteInput => {
    const email = str(i.email, 255, true)!;
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Invalid email");
    return {
      artistId: uuid(i.artistId), clientUserId: null, name: str(i.name, 120, true)!, email, phone: str(i.phone, 30),
      eventTypeId: i.eventTypeId ? uuid(i.eventTypeId) : null, eventDate: i.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(i.eventDate) ? i.eventDate : null,
      areaId: i.areaId ? uuid(i.areaId) : null, guests: i.guests ? Math.min(Math.max(1, Math.round(Number(i.guests))), 100000) : null,
      budget: (() => { const b = Number(i.budget); if (!(b > 0)) throw new Error("Budget is required"); return Math.min(b, 10_000_000); })(), message: str(i.message, 2000),
      startTime: typeof i.startTime === "string" && /^\d{2}:\d{2}$/.test(i.startTime) ? i.startTime : null,
      endTime: typeof i.endTime === "string" && /^\d{2}:\d{2}$/.test(i.endTime) ? i.endTime : null,
      packageIds: Array.isArray(i.packageIds) ? i.packageIds.slice(0, 10).map(uuid) : [],
      performMinutes: i.performMinutes ? Math.min(Math.max(1, Math.round(Number(i.performMinutes))), 1440) : null,
    };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { addMessage, runAgent } = await import("./agent.server");
    const { data: artist } = await supabaseAdmin.from("artists").select("id, status, stage_name").eq("id", data.artistId).single();
    if (!artist || artist.status !== "approved") throw new Error("Artist not available");
    if (data.eventDate) {
      const { data: b } = await supabaseAdmin.from("availability").select("id").eq("artist_id", data.artistId).eq("date", data.eventDate).maybeSingle();
      if (b) return { error: "The artist is unavailable on that date." as const };
    }
    const { data: q, error } = await supabaseAdmin.from("quote_requests").insert({
      artist_id: data.artistId, name: data.name, email: data.email, phone: data.phone, event_type_id: data.eventTypeId,
      event_date: data.eventDate, area_id: data.areaId, guests: data.guests, budget: data.budget, message: data.message,
      start_time: data.startTime ?? null, end_time: data.endTime ?? null, perform_minutes: data.performMinutes ?? null,
    }).select("id").single();
    if (error || !q) throw new Error("Could not save request");
    const { data: c } = await supabaseAdmin.from("conversations").insert({ quote_request_id: q.id, artist_id: data.artistId }).select("id, access_key").single();
    if (!c) throw new Error("Could not open conversation");
    const { data: pk } = data.packageIds?.length
      ? await supabaseAdmin.from("rate_cards").select("title, price").eq("artist_id", data.artistId).in("id", data.packageIds)
      : { data: [] };
    const { data: area } = data.areaId ? await supabaseAdmin.from("areas").select("name").eq("id", data.areaId).maybeSingle() : { data: null };
    const summary = formatBookingMessage({
      venue: area?.name ?? null, name: data.name, artistName: artist.stage_name, eventDate: data.eventDate, startTime: data.startTime ?? null, endTime: data.endTime ?? null,
      performMinutes: data.performMinutes ?? null, guests: data.guests, budget: data.budget,
      packages: (pk ?? []).map((p) => ({ title: p.title, price: Number(p.price) })), note: data.message,
    });
    await addMessage(c.id, "client", maskContacts(summary));
    await runAgent(c.id);
    return { conversationId: c.id, key: c.access_key };
  });

async function verifyKey(conversationId: string, key: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("conversations").select("id, mode, artist_id, access_key, artists(stage_name, slug, hue)").eq("id", conversationId).single();
  if (!data || data.access_key !== key) throw new Error("Conversation not found");
  return { supabaseAdmin, convo: data };
}

/** Public with secret link key: read a conversation. */
export const getChat = createServerFn({ method: "GET" })
  .inputValidator((i: { id: string; key: string }) => ({ id: uuid(i.id), key: uuid(i.key) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin, convo } = await verifyKey(data.id, data.key);
    const { data: msgs } = await supabaseAdmin.from("messages").select("id, sender, body, created_at").eq("conversation_id", data.id).order("created_at");
    return { mode: convo.mode, artist: convo.artists, messages: msgs ?? [] };
  });

/** Public with secret link key: client sends a message; AI replies if in AI mode. */
export const sendClientMessage = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; text: string }) => ({ id: uuid(i.id), key: uuid(i.key), text: str(i.text, MAX_CLIENT_MESSAGE_LENGTH, true)! }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await verifyKey(data.id, data.key);
    // anti-abuse: max 10 client messages per minute per conversation
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", data.id).eq("sender", "client").gte("created_at", since);
    if ((count ?? 0) >= 10) return { error: "You're sending messages too fast. Please wait a moment." };
    const { addMessage, runAgent } = await import("./agent.server");
    await addMessage(data.id, "client", maskContacts(data.text));
    await runAgent(data.id);
    return { ok: true };
  });

async function assertOwner(supabase: { from: (t: "conversations") => any }, conversationId: string) {
  const { data } = await supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/** Artist replies personally (masked). */
export const artistReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; text: string }) => ({ id: uuid(i.id), text: str(i.text, 2000, true)! }))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.id); // RLS: only the owning artist can see it
    const { addMessage } = await import("./agent.server");
    await addMessage(data.id, "artist", maskContacts(data.text));
    return { ok: true };
  });

/** Demo top-up: simulated payment, credits added through the ledger. */
export const topUpCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { packageId: string }) => i)
  .handler(async ({ data, context }) => {
    const pkg = TOPUP_PACKAGES.find((p) => p.id === data.packageId);
    if (!pkg) throw new Error("Unknown package");
    const { data: artist } = await context.supabase.from("artists").select("id").eq("user_id", context.userId).maybeSingle();
    if (!artist) throw new Error("No artist profile");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("credit_ledger").insert({ artist_id: artist.id, delta: pkg.credits, reason: "topup_demo", ref: `${pkg.id}:AED${pkg.priceAed}` });
    return { ok: true, credits: pkg.credits };
  });

/** Artist tests their agent with a private chat (charged like real replies). */
export const testAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { text: string }) => ({ text: str(i.text, MAX_CLIENT_MESSAGE_LENGTH, true)! }))
  .handler(async ({ data, context }) => {
    const { data: artist } = await context.supabase.from("artists").select("id").eq("user_id", context.userId).maybeSingle();
    if (!artist) throw new Error("No artist profile");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { addMessage, runAgent } = await import("./agent.server");
    let { data: c } = await supabaseAdmin.from("conversations").select("id, mode").eq("artist_id", artist.id).is("quote_request_id", null).maybeSingle();
    if (!c) c = (await supabaseAdmin.from("conversations").insert({ artist_id: artist.id }).select("id, mode").single()).data;
    if (!c) throw new Error("Could not open test chat");
    if (c.mode !== "ai") await supabaseAdmin.from("conversations").update({ mode: "ai", ai_replies: 0 }).eq("id", c.id);
    await addMessage(c.id, "client", maskContacts(data.text));
    await runAgent(c.id);
    const { data: msgs } = await supabaseAdmin.from("messages").select("id, sender, body").eq("conversation_id", c.id).order("created_at");
    return { messages: msgs ?? [] };
  });

/** Demo plan subscription: simulated payment, switches plan and grants its AI credits. */
export const subscribePlanDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string; cycle: "monthly" | "yearly" }) => ({ code: str(i.code, 30, true)!, cycle: i.cycle === "yearly" ? "yearly" as const : "monthly" as const }))
  .handler(async ({ data, context }) => {
    const { data: artist } = await context.supabase.from("artists").select("id, plan").eq("user_id", context.userId).maybeSingle();
    if (!artist) throw new Error("No artist profile");
    const { data: tier } = await context.supabase.from("plan_tiers").select("*").eq("code", data.code).maybeSingle();
    if (!tier) throw new Error("Unknown plan");
    if (artist.plan === tier.code) throw new Error("Already on this plan");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("artists").update({ plan: tier.code as never }).eq("id", artist.id);
    if (error) throw new Error(error.message);
    const price = data.cycle === "yearly" ? tier.price_yearly : tier.price_monthly;
    if (tier.ai_credits > 0) await supabaseAdmin.from("credit_ledger").insert({ artist_id: artist.id, delta: tier.ai_credits, reason: "plan_allocation", ref: `demo:${tier.code}:${data.cycle}:AED${price}` });
    return { ok: true, name: tier.name };
  });

/** Public: opens a chat with no booking form so the AI follows the artist's AI flow from the start. */
export const startChat = createServerFn({ method: "POST" })
  .inputValidator((i: { artistId: string }) => ({ artistId: uuid(i.artistId) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { addMessage, runAgent } = await import("./agent.server");
    const { data: artist } = await supabaseAdmin.from("artists").select("id, status").eq("id", data.artistId).single();
    if (!artist || artist.status !== "approved") throw new Error("Artist not available");
    const { data: c } = await supabaseAdmin.from("conversations").insert({ artist_id: data.artistId }).select("id, access_key").single();
    if (!c) throw new Error("Could not open conversation");
    await addMessage(c.id, "client", "Hi, I'd like to chat about a booking.");
    await runAgent(c.id);
    return { conversationId: c.id, key: c.access_key };
  });

/** Artist: create an invoice from services and post it into the client's chat. */
export const sendInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { conversationId: string; items: { title: string; qty: number; price: number }[]; due?: string | null; notes?: string | null }) => ({
    conversationId: uuid(i.conversationId),
    items: (Array.isArray(i.items) ? i.items : []).slice(0, 20).map((x) => ({ title: String(x?.title ?? ""), qty: Number(x?.qty) || 0, price: Number(x?.price) || 0 })),
    due: typeof i.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.due) ? i.due : null,
    notes: str(i.notes, 500),
  }))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.conversationId);
    const { buildInvoice, encodeInvoice } = await import("./invoice");
    const no = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const inv = buildInvoice(no, data.items, data.due, data.notes ? maskContacts(data.notes) : null);
    const { addMessage } = await import("./agent.server");
    await addMessage(data.conversationId, "artist", encodeInvoice(inv));
    return { ok: true, no, total: inv.total };
  });
