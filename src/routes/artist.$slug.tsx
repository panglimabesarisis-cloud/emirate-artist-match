import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Star, BadgeCheck, Trophy, MapPin, Languages, Clock } from "lucide-react";
import { getArtist, getCatalog } from "@/lib/public.functions";
import { PublicLayout } from "@/components/site/PublicLayout";
import { ArtistAvatar } from "@/components/site/ArtistCard";
import { aed, BADGE_LABELS } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/artist/$slug")({
  loader: async ({ params }) => {
    const [artist, catalog] = await Promise.all([getArtist({ data: { slug: params.slug } }), getCatalog()]);
    if (!artist) throw notFound();
    return { artist, catalog };
  },
  head: ({ loaderData }) => {
    const a = loaderData?.artist;
    if (!a) return { meta: [{ title: "Artist unavailable | Sahra" }, { name: "robots", content: "noindex" }] };
    const t = `${a.stage_name} — ${a.subcategory?.name ?? "Talent"} in ${a.area?.name ?? "Dubai"}`;
    return {
      meta: [
        { title: `${t} | Sahra` },
        { name: "description", content: a.tagline ?? t },
        { property: "og:title", content: t },
        { property: "og:description", content: a.tagline ?? t },
      ],
    };
  },
  component: ArtistPage,
});

