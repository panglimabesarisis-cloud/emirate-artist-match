import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AddonCards } from "@/components/dashboard/AddonsPage";
import { YourAgent } from "@/components/dashboard/YourAgent";
import { AddToHomeScreen } from "./AddToHomeScreen";
import { AiSettings } from "./AiSettings";
import "@/components/dashboard/studio.css";
import "@/components/dashboard/active-gold.css";
import "@/components/dashboard/reference-pages.css";
import "@/components/dashboard/reference-adapters.css";

/** The signed-in talent's own profile, or null when the account has none. */
export function useOwnArtist(userId: string | undefined) {
  return useQuery({
    queryKey: ["ai-page-artist", userId],
    enabled: !!userId,
    queryFn: async () => {
      const r = await supabase.rpc("private_artists").select("id, slug, stage_name, plan, trn").eq("user_id", userId!).maybeSingle();
      if (r.error) throw new Error("Unable to load your profile");
      return r.data;
    },
  });
}

function Notice({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-3xl content-center gap-5 px-4 py-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-gold text-gold-foreground"><Lock className="h-6 w-6" aria-hidden /></span>
      <h1 className="font-display text-4xl leading-none">{t(title)}</h1>
      <p className="text-muted-foreground">{t(text)}</p>
      {children}
    </main>
  );
}

/**
 * The talent's own AI agent at /ai/<name>: only that talent, with the paid add-on. Row security and the
 * server functions protect the data; these checks decide what to show.
 */
export function AiAgentPage({ slug, userId, email }: { slug: string; userId: string; email: string }) {
  const { t } = useI18n();
  const [view, setView] = useState<"chat" | "settings">("chat");
  const [tab, setTab] = useState<"usage" | "topup">("usage");
  const artist = useOwnArtist(userId);
  const mine = artist.data && artist.data.slug.toLowerCase() === slug.toLowerCase() ? artist.data : null;
  const access = useQuery({
    queryKey: ["ai-page-access", mine?.id],
    enabled: !!mine,
    queryFn: async () => {
      const r = await supabase.rpc("artist_has_addon", { _artist: mine!.id, _kind: "ai_page" });
      if (r.error) throw new Error("Unable to check your add-on");
      return r.data === true;
    },
  });

  const frame = (content: ReactNode) => <div className="studio-reference min-h-dvh bg-background text-foreground">{content}</div>;
  const back = <div><Button asChild variant="outline"><Link to="/dashboard">{t("Back to dashboard")}</Link></Button></div>;
  const failed = artist.error ?? access.error;
  if (failed) return frame(<Notice title="This page did not load" text={failed.message}><div><Button variant="outline" onClick={() => { void artist.refetch(); void access.refetch(); }}>{t("Try again")}</Button></div></Notice>);
  if (artist.isPending || (mine && access.isPending)) return frame(<p role="status" className="grid min-h-dvh place-items-center text-muted-foreground">{t("Loading…")}</p>);
  if (!artist.data) return frame(<Notice title="Talent accounts only" text="This page belongs to a talent. Sign in with the talent account that owns it.">{back}</Notice>);
  if (!mine) return frame(<Notice title="This page is private" text="Only the talent who owns this page can open it."><div><Button asChild className="bg-gradient-gold font-bold text-gold-foreground"><a href={`/ai/${artist.data.slug}`}>{t("Open my own page")}</a></Button></div></Notice>);
  if (!access.data) return frame(
    <Notice title="Get your Personal AI Agent" text="Buy the add-on to open your Personal AI Agent here. Your dashboard keeps working as before.">
      <div className="text-start"><AddonCards artistId={mine.id} slug={mine.slug} offers={(a) => a.kind === "ai_page"} onAiPage /></div>
      {back}
    </Notice>,
  );
  return frame(
    <>
      {/* The chat stays mounted so the open conversation is still there after Settings. */}
      <div hidden={view !== "chat"}>
        <YourAgent artistId={mine.id} stageName={mine.stage_name} onOpen={() => window.location.assign("/dashboard")} page={{ onSettings: () => { setTab("usage"); setView("settings"); }, onTopUp: () => { setTab("topup"); setView("settings"); } }} />
      </div>
      {view === "settings" && <AiSettings start={tab} artist={mine} userId={userId} email={email} onBack={() => setView("chat")} />}
      <AddToHomeScreen />
    </>,
  );
}
