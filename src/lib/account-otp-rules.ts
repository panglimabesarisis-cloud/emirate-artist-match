/** Rules for confirming sensitive account changes by WhatsApp code (0105). The server applies them again. */
import { normalizeVerificationPhone } from "./verification-rules";

export type PhoneState = {
  /** A registered talent, whose account changes need a code. */
  talent: boolean;
  /** The verified number on the account. */
  verified: string | null;
  /** The booking number on the talent profile. */
  listed: string | null;
  /** A code was confirmed in the last ten minutes. */
  granted: boolean;
};

/** Where a code goes: the verified number, else the one listed on the profile. Null means none is known yet. */
export const codeDestination = (s: Pick<PhoneState, "verified" | "listed">) =>
  s.verified ?? (s.listed ? normalizeVerificationPhone(s.listed) : null);

/** Whether proving ownership of a number may make it the account's verified number. */
export function mayAttachPhone(phone: string, s: PhoneState) {
  if (!s.talent || s.granted) return true;
  const destination = codeDestination(s);
  return !destination || destination === phone;
}

export const maskPhone = (phone: string) => `${phone.slice(0, 4)}${"•".repeat(Math.max(0, phone.length - 7))}${phone.slice(-3)}`;

export type BankForm = { account_type: string; holder_name: string; bank_name: string; branch: string; iban: string; swift: string };

export const cleanBank = (f: BankForm): BankForm => ({
  account_type: f.account_type === "business" ? "business" : "personal",
  holder_name: f.holder_name.trim(),
  bank_name: f.bank_name.trim(),
  branch: f.branch.trim(),
  iban: f.iban.replace(/\s+/g, "").toUpperCase(),
  swift: f.swift.replace(/\s+/g, "").toUpperCase(),
});

/** The first thing wrong with the bank details, or null. */
export function bankProblem(form: BankForm): string | null {
  const f = cleanBank(form);
  if (!f.holder_name || !f.bank_name) return "Enter the account holder and bank name";
  if ([f.holder_name, f.bank_name, f.branch].some((v) => v.length > 80)) return "Keep each name under 80 characters";
  if (!/^AE\d{21}$/.test(f.iban)) return "Enter a valid UAE IBAN (AE + 21 digits)";
  if (f.swift && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(f.swift)) return "Enter a valid SWIFT / BIC code, or leave it empty";
  return null;
}
