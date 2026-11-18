// Hides contact details so clients and artists keep talking on the platform.
const PATTERNS: RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, // email
  /(?:\+|00)?\d[\d\s().-]{7,}\d/g, // phone numbers (8+ digits)
  /\b(?:https?:\/\/|www\.)\S+/gi, // links
  /@[a-z0-9_.]{3,}/gi, // social handles
  /\b(?:whats\s?app|wa\.me|telegram|t\.me|instagram\.com|snapchat)\b/gi,
];

export const MASK = "[contact hidden]";

export function maskContacts(text: string): string {
  return PATTERNS.reduce((t, re) => t.replace(re, MASK), text);
}

export const AI_CREDIT_COST = 1;
export const MAX_AI_REPLIES_PER_CONVERSATION = 25;
export const MAX_CLIENT_MESSAGE_LENGTH = 1000;

export const TOPUP_PACKAGES = [
  { id: "starter", credits: 100, priceAed: 49 },
  { id: "growth", credits: 300, priceAed: 129 },
  { id: "studio", credits: 1000, priceAed: 379 },
] as const;
