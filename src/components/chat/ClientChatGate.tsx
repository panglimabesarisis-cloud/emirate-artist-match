import { useState, type ReactNode } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ClientSignInDialog } from "@/components/shared/ClientSignInDialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/** The chat page opens only for someone signed in; the sign-in window appears first. */
export function ClientChatGate({ returnTo, children }: { returnTo: string; children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  if (user) return <>{children}</>;
  if (loading) return <p role="status" className="p-16 text-center text-muted-foreground">{t("Loading account…")}</p>;
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-center">
      <div className="max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">{t("Sign in to open your chat")}</h1>
        <p className="text-sm text-muted-foreground">{t("Your conversation is waiting. Sign up or sign in to continue.")}</p>
        <Button type="button" className="bg-gradient-gold text-gold-foreground" onClick={() => setOpen(true)}><LogIn className="me-2 h-4 w-4" aria-hidden="true" />{t("Sign in")}</Button>
      </div>
      <ClientSignInDialog open={open} onOpenChange={setOpen} returnTo={returnTo} />
    </main>
  );
}
