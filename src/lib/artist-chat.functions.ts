import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const readArtistChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(i.id)) throw new Error("Invalid chat");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: chat, error } = await context.supabase.from("conversations").select("id,artist_id,mode,chat_operator_id,client_name,handover_requested_at,quote_requests(name)").eq("id", data.id).single();
    if (error || !chat) throw new Error("Chat unavailable");
    const { data: owner } = await context.supabase.rpc("is_artist_owner", { _artist: chat.artist_id });
    if (!owner) throw new Error("Artist owner required");
    const { data: messages, error: messageError } = await context.supabase.from("messages").select("id,sender,body,created_at").eq("conversation_id", chat.id).order("created_at");
    if (messageError) throw new Error("Messages unavailable");
    return { chat, messages: messages ?? [] };
  });

export const changeArtistChatMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; mode: "ai" | "human" }) => {
    if (!/^[0-9a-f-]{36}$/i.test(i.id) || !["ai", "human"].includes(i.mode)) throw new Error("Invalid chat");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("artist_chat_mode", { _id: data.id, _mode: data.mode });
    if (error) throw new Error(error.message);
    return { ok: true };
  });