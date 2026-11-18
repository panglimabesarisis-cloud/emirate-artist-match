import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Bot, ShieldCheck, Star } from "lucide-react";
import { getCatalog, getFeatured } from "@/lib/public.functions";
import { PublicLayout } from "@/components/site/PublicLayout";
import { ArtistCardView } from "@/components/site/ArtistCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import hero from "@/assets/hero-dubai-night.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sahra — Book singers, DJs & entertainers in Dubai" },
      { name: "description", content: "Find verified event talent in Dubai and the UAE. Free quick quotes answered instantly by each artist's AI booking agent." },
      { property: "og:title", content: "Sahra — Book event talent in Dubai" },
      { property: "og:description", content: "Verified singers, DJs, cultural acts and entertainers across the UAE with instant AI quotes." },
    ],
  }),
  loader: async () => {
    const [catalog, featured] = await Promise.all([getCatalog(), getFeatured()]);
    return { catalog, featured };
  },
  component: Home,
});

function Home() {
  const { catalog, featured } = Route.useLoaderData();
  const navigate = useNavigate();
  const [cat, setCat] = useState("musicians");
  const [em, setEm] = useState("dubai");
  const [ev, setEv] = useState<string>("any");

  const go = () =>
    navigate({
      to: "/$category/$emirate",
      params: { category: cat, emirate: em },
      search: ev !== "any" ? { event: ev } : {},
    });

  return (
    <PublicLayout>
      <section className="relative bg-night text-night-foreground overflow-hidden">
        <img src={hero} alt="Live singer performing at a Dubai rooftop event" width={1600} height={1008} className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-night" />
        <div className="relative mx-auto max-w-7xl px-4 pt-28 pb-20 md:pt-40 md:pb-28">
          <p className="text-gold uppercase tracking-[0.3em] text-xs font-semibold">Dubai · Abu Dhabi · Sharjah</p>
          <h1 className="mt-4 text-4xl md:text-7xl font-semibold max-w-3xl leading-[1.05]">
            Book the talent that makes the night.
          </h1>
          <p className="mt-5 max-w-xl text-lg opacity-85">
            Verified singers, DJs and cultural acts — with an AI booking agent that quotes you in seconds.
          </p>
          <div className="mt-10 bg-card text-card-foreground rounded-2xl p-3 shadow-card grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] max-w-4xl">
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="h-12 border-0 bg-muted"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>{catalog.categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={em} onValueChange={setEm}>
              <SelectTrigger className="h-12 border-0 bg-muted"><SelectValue placeholder="Emirate" /></SelectTrigger>
              <SelectContent>{catalog.emirates.map((e) => <SelectItem key={e.slug} value={e.slug}>{e.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={ev} onValueChange={setEv}>
              <SelectTrigger className="h-12 border-0 bg-muted"><SelectValue placeholder="Event type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any event</SelectItem>
                {catalog.eventTypes.map((e) => <SelectItem key={e.slug} value={e.slug}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={go} className="h-12 px-6 bg-gradient-gold text-gold-foreground hover:opacity-90">
              <Search className="h-4 w-4" /> Search
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-semibold">Browse by category</h2>
        <div className="mt-8 grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
          {catalog.categories.map((c) => (
            <Link key={c.slug} to="/$category" params={{ category: c.slug }}
              className="rounded-xl border bg-card p-4 hover:border-gold hover:shadow-card transition">
              <div className="font-semibold">{c.name}</div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4">
        <div className="flex items-end justify-between">
          <h2 className="text-3xl md:text-4xl font-semibold">Featured in Dubai</h2>
          <Link to="/$category" params={{ category: "musicians" }} className="text-sm font-semibold text-gold">See all →</Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((a) => <ArtistCardView key={a.id} a={a} />)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 grid gap-6 md:grid-cols-3">
        {[
          { icon: Bot, t: "Instant AI quotes", d: "Every artist has an AI agent that replies 24/7 using their own prices and rules." },
          { icon: ShieldCheck, t: "Verified talent", d: "ID, business and performer badges reviewed by our team before they appear." },
          { icon: Star, t: "Real reviews only", d: "Reviews come exclusively from completed bookings on the platform." },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="rounded-2xl bg-card p-6 shadow-card">
            <Icon className="h-6 w-6 text-gold" />
            <h3 className="mt-4 text-xl font-semibold">{t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
    </PublicLayout>
  );
}
