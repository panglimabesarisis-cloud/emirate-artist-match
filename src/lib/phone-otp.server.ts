import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readWhatsAppConfig } from "./whatsapp-provider.server";
import { newVerificationCode } from "./verification.server";
import { normalizeVerificationPhone, otpResult } from "./verification-rules";
import { mayAttachPhone, type PhoneState } from "./account-otp-rules";

const PROOF_DAYS = 30;

/** Both are server-only secrets; the dedicated one wins when it is set. */
function secret() {
  return process.env["VERIFICATION_OTP_HASH_SECRET"] || process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
}

async function sign(text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Shows later requests that this number was verified, without keeping a session. */
export async function phoneProof(phone: string, now = Date.now()) {
  const expires = now + PROOF_DAYS * 86400_000;
  return `${expires}.${await sign(`proof:${phone}:${expires}`)}`;
}

export async function proofMatches(phone: string, proof: string | null | undefined, now = Date.now()) {
  const [expires, signature] = String(proof ?? "").split(".");
  if (!secret() || !expires || !signature || !(Number(expires) > now)) return false;
  const expected = await sign(`proof:${phone}:${expires}`);
  if (expected.length !== signature.length) return false;
  let different = 0;
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return different === 0;
}

/** On unless the master admin switched it off; a failed read keeps it on. */
export async function otpRequired() {
  const { data } = await supabaseAdmin.from("site_settings").select("value").eq("key", "whatsapp_otp").maybeSingle();
  return (data?.value as { required?: boolean } | null | undefined)?.required !== false;
}

/** What is known about an account's numbers. A failed read refuses rather than guesses. */
export async function readPhoneState(userId: string): Promise<PhoneState> {
  const [profile, artist, talent, grant] = await Promise.all([
    supabaseAdmin.from("profiles").select("phone,phone_verified_at").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("artists").select("notify_phone").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.rpc("talent_needs_otp", { _user: userId }),
    supabaseAdmin.from("account_otp_grants").select("expires_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile.error || artist.error || talent.error || grant.error) throw new Error("Unable to read your account");
  return {
    talent: talent.data === true,
    verified: profile.data?.phone_verified_at ? profile.data.phone : null,
    listed: artist.data?.notify_phone ?? null,
    granted: !!grant.data && new Date(grant.data.expires_at).getTime() > Date.now(),
  };
}

/** Records a proven number on the account, unless that would take a talent's codes to another phone. */
export async function markAccountPhone(userId: string, phone: string) {
  if (!mayAttachPhone(phone, await readPhoneState(userId))) return;
  const { error } = await supabaseAdmin.from("profiles").update({ phone, phone_verified_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw new Error("Could not save your verified number");
}

async function accountPhone(userId: string) {
  const { data } = await supabaseAdmin.from("profiles").select("phone,phone_verified_at").eq("id", userId).maybeSingle();
  return data?.phone_verified_at ? data.phone : null;
}

/** The number to store with a new booking or chat. Throws until it is verified, unless the requirement is off. */
export async function requireVerifiedPhone(phone: string | null | undefined, proof: string | null | undefined, userId: string | null) {
  const normalized = normalizeVerificationPhone(phone ?? "");
  if (!(await otpRequired())) return normalized ?? (phone?.trim() || null);
  if (!normalized) throw new Error("Enter your WhatsApp number in international format, for example +971501234567.");
  if (await proofMatches(normalized, proof)) return normalized;
  if (userId && (await accountPhone(userId)) === normalized) return normalized;
  throw new Error("Verify your WhatsApp number first.");
}

/** For signed-in actions without a phone field. */
export async function requireVerifiedAccount(userId: string) {
  if ((await otpRequired()) && !(await accountPhone(userId))) throw new Error("Verify your WhatsApp number first.");
}

async function requesterHash() {
  const headers = getRequest()?.headers;
  const ip = headers?.get("cf-connecting-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip ? sign(`requester:${ip}`) : null;
}

export async function requestCode(rawPhone: string) {
  const phone = normalizeVerificationPhone(rawPhone);
  if (!phone) return { ok: false as const, error: "invalid_phone" as const };
  const config = await readWhatsAppConfig();
  // One-time codes go out through Fonnte; Meta needs a separate approved authentication template.
  if (config.provider !== "fonnte" || !config.token || !secret()) return { ok: false as const, error: "not_configured" as const };
  const id = crypto.randomUUID();
  const code = newVerificationCode();
  const reserved = await supabaseAdmin.rpc("reserve_phone_otp", { _id: id, _phone: phone, _hash: await sign(`otp:${id}:${code}`), _requester: (await requesterHash()) ?? (null as unknown as string) });
  if (reserved.error) throw new Error("Unable to reserve verification code");
  const result = otpResult.parse(reserved.data);
  if (!result.ok) return result;
  let messageId: string | null = null;
  try {
    const body = new FormData();
    body.set("target", phone.slice(1));
    body.set("countryCode", "0");
    body.set("connectOnly", "true");
    body.set("message", `Dealmaker verification code: ${code}\nValid for 5 minutes. Do not share this code.`);
    const response = await fetch("https://api.fonnte.com/send", { method: "POST", headers: { Authorization: config.token }, body, redirect: "manual", signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const sent = (await response.json()) as { status?: boolean; id?: unknown[] };
      const first = sent.id?.[0];
      if (sent.status === true && (typeof first === "string" || typeof first === "number")) messageId = `fonnte:${first}`;
    }
  } catch { /* Never log provider bodies or code messages. Acceptance is not delivery. */ }
  const saved = await supabaseAdmin.from("phone_verifications").update({ send_status: messageId ? "accepted" : "failed", provider_message_id: messageId }).eq("id", id);
  if (saved.error) throw new Error("Unable to save verification send status");
  return messageId ? { ...result, id } : { ok: false as const, error: "send_failed" as const };
}

/** Checks a code and says which number it proves. */
export async function verifyCode(id: string, code: string) {
  if (!secret()) return { ok: false as const, error: "not_configured" as const };
  const checked = await supabaseAdmin.rpc("check_phone_otp", { _id: id, _hash: await sign(`otp:${id}:${code}`) });
  if (checked.error) throw new Error("Unable to check verification code");
  const result = otpResult.parse(checked.data);
  if (!result.ok) return { ...result, ok: false as const, error: result.error ?? "wrong_code" };
  return { ok: true as const, phone: (checked.data as { phone: string }).phone };
}

export async function confirmCode(id: string, code: string, userId: string | null) {
  const result = await verifyCode(id, code);
  if (!result.ok) return result;
  const phone = result.phone;
  if (userId) {
    await markAccountPhone(userId, phone);
    // Registration passes through here, so this is where the signup address is captured.
    const { recordAccountIp } = await import("./account-ip.server");
    await recordAccountIp(userId);
  }
  return { ok: true as const, phone, proof: await phoneProof(phone) };
}
