/** Codes that confirm a talent's sensitive account changes, and the bank record they protect. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bankProblem, cleanBank, codeDestination, maskPhone, type BankForm } from "./account-otp-rules";
import { markAccountPhone, readPhoneState, requestCode, verifyCode } from "./phone-otp.server";
import { normalizeVerificationPhone } from "./verification-rules";

const GRANT_MINUTES = 10;

/** `phone` is used only while the account has no number at all. */
export async function requestAccountCode(userId: string, phone?: string) {
  const state = await readPhoneState(userId);
  const destination = codeDestination(state) ?? (phone ? normalizeVerificationPhone(phone) : null);
  if (!destination) return { ok: false as const, error: phone ? ("invalid_phone" as const) : ("no_phone" as const) };
  const sent = await requestCode(destination);
  if (!sent.ok || !("id" in sent)) return { ok: false as const, error: "error" in sent ? String(sent.error) : "send_failed" };
  return { ok: true as const, id: sent.id, sentTo: maskPhone(destination) };
}

export async function confirmAccountCode(userId: string, id: string, code: string) {
  const state = await readPhoneState(userId);
  const { data: sent, error } = await supabaseAdmin.from("phone_verifications").select("phone").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to check verification code");
  const destination = codeDestination(state);
  // A code sent anywhere else proves nothing about this account.
  if (!sent || (destination && sent.phone !== destination)) return { ok: false as const, error: "expired" };
  const result = await verifyCode(id, code);
  if (!result.ok) return { ok: false as const, error: result.error };
  if (!state.verified) await markAccountPhone(userId, result.phone);
  const saved = await supabaseAdmin.from("account_otp_grants").upsert({ user_id: userId, expires_at: new Date(Date.now() + GRANT_MINUTES * 60_000).toISOString() });
  if (saved.error) throw new Error("Unable to confirm the code");
  return { ok: true as const };
}

/** Saves the talent's bank record after a confirmed code, then tells the talent on WhatsApp. */
export async function saveBank(userId: string, form: BankForm) {
  const state = await readPhoneState(userId);
  if (!state.granted) return { ok: false as const, error: "Confirm with the WhatsApp code first" };
  const problem = bankProblem(form);
  if (problem) return { ok: false as const, error: problem };
  const { data: artist } = await supabaseAdmin.from("artists").select("id").eq("user_id", userId).maybeSingle();
  if (!artist) return { ok: false as const, error: "Talent profile required" };
  const next = cleanBank(form);
  const before = await supabaseAdmin.from("artist_bank_details").select("updated_at").eq("artist_id", artist.id).maybeSingle();
  if (before.error) return { ok: false as const, error: "Unable to read your bank details" };
  const saved = await supabaseAdmin.from("artist_bank_details").upsert({
    artist_id: artist.id, account_type: next.account_type, holder_name: next.holder_name, bank_name: next.bank_name,
    branch: next.branch || null, iban: next.iban, swift: next.swift || null,
  }).select("updated_at").single();
  if (saved.error) return { ok: false as const, error: "Could not save your bank details" };
  // The database moves the date only when something really changed.
  if (before.data?.updated_at === saved.data.updated_at) return { ok: true as const, changed: false, notified: false };
  return { ok: true as const, changed: true, notified: await announceBankChange(codeDestination(await readPhoneState(userId))) };
}

async function announceBankChange(phone: string | null) {
  if (!phone) return false;
  try {
    const { sendWhatsApp } = await import("./whatsapp-provider.server");
    const sent = await sendWhatsApp(phone, "Your bank account has been changed.",
      "Withdrawals are paused for 3 days. If this was not you, contact Dealmaker support at once.", "https://dealmakertalent.com/support");
    const logged = await supabaseAdmin.from("notifications").insert({ audience: "artist", channel: "whatsapp", kind: "bank_changed", recipient: phone, status: sent.status, error: sent.error?.slice(0, 500) ?? null, provider_message_id: sent.messageId ?? null });
    if (logged.error) console.error("Bank change notice not recorded", logged.error.message);
    return sent.status === "accepted";
  } catch (error) {
    console.error("Bank change notice failed", error);
    return false;
  }
}
