import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ClientThread = {
  id: string; key: string; artist: { stage_name: string; slug: string; hue: number | null } | null;
  mode: string; lastMessageAt: string; preview: string; lastSender: string | null; quoteRequestId: string | null;
};

/** Signed-in client: chats linked to the account, with the secret link key the client already owns. */
export const listClientConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientThread[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decodeChatMessage } = await import("./chat-attachments");
    const { decodeInvoice } = await import("./invoice");
    const { data: rows, error } = await supabaseAdmin.from("conversations")
      .select("id, access_key, mode, last_message_at, quote_request_id, artists(stage_name, slug, hue)")
      .eq("client_user_id", context.userId).order("last_message_at", { ascending: false }).limit(100);
    if (error) throw new Error("Could not load your conversations");
    const ids = (rows ?? []).map((r) => r.id);
    const latest = new Map<string, { body: string; sender: string }>();
    if (ids.length) {
      const { data: msgs } = await supabaseAdmin.from("messages").select("conversation_id, sender, body, created_at")
        .in("conversation_id", ids).neq("sender", "system").order("created_at", { ascending: false }).limit(Math.min(1000, ids.length * 20));
      for (const m of msgs ?? []) if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, { body: m.body, sender: m.sender });
    }
    return (rows ?? []).map((r) => {
      const last = latest.get(r.id);
      const text = last ? (decodeInvoice(last.body) ? "Invoice sent" : decodeChatMessage(last.body).text || "Attachment") : "";
      return {
        id: r.id, key: r.access_key, artist: r.artists, mode: r.mode, lastMessageAt: r.last_message_at,
        preview: text.replace(/\[[A-Z_]+[^\]]*\]/g, "").replace(/\s+/g, " ").trim().slice(0, 140), lastSender: last?.sender ?? null, quoteRequestId: r.quote_request_id,
      };
    });
  });

export type ClientBookingExtras = Record<string, {
  disputes: { id: string; status: string; reason: string; resolution: string | null; opened_by: string; created_at: string }[];
  review: { id: string; rating: number; body: string | null; status: string; created_at: string; rating_performance: number | null; rating_punctuality: number | null; rating_communication: number | null } | null;
}>;

/** Signed-in client: disputes and reviews on the client's own bookings (tables the client cannot read directly). */
export const getClientBookingExtras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ClientBookingExtras> => {
    const { data: own, error } = await context.supabase.from("bookings").select("id").eq("client_user_id", context.userId).limit(500);
    if (error) throw new Error("Could not load your bookings");
    const ids = (own ?? []).map((b) => b.id);
    if (!ids.length) return {};
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: disputes }, { data: reviews }] = await Promise.all([
      supabaseAdmin.from("disputes").select("id, booking_id, status, reason, resolution, opened_by, created_at").in("booking_id", ids).order("created_at", { ascending: false }),
      supabaseAdmin.from("reviews").select("id, booking_id, rating, body, status, created_at, rating_performance, rating_punctuality, rating_communication").in("booking_id", ids),
    ]);
    const out: ClientBookingExtras = {};
    for (const id of ids) out[id] = { disputes: [], review: null };
    for (const d of disputes ?? []) out[d.booking_id]?.disputes.push({ id: d.id, status: d.status, reason: d.reason, resolution: d.resolution, opened_by: d.opened_by, created_at: d.created_at });
    for (const r of reviews ?? []) if (r.booking_id && out[r.booking_id]) out[r.booking_id]!.review = { id: r.id, rating: r.rating, body: r.body, status: r.status, created_at: r.created_at, rating_performance: r.rating_performance, rating_punctuality: r.rating_punctuality, rating_communication: r.rating_communication };
    return out;
  });
