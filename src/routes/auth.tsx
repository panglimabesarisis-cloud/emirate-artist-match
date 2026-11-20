import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LovableMark } from "@lovable.dev/cloud-auth-js/react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";

type S = { mode?: "signin" | "signup" | undefined; redirect?: string | undefined };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): S => ({
    mode: s["mode"] === "signup" ? "signup" : undefined,
    redirect: oauthReturnPath(s["redirect"]) !== "/" ? oauthReturnPath(s["redirect"]) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in or join | Dealmaker" },
      { name: "description", content: "Sign in or create your artist or client account." },
      { property: "og:title", content: "Sign in to Dealmaker" },
      { property: "og:description", content: "Artists and clients sign in here." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function GoogleG() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
  );
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [type, setType] = useState("artist");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery,setRecovery]=useState(false);
  const dest = search.redirect ?? "/dashboard";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if(recovery){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/reset-password'});setBusy(false);if(error){toast.error(error.message);return;}toast.success('If this email has an account, a recovery link will be sent.');return;}
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + dest, data: { display_name: name, account_type: type } },
      });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      window.location.assign(dest);
    }
  };

  const oauth = async (p: "google" | "lovable") => {
    sessionStorage.setItem("post_auth", dest);
    const r = await lovable.auth.signInWithOAuth(p, { redirect_uri: window.location.origin + "/auth" });
    if (r.error) { toast.error("Sign-in failed. Please try again."); return; }
    if (r.redirected) return;
    window.location.assign(dest);
  };

  return (
    <ReferenceTheme><PublicLayout>
      <div className="reference-auth">
        <section className="reference-auth-art"><SceneBackground /><div><span className="reference-eyebrow">Dealmaker · Dubai & the UAE</span><h2>Welcome<br /><em className="reference-gradient-text">back.</em></h2><p>Your next great performance starts here.</p></div></section>
      <div className="reference-auth-form">
        <h1 className="text-3xl font-semibold">{recovery?'Recover your account':mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <div className="mt-6 grid gap-2">
          <Button type="button" variant="outline" onClick={() => oauth("google")} className="h-11"><GoogleG /> Continue with Google</Button>
          <Button type="button" variant="outline" onClick={() => oauth("lovable")} className="h-11"><LovableMark /> Continue with Lovable</Button>
        </div>
        {mode === "signup" && <p className="mt-2 text-xs text-muted-foreground">Accounts created with Google or Lovable start as clients. Use email to join as talent.</p>}
        <div className="my-6 text-center text-xs text-muted-foreground">or with email</div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <>
              <RadioGroup value={type} onValueChange={setType} className="grid grid-cols-2 gap-2">
                {([["artist", "I'm talent"], ["client", "I'm booking"]] as const).map(([v, l]) => (
                  <Label key={v} className={`rounded-xl border p-3 cursor-pointer flex items-center gap-2 ${type === v ? "border-gold bg-accent" : ""}`}>
                    <RadioGroupItem value={v} /> {l}
                  </Label>
                ))}
              </RadioGroup>
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>
            </>
          )}
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {!recovery&&<div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>}
          <Button type="submit" disabled={busy} className="w-full h-11 bg-gradient-gold text-gold-foreground hover:opacity-90">
            {busy ? "Please wait…" : recovery?'Send recovery email':mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>
        {mode==='signin'&&<Button variant="link" className="mt-2 px-0" onClick={()=>setRecovery(!recovery)}>{recovery?'Back to sign in':'Forgot password?'}</Button>}
        <Button variant="link" className="mt-4 px-0 text-sm text-muted-foreground underline" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </Button>
        <PostAuthRedirect />
      </div>
      </div>
    </PublicLayout></ReferenceTheme>
  );
}

function PostAuthRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const d = sessionStorage.getItem("post_auth");
      if (data.user && d) {
        sessionStorage.removeItem("post_auth");
        const p = oauthReturnPath(d);
        window.location.assign(p === "/" ? "/dashboard" : p);
      }
    });
  }, [navigate]);
  return null;
}
