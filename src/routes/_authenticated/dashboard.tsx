import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { FlowBuilder } from "@/components/flow/FlowBuilder";
import { CalendarSync,TeamTab } from "@/components/dashboard/TeamTabs";
import { ArtistOverview, CalendarTab, TeamPhones, WalletTab } from "@/components/dashboard/ArtistCRM";
import { aed, BADGE_LABELS, initials, slugify } from "@/lib/format";
import { BadgeCheck, Bot, Calendar, CalendarCheck, ClipboardList, Download, Eye, FileSignature, FileText, Home, Image as ImageIcon, Inbox as InboxIcon, Menu as MenuIcon, Receipt, Sparkles, Tag, User, Users, Wallet, Workflow, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  if (loading || !user) return <PublicLayout><div className="p-16 text-center text-muted-foreground">Loading…</div></PublicLayout>;
  return <><div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">{isArtist&&<><Button size="sm" variant={workspace==='own'?'default':'outline'} onClick={()=>setWorkspace('own')}>My talent workspace</Button><Button size="sm" variant={workspace==='teams'?'default':'outline'} onClick={()=>setWorkspace('teams')}>Invited teams & my requests</Button></>}<Button asChild size="sm" variant="ghost"><Link to="/account">Account settings</Link></Button></div>{isArtist&&workspace==='own'?<ArtistDash userId={user.id} email={user.email??''}/>:<PublicLayout><div className="mx-auto max-w-6xl px-4 py-10"><MemberOrClient userId={user.id}/></div></PublicLayout>}</>;
}

