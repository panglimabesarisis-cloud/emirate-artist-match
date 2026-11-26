import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { decodeAgentBody, encodeAgentBody } from "./my-agent-rules";

/** Checks a video the agent started and, once ready, attaches the file to its answer. Owner only. */
export const checkVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ messageId: z.string().uuid(), job: z.string().max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    // Row security shows the message to its talent only.
    const message = await context.supabase.from("agent_chat_messages").select("body, chat_id").eq("id", data.messageId).maybeSingle();
    if (!message.data) return { status: "failed" as const };
    const chat = await context.supabase.from("agent_chats").select("artist_id").eq("id", message.data.chat_id).maybeSingle();
    const owner = chat.data ? await context.supabase.rpc("is_artist_owner", { _artist: chat.data.artist_id }) : null;
    const body = decodeAgentBody(message.data.body);
    const item = body.media?.find((m) => m.job === data.job);
    if (!chat.data || owner?.data !== true || !item) return { status: "failed" as const };
    if (item.path) return { status: "done" as const };
    const { finishVideo } = await import("./agent-media.server");
    const result = await finishVideo(chat.data.artist_id, data.job);
    if (result.status === "pending") return { status: "pending" as const };
    if (result.status === "done") item.path = result.path;
    else item.failed = true;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const saved = await supabaseAdmin.from("agent_chat_messages").update({ body: encodeAgentBody(body) }).eq("id", data.messageId);
    return { status: saved.error ? ("pending" as const) : result.status };
  });
