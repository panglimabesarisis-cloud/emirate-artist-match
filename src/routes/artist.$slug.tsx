import { ScheduleDialog, type BusySlot } from "@/components/site/ScheduleDialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { startChat, submitQuote } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { OrderFormFields, type OrderField } from "@/components/dashboard/OrderFormBuilder";
import { useState } from "react";
import { toast } from "sonner";
import { Star, BadgeCheck, Trophy, MapPin, Languages, Clock, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { youtubeId } from "@/lib/media";
import { getArtist, getCatalog } from "@/lib/public.functions";
import { PublicLayout } from "@/components/site/PublicLayout";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { SceneBackground } from "@/components/shared/SceneBackground";
import "@/components/site/artist-profile.css";
import { ArtistAvatar } from "@/components/site/ArtistCard";
import { aed, BADGE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recoverPublicRead } from "@/lib/public-read-recovery";
import { ErrorComponent } from "./__root";
import { type StoredRate } from "@/lib/ratecard";
import { ArtistProfileDetails } from "@/components/site/ArtistProfileDetails";

export const Route = createFileRoute("/artist/$slug")({
  loader: async ({ params }) => {
    const [artist, catalog] = await Promise.all([
      recoverPublicRead(() => getArtist({ data: { slug: params.slug } })),
      recoverPublicRead(() => getCatalog()),
    ]);
    if (!artist) throw notFound();
    return { artist, catalog };
  },
  head: ({ loaderData }) => {
    const a = loaderData?.artist;
    if (!a) return { meta: [{ title: "Artist unavailable | Dealmaker" }, { name: "robots", content: "noindex" }, { name: "description", content: "This Dealmaker artist profile is unavailable." }, { property: "og:title", content: "Artist unavailable | Dealmaker" }, { property: "og:description", content: "This Dealmaker artist profile is unavailable." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] };
    const t = `${a.stage_name} — ${a.subcategory?.name ?? "Talent"} in ${a.area?.name ?? "Dubai"}`;
    return {
      meta: [
        { title: `${t} | Dealmaker` },
        { name: "description", content: a.tagline ?? t },
        { property: "og:title", content: t },
        { property: "og:description", content: a.tagline ?? t },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(a.profilePhotoUrl?.startsWith("https://") ? [{ property: "og:image", content: a.profilePhotoUrl }, { name: "twitter:image", content: a.profilePhotoUrl }] : []),
      ],
    };
  },
  component: ArtistPage,
  errorComponent: ErrorComponent,
  notFoundComponent: () => <PublicLayout><div className="mx-auto max-w-7xl px-4 py-16"><h1 className="text-2xl font-semibold">Artist unavailable</h1></div></PublicLayout>,
});

function ArtistPage() {
  const { artist: a, catalog } = Route.useLoaderData();
  const s = a.stats;
  const { t } = useI18n();
  const bars = [
    s.completed_orders != null && { k: "Completed bookings", v: String(s.completed_orders), pct: (s.completed_orders / Math.max(s.completed_orders, 100)) * 100 },
    s.rating != null && { k: "Rating", v: `${s.rating.toFixed(1)} / 5`, pct: (s.rating / 5) * 100 },
    s.response_rate != null && { k: "Response rate", v: `${s.response_rate}%`, pct: s.response_rate },
    s.repeat_clients != null && { k: "Repeat clients", v: String(s.repeat_clients), pct: s.completed_orders ? Math.min(100, (s.repeat_clients / s.completed_orders) * 100) : Math.min(100, s.repeat_clients) },
  ].filter(Boolean) as { k: string; v: string; pct: number }[];
  const facts = [
    s.revenue_label && { k: "Total earned", v: s.revenue_label },
    s.member_since && { k: "Member since", v: new Date(s.member_since).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <ReferenceTheme className="artist-profile"><PublicLayout>
      <section className="reference-scene-header artist-profile-hero">
        <SceneBackground arch={false} />
        <div className="reference-wrap reference-scene-content artist-profile-intro">
          {a.profilePhotoUrl ? <img src={a.profilePhotoUrl} alt={a.stage_name} className="artist-profile-avatar h-52 w-52 object-cover" width={208} height={208} fetchPriority="high" /> : <ArtistAvatar name={a.stage_name} hue={a.hue} className="artist-profile-avatar h-52 w-52 text-6xl" />}
          <div>
            <div className="text-gold text-xs uppercase tracking-[0.25em]">{a.category?.name} · {a.subcategory?.name}</div>
            <h1 className="mt-2 text-4xl md:text-5xl font-semibold">{a.stage_name}</h1>
            <p className="mt-2 opacity-80 text-lg">{a.tagline}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {a.badges.map((b) => (
                <span key={b} className={`inline-flex items-center gap-1 rounded-full text-xs font-bold px-2.5 py-1 ${b === "top_performer" ? "bg-gradient-gold text-gold-foreground" : "bg-sidebar-accent"}`}>
                  {b === "top_performer" ? <Trophy className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3 text-gold" />} {t(BADGE_LABELS[b] ?? b)}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-5 text-sm opacity-85">
              {s.rating != null && <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-gold text-gold" /> {s.rating.toFixed(1)} ({s.review_count} {t("reviews")})</span>}
              <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {a.area?.name}, {a.emirate?.name} · {t("travels")} {a.travel_radius_km} {t("km")}</span>
              <span className="inline-flex items-center gap-1"><Languages className="h-4 w-4" /> {a.languages.join(", ")}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="reference-wrap artist-profile-content">
        <div className="space-y-12">
          <section className="artist-profile-about">
            <h2 className="text-2xl font-semibold">{t("About")}</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed whitespace-pre-line" dir="auto">{a.bio}</p>
          </section>
          <ArtistProfileDetails artist={a} />
          <MediaShowcase media={a.media} name={a.stage_name} />
          <section>
            <h2 className="text-2xl font-semibold">{t("Reviews")} <span className="text-muted-foreground text-lg">({s.review_count})</span></h2>
            <div className="mt-4 space-y-4">
              {a.reviews.length === 0 && <p className="text-muted-foreground">{t("No reviews yet.")}</p>}
              {a.reviews.map((r) => (
                <div key={r.id} className="artist-profile-review p-5">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.client_name}</div>
                    <div className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-gold text-gold" : "text-border"}`} />)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{t("Verified booking")} · {r.event_label} · {new Date(r.created_at).toLocaleDateString("en-GB")}</div>
                  {r.rating_performance != null && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{t("Performance")} <b className="text-foreground" dir="ltr">{r.rating_performance}/5</b></span>
                      {r.rating_punctuality != null && <span>{t("Punctuality")} <b className="text-foreground" dir="ltr">{r.rating_punctuality}/5</b></span>}
                      {r.rating_communication != null && <span>{t("Communication")} <b className="text-foreground" dir="ltr">{r.rating_communication}/5</b></span>}
                    </div>
                  )}
                  <p className="mt-3 text-sm" dir="auto">{r.body}</p>
                  {r.reply && <div className="mt-3 border-s-2 border-gold ps-3 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{t("Reply from artist:")}</span> {r.reply}</div>}
                </div>
              ))}
            </div>
          </section>
          {(bars.length > 0 || facts.length > 0) && (
            <section className="artist-profile-section">
              <h2 className="font-semibold">{t("Track record")}</h2>
              <div className="mt-4 space-y-3">
                {bars.map((x) => (
                  <div key={x.k}>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t(x.k)}</span><b dir="ltr">{x.v}</b></div>
                    <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-gradient-gold" style={{ width: `${Math.max(2, Math.min(100, x.pct))}%` }} /></div>
                  </div>
                ))}
                {facts.map((x) => (
                  <div key={x.k} className="flex justify-between text-xs"><span className="text-muted-foreground">{t(x.k)}</span><b dir="ltr">{x.v}</b></div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">{t("Calculated from bookings on the platform. The artist chooses which figures to show.")}</p>
            </section>
          )}
        </div>
        <div className="space-y-6">
          <QuoteForm artistId={a.id} artistName={a.stage_name} basePrice={a.base_price} catalog={catalog} blocked={a.blockedDates} busy={a.busy} similar={a.similar} packages={a.rateCards} categories={a.categories} specialties={a.specialties} />
        </div>
      </div>
    </PublicLayout></ReferenceTheme>
  );
}

type Similar = { id: string; slug: string; stage_name: string; base_price: number; rating: number | null };
type Sent = { name: string; conversationId: string; key: string };

function QuoteForm({ artistId, artistName, basePrice, catalog, blocked, busy, similar, packages, categories, specialties }: {
  artistId: string; artistName: string; basePrice: number; blocked: string[]; busy: BusySlot[]; similar: Similar[];
  packages: (StoredRate & { id: string })[];
  categories: { id?: string; slug: string; name: string }[];
  specialties: { id?: string; slug: string; name: string }[];
  catalog: { eventTypes: { id: string; slug: string; name: string }[]; areas: { id: string; name: string }[] };
}) {
  const [f, setF] = useState({ name: "", email: "", phone: "", event: "", date: "", area: "", guests: "", budget: "", message: "", start: "", end: "", duration: "" });
  const [sending, setSending] = useState(false);
  const [extra, setExtra] = useState<string[]>([]);
  // Start is the lowest the artist agreed to take; base is their standard price.
  const priceRange = (() => {
    const bases = packages.map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0);
    const base = bases.length ? Math.min(...bases) : basePrice;
    const lows = packages.map((p) => (p.price_low == null ? Number(p.price) : Number(p.price_low))).filter((n) => Number.isFinite(n) && n > 0);
    return { start: lows.length ? Math.min(...lows) : base, base };
  })();
  const [sent, setSent] = useState<Sent[] | null>(null);
  const submit$ = useServerFn(submitQuote);
  const [showForm, setShowForm] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const startChat$ = useServerFn(startChat);
  const openChat = async () => {
    if (!chatText.trim() || chatBusy) return;
    setChatBusy(true);
    try { const result = await startChat$({ data: { artistId, text: chatText } }); await navigate({ to: "/chat/$id", params: { id: result.conversationId }, search: { k: result.key } }); }
    catch { toast.error(t("Could not open chat. Please try again.")); } finally { setChatBusy(false); }
  };
  const [jobCategory, setJobCategory] = useState("");
  const [speciality, setSpeciality] = useState("");
  const { data: orderForms } = useQuery({ queryKey: ["order-form", artistId], queryFn: async () => {
    const { data } = await (supabase as any).from("artist_order_forms").select("title, description, fields, enabled, subcategory_id").eq("artist_id", artistId).eq("enabled", true);
    return (data ?? []) as { title: string; description: string | null; fields: OrderField[]; enabled: boolean; subcategory_id: string | null }[];
  } });
  // The speciality's own questions when the artist wrote them, otherwise their fallback form.
  const orderForm = (orderForms ?? []).find(form => form.subcategory_id === speciality && speciality)
    ?? (orderForms ?? []).find(form => form.subcategory_id === null)
    ?? null;
  const customFields = orderForm?.fields ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { t } = useI18n();
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email)) { toast.error(t("Please enter your name and a valid email.")); return; }
    if (!(Number(f.budget) > 0)) { toast.error(t("Please enter your budget.")); return; }
    const missing = customFields.find((c) => c.required && !(answers[c.id] ?? "").trim());
    if (missing) { toast.error(`${t("Please fill in")}: ${missing.label}`); return; }
    const extraLines = customFields.filter((c) => (answers[c.id] ?? "").trim()).map((c) => `${c.label}: ${(answers[c.id] ?? "").trim()}`);
    const fullMessage = [f.message.trim(), ...extraLines].filter(Boolean).join("\n").slice(0, 2000);
    setSending(true);
    try {
      const payload = {
        clientUserId: null, name: f.name, email: f.email, phone: f.phone || null,
        eventTypeId: f.event || null, eventDate: f.date || null, areaId: f.area || null,
        guests: f.guests ? Number(f.guests) : null, budget: Number(f.budget), message: fullMessage || null, packageIds: [],
        startTime: f.start || null, endTime: f.end || null, performMinutes: f.duration ? Number(f.duration) : null,
      };
      const r = await submit$({ data: { ...payload, artistId } });
      if (extra.length === 0) { navigate({ to: "/chat/$id", params: { id: r.conversationId }, search: { k: r.key } }); return; }
      const list: Sent[] = [{ name: artistName, ...r }];
      const others = await Promise.allSettled(extra.map((xid) => submit$({ data: { ...payload, artistId: xid } })));
      others.forEach((o, i) => {
        const s = similar.find((x) => x.id === extra[i]);
        if (o.status === "fulfilled" && !("error" in o.value) && s) list.push({ name: s.stage_name, conversationId: o.value.conversationId, key: o.value.key });
        else if (s) toast.error(`${s.stage_name}: ${t("unavailable on that date")}`);
      });
      setSent(list);
    } catch {
      toast.error(t("Could not send your request. Please try again."));
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="artist-profile-panel artist-profile-booking">
      <div className="text-sm text-muted-foreground">{t("Starting from")}</div>
      <div className="font-display text-3xl font-semibold">{aed(basePrice)}</div>
      {sent ? (
        <div className="mt-5 space-y-3">
          <div className="font-semibold">{t("Your quote requests were sent")}</div>
          <p className="text-xs text-muted-foreground">{t("Each artist replies in its own chat. Save these links to come back later.")}</p>
          {sent.map((s) => (
            <Button key={s.conversationId} variant="outline" className="w-full justify-between" onClick={() => navigate({ to: "/chat/$id", params: { id: s.conversationId }, search: { k: s.key } })}>
              <span>{s.name}</span><span>{t("Open chat")} →</span>
            </Button>
          ))}
        </div>
      ) : !showForm ? (
        <div className="mt-5 space-y-3">
          <Button type="button" onClick={() => setShowForm(true)} className="w-full bg-gradient-gold text-gold-foreground hover:opacity-90">{t("Book Artist")}</Button>
          <Button type="button" variant="gold" onClick={() => setScheduleOpen(true)} className="w-full">{t("Check Schedule")}</Button>
          <Button type="button" variant="gold" className="w-full" onClick={() => setChatOpen(true)}>{t("Chat With Us")}</Button>
          <p className="text-[11px] text-muted-foreground">{t("An AI assistant replies instantly on behalf of the artist. Contact details stay private until booking.")}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="font-semibold">{t("Job Categories")}</div>
          <Select value={jobCategory} onValueChange={(v) => { setJobCategory(v); setSpeciality(""); }}>
            <SelectTrigger><SelectValue placeholder={t("What do you need?")} /></SelectTrigger>
            <SelectContent>{categories.map((c) => <SelectItem key={c.slug} value={c.id ?? c.slug}>{t(c.name)}</SelectItem>)}</SelectContent>
          </Select>
          {jobCategory && (
            <Select value={speciality} onValueChange={setSpeciality}>
              <SelectTrigger><SelectValue placeholder={t("Speciality")} /></SelectTrigger>
              <SelectContent>{specialties.map((sp) => <SelectItem key={sp.slug} value={sp.id ?? sp.slug}>{t(sp.name)}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {speciality && customFields.length > 0 && (
            <div className="rounded-xl border-t-4 border-gold bg-background p-3">
              <div className="font-semibold">{orderForm?.title}</div>
              {orderForm?.description && <p className="text-xs text-muted-foreground">{orderForm.description}</p>}
              <div className="mt-3"><OrderFormFields fields={customFields} values={answers} onChange={(id, v) => setAnswers({ ...answers, [id]: v })} /></div>
            </div>
          )}
          <Select value={f.event} onValueChange={(v) => setF({ ...f, event: v })}>
            <SelectTrigger><SelectValue placeholder={t("Event type")} /></SelectTrigger>
            <SelectContent>{catalog.eventTypes.map((e) => <SelectItem key={e.id} value={e.id}>{t(e.name)}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">{t("Date")}</Label><Input type="date" value={f.date} onChange={up("date")} /></div>
            <div><Label className="text-xs">{t("Guests")}</Label><Input type="number" min={1} value={f.guests} onChange={up("guests")} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2 items-end">
            <div><Label className="text-xs">{t("Start")}</Label><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value, duration: f.duration || autoDuration(e.target.value, f.end) })} /></div>
            <div><Label className="text-xs">{t("End")}</Label><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value, duration: f.duration || autoDuration(f.start, e.target.value) })} /></div>
            <div><Label className="text-xs">{t("Duration")}</Label><Input type="number" placeholder={t("min")} min={1} max={1440} value={f.duration} onChange={up("duration")} /></div>
          </div>
          <Select value={f.area} onValueChange={(v) => setF({ ...f, area: v })}>
            <SelectTrigger><SelectValue placeholder={t("Venue area")} /></SelectTrigger>
            <SelectContent>{catalog.areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
          <div><Label className="text-xs">{t("Budget (AED)")} *</Label><Input type="number" min={1} required value={f.budget} onChange={up("budget")} /></div>
          <Input placeholder={t("Your name")} value={f.name} onChange={up("name")} maxLength={120} />
          <Input placeholder={t("Email")} type="email" value={f.email} onChange={up("email")} maxLength={255} />
          <Input placeholder={t("Phone (+971…)")} value={f.phone} onChange={up("phone")} maxLength={30} />
          <Textarea placeholder={t("Tell the artist about your event")} value={f.message} onChange={up("message")} maxLength={2000} />
          {similar.length > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-xs font-semibold">{t("Also ask up to 2 similar artists")}</div>
              {similar.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-gold" checked={extra.includes(s.id)} disabled={!extra.includes(s.id) && extra.length >= 2}
                    onChange={(e) => setExtra(e.target.checked ? [...extra, s.id] : extra.filter((x) => x !== s.id))} />
                  <span className="flex-1">{s.stage_name}</span>
                  <span className="text-xs text-muted-foreground">{t("from")} {aed(s.base_price)}</span>
                </label>
              ))}
            </div>
          )}
          {packages.length > 0 && (
            <div className="rounded-xl border p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{t("Rate range")}</span>
                <b dir="ltr" className="text-gold">{priceRange.start === priceRange.base ? aed(priceRange.base) : `${aed(priceRange.start)} – ${aed(priceRange.base)}`}</b>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("Start rate is the lowest this artist will take; the base rate is their standard price. The final figure is agreed with the artist.")}</p>
            </div>
          )}
          <Button type="submit" disabled={sending} className="w-full bg-gradient-gold text-gold-foreground hover:opacity-90">
            {sending ? t("Assistant is replying…") : t("Book Artist")}
          </Button>
          <Button type="button" variant="gold" onClick={() => setScheduleOpen(true)} className="w-full">{t("Check Schedule")}</Button>
          <Button type="button" variant="gold" className="w-full" onClick={() => setChatOpen(true)}>{t("Chat With Us")}</Button>
          <p className="text-[11px] text-muted-foreground">{t("An AI assistant replies instantly on behalf of the artist. Contact details stay private until booking.")}</p>
        </form>
      )}
      {chatOpen && <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void openChat(); }}><Label htmlFor="artist-chat-message">{t("Your message")}</Label><Textarea id="artist-chat-message" autoFocus value={chatText} onChange={event => setChatText(event.target.value)} placeholder={t("Ask about your event")} maxLength={2000} /><Button variant="gold" type="submit" className="w-full" disabled={chatBusy || !chatText.trim()}>{t(chatBusy ? "Opening chat…" : "Start chat")}</Button></form>}
      <ScheduleDialog open={scheduleOpen} onOpenChange={setScheduleOpen} blocked={blocked} busy={busy} name={artistName} />
    </aside>
  );
}

function autoDuration(start: string, end: string) {
  if (!start || !end) return "";
  const m = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  let d = m(end) - m(start);
  if (d <= 0) d += 1440;
  return String(d);
}

type Media = { id: string; kind: "photo" | "video" | "youtube"; src: string; caption: string | null };

function MediaShowcase({ media, name }: { media: Media[]; name: string }) {
  const { t } = useI18n();
  const photos = media.filter((m) => m.kind === "photo").slice(0, 10);
  const videos = media.filter((m) => m.kind !== "photo").slice(0, 5);
  const [open, setOpen] = useState<{ type: "photo" | "video"; i: number } | null>(null);
  if (photos.length + videos.length === 0) return null;
  const list = open?.type === "photo" ? photos : videos;
  const go = (d: number) => setOpen((o) => (o ? { ...o, i: (o.i + d + list.length) % list.length } : o));
  const cur = open ? list[open.i] : null;
  return (
    <section className="artist-profile-media space-y-3">
      <h2 className="text-2xl font-semibold">{t("Photos & videos")}</h2>
      {photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {photos.map((p, n) => (
            <Button variant="ghost" key={p.id} type="button" onClick={() => setOpen({ type: "photo", i: n })} className="overflow-hidden rounded-lg bg-muted aspect-square hover:opacity-90">
              <img src={p.src} alt={p.caption ?? name} className="h-full w-full object-cover" loading="lazy" />
            </Button>
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {videos.map((v, n) => (
            <Button variant="ghost" key={v.id} type="button" onClick={() => setOpen({ type: "video", i: n })} aria-label={`Video ${n + 1}`} className="relative overflow-hidden rounded-lg bg-muted aspect-video hover:opacity-90">
              {v.kind === "youtube"
                ? <img src={`https://i.ytimg.com/vi/${youtubeId(v.src)}/mqdefault.jpg`} alt={v.caption ?? `${name} video`} className="h-full w-full object-cover" loading="lazy" />
                : <video className="h-full w-full object-cover" src={v.src} preload="metadata" muted />}
              <span className="absolute inset-0 grid place-items-center"><span className="grid h-8 w-8 place-items-center rounded-full bg-card/85 shadow-card"><Play className="h-4 w-4" /></span></span>
            </Button>
          ))}
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-4xl p-2 sm:p-3">
          <DialogTitle className="sr-only">{cur?.caption ?? name}</DialogTitle>
          {cur && (
            <div className="relative" dir="ltr">
              {open?.type === "photo"
                ? <img src={cur.src} alt={cur.caption ?? name} className="max-h-[80vh] w-full rounded-lg object-contain" />
                : <div className="aspect-video overflow-hidden rounded-lg bg-muted">
                    {cur.kind === "youtube"
                      ? <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${youtubeId(cur.src)}?autoplay=1`} title={cur.caption ?? `${name} video`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
                      : <video className="h-full w-full" src={cur.src} controls autoPlay />}
                  </div>}
              {list.length > 1 && (
                <>
                  <Button variant="ghost" type="button" aria-label="Previous" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-card/85 shadow-card"><ChevronLeft className="h-5 w-5" /></Button>
                  <Button variant="ghost" type="button" aria-label="Next" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-card/85 shadow-card"><ChevronRight className="h-5 w-5" /></Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
