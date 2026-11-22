import { createFileRoute, Link } from "@tanstack/react-router";
import { VerificationPage } from "@/components/dashboard/VerificationPage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Inbox, AgentSettings, Credits } from "@/components/dashboard/AgentTabs";
import { BookingsTab } from "@/components/dashboard/BookingsTab";
import { ExportTab } from "@/components/dashboard/ExportTab";
import { ContractsTable } from "@/components/dashboard/ContractsTable";
import { InvoicesTab } from "@/components/dashboard/InvoicesTab";
import { RateCardTable } from "@/components/dashboard/RateCardTable";
import { OrderFormBuilder } from "@/components/dashboard/OrderFormBuilder";
import { MediaTab } from "@/components/dashboard/MediaTab";
import { QuoteRequests } from "@/components/dashboard/QuoteRequests";
import { FlowBuilder } from "@/components/flow/FlowBuilder";
import { TeamTab } from "@/components/dashboard/TeamTabs";
import { ArtistOverview, CalendarTab, TeamPhones, WalletTab } from "@/components/dashboard/ArtistCRM";
import { aed, BADGE_LABELS, initials, slugify } from "@/lib/format";
import { BadgeCheck, Bell, Bot, Calendar, CalendarCheck, ClipboardList, Download, Eye, FileSignature, FileText, Home, Image as ImageIcon, Inbox as InboxIcon, Menu as MenuIcon, Receipt, Sparkles, Tag, User, Users, Wallet, Workflow, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "@/components/dashboard/studio.css";
import { YourAgent } from "@/components/dashboard/YourAgent";
import { ClientsSection, PhysicalFields, PortfolioSection, ProfilePhoto, SkillsField } from "@/components/dashboard/ProfileExtras";
import type { Json } from "@/integrations/supabase/types";
import { StudioHeading, StudioSection, StudioSoon, StudioEmpty } from "@/components/dashboard/StudioPage";
import { ProfileSide } from "@/components/dashboard/ProfileSide";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Dealmaker" }, { name: "robots", content: "noindex" }, { name: "description", content: "Manage your Dealmaker bookings, service invoices, and AI credit purchases." }, { property: "og:title", content: "Dashboard | Dealmaker" }, { property: "og:description", content: "Your talent workspace for bookings, invoices, and AI credits." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

function useCatalog() {
  return useQuery({
    queryKey: ["catalog-client"],
    queryFn: async () => {
      const [c, s, e, a] = await Promise.all([
        supabase.from("categories").select("id,name").order("sort"),
        supabase.from("subcategories").select("id,name,category_id").order("name"),
        supabase.from("emirates").select("id,name").order("sort"),
        supabase.from("areas").select("id,name,emirate_id").order("name"),
      ]);
      return { categories: c.data ?? [], subcategories: s.data ?? [], emirates: e.data ?? [], areas: a.data ?? [] };
    },
  });
}

function Dashboard() {
  const { user, isArtist, loading } = useAuth();
  const [workspace,setWorkspace]=useState('own');
  const { t } = useI18n();
  if (loading || !user) return <PublicLayout><div className="p-16 text-center text-muted-foreground">{t("Loading…")}</div></PublicLayout>;
  return <><div hidden className={`studio-workspace-access ${isArtist && workspace === "own" ? "studio-workspace-own" : ""}`}>{isArtist&&<><Button size="sm" variant={workspace==='own'?'default':'outline'} onClick={()=>setWorkspace('own')}>{t("My talent workspace")}</Button><Button size="sm" variant={workspace==='teams'?'default':'outline'} onClick={()=>setWorkspace('teams')}>{t("Invited teams & my requests")}</Button></>}<Button asChild size="sm" variant="ghost"><Link to="/account">{t("Account settings")}</Link></Button></div>{isArtist&&workspace==='own'?<ArtistDash userId={user.id} email={user.email??''}/>:<PublicLayout><div className="mx-auto max-w-6xl px-4 py-10"><MemberOrClient userId={user.id}/></div></PublicLayout>}</>;
}

/** Managers/assistants invited by an artist get a reduced artist workspace. */
function MemberOrClient({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["my-teams", userId],
    queryFn: async () => {
      await supabase.rpc("accept_artist_invites");
      return (await supabase.from("artist_members").select("role, role_id, team_roles(menus), artists(id, slug, stage_name)").eq("user_id", userId).eq("status", "active")).data ?? [];
    },
  });
  const teams = (data ?? []).filter((t) => t.artists);
  const [pick, setPick] = useState(0);
  const { t: tr } = useI18n();
  if (isLoading) return null;
  if (teams.length === 0) return <ClientDash userId={userId} />;
  const t = teams[Math.min(pick, teams.length - 1)];
  const a = t?.artists;if(!t||!a)return <ClientDash userId={userId}/>;
  const allowed = t.team_roles?.menus ?? null;
  const can = (menu: string) => !allowed || allowed.includes(menu);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">{a.stage_name}</h1><p className="text-sm text-muted-foreground">You are a {t.role} on this team</p></div>
        {teams.length > 1 && <Select value={String(pick)} onValueChange={(v) => setPick(Number(v))}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent>{teams.map((x, i) => <SelectItem key={x.artists?.id??i} value={String(i)}>{x.artists?.stage_name}</SelectItem>)}</SelectContent></Select>}
      </div>
      <Tabs key={a.id} defaultValue="inbox" className="mt-8">
        <TabsList className="flex-wrap h-auto">
          {can("inbox") && <TabsTrigger value="inbox">{tr("Inbox")}</TabsTrigger>}
          {can("bookings") && <TabsTrigger value="bookings">{tr("Bookings")}</TabsTrigger>}
          {can("quotes") && <TabsTrigger value="quotes">{tr("Quote requests")}</TabsTrigger>}
          {can("calendar") && <TabsTrigger value="calendar">{tr("Availability")}</TabsTrigger>}
          {can("media") && <TabsTrigger value="media">{tr("Photos & videos")}</TabsTrigger>}
          <TabsTrigger value="mine">{tr("My requests")}</TabsTrigger>
        </TabsList>
        {can("inbox") && <TabsContent value="inbox"><Inbox artistId={a.id} /></TabsContent>}
        {can("bookings") && <TabsContent value="bookings"><BookingsTab artistId={a.id} trn={null} notifyPhone={null} teamMode /></TabsContent>}
        {can("quotes") && <TabsContent value="quotes"><QuoteRequests artistId={a.id} /></TabsContent>}
        {can("calendar") && <TabsContent value="calendar"><Availability artistId={a.id} /></TabsContent>}
        {can("media") && <TabsContent value="media"><MediaTab artistId={a.id} /></TabsContent>}
        <TabsContent value="mine"><ClientDash userId={userId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ClientDash({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["my-quotes", userId],
    queryFn: async () => (await supabase.from("quote_requests").select("id, created_at, status, event_date, artists(stage_name, slug)").eq("client_user_id", userId).order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div>
      <h1 className="text-3xl font-semibold">My quote requests</h1>
      <div className="mt-6 space-y-3">
        {data?.length === 0 && <p className="text-muted-foreground">No requests yet. <Link to="/" className="text-gold underline">Find talent</Link>.</p>}
        {data?.map((q) => (
          <div key={q.id} className="rounded-xl bg-card p-4 shadow-card flex justify-between">
            <div><div className="font-semibold">{q.artists?.stage_name}</div><div className="text-xs text-muted-foreground">Event {q.event_date ?? "date TBC"}</div></div>
            <Badge variant="secondary">{q.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

const ARTIST_NAV = [
  { id: "overview", label: "Overview" },
  { id: "youragent", label: "Your AI agent" },
  { id: "inbox", label: "Inbox", group: "Sales" },
  { id: "quotes", label: "Quote requests", group: "Sales" },
  { id: "bookings", label: "Bookings", group: "Sales" },
  { id: "calendar", label: "Calendar", group: "Sales" },
  { id: "invoices", label: "Invoice", group: "Sales" },
  { id: "contracts", label: "Contract", group: "Sales" },
  { id: "wallet", label: "Wallet", group: "Money" },
  { id: "credits", label: "AI credits", group: "Money" },
  { id: "export", label: "Export data", group: "Money" },
  { id: "profile", label: "Profile", group: "Profile" },
  { id: "packages", label: "Ratecard", group: "Profile" },
  { id: "orderform", label: "Order form", group: "Profile" },
  { id: "media", label: "Photos & videos", group: "Profile" },
  { id: "verify", label: "Verification", group: "Profile" },
  { id: "agent", label: "AI agent", group: "AI" },
  { id: "flow", label: "AI flow", group: "AI" },
  { id: "team", label: "Team", group: "Settings" },
] as const;
type ArtistSection = (typeof ARTIST_NAV)[number]["id"];
const NAV_ICONS: Record<ArtistSection, LucideIcon> = {
  overview: Home, youragent: Bot, inbox: InboxIcon, quotes: FileText, bookings: CalendarCheck, calendar: Calendar, invoices: Receipt, contracts: FileSignature,
  wallet: Wallet, credits: Sparkles, export: Download, profile: User, packages: Tag, orderform: ClipboardList, media: ImageIcon, verify: BadgeCheck,
  agent: Bot, flow: Workflow, team: Users,
};

function ArtistDash({ userId, email }: { userId: string; email: string }) {
  const { data: artist, refetch, isLoading } = useQuery({
    queryKey: ["my-artist", userId],
    queryFn: async () => (await supabase.from("artists").select("*").eq("user_id", userId).maybeSingle()).data,
  });
  const { t: tr } = useI18n();
  const [section, setSection] = useState<ArtistSection>("overview");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add("dm-dash");
    return () => document.documentElement.classList.remove("dm-dash");
  }, []);
  const { data: navCounts } = useQuery({
    queryKey: ["nav-counts", artist?.id],
    enabled: !!artist?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const id = artist!.id;
      const head = { count: "exact" as const, head: true };
      const [inbox, quotes, bookings, invoices, wallet] = await Promise.all([
        supabase.from("conversations").select("id", head).eq("artist_id", id),
        supabase.from("quote_requests").select("id", head).eq("artist_id", id).eq("status", "new"),
        supabase.from("bookings").select("id", head).eq("artist_id", id),
        supabase.from("service_invoices").select("id", head).eq("artist_id", id),
        supabase.from("credit_wallets").select("balance").eq("artist_id", id).maybeSingle(),
      ]);
      return {
        inbox: inbox.count ?? 0,
        quotes: quotes.count ?? 0,
        bookings: bookings.count ?? 0,
        invoices: invoices.count ?? 0,
        credits: Number(wallet.data?.balance ?? 0),
      } as Record<string, number>;
    },
  });
  const NAV_COUNT: Partial<Record<string, string>> = { inbox: "inbox", quotes: "quotes", bookings: "bookings", invoices: "invoices", credits: "credits" };
  if (isLoading) return null;
  if (!artist) return <PublicLayout><div className="py-16 text-center"><h1 className="text-3xl font-semibold">{tr("Finish your talent register")}</h1><Button asChild className="mt-6 bg-gradient-gold text-gold-foreground"><Link to="/join">{tr("Continue registration")}</Link></Button></div></PublicLayout>;
  const current = ARTIST_NAV.find((n) => n.id === section) ?? ARTIST_NAV[0];
  let lastGroup: string | undefined;
  return (
    <div className="studio-app">
      <Button type="button" variant="ghost" aria-label={tr("Close menu")} className={`studio-scrim ${menu ? "is-open" : ""}`} tabIndex={menu ? 0 : -1} onClick={() => setMenu(false)} />
      <aside id="studio-sidebar" aria-label={tr("Studio navigation")} className={`studio-side ${menu ? "is-open" : ""}`}>
        <Link to="/" className="studio-brand" aria-label={tr("Dealmaker Studio")}>
          <span className="studio-brand-mark">{tr("D")}</span>
          <span>{tr("Dealmaker")} <em>{tr("Studio")}</em></span>
        </Link>
        <div className="studio-me">
          <span className="studio-avatar" aria-hidden="true">{initials(artist.stage_name)}</span>
          <div className="min-w-0">
            <b className="block truncate">{artist.stage_name}</b>
            <div className="studio-tags">
              <span className={`studio-chip ${artist.status === "approved" ? "is-approved" : ""}`}>{tr(artist.status === "pending" ? "Awaiting approval" : artist.status === "approved" ? "Approved" : artist.status)}</span>
              <Button type="button" variant="ghost" onClick={() => { setSection("overview"); setMenu(false); }} className="studio-chip studio-plan-chip">{tr("Plan:")} {tr(artist.plan)} · {tr("Upgrade")}</Button>
            </div>
          </div>
        </div>
        <nav className="studio-menu" aria-label={tr("Sections")}>
          <span className="studio-active-pill" aria-hidden="true" />
          {ARTIST_NAV.map((n) => {
            const g = "group" in n ? n.group : undefined;
            const header = g && g !== lastGroup ? <div className="studio-group">{tr(g)}</div> : null;
            lastGroup = g;
            const Icon = NAV_ICONS[n.id];
            const on = section === n.id;
            return (
              <div key={n.id} className="studio-menu-entry">
                {header}
                <Button type="button" variant="ghost" aria-current={on ? "page" : undefined} onClick={() => { setSection(n.id); setMenu(false); }} className="studio-nav-item">
                  <Icon aria-hidden="true" />{tr(n.label)}{NAV_COUNT[n.id] && navCounts && navCounts[NAV_COUNT[n.id]!] ? <span className="ms-auto text-[11px] font-bold opacity-60">{navCounts[NAV_COUNT[n.id]!]}</span> : null}
                </Button>
              </div>
            );
          })}
        </nav>
        <div className="studio-side-foot">
          <b>{tr("More credits,")} <span className="it">{tr("more replies.")}</span></b>
          <p>{tr("Medium gives 200 AI credits and calendar sync. Pro gives 500 credits and featured eligibility.")}</p>
          <Button size="sm" className="studio-button studio-button-gold" onClick={() => { setSection("overview"); setMenu(false); }}>{tr("See plans")} <span className="studio-arrow" aria-hidden="true">→</span></Button>
        </div>
      </aside>
      <div className="studio-main">
        <header className="studio-top">
          <Button variant="outline" size="icon" className="studio-burger studio-icon-button" onClick={() => setMenu(!menu)} aria-label={tr(menu ? "Close menu" : "Open navigation")} aria-controls="studio-sidebar" aria-expanded={menu}><MenuIcon /></Button>
          <nav className="studio-workspaces" aria-label={tr("Workspaces")}>
            <Button variant="ghost" aria-current={section !== "team" ? "page" : undefined} onClick={() => setSection("overview")}>{tr("My talent workspace")}</Button>
            <Button variant="ghost" aria-current={section === "team" ? "page" : undefined} onClick={() => setSection("team")}>{tr("Invite team")}</Button>
            <Link to="/account">{tr("Account settings")}</Link>
          </nav>
          <h1 className="studio-mobile-title">{tr(current.label)}</h1>
          <div className="studio-top-end">
            <Button variant="outline" size="icon" className="studio-icon-button" aria-label={tr("Inbox")} title={tr("Inbox")} onClick={() => setSection("inbox")}><Bell aria-hidden="true" /></Button>
            {artist.status === "approved" && <Button asChild variant="outline" size="sm" className="studio-button studio-public-link"><Link to="/artist/$slug" params={{ slug: artist.slug }} aria-label={tr("View public profile")}><Eye aria-hidden="true" /><span>{tr("View public profile")}</span></Link></Button>}
            <span className="studio-mail" title={email} dir="ltr">{email}</span>
          </div>
        </header>
        <main className={`studio-content ${section === "overview" ? "studio-overview-content" : "studio-reference"}`}>
          {section === "youragent" && <YourAgent artistId={artist.id} stageName={artist.stage_name} onOpen={(id) => setSection(id as ArtistSection)} />}
          {section === "overview" && <ArtistOverview artistId={artist.id} stageName={artist.stage_name} plan={artist.plan} onOpen={(id) => setSection(id as ArtistSection)} />}
          {section === "inbox" && <Inbox artistId={artist.id} />}
          {section === "quotes" && <QuoteRequests artistId={artist.id} />}
          {section === "bookings" && <BookingsTab artistId={artist.id} trn={artist.trn} notifyPhone={artist.notify_phone} />}
          {section === "calendar" && <CalendarTab artistId={artist.id} />}
          {section === "contracts" && <ContractsTable artistId={artist.id} />}
          {section === "invoices" && <InvoicesTab artistId={artist.id} />}
          {section === "wallet" && <WalletTab artistId={artist.id} />}
          {section === "credits" && <Credits artistId={artist.id} />}
          {section === "export" && <ExportTab artistId={artist.id} slug={artist.slug} />}
          {section === "profile" && <ProfileEditor artist={artist} onSaved={refetch} />}
          {section === "packages" && <RateCardTable artistId={artist.id} />}
          {section === "orderform" && <OrderFormBuilder artistId={artist.id} />}
          {section === "media" && <MediaTab artistId={artist.id} />}
          {section === "verify" && <VerificationPage artistId={artist.id} userId={userId} />}
          {section === "agent" && <AgentSettings artistId={artist.id} />}
          {section === "flow" && <FlowBuilder artistId={artist.id} />}
          {section === "team" && <><TeamTab artistId={artist.id}/><TeamPhones artistId={artist.id}/></>}
        </main>
      </div>
    </div>
  );
}

type ArtistRow = { id: string; stage_name: string; tagline: string | null; bio: string | null; base_price: number | null; languages: string[] | null; travel_radius_km: number | null; category_id: string | null; subcategory_id: string | null; emirate_id: string | null; area_id: string | null; skills?: string[] | null; body?: Json | null; photo_path?: string | null };

function ArtistFields({ v, set, photo }: { v: Partial<ArtistRow>; set: (p: Partial<ArtistRow>) => void; photo?: ReactNode }) {
  const { t } = useI18n();
  const { data: cat } = useCatalog();
  return <div className="studio-profile-fields">
    <StudioSection title="About" accent="you" subtitle="Your photo, name and a short line that sells you."><div className="studio-profile-about"><div>{photo ?? <><span className="studio-profile-avatar">{initials(v.stage_name ?? t("Artist"))}</span><Button variant="outline" disabled>{t("Upload photo")}</Button></>}</div><div><div className="dmr-qe-f"><Label>{t("Stage name")}</Label><Input value={v.stage_name ?? ""} onChange={(e) => set({ stage_name: e.target.value })} maxLength={80} /></div><div className="dmr-qe-f"><Label>{t("Tagline")}</Label><Input id="pf-tagline" value={v.tagline ?? ""} onChange={(e) => set({ tagline: e.target.value })} maxLength={120} /></div></div></div><div className="dmr-qe-f"><Label>{t("Bio")}</Label><Textarea id="pf-bio" rows={5} value={v.bio ?? ""} onChange={(e) => set({ bio: e.target.value })} maxLength={2000} placeholder={t("Who you are, what you perform, and what a client can expect on the day.")} /><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden><i className={`block h-full ${(v.bio ?? "").trim().length >= 150 ? "bg-emerald-400" : "bg-gold"}`} style={{ width: `${Math.min(100, ((v.bio ?? "").trim().length / 150) * 100)}%` }} /></div><span className="text-xs text-muted-foreground">{(v.bio ?? "").trim().length} / 2000 · {t("At least 150 characters.")}</span></div></StudioSection>
    <StudioSection title="What you" accent="do" subtitle="Add your category and speciality, then the skills clients search for."><div className="grid gap-4 sm:grid-cols-2"><div className="dmr-qe-f"><Label>{t("Category")}</Label>
        <Select value={v.category_id ?? ""} onValueChange={(x) => set({ category_id: x, subcategory_id: null })}>
          <SelectTrigger><SelectValue placeholder={t("Choose")} /></SelectTrigger>
          <SelectContent>{cat?.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select></div><div className="dmr-qe-f"><Label>{t("Speciality")}</Label>
        <Select value={v.subcategory_id ?? ""} onValueChange={(x) => set({ subcategory_id: x })}>
          <SelectTrigger id="pf-spec"><SelectValue placeholder={t("Choose")} /></SelectTrigger>
          <SelectContent>{cat?.subcategories.filter((s) => s.category_id === v.category_id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select></div></div><SkillsField skills={v.skills ?? []} onChange={(x) => set({ skills: x })} /></StudioSection>
    <StudioSection title="Physical" accent="details" subtitle="Casting details clients ask for on model bookings. Optional unless you list Models as a category."><PhysicalFields body={v.body && typeof v.body === "object" && !Array.isArray(v.body) ? (v.body as Record<string, unknown>) : {}} onChange={(x) => set({ body: x as Json })} /></StudioSection>
    <StudioSection title="Where and" accent="how much" subtitle="Used to match you with bookings and to quote."><div className="grid gap-4 sm:grid-cols-2"><div className="dmr-qe-f"><Label>{t("Emirate")}</Label>
        <Select value={v.emirate_id ?? ""} onValueChange={(x) => set({ emirate_id: x, area_id: null })}>
          <SelectTrigger><SelectValue placeholder={t("Choose")} /></SelectTrigger>
          <SelectContent>{cat?.emirates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select></div><div className="dmr-qe-f"><Label>{t("Base area")}</Label>
        <Select value={v.area_id ?? ""} onValueChange={(x) => set({ area_id: x })}>
          <SelectTrigger><SelectValue placeholder={t("Choose")} /></SelectTrigger>
          <SelectContent>{cat?.areas.filter((a) => a.emirate_id === v.emirate_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select></div><div className="dmr-qe-f"><Label>{t("Starting price (AED)")}</Label><Input id="pf-price" type="number" min={0} value={v.base_price ?? ""} onChange={(e) => set({ base_price: Number(e.target.value) })} /><span className="text-xs text-muted-foreground">{t("Excluding VAT.")}</span></div><div className="dmr-qe-f"><Label>{t("Travel radius (km)")}</Label><Input type="number" min={0} max={500} value={v.travel_radius_km ?? ""} onChange={(e) => set({ travel_radius_km: Number(e.target.value) })} /><span className="text-xs text-muted-foreground">{t("0 to 500.")}</span></div></div><div className="dmr-qe-f"><Label>{t("Languages (comma separated)")}</Label><Input id="pf-lang" placeholder={t("e.g. English, Arabic")} value={(v.languages ?? []).join(", ")} onChange={(e) => set({ languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div></StudioSection>
  </div>;
}

function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [v, setV] = useState<Partial<ArtistRow>>({ languages: ["English"], travel_radius_km: 30 });
  const save = async () => {
    if (!v.stage_name || !v.category_id || !v.emirate_id) { toast.error("Stage name, category and emirate are required."); return; }
    const { error } = await supabase.from("artists").insert({
      ...v, skills: v.skills ?? [], body: v.body ?? {}, stage_name: v.stage_name, user_id: userId,
      slug: `${slugify(v.stage_name)}-${Math.random().toString(36).slice(2, 6)}`,
      hue: Math.floor(Math.random() * 360),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Profile submitted for approval.");
    onDone();
  };
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold">Set up your talent profile</h1>
      <p className="text-muted-foreground mt-1">Our team reviews new profiles before they appear in search.</p>
      <div className="mt-8"><ArtistFields v={v} set={(p) => setV({ ...v, ...p })} /></div>
      <Button onClick={save} className="mt-6 bg-gradient-gold text-gold-foreground">Submit profile</Button>
    </div>
  );
}

/** Change password on its own, apart from the profile. Google sign-in accounts have no password here. */
function ChangePassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(true);
  const [f, setF] = useState({ cur: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setHasPassword(!data.user?.app_metadata?.["provider"] || data.user.app_metadata["provider"] === "email");
    });
  }, []);
  const strong = f.next.length >= 10 && /[a-z]/.test(f.next) && /[A-Z]/.test(f.next) && /\d/.test(f.next);
  const error = f.next && !strong ? t("At least 10 characters with upper case, lower case and a number.") : f.again && f.again !== f.next ? t("The two passwords do not match.") : "";
  const save = async () => {
    if (!email || !f.cur || !strong || f.again !== f.next) { toast.error(error || t("Fill in every field.")); return; }
    setBusy(true);
    const check = await supabase.auth.signInWithPassword({ email, password: f.cur });
    if (check.error) { setBusy(false); toast.error(t("Your current password is not correct.")); return; }
    const { error: err } = await supabase.auth.updateUser({ password: f.next });
    setBusy(false);
    if (err) { toast.error(err.message); return; }
    setF({ cur: "", next: "", again: "" });
    toast.success(t("Password changed"));
  };
  return (
    <StudioSection title="Change" accent="password" subtitle="Saved on its own, apart from your profile.">
      {!hasPassword ? <p className="text-sm text-muted-foreground">{t("You sign in with Google, so there is no password to change here.")}</p> : (
        <form className="grid gap-3.5" noValidate autoComplete="off" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {([["cur", "Current password", "current-password"], ["next", "New password", "new-password"], ["again", "Repeat new password", "new-password"]] as const).map(([k, l, ac]) => (
            <div key={k} className="dmr-qe-f"><Label htmlFor={`pf-pw-${k}`}>{t(l)}</Label><Input id={`pf-pw-${k}`} type={show ? "text" : "password"} autoComplete={ac} maxLength={64} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
          ))}
          <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">{error || t("At least 10 characters with upper case, lower case and a number.")}</p>
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy} className="rounded-full bg-gradient-gold font-bold text-gold-foreground">{busy ? t("Saving…") : t("Change password")}</Button><button type="button" aria-pressed={show} onClick={() => setShow(!show)} className="text-xs font-bold text-muted-foreground underline underline-offset-4">{t(show ? "Hide passwords" : "Show passwords")}</button></div>
        </form>
      )}
    </StudioSection>
  );
}

function ProfileEditor({ artist, onSaved }: { artist: ArtistRow; onSaved: () => void }) {
  const { t } = useI18n();
  const { data: cat } = useCatalog();
  const [v, setV] = useState<Partial<ArtistRow>>(artist);
  const bioLen = (v.bio ?? "").trim().length;
  const save = async () => {
    if (bioLen < 150) { toast.error(t("Your bio needs at least 150 characters")); return; }
    const { id: _id, ...rest } = v as ArtistRow;
    const { error } = await supabase.from("artists").update({
      stage_name: rest.stage_name, tagline: rest.tagline, bio: rest.bio, base_price: rest.base_price, languages: rest.languages,
      skills: rest.skills ?? [], body: rest.body ?? {}, travel_radius_km: rest.travel_radius_km, category_id: rest.category_id, subcategory_id: rest.subcategory_id, emirate_id: rest.emirate_id, area_id: rest.area_id,
    }).eq("id", artist.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Profile saved"));
    onSaved();
  };
  return <div className="dmr-wrap dmr-pfpage"><StudioHeading title="Your" accent="profile" /><p className="dmr-c-12 -mt-2 text-sm text-muted-foreground">{t("This is what clients see before they book you. A complete profile with a real bio, photo and past work gets more quote requests.")}</p><div className="dmr-w-left"><ArtistFields v={v} set={p=>setV({...v,...p})} photo={<ProfilePhoto artistId={artist.id} name={v.stage_name ?? artist.stage_name} photoPath={artist.photo_path ?? null} onSaved={onSaved} />} /><PortfolioSection artistId={artist.id} /><ClientsSection artistId={artist.id} /><ChangePassword /><div className="studio-save-bar"><p className={`text-xs ${bioLen < 150 ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">{t("Bio")}: {bioLen} / 150 {t("minimum characters")}</p><Button onClick={save}>{t("Save changes")}</Button></div></div><ProfileSide artistId={artist.id} v={v} photoPath={artist.photo_path ?? null} names={{ category: cat?.categories.find((c) => c.id === v.category_id)?.name ?? "", speciality: cat?.subcategories.find((x) => x.id === v.subcategory_id)?.name ?? "", emirate: cat?.emirates.find((e) => e.id === v.emirate_id)?.name ?? "", area: cat?.areas.find((x) => x.id === v.area_id)?.name ?? "" }} /></div>;
}

function Packages({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const key = ["rates", artistId];
  const { data } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("rate_cards").select("*").eq("artist_id", artistId).order("sort")).data ?? [] });
  const [n, setN] = useState({ title: "", price: "", duration: "60", description: "" });
  const add = async () => {
    if (!n.title || !n.price) { toast.error("Title and price required"); return; }
    const { error } = await supabase.from("rate_cards").insert({ artist_id: artistId, title: n.title, price: Number(n.price), duration_minutes: Number(n.duration), description: n.description, sort: (data?.length ?? 0) + 1 });
    if (error) { toast.error(error.message); return; }
    setN({ title: "", price: "", duration: "60", description: "" });
    qc.invalidateQueries({ queryKey: key });
  };
  const del = async (id: string) => { await supabase.from("rate_cards").delete().eq("id", id); qc.invalidateQueries({ queryKey: key }); };
  return (
    <div className="mt-6 space-y-4">
      {data?.map((r) => (
        <div key={r.id} className="rounded-xl bg-card p-4 shadow-card flex justify-between items-center">
          <div><div className="font-semibold">{r.title} · {aed(Number(r.price))}</div><div className="text-sm text-muted-foreground">{r.duration_minutes} min · {r.description}</div></div>
          <Button size="sm" variant="ghost" onClick={() => del(r.id)}>Remove</Button>
        </div>
      ))}
      <div className="rounded-xl border border-dashed p-4 grid gap-2 md:grid-cols-4">
        <Input placeholder="Package name" value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
        <Input placeholder="Price AED" type="number" value={n.price} onChange={(e) => setN({ ...n, price: e.target.value })} />
        <Input placeholder="Minutes" type="number" value={n.duration} onChange={(e) => setN({ ...n, duration: e.target.value })} />
        <Button onClick={add}>Add package</Button>
        <Input className="md:col-span-4" placeholder="What's included" value={n.description} onChange={(e) => setN({ ...n, description: e.target.value })} />
      </div>
    </div>
  );
}

function Availability({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const key = ["avail", artistId];
  const { data } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("availability").select("*").eq("artist_id", artistId).order("date")).data ?? [] });
  const [d, setD] = useState("");
  const add = async () => {
    if (!d) return;
    const { error } = await supabase.from("availability").insert({ artist_id: artistId, date: d, note: "Unavailable" });
    if (error) { toast.error(error.message); return; }
    setD(""); qc.invalidateQueries({ queryKey: key });
  };
  const del = async (id: string) => { await supabase.from("availability").delete().eq("id", id); qc.invalidateQueries({ queryKey: key }); };
  return (
    <div className="mt-6 max-w-lg">
      <p className="text-sm text-muted-foreground">Block dates you're not available. Clients can't request quotes for these dates.</p>
      <div className="mt-4 flex gap-2"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /><Button onClick={add}>Block date</Button></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {data?.map((x) => <button key={x.id} onClick={() => del(x.id)} className="rounded-full border px-3 py-1 text-sm hover:border-destructive">{x.date} ✕</button>)}
      </div>
    </div>
  );
}

function Visibility({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const key = ["vis", artistId];
  const { data } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("stat_visibility").select("*").eq("artist_id", artistId).maybeSingle()).data });
  type Vis = { artist_id: string; show_orders: boolean; revenue_mode: string; show_rating: boolean; show_response: boolean; show_repeat: boolean; show_member_since: boolean };
  type BoolKey = "show_orders" | "show_rating" | "show_response" | "show_repeat" | "show_member_since";
  const v: Vis = data ?? { artist_id: artistId, show_orders: true, revenue_mode: "range", show_rating: true, show_response: true, show_repeat: true, show_member_since: true };
  const save = async (patch: Partial<Vis>) => {
    const { error } = await supabase.from("stat_visibility").upsert({ ...v, ...patch, artist_id: artistId });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: key });
  };
  const rows: [BoolKey, string][] = [["show_orders", "Completed bookings"], ["show_rating", "Average rating"], ["show_response", "Response rate"], ["show_repeat", "Repeat clients"], ["show_member_since", "Member since"]];
  return (
    <div className="mt-6 max-w-lg space-y-4">
      <p className="text-sm text-muted-foreground">Numbers are calculated from your bookings. You choose what clients see.</p>
      {rows.map(([k, l]) => (
        <div key={k} className="flex items-center justify-between rounded-xl bg-card p-4 shadow-card">
          <span>{l}</span><Switch checked={!!v[k]} onCheckedChange={(c) => save({ [k]: c } as Partial<Vis>)} />
        </div>
      ))}
      <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-card">
        <span>Total earned</span>
        <Select value={v.revenue_mode} onValueChange={(m) => save({ revenue_mode: m })}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="hidden">Hidden</SelectItem><SelectItem value="range">Show range</SelectItem><SelectItem value="exact">Show exact</SelectItem></SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">Reviews are always public to keep the marketplace trustworthy.</p>
    </div>
  );
}

function Reviews({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const key = ["my-reviews", artistId];
  const { data } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("reviews").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(50)).data ?? [] });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const act = async (id: string, patch: { reply?: string | undefined; status?: string }) => {
    const { error } = await supabase.from("reviews").update(patch.status ? { status: patch.status } : { reply: patch.reply ?? null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(patch.status ? "Reported to moderation" : "Reply posted");
    qc.invalidateQueries({ queryKey: key });
  };
  return (
    <div className="mt-6 space-y-3">
      {data?.length === 0 && <p className="text-muted-foreground">No reviews yet.</p>}
      {data?.map((r) => (
        <div key={r.id} className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex justify-between"><span className="font-semibold">{r.client_name} · {"★".repeat(r.rating)}</span><Badge variant="secondary">{r.status}</Badge></div>
          <p className="text-sm mt-2" dir="auto">{r.body}</p>
          {r.reply ? <p className="text-sm mt-2 border-l-2 border-gold pl-3 text-muted-foreground">{r.reply}</p> : (
            <div className="mt-3 flex gap-2">
              <Input placeholder="Write a public reply" value={drafts[r.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} maxLength={600} />
              <Button size="sm" onClick={() => act(r.id, { reply: drafts[r.id] })} disabled={!drafts[r.id]}>Reply</Button>
              {r.status === "published" && <Button size="sm" variant="ghost" onClick={() => act(r.id, { status: "reported" })}>Report</Button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
