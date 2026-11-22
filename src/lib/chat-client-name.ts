/** Reads the client's name out of what they wrote, so the Inbox can show it instead of "Direct chat". */

const FIELD = /^\s*(?:client[_ ]?name|full[_ ]?name|your[_ ]?name|nama(?:[_ ]?lengkap)?|name)\s*[:=]\s*(.+?)\s*$/gim;
const SENTENCE = /(?:\bmy name is|\bname'?s|\bcall me|\bnama saya|\bnama aku)\s+([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,2})/iu;

const STOP = new Set(["and", "dan", "i", "from", "for", "from", "of", "is", "the", "we", "need", "want", "calling", "here", "yang", "dari", "untuk", "mau", "ingin"]);

/** A usable person name: letters only, no contact details, not a placeholder. */
export function cleanName(raw: string): string | null {
  const value = raw.replace(/\s+/g, " ").replace(/[.,;!]+$/, "").trim();
  if (value.length < 2 || value.length > 60) return null;
  if (/[\d@*_/\\<>[\]{}]/.test(value)) return null;
  if (/^(client|customer|unknown|n\/a|none|tbc|name)$/i.test(value)) return null;
  return value;
}

/** First name found in the client's own messages (form answers first, then "my name is …"). */
export function clientNameFromMessages(bodies: readonly string[]): string | null {
  for (const body of bodies) {
    for (const match of body.matchAll(FIELD)) {
      const name = cleanName(match[1] ?? "");
      if (name) return name;
    }
  }
  for (const body of bodies) {
    const words: string[] = [];
    for (const word of (body.match(SENTENCE)?.[1] ?? "").split(" ")) {
      if (STOP.has(word.toLowerCase())) break;
      words.push(word);
    }
    const name = cleanName(words.join(" "));
    if (name) return name;
  }
  return null;
}

export type InboxLabel = "inquiry" | "pending" | "partial" | "paid";
export const INBOX_LABELS: Record<InboxLabel, string> = { inquiry: "Inquiry", pending: "Pending Payment", partial: "Partially Paid", paid: "Fully Paid" };

type LabelBooking = { status: string; total: number | string; paid_amount: number | string };

/** Label from the money state of the chat's bookings. No booking means it is still an inquiry. */
export function inboxLabelFor(bookings: readonly LabelBooking[]): InboxLabel {
  const live = bookings.filter((b) => b.status !== "cancelled");
  if (live.some((b) => Number(b.total) > 0 && Number(b.paid_amount) >= Number(b.total))) return "paid";
  if (live.some((b) => Number(b.paid_amount) > 0)) return "partial";
  if (live.some((b) => b.status === "quoted" || b.status === "confirmed")) return "pending";
  return "inquiry";
}
