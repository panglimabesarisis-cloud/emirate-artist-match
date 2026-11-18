import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Inbox, AgentSettings, Credits } from "@/components/dashboard/AgentTabs";
import { BookingsTab } from "@/components/dashboard/BookingsTab";
import { ExportTab } from "@/components/dashboard/ExportTab";
import { MediaTab } from "@/components/dashboard/MediaTab";
import { FlowBuilder } from "@/components/flow/FlowBuilder";
import { CalendarSync, TeamTab } from "@/components/dashboard/TeamTabs";
import { aed, BADGE_LABELS, slugify } from "@/lib/format";
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
  head: () => ({ meta: [{ title: "Dashboard | Dealmaker" }, { name: "robots", content: "noindex" }] }),
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
  if (loading || !user) return <PublicLayout><div className="p-16 text-center text-muted-foreground">Loading…</div></PublicLayout>;
  return <PublicLayout><div className="mx-auto max-w-6xl px-4 py-10">{isArtist ? <ArtistDash userId={user.id} /> : <MemberOrClient userId={user.id} />}</div></PublicLayout>;
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
  const t = teams[Math.min(pick, teams.length - 1)]!;
  const a = t.artists!;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">{a.stage_name}</h1><p className="text-sm text-muted-foreground">You are a {t.role} on this team</p></div>
        {teams.length > 1 && <Select value={String(pick)} onValueChange={(v) => setPick(Number(v))}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent>{teams.map((x, i) => <SelectItem key={x.artists!.id} value={String(i)}>{x.artists!.stage_name}</SelectItem>)}</SelectContent></Select>}
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

function ArtistDash({ userId }: { userId: string }) {
  const { data: artist, refetch, isLoading } = useQuery({
    queryKey: ["my-artist", userId],
    queryFn: async () => (await supabase.from("artists").select("*").eq("user_id", userId).maybeSingle()).data,
  });
  const { t: tr } = useI18n();
  if (isLoading) return null;
  if (!artist) return <Onboarding userId={userId} onDone={refetch} />;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{artist.stage_name}</h1>
          <div className="mt-1 flex gap-2 items-center text-sm">
            <Badge variant={artist.status === "approved" ? "default" : "secondary"}>{artist.status === "pending" ? "Awaiting approval" : artist.status}</Badge>
            <span className="text-muted-foreground">{tr("Plan:")} {artist.plan}</span>
          </div>
        </div>
        {artist.status === "approved" && <Button asChild variant="outline"><Link to="/artist/$slug" params={{ slug: artist.slug }}>{tr("View public profile")}</Link></Button>}
      </div>
      <Tabs defaultValue="inbox" className="mt-8">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="inbox">{tr("Inbox")}</TabsTrigger>
          <TabsTrigger value="bookings">{tr("Bookings")}</TabsTrigger>
          <TabsTrigger value="agent">{tr("AI agent")}</TabsTrigger>
          <TabsTrigger value="flow">{tr("AI flow")}</TabsTrigger>
          <TabsTrigger value="credits">{tr("Credits")}</TabsTrigger>
          <TabsTrigger value="quotes">{tr("Quote requests")}</TabsTrigger>
          <TabsTrigger value="profile">{tr("Profile")}</TabsTrigger>
          <TabsTrigger value="packages">{tr("Packages")}</TabsTrigger>
          <TabsTrigger value="calendar">{tr("Availability")}</TabsTrigger>
          <TabsTrigger value="visibility">{tr("Public stats")}</TabsTrigger>
          <TabsTrigger value="verify">{tr("Verification")}</TabsTrigger>
          <TabsTrigger value="reviews">{tr("Reviews")}</TabsTrigger>
          <TabsTrigger value="team">{tr("Team")}</TabsTrigger>
          <TabsTrigger value="media">{tr("Photos & videos")}</TabsTrigger>
          <TabsTrigger value="export">{tr("Export data")}</TabsTrigger>
        </TabsList>
        <TabsContent value="media"><MediaTab artistId={artist.id} /></TabsContent>
        <TabsContent value="export"><ExportTab artistId={artist.id} slug={artist.slug} /></TabsContent>
        <TabsContent value="inbox"><Inbox artistId={artist.id} /></TabsContent>
        <TabsContent value="bookings"><BookingsTab artistId={artist.id} trn={artist.trn} notifyPhone={artist.notify_phone} /></TabsContent>
        <TabsContent value="agent"><AgentSettings artistId={artist.id} /></TabsContent>
        <TabsContent value="flow"><FlowBuilder artistId={artist.id} /></TabsContent>
        <TabsContent value="credits"><Credits artistId={artist.id} /></TabsContent>
        <TabsContent value="quotes"><Quotes artistId={artist.id} /></TabsContent>
        <TabsContent value="profile"><ProfileEditor artist={artist} onSaved={refetch} /></TabsContent>
        <TabsContent value="packages"><Packages artistId={artist.id} /></TabsContent>
        <TabsContent value="calendar"><Availability artistId={artist.id} /><CalendarSync artistId={artist.id} /></TabsContent>
        <TabsContent value="team"><TeamTab artistId={artist.id} /></TabsContent>
        <TabsContent value="visibility"><Visibility artistId={artist.id} /></TabsContent>
        <TabsContent value="verify"><Verification artistId={artist.id} userId={userId} /></TabsContent>
        <TabsContent value="reviews"><Reviews artistId={artist.id} /></TabsContent>
      </Tabs>
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
  const save = async () => {
    const { id: _id, ...rest } = v as ArtistRow;
    const { error } = await supabase.from("artists").update({
      stage_name: rest.stage_name, tagline: rest.tagline, bio: rest.bio, base_price: rest.base_price, languages: rest.languages,
      travel_radius_km: rest.travel_radius_km, category_id: rest.category_id, subcategory_id: rest.subcategory_id, emirate_id: rest.emirate_id, area_id: rest.area_id,
    }).eq("id", artist.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    onSaved();
  };
  return <div className="mt-6"><ArtistFields v={v} set={(p) => setV({ ...v, ...p })} /><Button onClick={save} className="mt-6">Save changes</Button></div>;
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
