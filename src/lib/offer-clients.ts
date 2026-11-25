/** The clients an artist can send a booking offer to: one entry per client, their latest chat. */
export type OfferChat = {
  id: string; client_name?: string | null; client_user_id?: string | null; entry_source?: string | null; deleted_at?: string | null; last_message_at?: string | null;
  quote_requests?: { name?: string | null; email?: string | null; event_date?: string | null; start_time?: string | null; end_time?: string | null } | null;
};
export type OfferClient = { id: string; name: string; eventDate: string | null; startTime: string | null; endTime: string | null; lastMessageAt: string | null };

const PLACEHOLDER = /^(client|direct chat)\b/i;
const real = (name: string | null | undefined) => (name?.trim() && !PLACEHOLDER.test(name.trim()) ? name.trim() : null);

/** Test chats, removed chats and visitors who never gave a name are left out. */
export function offerClients(chats: OfferChat[], bookings: { conversation_id?: string | null; client_name?: string | null }[] = []): OfferClient[] {
  const newestFirst = [...chats].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  const found = new Map<string, OfferClient>();
  for (const chat of newestFirst) {
    if (chat.deleted_at || chat.entry_source === "test") continue;
    const quote = chat.quote_requests;
    const name = real(quote?.name) ?? real(chat.client_name) ?? real(bookings.find(b => b.conversation_id === chat.id && real(b.client_name))?.client_name);
    if (!name) continue;
    const person = chat.client_user_id ?? quote?.email?.toLowerCase() ?? name.toLowerCase();
    if (!found.has(person)) found.set(person, { id: chat.id, name, eventDate: quote?.event_date ?? null, startTime: quote?.start_time ?? null, endTime: quote?.end_time ?? null, lastMessageAt: chat.last_message_at ?? null });
  }
  return [...found.values()];
}
