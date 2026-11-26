import { useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmAccountCode, requestAccountCode } from "@/lib/account-otp.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRORS: Record<string, string> = {
  invalid_phone: "Use the international format, for example +971501234567.",
  not_configured: "WhatsApp verification is not available right now. Please contact support.",
  send_failed: "The code could not be sent. Check that the number uses WhatsApp, then try again.",
  rate_limited: "Too many codes were requested. Please wait before trying again.",
  wrong_code: "That code is not correct.",
  too_many: "Too many wrong codes. Request a new one.",
  expired: "The code has expired. Request a new one.",
};

/**
 * Runs an action only after a WhatsApp code. "always" needs a code confirmed in the last ten minutes;
 * "talent" asks only a registered talent. The database and the server check again.
 */
export function useOtpGate() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const request$ = useServerFn(requestAccountCode);
  const confirm$ = useServerFn(confirmAccountCode);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<{ id: string; to: string } | null>(null);
  const [askPhone, setAskPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const action = useRef<(() => void) | null>(null);

  const close = () => { action.current = null; setOpen(false); setSent(null); setCode(""); setMessage(""); setAskPhone(false); };
  const send = async (number?: string) => {
    setBusy(true); setMessage("");
    try {
      const r = await request$({ data: number ? { phone: number } : {} });
      if (r.ok) { setSent({ id: r.id, to: r.sentTo }); setCode(""); setAskPhone(false); }
      else if (r.error === "no_phone") setAskPhone(true);
      else setMessage(ERRORS[r.error] ?? ERRORS["send_failed"]!);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : ERRORS["send_failed"]!);
    } finally { setBusy(false); }
  };
  const run = async (mode: "always" | "talent", next: () => void) => {
    const r = await supabase.rpc(mode === "always" ? "has_recent_otp" : "needs_account_otp");
    if (r.error) { toast.error(t("Unable to check your account. Try again.")); return; }
    if (mode === "always" ? r.data === true : r.data === false) { next(); return; }
    action.current = next;
    setOpen(true);
    await send();
  };
  const verify = async () => {
    if (!sent || !/^\d{6}$/.test(code) || busy) return;
    setBusy(true); setMessage("");
    try {
      const r = await confirm$({ data: { id: sent.id, code } });
      if (!r.ok) { setMessage(ERRORS[r.error ?? ""] ?? ERRORS["wrong_code"]!); return; }
      const next = action.current;
      close();
      void qc.invalidateQueries({ queryKey: ["account-phone"] });
      next?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : ERRORS["wrong_code"]!);
    } finally { setBusy(false); }
  };

  const dialog: ReactNode = (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) close(); }}>
      <DialogContent className="account-modal w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <span className="studio-empty-icon"><ShieldCheck className="size-6" /></span>
          <DialogTitle>{t("WhatsApp verification")}</DialogTitle>
          <DialogDescription>
            {sent ? <>{t("Enter the 6 digit code sent to")} <b dir="ltr">{sent.to}</b>.</> : askPhone ? t("Your account has no number yet. Enter your WhatsApp number to receive a code.") : t(busy ? "Sending a code…" : "A code protects this change.")}
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
            <div><Label htmlFor="otp-code">{t("Code")}</Label><Input id="otp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
            {message && <p role="alert" className="text-sm text-destructive">{t(message)}</p>}
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void send(phone || undefined)}>{t("Send a new code")}</Button>
              <Button type="submit" className="bg-gradient-gold text-gold-foreground" disabled={busy || code.length !== 6}>{t("Verify")}</Button>
            </div>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send(askPhone ? phone : undefined); }}>
            {askPhone && <div><Label htmlFor="otp-phone">{t("WhatsApp number")}</Label><Input id="otp-phone" type="tel" dir="ltr" autoComplete="tel" maxLength={20} placeholder="+971501234567" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>}
            {message && <p role="alert" className="text-sm text-destructive">{t(message)}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={close}>{t("Cancel")}</Button>
              <Button type="submit" disabled={busy || (askPhone && !phone.trim())}>{t("Send code")}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
  return { run, dialog };
}
