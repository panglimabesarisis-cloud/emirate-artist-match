import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { StarlightWordmark } from "@/components/shared/StarlightWordmark";
import "@/components/shared/shared.css";

export function SiteFooter() {
  const { t } = useI18n();
  const pages = useQuery({ queryKey: ["footer-pages"], queryFn: async () => (await supabase.from("site_pages").select("slug, title").eq("published", true).eq("in_menu", true).order("sort")).data ?? [] }).data ?? [];
  return (
    <footer className="shared-footer mt-24">
      <div className="mx-auto max-w-7xl px-4 py-12 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="font-display text-2xl">Dealmaker<span className="text-gold">.</span></div>
          <p className="mt-2 opacity-70">{t("Dubai's AI-powered talent marketplace. Every artist deserves an AI manager.")}</p>
        </div>
        <div>
          <div className="font-semibold mb-3 text-gold">{t("Discover")}</div>
          <ul className="space-y-2 opacity-80">
            <li><Link to="/$category" params={{ category: "musicians" }}>{t("Musicians in Dubai")}</Link></li>
            <li><Link to="/$category" params={{ category: "djs" }}>{t("DJs in Dubai")}</Link></li>
            <li><Link to="/$category" params={{ category: "variety-entertainers" }}>{t("Variety entertainers")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3 text-gold">{t("For talent")}</div>
          <ul className="space-y-2 opacity-80">
            <li><Link to="/join">{t("Create a profile")}</Link></li>
            <li><Link to="/how-it-works">{t("How it works")}</Link></li>
            {pages.map((p) => <li key={p.slug}><Link to="/p/$slug" params={{ slug: p.slug }}>{p.title}</Link></li>)}
          </ul>
        </div>
        <div className="opacity-70">
          {t("Prices in AED, incl. 5% VAT where applicable. Demo platform — no real payments.")}
        </div>
      </div>
      <StarlightWordmark />
      <div className="shared-footer-bottom"><span>© 2026 Dealmaker · Management by Dede Fajar Kurniawan</span><span>Dubai · Abu Dhabi · Sharjah</span></div>
    </footer>
  );
}
