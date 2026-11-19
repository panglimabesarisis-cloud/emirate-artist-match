export type WhatsAppProvider = "meta" | "fonnte";

export function whatsappProvider(value: unknown): WhatsAppProvider {
  if (value == null) return "meta";
  if (value === "meta" || value === "fonnte") return value;
  throw new Error("Invalid WhatsApp provider");
}

export function requireWhatsAppAdmin(isAdmin: unknown) {
  if (isAdmin !== true) throw new Error("Forbidden");
}

export function internationalPhone(phone: string) {
  const digits = phone.replace(/[\s()+-]/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error("Use a full international number, including country code");
  return digits;
}

export type WhatsAppSendResult = { status: "accepted" | "failed" | "pending_setup"; error?: string; messageId?: string };