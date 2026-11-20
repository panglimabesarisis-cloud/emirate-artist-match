import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAT_BUCKET, decodeChatMessage, validateAttachment, attachmentInConversation } from "./chat-attachments";

export const uploadChatFile = createServerFn({ method: "POST" })
  .inputValidator((input: FormData) => input)
  .handler(async ({ data }) => {
    const id = data.get("id"), key = data.get("key"), file = data.get("file");
    if (typeof id !== "string" || typeof key !== "string" || !(file instanceof File)) throw new Error("Invalid upload");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conversation } = await supabaseAdmin.from("conversations").select("access_key").eq("id", id).single();
    if (!conversation || conversation.access_key !== key) throw new Error("Conversation not found");
    const validated = validateAttachment(file);
    const { data: existing } = await supabaseAdmin.storage.from(CHAT_BUCKET).list(`chat/${id}`, { limit: 31 });
    if ((existing?.length ?? 0) >= 30) throw new Error("This conversation has reached its attachment limit.");
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "video/mp4": "mp4", "video/quicktime": "mov" };
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const prefix = new TextDecoder().decode(bytes);
    const matches = file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === "image/png" ? bytes[0] === 137 && prefix.slice(1, 4) === "PNG" : file.type === "image/webp" ? prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP" : file.type === "application/pdf" ? prefix.startsWith("%PDF-") : prefix.slice(4, 8) === "ftyp";
    if (!matches) throw new Error("File contents do not match the selected file type.");
    const path = `chat/${id}/${crypto.randomUUID()}.${extensions[file.type]}`;
    const { error } = await supabaseAdmin.storage.from(CHAT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error("File upload failed. Please try again.");
    return { path, ...validated };
  });

/** The artist team's existing conversation SELECT policy authorizes this read. */
export const artistChatFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: conversation } = await context.supabase.from("conversations").select("id").eq("id", data.id).single();
    if (!conversation) throw new Error("Forbidden");
    const { data: messages } = await context.supabase.from("messages").select("id, body").eq("conversation_id", data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return Promise.all((messages ?? []).map(async message => ({ id: message.id, files: await Promise.all(decodeChatMessage(message.body).attachments.filter(file => attachmentInConversation(file.path, data.id)).map(async file => {
      const { data: signed } = await supabaseAdmin.storage.from(CHAT_BUCKET).createSignedUrl(file.path, 3600);
      return { ...file, ...(signed?.signedUrl ? { url: signed.signedUrl } : {}) };
    })) })));
  });