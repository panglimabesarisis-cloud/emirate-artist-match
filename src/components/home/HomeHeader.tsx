import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DemoBanner } from "@/components/site/DemoBanner";
import { useI18n, localName } from "@/lib/i18n";
import type { HomeCatalog } from "./types";

export function HomeHeader({ catalog }: { catalog: HomeCatalog }) {
  const { user, isAdmin } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [dropdown, setDropdown] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const openDd = (id: string) => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } setDropdown(id); };
  const closeDd = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setDropdown(null), 200); };
  const musicians = catalog.categories.find((c) => c.slug === "musicians");
  const signOut = async () => {
    await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };
  const close = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } setMenu(false); setDropdown(null); };
  const artistLinks = <>
    <Link to="/join" onClick={close}><b>{t("Create a profile")}</b><small>{t("Six quick steps, reviewed by our team")}</small></Link>
    <Link to="/how-it-works" onClick={close}><b>{t("How you get booked")}</b><small>{t("Register, share your link, get jobs")}</small></Link>
    <Link to="/how-it-works" onClick={close}><b>{t("Why artists join")}</b><small>{t("No small talk, just confirmed jobs")}</small></Link>
    <Link to="/join" onClick={close}><b>{t("Plans")}</b><small>{t("Free, Medium and Pro")}</small></Link>
    <Link to="/support" onClick={close}><b>{t("Support")}</b></Link>
    <Link to="/terms" onClick={close}><b>{t("Terms of Service")}</b></Link>
    <Link to={user ? "/dashboard" : "/auth"} onClick={close}><b>{t(user ? "Dashboard" : "Sign in")}</b><small>{t("Your bookings and AI manager")}</small></Link>
  </>;
  const categories = catalog.categories.map((c) => <Link key={c.slug} to="/$category" params={{ category: c.slug }} onClick={close}>{localName(lang, c)}</Link>);
  return <header className="home-nav-shell">
    <DemoBanner />
    <div className="nav solid">
      <div className="wrap nav-in">
        <Link to="/" className="logo" aria-label="Dealmaker home"><i>D</i><span>Dealmaker<b>.</b></span></Link>
        <nav className="links" aria-label={t("Main navigation")}>
          <div className={`dd ${dropdown === "talent" ? "open" : ""}`} onMouseEnter={() => openDd("talent")} onMouseLeave={closeDd} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropdown(null); }} onKeyDown={(e) => { if (e.key === "Escape") setDropdown(null); }}>
            <Button variant="ghost" className="dd-t" aria-expanded={dropdown === "talent"} aria-controls="home-talent-menu" onClick={() => setDropdown(dropdown === "talent" ? null : "talent")}>{t("Find talent")}<ChevronDown className="chev h-3 w-3" /></Button>
            <div className="dd-p mega" id="home-talent-menu" inert={dropdown !== "talent"}>
              <div className="dd-col"><span className="dd-h">{t("Categories")}</span>{categories}</div>
              <div className="dd-col"><span className="dd-h">{t("Musicians")}</span><div className="dd-2">{catalog.subcategories.filter((s) => s.category_id === musicians?.id).map((s) => <Link key={s.slug} to="/$category" params={{ category: musicians?.slug ?? "musicians" }} search={{ sub: s.slug }} onClick={close}>{t(s.name)}</Link>)}</div></div>
              <Link className="dd-card" to="/$category" params={{ category: catalog.categories[0]?.slug ?? "musicians" }} onClick={close}><span className="dd-h">{t("All talent")}</span><b className="serif">{t("Browse")} <span className="it">{t("talent.")}</span></b><span className="arr">↗</span></Link>
            </div>
          </div>
          <div className={`dd ${dropdown === "artists" ? "open" : ""}`} onMouseEnter={() => openDd("artists")} onMouseLeave={closeDd} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropdown(null); }} onKeyDown={(e) => { if (e.key === "Escape") setDropdown(null); }}>
            <Button variant="ghost" className="dd-t" aria-expanded={dropdown === "artists"} aria-controls="home-artists-menu" onClick={() => setDropdown(dropdown === "artists" ? null : "artists")}>{t("For artists")}<ChevronDown className="chev h-3 w-3" /></Button>
            <div className="dd-p" id="home-artists-menu" inert={dropdown !== "artists"}>{artistLinks}</div>
          </div>
          <Link to="/for-clients" activeProps={{ "aria-current": "page" }}>{t("For clients")}</Link>
          <Link to="/features">{t("Features")}</Link>
          <Link to="/how-it-works">{t("How it works")}</Link>
        </nav>
        <div className="nav-r">
          <Button variant="ghost" size="sm" className="language" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}>{lang === "ar" ? "EN" : "عربي"}</Button>
          {user ? <>
            {isAdmin && <Link className="hide-m" to="/admin">{t("Admin")}</Link>}
            <Link className="hide-m" to="/dashboard">{t("Dashboard")}</Link>
            <Button variant="ghost" size="icon" className="hide-m sign-out" onClick={signOut} aria-label={t("Sign out")} title={t("Sign out")}><LogOut className="h-4 w-4" /></Button>
          </> : <Link className="hide-m" to="/auth">{t("Sign in")}</Link>}
          <Button asChild className="btn btn-gold hide-m"><Link to="/join">{t("Join as talent")}</Link></Button>
          <Button variant="ghost" size="icon" className="burger" aria-expanded={menu} aria-controls="home-mobile-menu" aria-label={t(menu ? "Close menu" : "Menu")} onClick={() => setMenu(!menu)}>{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button>
        </div>
      </div>
      {menu && <nav id="home-mobile-menu" className="home-mobile-menu" aria-label={t("Mobile navigation")}>
        <details><summary>{t("Find talent")}</summary><div>{categories}</div></details>
        <details><summary>{t("For artists")}</summary><div>{artistLinks}</div></details>
        <Link to="/for-clients" activeProps={{ "aria-current": "page" }} onClick={close}>{t("For clients")}</Link><Link to="/how-it-works" onClick={close}>{t("How it works")}</Link>
        <Link to="/features" onClick={close}>{t("Features")}</Link><Link to="/support" onClick={close}>{t("Support")}</Link><Link to="/terms" onClick={close}>{t("Terms of Service")}</Link>
        <Link to="/join" onClick={close}>{t("Join as talent")}</Link>
        {user ? <><Link to="/dashboard" onClick={close}>{t("Dashboard")}</Link>{isAdmin && <Link to="/admin" onClick={close}>{t("Admin")}</Link>}<Button variant="ghost" onClick={signOut}>{t("Sign out")}</Button></> : <Link to="/auth" onClick={close}>{t("Sign in")}</Link>}
      </nav>}
    </div>
  </header>;
}