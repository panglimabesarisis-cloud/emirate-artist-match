import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Search, Bot, ShieldCheck, Star, CalendarCheck, Check, ArrowRight, ChevronLeft, ChevronRight, Music2, Disc3, Mic2, Sparkles, Camera, Users, LayoutGrid } from "lucide-react";
import { getCatalog, getFeatured } from "@/lib/public.functions";
import { PublicLayout } from "@/components/site/PublicLayout";
import { ArtistCardView } from "@/components/site/ArtistCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, localName } from "@/lib/i18n";
import hero from "@/assets/hero-dubai-night.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Dealmaker — Book Dubai's best event talent" },
    { name: "description", content: "Discover singers, DJs and cultural acts across Dubai and the UAE. Browse talent and request a quote from each artist's AI booking agent." },
    { property: "og:title", content: "Dealmaker — Book Dubai's best event talent" },
    { property: "og:description", content: "Find performers for weddings, corporate events and private parties with AED pricing and AI-assisted booking." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: async () => {
    const [catalog, featured] = await Promise.all([getCatalog(), getFeatured()]);
    return { catalog, featured };
  },
  component: Home,
});

function categoryIcon(slug: string) {
  if (slug.includes("music")) return Music2;
  if (slug.includes("dj")) return Disc3;
  if (slug.includes("photo")) return Camera;
  if (slug.includes("host") || slug.includes("speaker")) return Mic2;
  if (slug.includes("dance") || slug.includes("kids")) return Users;
  return Sparkles;
}

