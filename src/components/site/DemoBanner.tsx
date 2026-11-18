import { useI18n } from "@/lib/i18n";

export function DemoBanner() {
  const { t } = useI18n();
  return (
    <div className="bg-gradient-gold text-gold-foreground text-center text-xs font-semibold tracking-wide py-1.5 px-4">
      {t("DEMO MODE — no real payments are processed.")}
    </div>
  );
}
