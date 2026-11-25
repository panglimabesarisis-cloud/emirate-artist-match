import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import "@/components/dashboard/studio.css";
import "@/components/admin/admin-control.css";
import { BadgeCheck, Banknote, Bell, CalendarRange, ChartNoAxesCombined, ClipboardList, FileSignature, FolderTree, Gauge, History, Layers, LogOut, Menu as MenuIcon, Package, Receipt, RefreshCw, Search, Settings as SettingsIcon, ShieldCheck, Sparkles, Star, LifeBuoy, Tag, UserCheck, Users as UsersIcon, Workflow, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PublicLayout } from "@/components/site/PublicLayout";
import { BADGE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdminEscrow } from "@/components/dashboard/AdminEscrow";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminPerformance } from "@/components/admin/AdminPerformance";
import { ArtistDirectory, ArtistRequests, CategoryManager, EventTypeManager } from "@/components/admin/AdminArtists";
import { AdminPlans } from "@/components/admin/AdminPlans";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { AdminRatecards } from "@/components/admin/AdminRatecards";
import { InvoiceRecords } from "@/components/dashboard/InvoiceRecords";
import { ContractsTable } from "@/components/dashboard/ContractsTable";
import { FlowBuilder } from "@/components/flow/FlowBuilder";
import { AdminLibrary } from "@/components/admin/AdminLibrary";
import { AdminFinance } from "@/components/admin/AdminFinance";
import { AdminRecords } from "@/components/admin/AdminRecords";
import { AdminModelRates } from "@/components/admin/AdminMarketplace";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ClientAccounts, ClientWithdrawals, SupportInbox } from "@/components/admin/AdminClients";
import { useServerFn } from "@tanstack/react-start";
import { decideVerification, openVerificationFile } from "@/lib/verification.functions";
import { VERIFICATION_REASONS } from "@/lib/verification-rules";
import { LogoutButton } from "@/components/shared/LogoutButton";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Master Control Center | Dealmaker" }, { name: "robots", content: "noindex" }, { name: "description", content: "Dealmaker master administration for talent, bookings, separate artist and client commissions, support and payment oversight." }, { property: "og:title", content: "Master Control Center | Dealmaker" }, { property: "og:description", content: "Manage the Dealmaker talent ecosystem from one protected operational workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Admin,
});

const NAV = [
  { id: "overview", label: "Overview", group: "Dashboard" },
  { id: "performance", label: "Performance Analytics", group: "Dashboard" },
  { id: "artists", label: "Artist directory", group: "Artists" },
  { id: "requests", label: "Artist requests", group: "Artists" },
  { id: "categories", label: "Categories", group: "Artists" },
  { id: "verify", label: "Verification", group: "Artists" },
  { id: "ratecards", label: "Ratecards", group: "Artists" },
  { id: "bookings", label: "Booking management", group: "Operations" },
  { id: "clients", label: "Client accounts", group: "Operations" },
  { id: "reviews", label: "Review moderation", group: "Operations" },
  { id: "catalog", label: "Event types", group: "Operations" },
  { id: "support", label: "Support tickets", group: "Operations" },
  { id: "invoices", label: "Invoices", group: "Finance" },
  { id: "contracts", label: "Contracts", group: "Finance" },
  { id: "transactions", label: "Payment transactions", group: "Finance" },
  { id: "allocations", label: "Commission allocations", group: "Finance" },
  { id: "escrow", label: "Escrow & disputes", group: "Finance" },
  { id: "payouts", label: "Artist payouts", group: "Finance" },
  { id: "client-payouts", label: "Client commission & payouts", group: "Finance" },
  { id: "plans", label: "Artist packages", group: "Subscriptions" },
  { id: "credits", label: "Credit ledger", group: "Subscriptions" },
  { id: "flow", label: "AI flow builder", group: "AI & Automation" },
  { id: "model-rates", label: "Model pricing", group: "AI & Automation" },
  { id: "library", label: "Templates & prompts", group: "Master Library" },
  { id: "settings", label: "Settings", group: "System" },
  { id: "roles", label: "Users & roles", group: "Administration" },
  { id: "notifications", label: "Notification delivery", group: "Administration" },
  { id: "audit", label: "Library audit", group: "Administration" },
] as const;
type Section = (typeof NAV)[number]["id"];
const NAV_ICONS: Record<Section, LucideIcon> = {
  overview: Gauge, performance: ChartNoAxesCombined, artists: UsersIcon, requests: UserCheck, categories: FolderTree, verify: BadgeCheck, ratecards: Tag, invoices: Receipt,
  contracts: FileSignature, plans: Package, escrow: ShieldCheck, payouts: Banknote, reviews: Star, catalog: CalendarRange,
  library: Layers, flow: Workflow, settings: SettingsIcon, clients: UsersIcon, "client-payouts": Banknote, support: LifeBuoy,
  bookings: ClipboardList, transactions: Receipt, allocations: Banknote, credits: Sparkles, "model-rates": Tag, roles: ShieldCheck, notifications: Bell, audit: History,
};


