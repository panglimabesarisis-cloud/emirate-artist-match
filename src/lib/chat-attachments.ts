import { maskContacts } from "./masking";

export const CHAT_BUCKET = "chat-files";
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4", "video/quicktime"];
export type ChatAttachment = { path: string; name: string; type: string; size: number; url?: string };
export function validateAttachment(file: { name: string; type: string; size: number }) {
  if (!ATTACHMENT_TYPES.includes(file.type)) throw new Error("Only JPG, PNG, WebP, PDF, MP4 and MOV files are supported.");
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 50 * 1024 * 1024) throw new Error("Maximum file size is 50 MB.");
  return { name: maskContacts(String(file.name).slice(0, 300)).replace(/[\r\n]/g, " ").slice(0, 120), type: file.type, size: file.size };
}
export function attachmentInConversation(path: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || path.length > 200) return false;
  return new RegExp(`^chat/${id}/[0-9a-f-]{36}\\.(jpg|png|webp|pdf|mp4|mov)$`, "i").test(path);
}
export function encodeChatMessage(text: string, attachments: ChatAttachment[]) {
  return attachments.length ? JSON.stringify({ kind: "chat_attachments", text: maskContacts(text), attachments: attachments.map(({ url: _url, ...file }) => file) }) : maskContacts(text);
}
export function decodeChatMessage(body: string): { text: string; attachments: ChatAttachment[] } {
  try {
    const value = JSON.parse(body);
    if (value.kind === "chat_attachments" && typeof value.text === "string" && Array.isArray(value.attachments)) return { text: value.text, attachments: value.attachments.filter((file: ChatAttachment) => typeof file.path === "string" && typeof file.name === "string" && ATTACHMENT_TYPES.includes(file.type)) };
  } catch { /* Ordinary text message. */ }
  return { text: body, attachments: [] };
}