function ArtistPage() {
  const { artist: a, catalog } = Route.useLoaderData();
  const s = a.stats;
  const stats = [
    s.completed_orders != null && { k: "Completed bookings", v: String(s.completed_orders) },
    s.rating != null && { k: "Rating", v: `${s.rating.toFixed(1)} / 5` },
    s.revenue_label && { k: "Total earned", v: s.revenue_label },
    s.response_rate != null && { k: "Response rate", v: `${s.response_rate}%` },
    s.repeat_clients != null && { k: "Repeat clients", v: String(s.repeat_clients) },
    s.member_since && { k: "Member since", v: new Date(s.member_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <PublicLayout>
      <section className="bg-night text-night-foreground">
        <div className="mx-auto max-w-7xl px-4 py-12 grid gap-8 md:grid-cols-[220px_1fr] items-center">
          <ArtistAvatar name={a.stage_name} hue={a.hue} className="h-52 w-52 rounded-3xl text-6xl" />
          <div>
            <div className="text-gold text-xs uppercase tracking-[0.25em]">{a.category?.name} · {a.subcategory?.name}</div>
            <h1 className="mt-2 text-4xl md:text-5xl font-semibold">{a.stage_name}</h1>
            <p className="mt-2 opacity-80 text-lg">{a.tagline}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {a.badges.map((b) => (
                <span key={b} className={`inline-flex items-center gap-1 rounded-full text-xs font-bold px-2.5 py-1 ${b === "top_performer" ? "bg-gradient-gold text-gold-foreground" : "bg-sidebar-accent"}`}>
                  {b === "top_performer" ? <Trophy className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3 text-gold" />} {BADGE_LABELS[b]}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-5 text-sm opacity-85">
              {s.rating != null && <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-gold text-gold" /> {s.rating.toFixed(1)} ({s.review_count} reviews)</span>}
              <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {a.area?.name}, {a.emirate?.name} · travels {a.travel_radius_km} km</span>
              <span className="inline-flex items-center gap-1"><Languages className="h-4 w-4" /> {a.languages.join(", ")}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="space-y-12">
          {stats.length > 0 && (
            <section>
              <h2 className="text-2xl font-semibold">Track record</h2>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                {stats.map((x) => (
                  <div key={x.k} className="rounded-xl bg-card p-4 shadow-card">
                    <div className="text-xs text-muted-foreground">{x.k}</div>
                    <div className="font-display text-2xl font-semibold mt-1">{x.v}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Calculated from bookings on the platform. The artist chooses which figures to show.</p>
            </section>
          )}
          <section>
            <h2 className="text-2xl font-semibold">About</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">{a.bio}</p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold">Packages</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {a.rateCards.map((r) => (
                <div key={r.id} className="rounded-2xl border bg-card p-5">
                  <div className="font-semibold">{r.title}</div>
                  <div className="font-display text-2xl mt-2">{aed(Number(r.price))}</div>
                  <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {r.duration_minutes} min</div>
                  <p className="text-sm text-muted-foreground mt-3">{r.description}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-2xl font-semibold">Reviews <span className="text-muted-foreground text-lg">({s.review_count})</span></h2>
            <div className="mt-4 space-y-4">
              {a.reviews.length === 0 && <p className="text-muted-foreground">No reviews yet.</p>}
              {a.reviews.map((r) => (
                <div key={r.id} className="rounded-2xl bg-card p-5 shadow-card">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.client_name}</div>
                    <div className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-gold text-gold" : "text-border"}`} />)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">Verified booking · {r.event_label} · {new Date(r.created_at).toLocaleDateString("en-GB")}</div>
                  <p className="mt-3 text-sm" dir="auto">{r.body}</p>
                  {r.reply && <div className="mt-3 border-l-2 border-gold pl-3 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Reply from artist:</span> {r.reply}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>
        <QuoteForm artistId={a.id} artistName={a.stage_name} basePrice={a.base_price} catalog={catalog} blocked={a.blockedDates} />
      </div>
    </PublicLayout>
  );
}

function QuoteForm({ artistId, artistName, basePrice, catalog, blocked }: {
  artistId: string; artistName: string; basePrice: number; blocked: string[];
  catalog: { eventTypes: { id: string; slug: string; name: string }[]; areas: { id: string; name: string }[] };
}) {
  const [f, setF] = useState({ name: "", email: "", phone: "", event: "", date: "", area: "", guests: "", budget: "", message: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) { toast.error("Please enter your name and a valid email."); return; }
    if (f.date && blocked.includes(f.date)) { toast.error("The artist is unavailable on that date."); return; }
    setSending(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("quote_requests").insert({
      artist_id: artistId,
      client_user_id: u.user?.id ?? null,
      name: f.name.trim().slice(0, 120),
      email: f.email.trim().slice(0, 255),
      phone: f.phone.trim().slice(0, 30) || null,
      event_type_id: f.event || null,
      event_date: f.date || null,
      area_id: f.area || null,
      guests: f.guests ? Number(f.guests) : null,
      budget: f.budget ? Number(f.budget) : null,
      message: f.message.slice(0, 2000) || null,
    });
    setSending(false);
    if (error) { toast.error("Could not send your request. Please try again."); return; }
    setDone(true);
  };

  return (
    <aside className="lg:sticky lg:top-32 self-start rounded-2xl bg-card shadow-card p-6">
      <div className="text-sm text-muted-foreground">Starting from</div>
      <div className="font-display text-3xl font-semibold">{aed(basePrice)}</div>
      {done ? (
        <div className="mt-6 rounded-xl bg-accent p-4 text-sm text-accent-foreground">
          <div className="font-semibold">Request sent to {artistName}!</div>
          <p className="mt-1">The artist has your event details. AI instant replies are coming in the next release.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="font-semibold">Free Quick Quote</div>
          <Select value={f.event} onValueChange={(v) => setF({ ...f, event: v })}>
            <SelectTrigger><SelectValue placeholder="Event type" /></SelectTrigger>
            <SelectContent>{catalog.eventTypes.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Date</Label><Input type="date" value={f.date} onChange={up("date")} /></div>
            <div><Label className="text-xs">Guests</Label><Input type="number" min={1} value={f.guests} onChange={up("guests")} /></div>
          </div>
          <Select value={f.area} onValueChange={(v) => setF({ ...f, area: v })}>
            <SelectTrigger><SelectValue placeholder="Venue area" /></SelectTrigger>
            <SelectContent>{catalog.areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Budget (AED, optional)" type="number" value={f.budget} onChange={up("budget")} />
          <Input placeholder="Your name" value={f.name} onChange={up("name")} maxLength={120} />
          <Input placeholder="Email" type="email" value={f.email} onChange={up("email")} maxLength={255} />
          <Input placeholder="Phone (+971…)" value={f.phone} onChange={up("phone")} maxLength={30} />
          <Textarea placeholder="Tell the artist about your event" value={f.message} onChange={up("message")} maxLength={2000} />
          <Button type="submit" disabled={sending} className="w-full bg-gradient-gold text-gold-foreground hover:opacity-90">
            {sending ? "Sending…" : "Get my free quote"}
          </Button>
          <p className="text-[11px] text-muted-foreground">Contact details are shared only with this artist.</p>
        </form>
      )}
    </aside>
  );
}