function Admin() {
  const { isAdmin, loading, user } = useAuth();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const [menu, setMenu] = useState(false);
  const [command, setCommand] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.documentElement.classList.add("dm-dash", "dm-admin");
    return () => document.documentElement.classList.remove("dm-dash", "dm-admin");
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && isAdmin) { event.preventDefault(); setCommand(value => !value); }
      if (event.key === "Escape" && menu) { setMenu(false); menuButton.current?.focus(); }
      if (menu && event.key === "Tab") {
        const nodes = sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
        const first = nodes?.[0]; const last = nodes?.[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAdmin, menu]);
  useEffect(() => { if (menu) sidebar.current?.querySelector<HTMLElement>('a[href]')?.focus(); }, [menu]);
  const pending = useQuery({ queryKey: ["admin-pending-count"], enabled: isAdmin, queryFn: async () => (await supabase.from("artists").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0 }).data ?? 0;
  if (loading) return <div className="p-16 text-center text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <PublicLayout><div className="p-16 text-center">You don't have access to the admin area.</div></PublicLayout>;
  const current = NAV.find((n) => n.id === section) ?? NAV[0];
  const openSection = (id: Section) => { setSection(id); setMenu(false); setCommand(false); };
  const refresh = async () => {
    setRefreshing(true);
    try { await qc.invalidateQueries(); }
    finally { setRefreshing(false); }
  };
  const logout = async () => { const { error } = await supabase.auth.signOut(); if (error) toast.error("Could not sign out"); else window.location.assign("/"); };
  let lastGroup: string | undefined;
  return (
    <div className="studio-app admin-control">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-3">Skip to content</a>
      <Button type="button" variant="ghost" aria-label="Close menu" className={`studio-scrim ${menu ? "is-open" : ""}`} tabIndex={menu ? 0 : -1} onClick={() => setMenu(false)} />
      <aside ref={sidebar} id="studio-sidebar" aria-label="Admin navigation" className={`studio-side admin-site-side ${menu ? "is-open" : ""}`}>
        <Link to="/" className="studio-brand" aria-label="Dealmaker home">
          <span className="studio-brand-mark">D</span>
          <span>Dealmaker <em>Admin</em></span>
        </Link>
        <div className="studio-me">
          <span className="studio-avatar" aria-hidden="true">A</span>
          <div className="min-w-0">
            <b className="block truncate">Master control center</b>
            <div className="studio-tags"><span className="studio-chip is-approved">Master admin</span></div>
          </div>
        </div>
        <nav className="studio-menu" aria-label="Sections">
          <span className="studio-active-pill" aria-hidden="true" />
          {NAV.map((n) => {
            const g = "group" in n ? n.group : undefined;
            const header = g && g !== lastGroup ? <div className="studio-group">{g}</div> : null;
            lastGroup = g;
            const Icon = NAV_ICONS[n.id];
            return (
              <div key={n.id} className="studio-menu-entry">
                {header}
                <Button type="button" variant="ghost" aria-current={section === n.id ? "page" : undefined} onClick={() => openSection(n.id)} className="studio-nav-item">
                  <Icon aria-hidden="true" />{n.label}
                  {n.id === "requests" && pending > 0 ? <span className="ms-auto text-[11px] font-bold">{pending}</span> : null}
                </Button>
              </div>
            );
          })}
        </nav>
        <div className="admin-logout"><Button variant="ghost" className="studio-nav-item" onClick={() => void logout()}><LogOut />Sign out</Button></div>
      </aside>
      <div className="studio-main">
        <header className="studio-top admin-site-top">
          <Button ref={menuButton} variant="outline" size="icon" className="studio-burger studio-icon-button" onClick={() => setMenu(!menu)} aria-label={menu ? "Close menu" : "Open navigation"} aria-controls="studio-sidebar" aria-expanded={menu}><MenuIcon /></Button>
          <div className="admin-breadcrumb"><span>Master admin / </span><b>{current.group}</b></div>
          <div className="studio-top-end">
            <span className="studio-mail" title={user?.email ?? ""} dir="ltr">{user?.email}</span>
            <Button variant="outline" className="admin-search" onClick={() => setCommand(true)} aria-label="Find admin section"><Search /><span>Find a section</span></Button>
            <Button variant="ghost" size="icon" disabled={refreshing} aria-label="Refresh admin data" title="Refresh admin data" onClick={() => void refresh()}><RefreshCw /></Button>
            <LogoutButton />
          </div>
        </header>
        <main id="admin-content" className="studio-content studio-reference" tabIndex={-1}>
          <div className="admin-title"><div><h1 className="font-display">{current.label}</h1><p>{section === "overview" ? "Talent, bookings and payment oversight across Dealmaker." : section === "performance" ? "Artist activity, client conversations and completed jobs across Dealmaker." : section === "allocations" ? "Artist entitlement, platform fees and client rewards, separately recorded for every booking." : `${current.group} / ${current.label}`}</p></div><Badge variant="outline">Master admin</Badge></div>
          {section === "overview" && <AdminOverview onOpen={openSection} />}
          {section === "performance" && <AdminPerformance />}
          {section === "bookings" && <AdminFinance key="bookings" bookings />}
          {section === "allocations" && <AdminFinance key="allocations" />}
          {(section === "transactions" || section === "credits" || section === "notifications" || section === "roles" || section === "audit") && <AdminRecords key={section} kind={section} />}
          {section === "model-rates" && <AdminModelRates />}
          {section === "artists" && <ArtistDirectory />}
          {section === "requests" && <ArtistRequests />}
          {section === "categories" && <CategoryManager />}
          {section === "verify" && <VerifyQueue />}
          {section === "ratecards" && <AdminRatecards />}
          {section === "invoices" && <InvoiceRecords />}
          {section === "contracts" && <ContractsTable />}
          {section === "plans" && <AdminPlans />}
          {section === "escrow" && <AdminEscrow />}
          {section === "payouts" && <PayoutQueue />}
          {section === "reviews" && <ReviewQueue />}
          {section === "catalog" && <EventTypeManager />}
          {section === "library" && <AdminLibrary />}
          {section === "clients" && <ClientAccounts />}
          {section === "client-payouts" && <ClientWithdrawals />}
          {section === "support" && <SupportInbox />}
          {section === "settings" && <AdminSettings />}
          {section === "flow" && <FlowBuilder artistId={null} />}
        </main>
      </div>
      <Dialog open={command} onOpenChange={setCommand}><DialogContent className="p-0 overflow-hidden"><DialogTitle className="sr-only">Find admin section</DialogTitle><DialogDescription className="sr-only">Choose an area of the Dealmaker master control center.</DialogDescription><Command><CommandInput placeholder="Find bookings, artists, commissions…" /><CommandList><CommandEmpty>No section found.</CommandEmpty>{[...new Set(NAV.map(n => n.group))].map(group => <CommandGroup key={group} heading={group}>{NAV.filter(n => n.group === group).map(n => { const Icon = NAV_ICONS[n.id]; return <CommandItem key={n.id} value={`${n.group} ${n.label}`} onSelect={() => openSection(n.id)}><Icon />{n.label}</CommandItem>; })}</CommandGroup>)}</CommandList></Command></DialogContent></Dialog>
    </div>
  );
}

