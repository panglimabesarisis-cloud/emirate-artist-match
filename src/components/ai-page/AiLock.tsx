import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { confirmAccountCode, requestAccountCode } from "@/lib/account-otp.functions";
import { signInNeedsCode } from "@/lib/agent-page";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const KEY = "dm-ai-otp";
const ERRORS: Record<string, string> = {
  invalid_phone: "Use the international format, for example +971501234567.",
  not_configured: "WhatsApp verification is not available right now. Please contact support.",
  send_failed: "The code could not be sent. Check that the number uses WhatsApp, then try again.",
  rate_limited: "Too many codes were requested. Please wait before trying again.",
  wrong_code: "That code is not correct.",
  too_many: "Too many wrong codes. Request a new one.",
  expired: "The code has expired. Request a new one.",
};

/** The page behind a blur, with the sign-in or code window in front. */
function Veil({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="studio-reference relative min-h-dvh overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid gap-4 p-5 blur-md lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        {["New chat", "Personal AI Agent", "Wait Your Command"].map((label, i) => (
          <div key={label} className={`space-y-3 rounded-[22px] border border-border bg-[linear-gradient(180deg,#141b34,#0a0e1b)] p-5 ${i === 1 ? "" : "hidden lg:block"}`}>
            <b className="font-display text-3xl font-normal text-gold">{label}</b>
            {Array.from({ length: 8 }, (_, n) => <div key={n} className="h-10 rounded-xl bg-foreground/[.07]" />)}
          </div>
        ))}
      </div>
      <div className="relative grid min-h-dvh place-items-center bg-black/55 p-4 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" aria-labelledby="ai-lock-title" className="w-full max-w-md space-y-4 rounded-[24px] border border-gold/30 bg-[linear-gradient(180deg,#141a2e,#0c1120)] p-6 shadow-2xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-gold text-gold-foreground"><Lock className="h-6 w-6" aria-hidden /></span>
          <h1 id="ai-lock-title" className="text-center font-display text-3xl font-normal">{t(title)}</h1>
          <p className="text-center text-sm text-muted-foreground">{t(text)}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function SignIn({ path }: { path: string }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const google = async () => {
    // The sign-in page brings the visitor back here after Google.
    sessionStorage.setItem("post_auth", path);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(t("Sign-in failed. Please try again."));
    else if (!r.redirected) window.location.assign(path);
  };
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  };
  return (
    <Veil title="Personal AI Agent" text="Sign in to open your Personal AI Agent. Email sign-in also needs a WhatsApp code.">
      <Button type="button" variant="outline" className="w-full rounded-full" onClick={() => void google()}><b aria-hidden="true">G</b>{t("Continue with Google")}</Button>
      <p className="text-center text-xs text-muted-foreground">{t("or with email")}</p>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div><Label htmlFor="ai-lock-email">{t("Email")}</Label><Input id="ai-lock-email" type="email" required autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label htmlFor="ai-lock-password">{t("Password")}</Label><Input id="ai-lock-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button type="submit" className="w-full rounded-full bg-gradient-gold font-bold text-gold-foreground" disabled={busy}>{t("Sign in")}</Button>
      </form>
    </Veil>
  );
}

function CodeStep({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const request$ = useServerFn(requestAccountCode);
  const confirm$ = useServerFn(confirmAccountCode);
  const [sent, setSent] = useState<{ id: string; to: string } | null>(null);
  const [askPhone, setAskPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // A code is sent only when asked, so reloading the page never spends one.
  const send = async () => {
    setBusy(true); setMessage("");
    try {
      const r = await request$({ data: askPhone ? { phone } : {} });
      if (r.ok) { setSent({ id: r.id, to: r.sentTo }); setCode(""); }
      else if (r.error === "no_phone") setAskPhone(true);
      else setMessage(ERRORS[r.error] ?? ERRORS["send_failed"]!);
    } catch (e) { setMessage(e instanceof Error ? e.message : ERRORS["send_failed"]!); } finally { setBusy(false); }
  };
  const verify = async () => {
    if (!sent || code.length !== 6) return;
    setBusy(true); setMessage("");
    try {
      const r = await confirm$({ data: { id: sent.id, code } });
      if (!r.ok) setMessage(ERRORS[r.error ?? ""] ?? ERRORS["wrong_code"]!);
      else onDone();
    } catch (e) { setMessage(e instanceof Error ? e.message : ERRORS["wrong_code"]!); } finally { setBusy(false); }
  };
  return (
    <Veil title="WhatsApp code" text={sent ? `Enter the 6 digit code sent to ${sent.to}.` : "You signed in with email, so confirm with a code on WhatsApp."}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void (sent ? verify() : send()); }}>
        {!sent && askPhone && <div><Label htmlFor="ai-lock-phone">{t("WhatsApp number")}</Label><Input id="ai-lock-phone" type="tel" dir="ltr" placeholder="+971501234567" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>}
        {sent && <div><Label htmlFor="ai-lock-code">{t("Code")}</Label><Input id="ai-lock-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>}
        {message && <p role="alert" className="text-sm text-destructive">{t(message)}</p>}
        <Button type="submit" className="w-full rounded-full bg-gradient-gold font-bold text-gold-foreground" disabled={busy || (!!sent && code.length !== 6)}>{t(sent ? "Verify" : "Send code")}</Button>
        {sent && <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => void send()}>{t("Send a new code")}</Button>}
        <Button type="button" variant="ghost" className="w-full" onClick={() => void supabase.auth.signOut()}>{t("Sign out")}</Button>
      </form>
    </Veil>
  );
}

/**
 * The Personal AI Agent opens after sign-in. A sign-in with email and password also needs a WhatsApp code,
 * remembered for that sign-in. This locks the page; the data itself is protected by the database.
 */
export function AiLock({ path, signedIn, loading, children }: { path: string; signedIn: boolean; loading: boolean; children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; session: string } | null>(null);
  useEffect(() => {
    document.documentElement.classList.add("dm-dash");
    return () => document.documentElement.classList.remove("dm-dash");
  }, []);
  useEffect(() => {
    if (!signedIn) { setState(null); return; }
    void supabase.auth.getSession().then(({ data }) => {
      const { needsCode, session } = signInNeedsCode(data.session?.access_token ?? "");
      let confirmed = false;
      try { confirmed = localStorage.getItem(KEY) === session; } catch { /* private window */ }
      setState({ open: !needsCode || confirmed, session });
    });
  }, [signedIn]);
  if (loading) return null;
  if (!signedIn) return <SignIn path={path} />;
  if (!state) return null;
  if (!state.open) return <CodeStep onDone={() => { try { localStorage.setItem(KEY, state.session); } catch { /* private window */ } setState({ ...state, open: true }); }} />;
  return <>{children}</>;
}
