import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DemoBanner } from "./DemoBanner";
import { useI18n } from "@/lib/i18n";
import { LogOut } from "lucide-react";
import { NavbarDropdown } from "@/components/shared/NavbarDropdown";
import "@/components/shared/shared.css";

export function SiteHeader() {
  const { user, isAdmin } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <header className="shared-header sticky top-0 z-40">
      <DemoBanner />
      <div className="bg-night text-night-foreground">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-gradient-gold grid place-items-center font-display font-bold text-gold-foreground">D</span>
            <span className="font-display text-xl font-semibold">Dealmaker<span className="text-gold">.</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm opacity-90">
            <NavbarDropdown label={t("Find talent")}>
            <Link to="/$category" params={{ category: "musicians" }} className="hover:text-gold">{t("Musicians")}</Link>
            <Link to="/$category" params={{ category: "djs" }} className="hover:text-gold">{t("DJs")}</Link>
            <Link to="/$category" params={{ category: "arabic-cultural-acts" }} className="hover:text-gold">{t("Cultural Acts")}</Link>
            </NavbarDropdown>
            <NavbarDropdown label={t("For artists")}>
              <Link to="/join">{t("Create a profile")}</Link>
              <Link to="/how-it-works">{t("How you get booked")}</Link>
              <Link to="/join">{t("Plans")}</Link>
              <Link to={user ? "/dashboard" : "/auth"}>{t(user ? "Dashboard" : "Sign in")}</Link>
            </NavbarDropdown>
            <Link to="/how-it-works" className="hover:text-gold">{t("How it works")}</Link>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"} className="text-night-foreground hover:bg-sidebar-accent hover:text-gold">
              {lang === "ar" ? "EN" : "عربي"}
            </Button>
            {user ? (
              <>
                {isAdmin && (
                  <Button asChild variant="ghost" size="sm" className="text-night-foreground hover:bg-sidebar-accent hover:text-gold">
                    <Link to="/admin">{t("Admin")}</Link>
                  </Button>
                )}
                <Button asChild size="sm" className="bg-gradient-gold text-gold-foreground hover:opacity-90">
                  <Link to="/dashboard">{t("Dashboard")}</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={signOut} aria-label={t("Sign out")} title={t("Sign out")} className="shrink-0 text-night-foreground hover:bg-sidebar-accent hover:text-gold">
                  <LogOut className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">{t("Sign out")}</span>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-night-foreground hover:bg-sidebar-accent hover:text-gold">
                  <Link to="/auth">{t("Sign in")}</Link>
                </Button>
                <Button asChild size="sm" className="bg-gradient-gold text-gold-foreground hover:opacity-90">
                  <Link to="/join">{t("Join as talent")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
