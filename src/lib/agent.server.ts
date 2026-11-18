import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AI_CREDIT_COST, MAX_AI_REPLIES_PER_CONVERSATION, maskContacts } from "./masking";

const MODEL = "openai/gpt-6-astra" as const;

export async function addMessage(conversationId: string, sender: string, body: string) {
  await supabaseAdmin.from("messages").insert({ conversation_id: conversationId, sender, body: body.slice(0, 4000) });
  await supabaseAdmin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversationId);
}

/** Runs the artist's AI agent for one reply, charging the artist's credit wallet. */
export async function runAgent(conversationId: string) {
  const { data: convo } = await supabaseAdmin.from("conversations").select("*").eq("id", conversationId).single();
  if (!convo || convo.mode !== "ai") return;

  const [{ data: artist }, { data: settings }, { data: wallet }, { data: rates }, { data: blocked }, { data: quote }, { data: history }] =
    await Promise.all([
      supabaseAdmin.from("artists").select("stage_name, bio, base_price, languages, travel_radius_km, areas(name), subcategories(name)").eq("id", convo.artist_id).single(),
      supabaseAdmin.from("agent_settings").select("*").eq("artist_id", convo.artist_id).maybeSingle(),
      supabaseAdmin.from("credit_wallets").select("balance").eq("artist_id", convo.artist_id).maybeSingle(),
      supabaseAdmin.from("rate_cards").select("title, price, duration_minutes, description").eq("artist_id", convo.artist_id).order("sort"),
      supabaseAdmin.from("availability").select("date").eq("artist_id", convo.artist_id).gte("date", new Date().toISOString().slice(0, 10)),
      convo.quote_request_id
        ? supabaseAdmin.from("quote_requests").select("name, event_date, guests, budget, message, event_types(name), areas(name)").eq("id", convo.quote_request_id).single()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from("messages").select("sender, body").eq("conversation_id", conversationId).order("created_at").limit(40),
    ]);

  const handover = async (why: string) => {
    await supabaseAdmin.from("conversations").update({ mode: "human" }).eq("id", conversationId);
    await addMessage(conversationId, "system", why);
  };

  if (!artist) return;
  if (settings && !settings.enabled) return handover(`${artist.stage_name} will reply to you personally.`);
  if ((wallet?.balance ?? 0) < AI_CREDIT_COST) return handover(`${artist.stage_name} will reply to you personally shortly.`);
  if (convo.ai_replies >= MAX_AI_REPLIES_PER_CONVERSATION) return handover(`I've passed this conversation to ${artist.stage_name} directly.`);

  const maxDiscount = settings?.max_discount_pct ?? 10;
  const packages = (rates ?? []).map((r) => `- ${r.title}: AED ${Number(r.price).toLocaleString("en-US")} (${r.duration_minutes} min) — ${r.description ?? ""}`).join("\n");
  const floor = Math.min(...(rates ?? []).map((r) => Number(r.price)), Number(artist.base_price)) * (1 - maxDiscount / 100);

  const instructions = `You are the AI booking assistant for ${artist.stage_name}, a ${artist.subcategories?.name ?? "performer"} based in ${artist.areas?.name ?? "Dubai"}, UAE. Always say you are an AI assistant if asked.
Tone: ${settings?.tone ?? "warm and professional"}. Reply in the client's language (English or Arabic). Keep replies under 120 words. Write plain text only — no markdown, asterisks or headings. Today is ${new Date().toISOString().slice(0, 10)} (Asia/Dubai); assume the next upcoming occurrence of any date without a year.
Goal: collect missing event details (date, venue area, guest count, timing, event type), recommend a package and quote a price.
PRICING RULES (strict):
${packages || "- No packages set. Do not quote a price; say the artist will confirm."}
- Only quote the package prices above, in AED. Prices exclude 5% VAT.
- You may offer at most ${maxDiscount}% off. Never go below AED ${Math.round(floor).toLocaleString("en-US")}. If the client wants lower, politely decline and say the artist can review.
- Travel radius ${artist.travel_radius_km ?? 30} km from base; beyond that say travel fees will be confirmed by the artist.
AVAILABILITY: unavailable on ${(blocked ?? []).map((b) => b.date).join(", ") || "no blocked dates"}. Never confirm a booking yourself; say the artist will send a formal confirmation.
Never share or ask for phone numbers, emails or social handles — all communication stays on the platform.
If the client asks something you cannot answer, or wants to speak to the artist, end your reply with the exact token [HANDOVER].
${settings?.extra_instructions ? `Artist notes: ${settings.extra_instructions}` : ""}
Original request: ${JSON.stringify(quote ?? {})}`;

  const input = (history ?? [])
    .filter((m) => m.sender !== "system")
    .map((m) => ({ role: m.sender === "client" ? ("user" as const) : ("assistant" as const), content: m.body }));

  try {
    const res = await generateResponse({ model: MODEL, instructions, input, max_output_tokens: 600 });
    let text = "";
    for (const item of res.output ?? []) {
      if (item.type === "message") for (const c of item.content) if (c.type === "output_text") text += c.text;
    }
    text = text.trim();
    const wantsHandover = text.includes("[HANDOVER]");
    text = maskContacts(text.replace("[HANDOVER]", "").replace(/\*\*|__|^#+\s/gm, "").trim());
    if (!text) return;
    await addMessage(conversationId, "ai", text);
    await supabaseAdmin.from("credit_ledger").insert({ artist_id: convo.artist_id, delta: -AI_CREDIT_COST, reason: "ai_reply", ref: conversationId });
    await supabaseAdmin.from("conversations").update({ ai_replies: convo.ai_replies + 1 }).eq("id", conversationId);
    if (wantsHandover) await handover(`I've notified ${artist.stage_name} to continue this conversation personally.`);
  } catch (e) {
    console.error("AI agent failed", e instanceof GatewayError ? { code: e.code, ids: e.ids } : e);
    await handover(`${artist.stage_name} will reply to you personally shortly.`);
  }
}