/** Managers/assistants invited by an artist get a reduced artist workspace. */
function MemberOrClient({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["my-teams", userId],
    queryFn: async () => {
      await supabase.rpc("accept_artist_invites");
      return (await supabase.from("artist_members").select("role, artists(id, slug, stage_name)").eq("user_id", userId).eq("status", "active")).data ?? [];
    },
  });
  const teams = (data ?? []).filter((t) => t.artists);
  const [pick, setPick] = useState(0);
  const { t: tr } = useI18n();
  if (isLoading) return null;
  if (teams.length === 0) return <ClientDash userId={userId} />;
  const t = teams[Math.min(pick, teams.length - 1)];
  const a = t?.artists;if(!t||!a)return <ClientDash userId={userId}/>;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">{a.stage_name}</h1><p className="text-sm text-muted-foreground">You are a {t.role} on this team</p></div>
        {teams.length > 1 && <Select value={String(pick)} onValueChange={(v) => setPick(Number(v))}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent>{teams.map((x, i) => <SelectItem key={x.artists?.id??i} value={String(i)}>{x.artists?.stage_name}</SelectItem>)}</SelectContent></Select>}
      </div>
      <Tabs key={a.id} defaultValue="inbox" className="mt-8">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="inbox">{tr("Inbox")}</TabsTrigger>
          <TabsTrigger value="bookings">{tr("Bookings")}</TabsTrigger>
          <TabsTrigger value="quotes">{tr("Quote requests")}</TabsTrigger>
          <TabsTrigger value="calendar">{tr("Availability")}</TabsTrigger>
          <TabsTrigger value="media">{tr("Photos & videos")}</TabsTrigger>
          <TabsTrigger value="mine">{tr("My requests")}</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox"><Inbox artistId={a.id} /></TabsContent>
        <TabsContent value="bookings"><BookingsTab artistId={a.id} trn={null} notifyPhone={null} teamMode /></TabsContent>
        <TabsContent value="quotes"><Quotes artistId={a.id} /></TabsContent>
        <TabsContent value="calendar"><Availability artistId={a.id} /></TabsContent>
        <TabsContent value="media"><MediaTab artistId={a.id} /></TabsContent>
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
  overview: Home, inbox: InboxIcon, quotes: FileText, bookings: CalendarCheck, calendar: Calendar, invoices: Receipt, contracts: FileSignature,
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
  if (isLoading) return null;
  if (!artist) return <PublicLayout><div className="py-16 text-center"><h1 className="text-3xl font-semibold">Finish your talent register</h1><Button asChild className="mt-6 bg-gradient-gold text-gold-foreground"><Link to="/join">Continue registration</Link></Button></div></PublicLayout>;
  const current = ARTIST_NAV.find((n) => n.id === section)!;
  let lastGroup: string | undefined;
  return (
    <div className="min-h-screen bg-background md:flex">
      {menu && <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setMenu(false)} />}
      <aside aria-label="Studio navigation" className={`${menu ? "fixed inset-y-0 start-0 z-40 flex w-[min(300px,86vw)]" : "hidden"} md:sticky md:top-0 md:flex md:h-screen md:w-64 shrink-0 flex-col gap-4 overflow-y-auto border-e border-border bg-sidebar px-4 py-5 text-sidebar-foreground`}>
        <Link to="/" className="flex items-center gap-2.5 px-2" aria-label="Dealmaker Studio">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-gold font-display text-lg text-gold-foreground">D</span>
          <span className="font-display text-2xl tracking-wide">Dealmaker <span className="text-gold">Studio</span></span>
        </Link>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-foreground/[.04] p-3">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-gold font-display text-lg text-gold-foreground">
            {initials(artist.stage_name)}
            <span className="absolute -bottom-px -end-px h-3 w-3 rounded-full border-2 border-sidebar bg-emerald-400" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{artist.stage_name}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold tracking-wide ${artist.status === "approved" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-border text-muted-foreground"}`}>{artist.status === "pending" ? "Awaiting approval" : artist.status === "approved" ? "Approved" : artist.status}</span>
              <button type="button" onClick={() => { setSection("overview"); setMenu(false); }} className="rounded-full border border-gold/40 px-2 py-0.5 text-[10.5px] font-bold capitalize tracking-wide text-gold transition-colors hover:bg-gradient-gold hover:text-gold-foreground">{tr("Plan:")} {artist.plan} · {tr("Upgrade")}</button>
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Sections">
          {ARTIST_NAV.map((n) => {
            const g = "group" in n ? n.group : undefined;
            const header = g && g !== lastGroup ? <div className="px-3 pb-1.5 pt-4 text-[10.5px] font-bold uppercase tracking-[.14em] text-muted-foreground/70">{tr(g)}</div> : null;
            lastGroup = g;
            const Icon = NAV_ICONS[n.id];
            const on = section === n.id;
            return (
              <div key={n.id}>
                {header}
                <button type="button" aria-current={on ? "page" : undefined} onClick={() => { setSection(n.id); setMenu(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm transition-all ${on ? "bg-gradient-gold font-bold text-gold-foreground shadow-[0_10px_30px_rgba(232,164,63,.25)]" : "font-medium text-muted-foreground hover:translate-x-0.5 hover:bg-foreground/[.04] hover:text-foreground rtl:hover:-translate-x-0.5"}`}>
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${on ? "" : "opacity-75"}`} aria-hidden />{tr(n.label)}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-gold/25 bg-[radial-gradient(ellipse_at_80%_0%,rgba(232,176,74,.16),transparent_60%)] p-4">
          <div className="font-display text-2xl leading-tight">{tr("More credits,")} <span className="it">{tr("more replies.")}</span></div>
          <p className="mb-3 mt-1.5 text-[12.5px] text-muted-foreground">{tr("Medium gives 200 AI credits and calendar sync. Pro gives 500 credits and featured eligibility.")}</p>
          <Button size="sm" className="rounded-full bg-gradient-gold text-gold-foreground" onClick={() => { setSection("overview"); setMenu(false); }}>{tr("See plans")} →</Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-3.5 backdrop-blur-md md:px-8">
          <Button variant="outline" size="icon" className="rounded-xl md:hidden" onClick={() => setMenu(!menu)} aria-label="Open navigation" aria-expanded={menu}><MenuIcon className="h-[18px] w-[18px]" /></Button>
          <nav className="hidden gap-1 rounded-full border border-border bg-foreground/[.03] p-1 lg:flex" aria-label="Workspaces">
            <button type="button" aria-current={section !== "team" ? "page" : undefined} onClick={() => setSection("overview")} className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${section !== "team" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{tr("My talent workspace")}</button>
            <button type="button" aria-current={section === "team" ? "page" : undefined} onClick={() => setSection("team")} className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${section === "team" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{tr("Invite team")}</button>
            <Link to="/account" className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground">{tr("Account settings")}</Link>
          </nav>
          <h1 className="whitespace-nowrap font-display text-xl tracking-wide lg:hidden">{tr(current.label)}</h1>
          <div className="ms-auto flex items-center gap-3">
            {artist.status === "approved" && <Button asChild variant="outline" size="sm" className="rounded-full"><Link to="/artist/$slug" params={{ slug: artist.slug }}><Eye className="me-1.5 h-4 w-4" />{tr("View public profile")}</Link></Button>}
            <span className="hidden max-w-56 truncate text-sm text-muted-foreground xl:block">{email}</span>
          </div>
        </header>
        <main className="p-4 md:p-8">
          {section === "overview" && <ArtistOverview artistId={artist.id} stageName={artist.stage_name} plan={artist.plan} onOpen={(id) => setSection(id as ArtistSection)} />}
          {section === "inbox" && <Inbox artistId={artist.id} />}
          {section === "quotes" && <Quotes artistId={artist.id} />}
          {section === "bookings" && <BookingsTab artistId={artist.id} trn={artist.trn} notifyPhone={artist.notify_phone} />}
          {section === "calendar" && <><CalendarTab artistId={artist.id} /><CalendarSync artistId={artist.id} /></>}
          {section === "contracts" && <ContractsTable artistId={artist.id} />}
          {section === "invoices" && <InvoicesTab artistId={artist.id} />}
          {section === "wallet" && <WalletTab artistId={artist.id} />}
          {section === "credits" && <Credits artistId={artist.id} />}
          {section === "export" && <ExportTab artistId={artist.id} slug={artist.slug} />}
          {section === "profile" && <ProfileEditor artist={artist} onSaved={refetch} />}
          {section === "packages" && <RateCardTable artistId={artist.id} />}
          {section === "orderform" && <OrderFormBuilder artistId={artist.id} />}
          {section === "media" && <MediaTab artistId={artist.id} />}
          {section === "verify" && <Verification artistId={artist.id} userId={userId} />}
          {section === "agent" && <AgentSettings artistId={artist.id} />}
          {section === "flow" && <FlowBuilder artistId={artist.id} />}
          {section === "team" && <><TeamTab artistId={artist.id}/><TeamPhones artistId={artist.id}/></>}
        </main>
      </div>
    </div>
  );
}

type ArtistRow = { id: string; stage_name: string; tagline: string | null; bio: string | null; base_price: number | null; languages: string[] | null; travel_radius_km: number | null; category_id: string | null; subcategory_id: string | null; emirate_id: string | null; area_id: string | null };

function ArtistFields({ v, set }: { v: Partial<ArtistRow>; set: (p: Partial<ArtistRow>) => void }) {
  const { data: cat } = useCatalog();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div><Label>Stage name</Label><Input value={v.stage_name ?? ""} onChange={(e) => set({ stage_name: e.target.value })} maxLength={80} /></div>
      <div><Label>Tagline</Label><Input value={v.tagline ?? ""} onChange={(e) => set({ tagline: e.target.value })} maxLength={120} /></div>
      <div><Label>Category</Label>
        <Select value={v.category_id ?? ""} onValueChange={(x) => set({ category_id: x, subcategory_id: null })}>
          <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>{cat?.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select></div>
      <div><Label>Speciality</Label>
        <Select value={v.subcategory_id ?? ""} onValueChange={(x) => set({ subcategory_id: x })}>
          <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>{cat?.subcategories.filter((s) => s.category_id === v.category_id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select></div>
      <div><Label>Emirate</Label>
        <Select value={v.emirate_id ?? ""} onValueChange={(x) => set({ emirate_id: x, area_id: null })}>
          <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>{cat?.emirates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select></div>
      <div><Label>Base area</Label>
        <Select value={v.area_id ?? ""} onValueChange={(x) => set({ area_id: x })}>
          <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
          <SelectContent>{cat?.areas.filter((a) => a.emirate_id === v.emirate_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select></div>
      <div><Label>Starting price (AED)</Label><Input type="number" min={0} value={v.base_price ?? ""} onChange={(e) => set({ base_price: Number(e.target.value) })} /></div>
      <div><Label>Travel radius (km)</Label><Input type="number" min={0} value={v.travel_radius_km ?? ""} onChange={(e) => set({ travel_radius_km: Number(e.target.value) })} /></div>
      <div className="md:col-span-2"><Label>Languages (comma separated)</Label><Input value={(v.languages ?? []).join(", ")} onChange={(e) => set({ languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
      <div className="md:col-span-2"><Label>Bio</Label><Textarea rows={5} value={v.bio ?? ""} onChange={(e) => set({ bio: e.target.value })} maxLength={2000} /></div>
    </div>
  );
}

function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [v, setV] = useState<Partial<ArtistRow>>({ languages: ["English"], travel_radius_km: 30 });
  const save = async () => {
    if (!v.stage_name || !v.category_id || !v.emirate_id) { toast.error("Stage name, category and emirate are required."); return; }
    const { error } = await supabase.from("artists").insert({
      ...v, stage_name: v.stage_name, user_id: userId,
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

function ProfileEditor({ artist, onSaved }: { artist: ArtistRow; onSaved: () => void }) {
  const [v, setV] = useState<Partial<ArtistRow>>(artist);
  const bioLen = (v.bio ?? "").trim().length;
  const save = async () => {
    if (bioLen < 150) { toast.error("Your bio needs at least 150 characters"); return; }
    const { id: _id, ...rest } = v as ArtistRow;
    const { error } = await supabase.from("artists").update({
      stage_name: rest.stage_name, tagline: rest.tagline, bio: rest.bio, base_price: rest.base_price, languages: rest.languages,
      travel_radius_km: rest.travel_radius_km, category_id: rest.category_id, subcategory_id: rest.subcategory_id, emirate_id: rest.emirate_id, area_id: rest.area_id,
    }).eq("id", artist.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    onSaved();
  };
  return <div className="mt-6"><ArtistFields v={v} set={(p) => setV({ ...v, ...p })} /><p className={`mt-3 text-xs ${bioLen < 150 ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">Bio: {bioLen} / 150 minimum characters</p><Button onClick={save} className="mt-4 bg-gradient-gold text-gold-foreground">Save changes</Button></div>;
}

function Quotes({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["artist-quotes", artistId],
    queryFn: async () => (await supabase.from("quote_requests").select("*, event_types(name), areas(name)").eq("artist_id", artistId).order("created_at", { ascending: false })).data ?? [],
  });
  const mark = async (id: string, status: string) => {
    await supabase.from("quote_requests").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["artist-quotes", artistId] });
  };
  return (
    <div className="mt-6 space-y-3">
      {data?.length === 0 && <p className="text-muted-foreground">No quote requests yet.</p>}
      {data?.map((q) => (
        <div key={q.id} className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex justify-between gap-4">
            <div>
              <div className="font-semibold">{q.name} <span className="text-muted-foreground font-normal text-sm">· {q.email} {q.phone}</span></div>
              <div className="text-sm text-muted-foreground">{q.event_types?.name ?? "Event"} · {q.event_date ?? "date TBC"} · {q.areas?.name ?? "area TBC"} · {q.guests ?? "?"} guests {q.budget ? `· budget ${aed(Number(q.budget))}` : ""}</div>
            </div>
            <Badge variant={q.status === "new" ? "default" : "secondary"}>{q.status}</Badge>
          </div>
          {q.message && <p className="mt-2 text-sm">{q.message}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => mark(q.id, "replied")}>Mark replied</Button>
            <Button size="sm" variant="ghost" onClick={() => mark(q.id, "closed")}>Close</Button>
          </div>
        </div>
      ))}
    </div>
  );
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

function Verification({ artistId, userId }: { artistId: string; userId: string }) {
  const qc = useQueryClient();
  const key = ["verif", artistId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [apps, badges] = await Promise.all([
        supabase.from("verification_applications").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }),
        supabase.from("artist_badges").select("badge").eq("artist_id", artistId),
      ]);
      return { apps: apps.data ?? [], badges: (badges.data ?? []).map((b) => b.badge) };
    },
  });
  const [type, setType] = useState("verified_identity");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const submit = async () => {
    if (!file) { toast.error("Attach a document (PDF or image)."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10 MB."); return; }
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const up = await supabase.storage.from("verification-docs").upload(path, file);
    if (up.error) { toast.error(up.error.message); return; }
    const { error } = await supabase.from("verification_applications").insert({ artist_id: artistId, badge_type: type, doc_path: path, note: note.slice(0, 500) });
    if (error) { toast.error(error.message); return; }
    toast.success("Application submitted. Review takes up to 3 business days.");
    setFile(null); setNote("");
    qc.invalidateQueries({ queryKey: key });
  };
  return (
    <div className="mt-6 grid gap-8 md:grid-cols-2">
      <div className="space-y-3">
        <h3 className="text-xl font-semibold">Apply for a badge</h3>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="verified_identity">ID Verified (Emirates ID / passport)</SelectItem>
            <SelectItem value="verified_business">Business Verified (trade licence)</SelectItem>
            <SelectItem value="verified_performer">Verified Performer (portfolio / references)</SelectItem>
          </SelectContent>
        </Select>
        <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Textarea placeholder="Notes for the reviewer (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={submit}>Submit application</Button>
        <p className="text-xs text-muted-foreground">Documents are stored privately and only visible to our verification team.</p>
      </div>
      <div>
        <h3 className="text-xl font-semibold">Your badges</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {data?.badges.length ? data.badges.map((b) => <Badge key={b}>{BADGE_LABELS[b]}</Badge>) : <span className="text-sm text-muted-foreground">None yet</span>}
        </div>
        <h3 className="text-xl font-semibold mt-6">Applications</h3>
        <div className="mt-2 space-y-2">
          {data?.apps.map((a) => (
            <div key={a.id} className="rounded-lg border p-3 text-sm">
              <div className="flex justify-between"><span>{BADGE_LABELS[a.badge_type]}</span><Badge variant="secondary">{a.status.replace(/_/g, " ")}</Badge></div>
              {a.admin_note && <p className="text-muted-foreground mt-1">Reviewer: {a.admin_note}</p>}
            </div>
          ))}
        </div>
      </div>
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
