import { Sparkles } from "lucide-react";
import { StudioHeading, StudioSection } from "./StudioPage";
import { BillingPanel } from "./BillingPanel";
import { useI18n } from "@/lib/i18n";

/**
 * Dedicated plan pricelist opened from the "Plans" sidebar menu and the Upgrade links.
 * It reuses BillingPanel, so the plan catalog, proration, Stripe checkout and verified
 * settlement all stay in the one place the rest of the dashboard already trusts.
 */
export function PlansPage({ artistId, plan }: { artistId: string; plan: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <StudioHeading title="Choose your" accent="plan">
        <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-3.5 py-[9px] text-[12.5px] font-bold text-gold">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t("Current plan:")} <b className="font-extrabold uppercase">{t(plan)}</b>
        </span>
      </StudioHeading>
      <StudioSection
        title="Plans &"
        accent="pricing"
        subtitle="Pick a plan, switch billing to monthly or yearly, and pay securely. Changes apply straight away; a downgrade to Free takes effect at the end of your paid period."
      >
        <BillingPanel artistId={artistId} />
      </StudioSection>
    </div>
  );
}
