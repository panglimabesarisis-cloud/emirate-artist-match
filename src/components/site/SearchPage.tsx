import { withTalent, type TalentIndex } from "@/lib/catalog-listing";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ArtistCard } from "@/lib/public.functions";
import { ListingArtistCard } from "./ListingArtistCard";
import { ListingSearch } from "./ListingSearch";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { X } from "lucide-react";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";
import { PublicLayout } from "./PublicLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, localName } from "@/lib/i18n";
import { ClientBookingGuide } from "./ClientBookingGuide";
import "./artist-profile.css";
import { ALL, ALL_CATEGORY, searchText } from "@/lib/artist-search";

export type Filters = {
  q?: string | undefined;
  sub?: string | undefined; event?: string | undefined; lang?: string | undefined;
  minRating?: number | undefined;
  verified?: boolean | undefined; top?: boolean | undefined;
  sort?: "recommended" | "rating" | "bookings" | undefined;
};

type Catalog = {
  talent?: TalentIndex | null;
  subcategories: { id: string; slug: string; name: string; category_id: string }[];
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
  useWebMCP({
    name: "list_shown_artists",
    description: "List the talent currently shown on this search page. Rates are given only in the booking chat and on invoices.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => runWebMCPTool("list_shown_artists", () => {
      const list = results.slice(0, shown);
      return list.length === 0 ? "No artists shown." : list.map((a) => `${a.slug}: ${a.stage_name}`).join("\n");
    }),
  });
  const { t, lang } = useI18n();
  // Chips offer only categories and specialities with talent; the page's own category stays.
  const listed = withTalent(catalog, categorySlug);
  const categories = [ALL_CATEGORY, ...listed.categories];
  const cat = categories.find((c) => c.slug === categorySlug);
  const subs = listed.subcategories.filter((s) => s.category_id === cat?.id);
  const emirate = catalog.emirates.find((e) => e.slug === emirateSlug);
  const areas = emirate ? catalog.areas.filter((a) => a.emirate_id === emirate.id) : [];

  const set = (patch: Partial<Filters>) =>
    navigate({ to: ".", search: (prev: Filters) => ({ ...prev, ...patch }), replace: true });

  return (
    <ReferenceTheme><PublicLayout>
      <div className="reference-scene-header">
        <SceneBackground arch={false} />
        <div className="reference-wrap reference-scene-content listing-header-centered">
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
          <ListingSearch key={`${categorySlug}|${emirateSlug ?? ALL}|${filters.q ?? ""}`} catalog={catalog} categorySlug={categorySlug} emirateSlug={emirateSlug} filters={filters} />
          <div className="reference-category-chips">{categories.map(c => <Link key={c.slug} to="/$category" params={{ category: c.slug }} search={{ ...filters, sub: undefined }} className={c.slug === categorySlug ? "is-active" : ""}>{c.slug === ALL ? t("All") : localName(lang, c)}</Link>)}</div>
          {subs.length > 0 && (
            <div className="listing-subcategories mt-6 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => set({ sub: undefined })}
                className={`rounded-full px-3 py-1 text-sm border border-sidebar-border ${!filters.sub ? "bg-gradient-gold text-gold-foreground" : ""}`}>{t("All")}</Button>
              {subs.map((s) => (
                <Button variant="ghost" key={s.slug} onClick={() => set({ sub: s.slug })}
                  className={`rounded-full px-3 py-1 text-sm border border-sidebar-border ${filters.sub === s.slug ? "bg-gradient-gold text-gold-foreground" : ""}`}>
                  {s.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="reference-wrap listing-content">
        <aside hidden className="space-y-6">
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
                  <Link key={a.slug} to="/$category/$emirate/$area" params={{ category: categorySlug, emirate: emirateSlug ?? "dubai", area: a.slug }}
                    className="text-xs rounded-full border px-2 py-0.5 hover:border-gold">{a.name}</Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div>
          <div className="listing-filter-chips">{Object.entries(filters).filter(([key, value]) => key !== "sort" && value !== undefined && value !== false).map(([key, value]) => <Button key={key} variant="ghost" onClick={() => set({ [key]: undefined })} aria-label={`${t("Remove")} ${key}`}>
            {key === "q" ? `“${value}”` : key === "sub" ? catalog.subcategories.find(s => s.slug === value)?.name ?? String(value) : key === "event" ? catalog.eventTypes.find(e => e.slug === value)?.name ?? String(value) : key === "minRating" ? `${value}+ ${t("rating")}` : key === "verified" ? t("Verified only") : key === "top" ? t("Top Performers") : String(value)}<X className="h-3 w-3" />
          </Button>)}</div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{results.length} {t("artists found")}</p>
            <Select value={filters.sort ?? "recommended"} onValueChange={(v) => set({ sort: v as Filters["sort"] })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">{t("Recommended")}</SelectItem>
                <SelectItem value="rating">{t("Highest rated")}</SelectItem>
                <SelectItem value="bookings">{t("Most booked")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {results.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
              {t("No artists match these filters yet. Try widening your search.")}
            </div>
          ) : (
            <div className="listing-artists">
              {results.slice(0, shown).map((a) => <ListingArtistCard key={a.id} artist={a} match={subs.find(s => s.slug === filters.sub)?.name ?? (categorySlug === ALL ? a.category?.name : cat?.name) ?? ""} />)}
            </div>
          )}
          {shown < results.length && (
            <div className="mt-8 text-center">
              <Button variant="outline" onClick={() => setShown((n) => n + 12)}>{t("Show more")}</Button>
            </div>
          )}

          <ClientBookingGuide />
        </div>
      </div>
    </PublicLayout></ReferenceTheme>
  );
}

export function validateFilters(s: Record<string, unknown>): Filters {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const num = (v: unknown) => (v != null && !isNaN(Number(v)) ? Number(v) : undefined);
  const sorts = ["recommended", "rating", "bookings"];
  return {
    q: searchText(s["q"]),
    sub: str(s["sub"]), event: str(s["event"]), lang: str(s["lang"]),
    minRating: num(s["minRating"]),
    verified: s["verified"] === true || s["verified"] === "true" ? true : undefined,
    top: s["top"] === true || s["top"] === "true" ? true : undefined,
    sort: sorts.includes(String(s["sort"])) ? (s["sort"] as Filters["sort"]) : undefined,
  };
}
