/** Chats opened on this device, newest first, so a guest can move between them. Nothing is sent anywhere. */
export type SavedChat = { id: string; k: string; title: string };

const KEY = "dm_recent_chats";

export function readRecentChats(): SavedChat[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(rows) ? rows.filter((r): r is SavedChat => !!r && typeof r.id === "string" && typeof r.k === "string" && typeof r.title === "string") : [];
  } catch { return []; }
}

function write(rows: SavedChat[]) {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* private window: the list lasts for this visit */ }
  return rows;
}

/** Adds a chat on top, or renames it where it already is so the list does not jump while switching. */
export function rememberChat(chat: SavedChat) {
  const rows = readRecentChats();
  return write(rows.some((r) => r.id === chat.id) ? rows.map((r) => (r.id === chat.id ? chat : r)) : [chat, ...rows].slice(0, 20));
}

export const forgetChat = (id: string) => write(readRecentChats().filter((r) => r.id !== id));
