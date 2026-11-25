import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/** Shown while a talent who paid the registration deposit still has no rate card (the last registration step). */
export function RatecardReminder({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const { data: missing } = useQuery({
    // Under the "rates" key so saving or deleting a ratecard in the dashboard refreshes it.
    queryKey: ["rates", artistId, "reminder"],
    refetchOnMount: "always",
    queryFn: async () => {
      const [artist, rates] = await Promise.all([
        supabase.from("artists").select("registration_paid_at,onboarding_complete").eq("id", artistId).maybeSingle(),
        supabase.from("rate_cards").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
      ]);
      // A failed check shows nothing rather than asking for a rate card that may already exist.
      if (artist.error || rates.error) return false;
      return !!artist.data?.registration_paid_at && !!artist.data.onboarding_complete && rates.count === 0;
    },
  });
  if (!missing) return null;
  return (
    <div role="status" className="studio-span-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold/50 bg-gold/10 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <Tag aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-gold" />
        <div>
          <b className="block">{t("Fill in your rate card")}</b>
          <p className="text-sm text-muted-foreground">{t("Your deposit is paid. Add your starting price and prices so clients and your AI agent can quote them.")}</p>
        </div>
      </div>
      <Button asChild className="studio-button studio-button-gold"><Link to="/join">{t("Fill rate card")}</Link></Button>
    </div>
  );
}
