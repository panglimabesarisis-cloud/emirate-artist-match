import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { claimVerifiedPhone, confirmPhoneCode, requestPhoneCode } from "@/lib/phone-otp.functions";
import { normalizeVerificationPhone } from "@/lib/verification-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

const KEY = "dm_whatsapp";
type Saved = { phone: string; proof: string };

function readSaved(): Saved | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    return value && typeof value.phone === "string" && Number(String(value.proof).split(".")[0]) > Date.now() ? value : null;
  } catch { return null; }
}

export function useOtpSetting() {
  return useQuery({
    queryKey: ["whatsapp-otp"], staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "whatsapp_otp").maybeSingle();
      const value = (data?.value ?? {}) as { required?: boolean; since?: string };
      return { required: value.required !== false, since: value.since ?? null };
    },
  });
}

/** Whether a form may be sent with this number, and the proof to send with it. */
export function useWhatsAppProof(phone: string) {
  const setting = useOtpSetting();
  const [saved, setSaved] = useState<Saved | null>(null);
  useEffect(() => {
    const load = () => setSaved(readSaved());
    load();
    window.addEventListener("dm-whatsapp", load);
    return () => window.removeEventListener("dm-whatsapp", load);
  }, []);
  const required = setting.data?.required ?? true;
  const proof = saved && saved.phone === normalizeVerificationPhone(phone) ? saved.proof : null;
  return { required, proof, ready: !required || !!proof, saved };
}

const ERRORS: Record<string, string> = {
  invalid_phone: "Use the international format, for example +971501234567.",
  not_configured: "WhatsApp verification is not available right now. Please contact support.",
  send_failed: "The code could not be sent. Check that the number uses WhatsApp, then try again.",
  rate_limited: "Too many codes were requested. Please wait before trying again.",
  wrong_code: "That code is not correct.",
  too_many: "Too many wrong codes. Request a new one.",
  expired: "The code has expired. Request a new one.",
};

/** The WhatsApp number field with its one-time code. It lives inside other forms, so its buttons never submit them. */
export function WhatsAppVerify({ phone, onChange, onVerified, accountPhone, id = "whatsapp-number" }: { phone: string; onChange: (phone: string) => void; onVerified?: () => void; /** Already verified on the signed-in account. */ accountPhone?: string | null; id?: string }) {
  const { t } = useI18n();
  const { required, proof, saved } = useWhatsAppProof(phone);
  const verified = !!proof || (!!accountPhone && accountPhone === normalizeVerificationPhone(phone));
  const send$ = useServerFn(requestPhoneCode);
  const confirm$ = useServerFn(confirmPhoneCode);
  const claim$ = useServerFn(claimVerifiedPhone);
  const [request, setRequest] = useState<{ id: string; phone: string } | null>(null);
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!phone && saved) onChange(saved.phone); }, [saved?.phone]);
  // Attaches the number to the account when someone is signed in; guests are simply told no.
  useEffect(() => { if (proof) void claim$({ data: { phone: normalizeVerificationPhone(phone)!, proof } }).then(() => onVerified?.()).catch(() => {}); }, [proof]);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);
  const normalized = normalizeVerificationPhone(phone);
  const waiting = request && request.phone === normalized;
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); } catch { toast.error(t("Something went wrong. Please try again.")); } finally { setBusy(false); }
  };
  const fail = (r: { error: string; retry_after?: number | undefined }) => { toast.error(t(ERRORS[r.error] ?? "Something went wrong. Please try again.")); if (r.retry_after) setWait(Math.min(r.retry_after, 3600)); };
  const sendCode = () => run(async () => {
    const r = await send$({ data: { phone } });
    if (!r.ok) { fail(r); return; }
    if (!("id" in r)) return;
    setRequest({ id: String(r.id), phone: normalized! });
    setCode("");
    setWait(30);
    toast.success(t("Code sent to your WhatsApp"));
  });
  const verify = () => run(async () => {
    if (!request || code.length !== 6) return;
    const r = await confirm$({ data: { id: request.id, code } });
    if (!r.ok) { fail(r); return; }
    if (!("proof" in r)) return;
    try { localStorage.setItem(KEY, JSON.stringify({ phone: r.phone, proof: r.proof })); } catch { /* the proof lasts for this visit only */ }
    window.dispatchEvent(new Event("dm-whatsapp"));
    setRequest(null);
    onChange(r.phone);
    toast.success(t("WhatsApp number verified"));
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input id={id} type="tel" dir="ltr" inputMode="tel" autoComplete="tel" className="min-w-0 flex-1" required={required} maxLength={20} aria-label={t("WhatsApp number")} placeholder={t("WhatsApp number (+971…)")} value={phone} onChange={(e) => onChange(e.target.value)} />
        {required && !verified && <Button type="button" variant="outline" disabled={busy || !normalized || wait > 0} onClick={() => void sendCode()}>{wait > 0 ? `${t("Resend in")} ${wait}s` : waiting ? t("Resend code") : t("Send code")}</Button>}
      </div>
      {required && verified && <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500"><BadgeCheck className="h-4 w-4" aria-hidden />{t("WhatsApp number verified")}</p>}
      {required && !verified && !waiting && <p className="text-xs text-muted-foreground">{t("Required. We send a 6-digit code to this WhatsApp number.")}</p>}
      {required && !verified && waiting && (
        <div className="flex flex-wrap gap-2">
          <Input dir="ltr" inputMode="numeric" autoComplete="one-time-code" aria-label={t("6-digit code")} placeholder={t("6-digit code")} maxLength={6} className="w-40 tracking-[0.3em]" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void verify(); } }} />
          <Button type="button" disabled={busy || code.length !== 6} onClick={() => void verify()}>{t("Verify")}</Button>
        </div>
      )}
    </div>
  );
}
