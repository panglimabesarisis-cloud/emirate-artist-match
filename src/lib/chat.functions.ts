import { CHAT_BUCKET, decodeChatMessage, encodeChatMessage, validateAttachment, attachmentInConversation, type ChatAttachment } from "./chat-attachments";
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

function validateQuote(i: QuoteInput): QuoteInput {
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
}

/** Stores a quote request, opens its conversation (linked to the verified client account when known) and gets the first AI reply. */
async function createQuote(data: QuoteInput, clientUserId: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { addMessage, runAgent } = await import("./agent.server");
  const { data: artist } = await supabaseAdmin.from("artists").select("id, status, stage_name").eq("id", data.artistId).single();
  if (!artist || artist.status !== "approved") throw new Error("Artist not available");
  const { data: q, error } = await supabaseAdmin.from("quote_requests").insert({
    artist_id: data.artistId, name: data.name, email: data.email, phone: data.phone, event_type_id: data.eventTypeId,
    event_date: data.eventDate, area_id: data.areaId, guests: data.guests, budget: data.budget, message: data.message,
    start_time: data.startTime ?? null, end_time: data.endTime ?? null, perform_minutes: data.performMinutes ?? null,
    client_user_id: clientUserId,
  }).select("id").single();
  if (error || !q) throw new Error("Could not save request");
  const { data: c } = await supabaseAdmin.from("conversations").insert({ quote_request_id: q.id, artist_id: data.artistId, client_user_id: clientUserId }).select("id, access_key").single();
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
}

/** Public: stores a quote request; a signed-in visitor's request is linked to their account. */
export const submitQuote = createServerFn({ method: "POST" })
  .inputValidator(validateQuote)
  .handler(async ({ data }) => {
    const { optionalUserId } = await import("./request-user.server");
    return createQuote(data, await optionalUserId());
  });

export type ClientRequestInput = Omit<QuoteInput, "clientUserId" | "name" | "email"> & { eventTitle?: string | null };

/** Signed-in client portal: booking request with the account's verified name, email and phone. */
export const submitClientQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: ClientRequestInput) => {
    const title = str(i.eventTitle, 120);
    const note = str(i.message, 1800);
    return validateQuote({ ...i, clientUserId: null, name: "Client", email: "client@example.com", message: [title ? `Event: ${title}` : null, note].filter(Boolean).join("\n") || null });
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: user }, { data: profile }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(context.userId),
      supabaseAdmin.from("profiles").select("display_name, phone").eq("id", context.userId).maybeSingle(),
    ]);
    const email = user.user?.email;
    if (!email) throw new Error("Add an email address to your account first");
    const name = (profile?.display_name ?? "").trim() || email.split("@")[0] || "Client";
    return createQuote({ ...data, name: name.slice(0, 120), email, phone: data.phone ?? profile?.phone ?? null }, context.userId);
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
    const { data: invoices } = await supabaseAdmin.from("service_invoices").select("id,status,paid_at").eq("conversation_id", data.id);
    return { mode: convo.mode, artist: convo.artists, messages: await Promise.all((msgs ?? []).map(async message => {
      const parsed = decodeChatMessage(message.body);
      const attachments = await Promise.all(parsed.attachments.filter(file => attachmentInConversation(file.path, data.id)).map(async file => {
        const { data: signed } = await supabaseAdmin.storage.from(CHAT_BUCKET).createSignedUrl(file.path, 3600);
        return { ...file, ...(signed?.signedUrl ? { url: signed.signedUrl } : {}) };
      }));
      return { ...message, body: parsed.text, attachments };
    })), invoices: invoices ?? [] };
  });

/** Public with secret link key: client sends a message; AI replies if in AI mode. */
export const sendClientMessage = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; key: string; text: string; attachments?: ChatAttachment[] }) => {
    const attachments = (i.attachments ?? []).map(file => ({ path: file.path, ...validateAttachment(file) }));
    if (attachments.length > 3 || attachments.some(file => !attachmentInConversation(file.path, i.id))) throw new Error("Invalid attachments");
    const text = str(i.text, MAX_CLIENT_MESSAGE_LENGTH) ?? "";
    if (!text && !attachments.length) throw new Error("Missing message");
    return { id: uuid(i.id), key: uuid(i.key), text, attachments };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await verifyKey(data.id, data.key);
    // anti-abuse: max 10 client messages per minute per conversation
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", data.id).eq("sender", "client").gte("created_at", since);
    if ((count ?? 0) >= 10) return { error: "You're sending messages too fast. Please wait a moment." };
    const { addMessage, runAgent } = await import("./agent.server");
    for (const file of data.attachments) {
      const { data: stored, error } = await supabaseAdmin.storage.from(CHAT_BUCKET).info(file.path);
      if (error || !stored || Number(stored.size ?? stored.metadata?.['size']) !== file.size || (stored.contentType ?? stored.metadata?.['mimetype']) !== file.type) throw new Error("Attachment not found");
    }
    await addMessage(data.id, "client", encodeChatMessage(data.text, data.attachments));
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
    void data; void context;
    throw new Error("Use Stripe sandbox checkout to buy credits");
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
    void data; void context;
    throw new Error('Demo plan switching is disabled. Use verified test subscription checkout.');
  });

/** Public: opens a chat with no booking form so the AI follows the artist's AI flow from the start. */
export const startChat = createServerFn({ method: "POST" })
  .inputValidator((i: { artistId: string; text?: string }) => ({ artistId: uuid(i.artistId), text: str(i.text, MAX_CLIENT_MESSAGE_LENGTH) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { addMessage, runAgent } = await import("./agent.server");
    const { data: artist } = await supabaseAdmin.from("artists").select("id, status").eq("id", data.artistId).single();
    if (!artist || artist.status !== "approved") throw new Error("Artist not available");
    const { optionalUserId } = await import("./request-user.server");
    const { data: c } = await supabaseAdmin.from("conversations").insert({ artist_id: data.artistId, client_user_id: await optionalUserId() }).select("id, access_key").single();
    if (!c) throw new Error("Could not open conversation");
    await addMessage(c.id, "client", maskContacts(data.text ?? "Hi, I'd like to chat about a booking."));
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
    const inv = buildInvoice(no, data.items.map(x => ({ ...x, title: maskContacts(x.title) })), data.due, data.notes ? maskContacts(data.notes) : null);
    const { data: c } = await context.supabase.from("conversations").select("artist_id").eq("id", data.conversationId).single();
    if (!c) throw new Error("Conversation not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    inv.id = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("service_invoices").insert({ id: inv.id, artist_id: c.artist_id, conversation_id: data.conversationId, number: no, document: JSON.parse(JSON.stringify(inv)), total: inv.total });
    if (error) throw new Error(error.message);
    const { addMessage } = await import("./agent.server");
    await addMessage(data.conversationId, "artist", encodeInvoice(inv));
    return { ok: true, no, total: inv.total };
  });
