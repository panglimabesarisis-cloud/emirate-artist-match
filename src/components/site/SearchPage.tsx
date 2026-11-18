import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ArtistCard } from "@/lib/public.functions";
import { ArtistCardView } from "./ArtistCard";
import { PublicLayout } from "./PublicLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, localName } from "@/lib/i18n";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export type Filters = {
  sub?: string | undefined; event?: string | undefined; lang?: string | undefined;
  maxPrice?: number | undefined; minRating?: number | undefined;
  verified?: boolean | undefined; top?: boolean | undefined;
  sort?: "recommended" | "rating" | "price_asc" | "price_desc" | "bookings" | undefined;
};

type Catalog = {
  subcategories: { slug: string; name: string; category_id: string }[];
  categories: { id: string; slug: string; name: string; name_ar?: string | null; description: string | null }[];
  emirates: { id: string; slug: string; name: string; name_ar?: string | null }[];
  areas: { slug: string; name: string; emirate_id: string }[];
  eventTypes: { slug: string; name: string }[];
};

export function SearchPage(props: {
  title: string;
  categorySlug: string;
  emirateSlug?: string;
  catalog: Catalog;
  results: ArtistCard[];
  filters: Filters;
  breadcrumbs: { label: string; to?: { category: string; emirate?: string } }[];
}) {
  const { catalog, results, filters, categorySlug, emirateSlug } = props;
  const navigate = useNavigate();
  const [shown, setShown] = useState(12);
  const { t, lang } = useI18n();
  const cat = catalog.categories.find((c) => c.slug === categorySlug);
  const subs = catalog.subcategories.filter((s) => s.category_id === cat?.id);
  const emirate = catalog.emirates.find((e) => e.slug === emirateSlug);
  const areas = emirate ? catalog.areas.filter((a) => a.emirate_id === emirate.id) : [];

  const set = (patch: Partial<Filters>) =>
    navigate({ to: ".", search: (prev: Filters) => ({ ...prev, ...patch }), replace: true });

  return (
    <PublicLayout>
      <div className="bg-night text-night-foreground">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <nav className="text-xs opacity-70 flex gap-1 flex-wrap">
            <Link to="/">{t("Home")}</Link>
            {props.breadcrumbs.map((b) => (
              <span key={b.label}>
                {" / "}
                {b.to ? (
                  b.to.emirate
                    ? <Link to="/$category/$emirate" params={{ category: b.to.category, emirate: b.to.emirate }}>{b.label}</Link>
                    : <Link to="/$category" params={{ category: b.to.category }}>{b.label}</Link>
                ) : b.label}
              </span>
            ))}
          </nav>
          <h1 className="mt-3 text-3xl md:text-5xl font-semibold">{lang === "ar" && cat ? `${localName(lang, cat)}${emirate ? ` في ${localName(lang, emirate)}` : " في الإمارات"}` : props.title}</h1>
          {lang === "en" && <p className="mt-2 opacity-75 max-w-2xl">{cat?.description}</p>}
          {subs.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={() => set({ sub: undefined })}
                className={`rounded-full px-3 py-1 text-sm border border-sidebar-border ${!filters.sub ? "bg-gradient-gold text-gold-foreground" : ""}`}>{t("All")}</button>
              {subs.map((s) => (
                <button key={s.slug} onClick={() => set({ sub: s.slug })}
                  className={`rounded-full px-3 py-1 text-sm border border-sidebar-border ${filters.sub === s.slug ? "bg-gradient-gold text-gold-foreground" : ""}`}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-6">
          <div className="space-y-2">
            <Label>{t("Event type")}</Label>
            <Select value={filters.event ?? "any"} onValueChange={(v) => set({ event: v === "any" ? undefined : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("Any event")}</SelectItem>
                {catalog.eventTypes.map((e) => <SelectItem key={e.slug} value={e.slug}>{t(e.name)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("Budget (starting price)")}</Label>
            <Select value={String(filters.maxPrice ?? "any")} onValueChange={(v) => set({ maxPrice: v === "any" ? undefined : Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("Any budget")}</SelectItem>
                {[1000, 2500, 5000, 10000].map((p) => <SelectItem key={p} value={String(p)}>{t("Up to")} AED {p.toLocaleString()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("Language")}</Label>
            <Select value={filters.lang ?? "any"} onValueChange={(v) => set({ lang: v === "any" ? undefined : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("Any language")}</SelectItem>
                {["English", "Arabic", "Hindi", "Russian", "French", "Urdu"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("Minimum rating")}</Label>
            <Select value={String(filters.minRating ?? "any")} onValueChange={(v) => set({ minRating: v === "any" ? undefined : Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("Any rating")}</SelectItem>
                <SelectItem value="4">4.0+</SelectItem>
                <SelectItem value="4.5">4.5+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!filters.verified} onCheckedChange={(v) => set({ verified: v ? true : undefined })} /> {t("Verified only")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!filters.top} onCheckedChange={(v) => set({ top: v ? true : undefined })} /> {t("Top Performers")}
          </label>
          {areas.length > 0 && (
            <div>
              <Label>{t("Areas in")} {localName(lang, emirate)}</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {areas.slice(0, 16).map((a) => (
                  <Link key={a.slug} to="/$category/$emirate/$area" params={{ category: categorySlug, emirate: emirateSlug!, area: a.slug }}
                    className="text-xs rounded-full border px-2 py-0.5 hover:border-gold">{a.name}</Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{results.length} {t("artists found")}</p>
            <Select value={filters.sort ?? "recommended"} onValueChange={(v) => set({ sort: v as Filters["sort"] })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">{t("Recommended")}</SelectItem>
                <SelectItem value="rating">{t("Highest rated")}</SelectItem>
                <SelectItem value="bookings">{t("Most booked")}</SelectItem>
                <SelectItem value="price_asc">{t("Price: low to high")}</SelectItem>
                <SelectItem value="price_desc">{t("Price: high to low")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {results.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
              {t("No artists match these filters yet. Try widening your search.")}
            </div>
          ) : (
            <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {results.slice(0, shown).map((a) => <ArtistCardView key={a.id} a={a} />)}
            </div>
          )}
          {shown < results.length && (
            <div className="mt-8 text-center">
              <Button variant="outline" onClick={() => setShown((n) => n + 12)}>{t("Show more")}</Button>
            </div>
          )}

          <section className="mt-16">
            <h2 className="text-2xl font-semibold">{t("Frequently asked questions")}</h2>
            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="1"><AccordionTrigger>{lang === "ar" ? `${t("How much does it cost to book in Dubai?")} (${localName(lang, cat)})` : `How much does it cost to book ${cat?.name.toLowerCase()} in Dubai?`}</AccordionTrigger>
                <AccordionContent>{t("Prices start from each artist's package rate in AED. Request a free quick quote and the artist's AI agent replies with an exact price for your date and venue.")}</AccordionContent></AccordionItem>
              <AccordionItem value="2"><AccordionTrigger>{t("Are the reviews real?")}</AccordionTrigger>
                <AccordionContent>{t("Yes. Only clients with a completed booking on the platform can leave a review.")}</AccordionContent></AccordionItem>
              <AccordionItem value="3"><AccordionTrigger>{t("Do I need an event permit?")}</AccordionTrigger>
                <AccordionContent>{t("Public events in Dubai may require a DET permit. The organiser is responsible for permits; artists can advise on requirements.")}</AccordionContent></AccordionItem>
            </Accordion>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}

export function validateFilters(s: Record<string, unknown>): Filters {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const num = (v: unknown) => (v != null && !isNaN(Number(v)) ? Number(v) : undefined);
  const sorts = ["recommended", "rating", "price_asc", "price_desc", "bookings"];
  return {
    sub: str(s["sub"]), event: str(s["event"]), lang: str(s["lang"]),
    maxPrice: num(s["maxPrice"]), minRating: num(s["minRating"]),
    verified: s["verified"] === true || s["verified"] === "true" ? true : undefined,
    top: s["top"] === true || s["top"] === "true" ? true : undefined,
    sort: sorts.includes(String(s["sort"])) ? (s["sort"] as Filters["sort"]) : undefined,
  };
}
