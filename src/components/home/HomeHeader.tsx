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
import { ALL } from "@/lib/artist-search";
import "./send-job-navigation.css";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { ARTIST_MENU, TALENT_MENU, type MenuItem } from "@/lib/site-settings";

/** A header link saved in Admin → Settings → Menu. */
function NavLink({ item, onClick }: { item: MenuItem; onClick?: () => void }) {
  const { t } = useI18n();
  if (!/^\/[^?#]*$/.test(item.href)) return <a href={item.href} onClick={onClick}>{t(item.label)}</a>;
  return <Link to={item.href as "/"} activeProps={{ "aria-current": "page" }} onClick={onClick}>{t(item.label)}</Link>;
}

export function HomeHeader({ catalog }: { catalog: HomeCatalog }) {
  const { user, isAdmin, isArtist, loading } = useAuth();
  const signedInArtist = !!user && isArtist;
  // Until roles have loaded, keep the neutral label rather than calling an artist a client.
  const dashboardLabel = loading ? "Dashboard" : isArtist ? "Artist Dashboard" : isAdmin ? "Dashboard" : "Client Dashboard";
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const navItems = useSiteSettings().menu;
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
    {!signedInArtist && <Link to="/join" onClick={close}><b>{t("Create a profile")}</b><small>{t("Six quick steps, reviewed by our team")}</small></Link>}
    <Link to="/how-you-get-booked" activeProps={{ "aria-current": "page" }} onClick={close}><b>{t("How you get booked")}</b><small>{t("Register, share your link, get jobs")}</small></Link>
    <Link to="/why-artists-join" activeProps={{ "aria-current": "page" }} onClick={close}><b>{t("Why artists join")}</b><small>{t("No small talk, just confirmed jobs")}</small></Link>
    {!signedInArtist && <Link to="/join" onClick={close}><b>{t("Plans")}</b><small>{t("Free, Medium and Pro")}</small></Link>}
    <Link to="/support" onClick={close}><b>{t("Support")}</b></Link>
    <Link to="/terms" onClick={close}><b>{t("Terms of Service")}</b></Link>
    <Link to={user ? "/dashboard" : "/auth"} onClick={close}><b>{t(user ? dashboardLabel : "Sign in")}</b><small>{t("Your bookings and AI manager")}</small></Link>
  </>;
  const categories = <>
    <Link to="/$category" params={{ category: ALL }} onClick={close}>{t("All")}</Link>
    {catalog.categories.map((c) => <Link key={c.slug} to="/$category" params={{ category: c.slug }} onClick={close}>{localName(lang, c)}</Link>)}
  </>;
  return <header className="home-nav-shell">
    <DemoBanner />
    <div className="nav solid">
      <div className="wrap nav-in">
        <Link to="/" className="logo" aria-label="Dealmaker home"><i>D</i><span>Dealmaker<b>.</b></span></Link>
        <nav className="links" aria-label={t("Main navigation")}>
          {navItems.map((item) => item.href === TALENT_MENU ? (
          <div key={item.href} className={`dd ${dropdown === "talent" ? "open" : ""}`} onMouseEnter={() => openDd("talent")} onMouseLeave={closeDd} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropdown(null); }} onKeyDown={(e) => { if (e.key === "Escape") setDropdown(null); }}>
            <Button variant="ghost" className="dd-t" aria-expanded={dropdown === "talent"} aria-controls="home-talent-menu" onClick={() => setDropdown(dropdown === "talent" ? null : "talent")}>{t(item.label)}<ChevronDown className="chev h-3 w-3" /></Button>
            <div className="dd-p mega" id="home-talent-menu" inert={dropdown !== "talent"}>
              <div className="dd-col"><span className="dd-h">{t("Categories")}</span>{categories}</div>
              <div className="dd-col"><span className="dd-h">{t("Musicians")}</span><div className="dd-2">{catalog.subcategories.filter((s) => s.category_id === musicians?.id).map((s) => <Link key={s.slug} to="/$category" params={{ category: musicians?.slug ?? "musicians" }} search={{ sub: s.slug }} onClick={close}>{t(s.name)}</Link>)}</div></div>
              <Link className="dd-card" to="/$category" params={{ category: ALL }} onClick={close}><span className="dd-h">{t("All talent")}</span><b className="serif">{t("Show all")} <span className="it">{t("talent.")}</span></b><span className="arr">↗</span></Link>
            </div>
          </div>
          ) : item.href === ARTIST_MENU ? (
          <div key={item.href} className={`dd ${dropdown === "artists" ? "open" : ""}`} onMouseEnter={() => openDd("artists")} onMouseLeave={closeDd} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropdown(null); }} onKeyDown={(e) => { if (e.key === "Escape") setDropdown(null); }}>
            <Button variant="ghost" className="dd-t" aria-expanded={dropdown === "artists"} aria-controls="home-artists-menu" onClick={() => setDropdown(dropdown === "artists" ? null : "artists")}>{t(item.label)}<ChevronDown className="chev h-3 w-3" /></Button>
            <div className="dd-p" id="home-artists-menu" inert={dropdown !== "artists"}>{artistLinks}</div>
          </div>
          ) : <NavLink key={`${item.label}-${item.href}`} item={item} />)}
        </nav>
        <div className="nav-r">
          <Button variant="ghost" size="sm" className="language" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}>{lang === "ar" ? "EN" : "عربي"}</Button>
          {user ? <>
            {isAdmin && <Link className="hide-m" to="/admin">{t("Admin")}</Link>}
            <Link className="hide-m" to="/dashboard">{t(dashboardLabel)}</Link>
            <Button variant="ghost" size="icon" className="hide-m sign-out" onClick={signOut} aria-label={t("Sign out")} title={t("Sign out")}><LogOut className="h-4 w-4" /></Button>
          </> : <Link className="hide-m" to="/auth">{t("Sign in")}</Link>}
          {!signedInArtist && <Button asChild className="btn btn-gold hide-m"><Link to="/join">{t("Join as talent")}</Link></Button>}
          <Button asChild variant="outline" className="btn btn-line hide-m"><Link to="/send-job">{t("Send Job")}</Link></Button>
          <Button variant="ghost" size="icon" className="burger" aria-expanded={menu} aria-controls="home-mobile-menu" aria-label={t(menu ? "Close menu" : "Menu")} onClick={() => setMenu(!menu)}>{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button>
        </div>
      </div>
      {menu && <nav id="home-mobile-menu" className="home-mobile-menu" aria-label={t("Mobile navigation")}>
        {navItems.map((item) => item.href === TALENT_MENU ? <details key={item.href}><summary>{t(item.label)}</summary><div>{categories}</div></details>
          : item.href === ARTIST_MENU ? <details key={item.href}><summary>{t(item.label)}</summary><div>{artistLinks}</div></details>
          : <NavLink key={`${item.label}-${item.href}`} item={item} onClick={close} />)}
        {!navItems.some((item) => item.href === "/support") && <Link to="/support" onClick={close}>{t("Support")}</Link>}
        {!navItems.some((item) => item.href === "/terms") && <Link to="/terms" onClick={close}>{t("Terms of Service")}</Link>}
        {!signedInArtist && <Link to="/join" onClick={close}>{t("Join as talent")}</Link>}
        <Link to="/send-job" onClick={close}>{t("Send Job")}</Link>
        {user ? <><Link to="/dashboard" onClick={close}>{t(dashboardLabel)}</Link>{isAdmin && <Link to="/admin" onClick={close}>{t("Admin")}</Link>}<Button variant="ghost" onClick={signOut}>{t("Sign out")}</Button></> : <Link to="/auth" onClick={close}>{t("Sign in")}</Link>}
      </nav>}
    </div>
  </header>;
}