import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Bell, BookOpen, CheckCircle2, FileBarChart, Gem, Home, Landmark, LifeBuoy, Mail, Menu, MessageSquare, Settings as SettingsIcon, Sparkles, Star, TrendingUp, User, Users, Wallet as WalletIcon, ArrowUpFromLine, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { buildFeed } from "@/lib/client-portal-rules";
import { PortalContext, type ClientSection, type PortalModal } from "./portal-context";
import { usePortalRows } from "./derived";
import { useClaimRecords, useCommissions, usePayoutAccount, usePayouts, useProfile, useSettings, useSupport, useTeamAccess, useThreads } from "./useClientPortal";
import { Overview, Browse, Bookings, Jobs, Reviews, Messages } from "./sections/Workspace";
import { CommissionOverview, CommissionHistory, Wallet, Withdrawals, PayoutAccounts, Statements } from "./sections/Finance";
import { Profile, Notifications, Support, Settings } from "./sections/Account";
import { PortalModals } from "./Modals";
import { ClientOpenInquiries } from "@/components/dashboard/OpenInquiries";
import "./client-portal.css";

type NavItem = { id: ClientSection; label: string; icon: LucideIcon };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Workspace", items: [
    { id: "dashboard", label: "Dashboard", icon: Home }, { id: "browse", label: "Browse Artists", icon: Sparkles }, { id: "bookings", label: "My Bookings", icon: BookOpen },
    { id: "inquiries", label: "Open inquiries", icon: Sparkles },
    { id: "jobs", label: "Job Confirmations", icon: CheckCircle2 }, { id: "reviews", label: "My Reviews", icon: Star }, { id: "messages", label: "Messages", icon: MessageSquare },
  ] },
  { group: "Earnings & Finance", items: [
    { id: "commission", label: "Commission Overview", icon: Gem }, { id: "history", label: "Commission History", icon: TrendingUp }, { id: "wallet", label: "My Wallet", icon: WalletIcon },
    { id: "withdrawals", label: "Withdrawals", icon: ArrowUpFromLine }, { id: "payout", label: "Payout Accounts", icon: Landmark }, { id: "statements", label: "Financial Statements", icon: FileBarChart },
  ] },
  { group: "Account", items: [
    { id: "profile", label: "My Profile", icon: User }, { id: "notifications", label: "Notifications", icon: Bell }, { id: "support", label: "Support Center", icon: LifeBuoy }, { id: "settings", label: "Settings", icon: SettingsIcon },
  ] },
];
const LABEL = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.id, i.label]))) as Record<ClientSection, string>;

