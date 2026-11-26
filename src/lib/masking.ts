// Hides contact details so clients and artists keep talking on the platform.
const PATTERNS: RegExp[] = [
  // Bounded like real addresses: open-ended repeats take minutes on a long crafted message.
  /[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,24}/gi, // email
  /(?:\+|00)?\d[\d\s().-]{7,}\d/g, // phone numbers (8+ digits)
  /\b(?:https?:\/\/|www\.)\S+/gi, // links
  /@[a-z0-9_.]{3,}/gi, // social handles
  /\b(?:whats\s?app|wa\.me|telegram|t\.me|instagram\.com|snapchat)\b/gi,
];

export const MASK = "[contact hidden]";

export function maskContacts(text: string): string {
  // ISO dates (2026-12-19) look like digit runs but are not contact details.
  return PATTERNS.reduce((t, re) => t.replace(re, (m) => (/^\d{4}-\d{2}-\d{2}$/.test(m.trim()) ? m : MASK)), text);
}

export const AI_CREDIT_COST = 1;
export const MAX_AI_REPLIES_PER_CONVERSATION = 25;
/** Across all of an artist's client chats. Above this the artist answers, so their credits cannot be drained in a day. */
export const MAX_AI_REPLIES_PER_ARTIST_PER_DAY = 200;
export const MAX_CLIENT_MESSAGE_LENGTH = 1000;

export const TOPUP_PACKAGES = [
  { id: "starter", credits: 100, priceAed: 49 },
  { id: "growth", credits: 300, priceAed: 129 },
  { id: "studio", credits: 1000, priceAed: 379 },
] as const;
