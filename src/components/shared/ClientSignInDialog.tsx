import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

/** A client signs up or in before entering a chat, then comes back to `returnTo`. */
export function ClientSignInDialog({ open, onOpenChange, returnTo, onSignedIn }: {
  open: boolean; onOpenChange: (open: boolean) => void; returnTo: string;
  /** Google signed in without leaving the page (popup). */
  onSignedIn?: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const google = async () => {
    setBusy(true);
    try {
      // The sign-in page reads this and sends the visitor back.
      sessionStorage.setItem("post_auth", returnTo);
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
      if (result.error) { toast.error(t("Sign-in failed. Please try again.")); return; }
      if (result.redirected) return;
      sessionStorage.removeItem("post_auth");
      onSignedIn?.();
    } catch { toast.error(t("Sign-in failed. Please try again.")); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("Sign in to continue")}</DialogTitle>
          <DialogDescription>{t("Sign up or sign in to open your chat. Your booking is saved to your account.")}</DialogDescription>
        </DialogHeader>
        <Button type="button" variant="outline" className="h-11 w-full gap-2" disabled={busy} onClick={() => void google()}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" /><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" /><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29A11.9 11.9 0 0 0 0 12c0 1.94.47 3.76 1.29 5.38l3.98-3.09z" /><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" /></svg>
          {t("Continue with Google")}
        </Button>
        <Button asChild variant="link" className="gap-2">
          <a href={`/auth?${new URLSearchParams({ mode: "signup", redirect: returnTo }).toString()}`}><Mail className="h-4 w-4" aria-hidden="true" />{t("Use email instead")}</a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