function PayoutQueue() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => (await supabase.from("payout_requests").select("*, artists(stage_name)").order("created_at", { ascending: false })).data ?? [],
  });
  const decide = async (id: string, status: "paid" | "rejected") => {
    const note = status === "rejected" ? prompt("Reason for rejecting?") ?? "" : "";
    const { error } = await supabase.from("payout_requests").update({ status, admin_note: note || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "paid" ? "Marked as paid" : "Rejected");
    qc.invalidateQueries({ queryKey: ["admin-payouts"] });
  };
  return (
    <div className="rounded-xl border bg-card divide-y">
      {data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No withdrawal requests yet.</p>}
      {data?.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.artists?.stage_name} · AED {Number(r.amount).toLocaleString("en-US")}</div>
            <div className="whitespace-pre-line text-xs text-muted-foreground">{r.bank_details}</div>
            <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-GB")}</div>
          </div>
          <Badge variant={r.status === "paid" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
          {r.status === "pending" && <><Button size="sm" onClick={() => decide(r.id, "paid")}>Mark paid</Button><Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")}>Reject</Button></>}
        </div>
      ))}
    </div>
  );
}

function VerifyQueue() {
  const qc = useQueryClient();
  const openFile = useServerFn(openVerificationFile);
  const saveDecision = useServerFn(decideVerification);
  const { data } = useQuery({
    queryKey: ["admin-verif"],
    queryFn: async () => {
      const result = await supabase.from("verification_applications").select("*, artists(stage_name), verification_details(*), verification_files(*)").order("created_at", { ascending: false });
      if (result.error) throw new Error("Unable to load verification applications");
      return result.data ?? [];
    },
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (id: string, status: "approved" | "rejected" | "needs_more_info", savedReasons: string[], savedNote: string | null) => {
    setBusy(id);
    try {
      const result = await saveDecision({ data: { applicationId: id, status, reasons: (reasons[id] ?? savedReasons.join("\n")).split("\n").map((s) => s.trim()).filter(Boolean), admin_note: notes[id] ?? savedNote ?? "" } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(`Marked ${status.replace(/_/g, " ")}`);
      await qc.invalidateQueries({ queryKey: ["admin-verif"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save decision"); }
    finally { setBusy(null); }
  };
  const view = async (applicationId: string, fileId?: string) => {
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    try {
      const result = await openFile({ data: fileId ? { applicationId, fileId } : { applicationId } });
      if (popup) popup.location.href = result.url;
      else toast.error("Allow pop-ups to view verification documents");
    } catch (error) { popup?.close(); toast.error(error instanceof Error ? error.message : "Could not open document"); }
  };
  return (
    <div className="space-y-3">
      {data?.length === 0 && <p className="text-muted-foreground">No applications yet.</p>}
      {data?.map((a) => (
        <div key={a.id} className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex justify-between"><span className="font-semibold">{a.artists?.stage_name} — {BADGE_LABELS[a.badge_type]}</span><Badge variant="secondary">{a.status.replace(/_/g, " ")}</Badge></div>
          {a.note && <p className="text-sm text-muted-foreground mt-1">{a.note}</p>}
          {a.verification_details && <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(a.verification_details).filter(([key]) => !["application_id", "created_at"].includes(key)).map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{key.replace(/_/g, " ")}</dt><dd className="break-words">{value === null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}
          </dl>}
          <div className="mt-3 flex flex-wrap gap-2">{a.verification_files.map((file) => <Button key={file.id} size="sm" variant="outline" disabled={Boolean(a.privacy_purged_at)} onClick={() => view(a.id, file.id)}>{file.kind.replace(/_/g, " ")}</Button>)}</div>
          {a.doc_path && !a.verification_files.some((file) => file.storage_path === a.doc_path) && <Button size="sm" variant="outline" disabled={Boolean(a.privacy_purged_at)} onClick={() => view(a.id)}>Legacy document</Button>}
          {a.privacy_purged_at && <p className="mt-2 text-sm text-muted-foreground">Documents deleted under the 30-day privacy rule.</p>}
          <div className="mt-3 space-y-2">
            <label className="block text-sm" htmlFor={`reasons-${a.id}`}>What went wrong</label>
            <div className="flex flex-wrap gap-2">{VERIFICATION_REASONS.map((reason) => <Button key={reason} size="sm" variant="outline" className="h-auto whitespace-normal text-start" onClick={() => setReasons((previous) => ({ ...previous, [a.id]: [...new Set([...(previous[a.id] ?? a.reasons.join("\n")).split("\n").filter(Boolean), reason])].join("\n") }))}>{reason}</Button>)}</div>
            <textarea id={`reasons-${a.id}`} className="w-full rounded-md border border-input bg-background p-2 text-sm" rows={3} placeholder="Choose a reason above or type one per line" value={reasons[a.id] ?? a.reasons.join("\n")} onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <Input className="max-w-xs" placeholder="Note to artist" value={notes[a.id] ?? a.admin_note ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
            <Button size="sm" disabled={busy === a.id || Boolean(a.privacy_purged_at)} onClick={() => decide(a.id, "approved", a.reasons, a.admin_note)}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busy === a.id || Boolean(a.privacy_purged_at)} onClick={() => decide(a.id, "needs_more_info", a.reasons, a.admin_note)}>Need more info</Button>
            <Button size="sm" variant="ghost" disabled={busy === a.id || Boolean(a.privacy_purged_at)} onClick={() => decide(a.id, "rejected", a.reasons, a.admin_note)}>Reject</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewQueue() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => (await supabase.from("reviews").select("*, artists(stage_name)").in("status", ["reported", "hidden"]).order("created_at", { ascending: false })).data ?? [],
  });
  const set = async (id: string, status: string) => {
    await supabase.from("reviews").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
  };
  return (
    <div className="space-y-3">
      {data?.length === 0 && <p className="text-muted-foreground">No reported reviews.</p>}
      {data?.map((r) => (
        <div key={r.id} className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex justify-between"><span className="font-semibold">{r.artists?.stage_name} · {r.client_name} · {"★".repeat(r.rating)}</span><Badge variant="secondary">{r.status}</Badge></div>
          <p className="text-sm mt-2">{r.body}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => set(r.id, "published")}>Keep published</Button>
            <Button size="sm" variant="outline" onClick={() => set(r.id, "hidden")}>Hide</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