function Home() {
  const { catalog, featured } = Route.useLoaderData();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [cat, setCat] = useState("musicians");
  const [em, setEm] = useState("dubai");
  const [ev, setEv] = useState("any");
  const [active, setActive] = useState("all");
  const categoriesRef = useRef<HTMLDivElement>(null);
  const talentRef = useRef<HTMLElement>(null);
  const visible = active === "all" ? featured : featured.filter((a) => a.category?.slug === active);
  const activeCategory = catalog.categories.find((c) => c.slug === active);
  const go = () => navigate({ to: "/$category/$emirate", params: { category: cat, emirate: em }, search: ev !== "any" ? { event: ev } : {} });
  const benefits = [
    { icon: CalendarCheck, title: "Effortless booking", description: "Find your performer, check their schedule and keep every booking detail in one place.", points: ["Google Calendar availability checks", "Itemised invoices in AED", "All bookings tracked in one dashboard"] },
    { icon: ShieldCheck, title: "Clear, trackable payments", description: "Review your contract and invoice before paying your deposit, with your balance always visible.", points: ["Deposit and balance payment tracking", "VAT invoices & receipts", "Clear cancellation & refund policy"] },
    { icon: Bot, title: "Served by AI, 24/7", description: "Every artist has an AI manager that answers enquiries using their own prices and rules.", points: ["Enquiries any time of day", "English & Arabic", "Artist approval before your invoice"] },
  ];

  return (
    <PublicLayout className="dealmaker-home">
      <section className="home-hero relative overflow-hidden bg-night text-night-foreground">
        <img src={hero} alt="Singer performing at a Dubai rooftop event with the Burj Khalifa skyline" width={1600} height={1008} className="home-hero-image absolute inset-0 h-full w-full object-cover" />
        <div className="home-hero-shade absolute inset-0" />
        <div className="home-wrap relative">
          <div className="home-hero-content mx-auto flex flex-col items-center text-center">
            <p className="home-eyebrow text-gold">{t("Dubai · Abu Dhabi · Sharjah")}</p>
            <h1 className="home-title">{lang === "en" ? <>Book the talent that<br className="hidden sm:block" /> makes <em className="text-gold">the night.</em></> : t("Book the talent that makes the night.")}</h1>
            <p className="home-lead">{t("Verified singers, DJs and cultural acts — with an AI booking agent that quotes you in seconds.")}</p>
            <form className="home-search grid w-full text-start" onSubmit={(e) => { e.preventDefault(); void go(); }}>
              <div className="home-search-field"><label id="home-talent-label">{t("Talent")}</label>
                <Select value={cat} onValueChange={setCat}><SelectTrigger aria-labelledby="home-talent-label"><SelectValue /></SelectTrigger><SelectContent>{catalog.categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{localName(lang, c)}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="home-search-field"><label id="home-city-label">{t("City")}</label>
                <Select value={em} onValueChange={setEm}><SelectTrigger aria-labelledby="home-city-label"><SelectValue /></SelectTrigger><SelectContent>{catalog.emirates.map((e) => <SelectItem key={e.slug} value={e.slug}>{localName(lang, e)}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="home-search-field"><label id="home-event-label">{t("Event")}</label>
                <Select value={ev} onValueChange={setEv}><SelectTrigger aria-labelledby="home-event-label"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">{t("Any event")}</SelectItem>{catalog.eventTypes.map((e) => <SelectItem key={e.slug} value={e.slug}>{t(e.name)}</SelectItem>)}</SelectContent></Select>
              </div>
              <Button type="submit" className="home-search-go"><Search />{t("Search")}</Button>
            </form>
            <div className="home-stats flex justify-center">
              <div><strong>24/7</strong><span>{t("AI booking agent")}</span></div>
              <div><strong><ShieldCheck className="mx-auto h-7 w-7" /></strong><span>{t("Verified talent")}</span></div>
              <div><strong>AED</strong><span>{t("Transparent pricing")}</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="home-wrap home-categories relative">
        <div className="home-category-bar flex items-center gap-2">
          <Button variant="outline" size="icon" className="home-category-arrow shrink-0" aria-label={t("Scroll categories backward")} onClick={() => categoriesRef.current?.scrollBy({ left: lang === "ar" ? 340 : -340, behavior: "smooth" })}><ChevronLeft className="rtl:rotate-180" /></Button>
          <div ref={categoriesRef} className="home-category-scroll flex flex-1 gap-2 overflow-x-auto" role="group" aria-label={t("Categories")}>
            <Button variant="outline" className={`home-category-chip ${active === "all" ? "is-active" : ""}`} aria-pressed={active === "all"} onClick={() => setActive("all")}><LayoutGrid />{t("All")}</Button>
            {catalog.categories.map((c) => { const Icon = categoryIcon(c.slug); return <Button key={c.slug} variant="outline" className={`home-category-chip ${active === c.slug ? "is-active" : ""}`} aria-pressed={active === c.slug} onClick={() => setActive(c.slug)}><Icon />{localName(lang, c)}</Button>; })}
          </div>
          <Button variant="outline" size="icon" className="home-category-arrow shrink-0" aria-label={t("Scroll categories forward")} onClick={() => categoriesRef.current?.scrollBy({ left: lang === "ar" ? -340 : 340, behavior: "smooth" })}><ChevronRight className="rtl:rotate-180" /></Button>
        </div>
      </div>

      <section ref={talentRef} className="home-wrap home-talent">
        <div className="home-section-head flex items-end justify-between gap-5">
          <div><h2>{activeCategory ? localName(lang, activeCategory) : t("Featured in Dubai")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("Discover performers with reviews from completed bookings.")}</p></div>
          <Button asChild variant="link" className="home-see shrink-0"><Link to="/$category" params={{ category: active === "all" ? "musicians" : active }}>{t("See all talent")}<ArrowRight className="rtl:rotate-180" /></Link></Button>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((a) => <ArtistCardView key={a.id} a={a} compact />)}
          {visible.length === 0 && <div className="col-span-full py-12 text-center text-muted-foreground"><p>{t("No featured artists in this category yet.")}</p><Button asChild variant="link" className="mt-3"><Link to="/$category" params={{ category: active }}>{t("Browse this category")}<ArrowRight /></Link></Button></div>}
        </div>
      </section>

      <section className="home-why bg-night text-night-foreground">
        <div className="home-wrap">
          <p className="home-eyebrow text-gold">{t("Why Dealmaker")}</p>
          <h2 className="mt-3">{t("Booking talent, finally made simple.")}</h2>
          <p className="mt-3 text-sm opacity-70">{t("From first enquiry to final invoice — everything in one place.")}</p>
          <div className="home-benefits grid gap-8 lg:grid-cols-3">
            {benefits.map(({ icon: Icon, title, description, points }, i) => <article key={title} className="home-benefit">
              <div className="home-benefit-icon"><Icon className="h-6 w-6" /></div>
              <h3 className="mt-5 text-2xl">{t(title)}</h3><p className="mt-3 text-sm leading-relaxed opacity-70">{t(description)}</p>
              <ul className="mt-5 space-y-3 text-sm">{points.map((p) => <li key={p} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-gold" />{t(p)}</li>)}</ul>
              <div className="home-benefit-visual mt-6">
                {i === 0 ? <div className="flex items-center justify-between gap-2 text-center">{["Choose", "Quote", "Confirm"].map((s, n) => <div key={s} className="flex-1"><span className="block font-display text-lg text-gold">{n + 1}</span>{t(s)}</div>)}</div> : i === 1 ? <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 shrink-0 text-gold" /><div><p className="font-semibold">{t("Invoice · Contract · Payment")}</p><p className="mt-1 opacity-60">{t("Booking details in one place")}</p></div></div> : <div className="flex items-center gap-3"><Bot className="h-8 w-8 shrink-0 text-gold" /><div><p className="font-semibold">{t("Your artist's AI manager")}</p><p className="mt-1 opacity-60">{t("Available for enquiries 24/7")}</p></div></div>}
              </div>
            </article>)}
          </div>
          <div className="home-trust flex flex-wrap justify-center gap-x-10 gap-y-4 text-sm">
            <span><ShieldCheck />{t("Verified talent")}</span><span><Star />{t("Reviews only from completed bookings")}</span><span><CalendarCheck />{t("Clear cancellation & refund policy")}</span>
          </div>
        </div>
      </section>

      <section className="home-wrap home-cta grid gap-10 md:grid-cols-2">
        <div className="home-organiser"><p className="home-eyebrow text-gold">{t("For event organisers")}</p><h2 className="mt-3">{t("Are you looking for talent?")}</h2><p className="mt-4 text-sm leading-relaxed opacity-70">{t("Browse performers across the UAE and find the right talent for your next event.")}</p><Button className="mt-6 bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => talentRef.current?.scrollIntoView({ behavior: "smooth" })}>{t("Explore talent")}<ArrowRight className="rtl:rotate-180" /></Button></div>
        <div className="home-performer"><p className="home-eyebrow">{t("For performers")}</p><h2 className="mt-3">{t("Are you a performer?")}</h2><p className="mt-4 text-sm leading-relaxed opacity-80">{t("Create your profile and let your AI manager handle enquiries while you perform.")}</p><Button asChild className="mt-6"><Link to="/join">{t("Create a profile")}<ArrowRight className="rtl:rotate-180" /></Link></Button></div>
      </section>
    </PublicLayout>
  );
}
