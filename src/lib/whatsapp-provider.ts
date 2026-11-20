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
  let digits = phone.replace(/[\s()+-]/g, "");
  // UAE mobile numbers may be entered locally; never guess another country's code.
  if (/^0?5[024568]\d{7}$/.test(digits)) digits = `971${digits.replace(/^0/, "")}`;
  if (digits.startsWith("00971")) digits = digits.slice(2);
  if (digits.startsWith("9715") && !/^9715[024568]\d{7}$/.test(digits)) throw new Error("Use a valid UAE mobile number, e.g. 0501234567 or 971501234567");
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw new Error("Use a full international number, including country code");
  return digits;
}

export type WhatsAppSendResult = { status: "accepted" | "failed" | "pending_setup"; error?: string; messageId?: string };