export function ClientPortal({ uid, email, section, thread, onNavigate }: { uid: string; email: string; section: ClientSection; thread?: string | undefined; onNavigate: (section: ClientSection, thread?: string) => void }) {
  const { t, lang } = useI18n();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<PortalModal | null>(null);
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  useClaimRecords(uid);
  useEffect(() => {
    document.documentElement.classList.add("dm-dash");
    return () => document.documentElement.classList.remove("dm-dash");
  }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setMenu(false);
    window.scrollTo({ top: 0 });
    main.current?.focus({ preventScroll: true });
  }, [section]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const profile = useProfile(uid);
  const account = usePayoutAccount(uid);
  const threads = useThreads(uid);
  const teams = useTeamAccess(uid);
  const settings = useSettings(uid);
  const payouts = usePayouts(uid);
  const support = useSupport(uid);
  const commissions = useCommissions(uid);
  const { rows } = usePortalRows(uid);
  const inquiryAlerts = useQuery({ queryKey: ["inquiry-alerts", uid], refetchInterval: 30000, queryFn: async () => {
    const { count, error } = await supabase.from("job_applications").select("id,open_jobs!inner(client_user_id)", { count: "exact", head: true }).eq("open_jobs.client_user_id", uid).eq("status", "pending");
    if (error) throw error;
    return count ?? 0;
  } });
  const name = profile.data?.display_name || email.split("@")[0] || "Client";
  const counts = useMemo(() => {
    const s = settings.data;
    const feed = buildFeed({ bookings: rows.flatMap((r) => r.booking ? [{ ...r.booking, artist_name: r.artist }] : []), payouts: payouts.data ?? [], support: support.data ?? [], commissions: commissions.data ?? [], bookingAlerts: s?.booking_alerts ?? true, commissionAlerts: s?.commission_alerts ?? true });
    return {
      bookings: rows.filter((r) => r.kind === "booking" && !["completed", "cancelled"].includes(r.state.key)).length,
      jobs: rows.filter((r) => r.state.key === "job_review").length,
      messages: (threads.data ?? []).filter((x) => x.lastSender && x.lastSender !== "client").length,
      notifications: feed.filter((e) => !s?.notifications_read_at || e.at > s.notifications_read_at).length,
    };
  }, [rows, threads.data, settings.data, payouts.data, support.data, commissions.data]);
  const COUNT: Partial<Record<ClientSection, number>> = { inquiries: inquiryAlerts.data ?? 0, bookings: counts.bookings, jobs: counts.jobs, messages: counts.messages, notifications: counts.notifications };
  const ctx = useMemo(() => ({ uid, email, go: (s: ClientSection, th?: string) => onNavigate(s, th), openModal: (m: PortalModal) => setModal(m) }), [uid, email, onNavigate]);
  const accountLine = account.data?.verified_at ? "Client account · Verified payout" : "Client account";

  return (
    <PortalContext.Provider value={ctx}>
      <div className="cp" dir={lang === "ar" ? "rtl" : "ltr"}>
        <a href="#cp-main" className="cp-skip">{t("Skip to content")}</a>
        <aside id="cp-side" className={`cp-side${menu ? " is-open" : ""}`} aria-label={t("Client portal")}>
          <div className="cp-brand"><div className="cp-brand-mark" aria-hidden="true">D</div><div className="cp-brand-name">DEALMAKER<span>.</span></div></div>
          <div className="cp-profile"><div className="cp-avatar" aria-hidden="true">{initials(name)}</div><div style={{ minWidth: 0 }}><b>{name}</b><small>{t(accountLine)}</small></div></div>
          <nav className="cp-nav" aria-label={t("Client portal sections")}>
            {NAV.map((g) => (
              <div key={g.group} role="group" aria-labelledby={`cp-g-${g.group.replace(/\W+/g, "")}`}>
                <div className="cp-nav-group" id={`cp-g-${g.group.replace(/\W+/g, "")}`}>{t(g.group)}</div>
                {g.items.map((i) => {
                  const n = COUNT[i.id];
                  return <button key={i.id} type="button" className="cp-nav-item" aria-current={section === i.id ? "page" : undefined} onClick={() => onNavigate(i.id)}><i.icon aria-hidden="true" />{t(i.label)}{n ? <span className="cp-count" aria-label={`${n} ${t("pending")}`}>{n}</span> : null}</button>;
                })}
              </div>
            ))}
          </nav>
          <div className="cp-side-cta"><strong>{t("Need a talent?")}</strong><p>{t("Find the right artist for your next event.")}</p><button type="button" className="cp-btn cp-btn-gold cp-btn-block" onClick={() => setModal({ type: "new-booking" })}>{t("Book an artist")}</button></div>
        </aside>
        <button type="button" className={`cp-scrim${menu ? " is-open" : ""}`} aria-label={t("Close menu")} tabIndex={menu ? 0 : -1} onClick={() => setMenu(false)} />
        <div className="cp-main">
          <header className="cp-top">
            <button type="button" className="cp-icon-btn cp-burger" aria-label={t("Open menu")} aria-expanded={menu} aria-controls="cp-side" onClick={() => setMenu((v) => !v)}><Menu aria-hidden="true" /></button>
            <div className="cp-crumb">{t("Client portal")} <span className="cp-muted">/</span> <b>{t(LABEL[section])}</b></div>
            <div className="cp-top-actions">
              {(teams.data ?? 0) > 0 && <Link to="/dashboard" className="cp-team-link"><Users size={13} aria-hidden="true" style={{ display: "inline", marginInlineEnd: 6, verticalAlign: "-2px" }} />{t("Team workspace")}</Link>}
              <button type="button" className="cp-icon-btn" aria-label={`${t("Notifications")}${counts.notifications ? ` (${counts.notifications})` : ""}`} onClick={() => onNavigate("notifications")}><Bell aria-hidden="true" />{counts.notifications ? <i className="cp-dot" aria-hidden="true">{counts.notifications > 9 ? "9+" : counts.notifications}</i> : null}</button>
              <button type="button" className="cp-icon-btn" aria-label={`${t("Messages")}${counts.messages ? ` (${counts.messages})` : ""}`} onClick={() => onNavigate("messages")}><Mail aria-hidden="true" />{counts.messages ? <i className="cp-dot" aria-hidden="true">{counts.messages > 9 ? "9+" : counts.messages}</i> : null}</button>
              <button type="button" className="cp-user-pill" onClick={() => onNavigate("profile")} aria-label={t("My profile")}><div className="cp-avatar" aria-hidden="true">{initials(name)}</div><span>{name}</span></button>
            </div>
          </header>
          <main id="cp-main" ref={main} tabIndex={-1} className="cp-content">
            {section === "dashboard" && <Overview />}
            {section === "browse" && <Browse />}
            {section === "inquiries" && <ClientOpenInquiries uid={uid} />}
            {section === "bookings" && <Bookings />}
            {section === "jobs" && <Jobs />}
            {section === "reviews" && <Reviews />}
            {section === "messages" && <Messages thread={thread} />}
            {section === "commission" && <CommissionOverview />}
            {section === "history" && <CommissionHistory />}
            {section === "wallet" && <Wallet />}
            {section === "withdrawals" && <Withdrawals />}
            {section === "payout" && <PayoutAccounts />}
            {section === "statements" && <Statements />}
            {section === "profile" && <Profile />}
            {section === "notifications" && <Notifications />}
            {section === "support" && <Support />}
            {section === "settings" && <Settings />}
          </main>
        </div>
        <PortalModals modal={modal} onClose={() => setModal(null)} />
      </div>
    </PortalContext.Provider>
  );
}

