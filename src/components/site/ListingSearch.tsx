import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, localName } from "@/lib/i18n";
import { ALL, searchTarget } from "@/lib/artist-search";
import { withTalent, type TalentIndex } from "@/lib/catalog-listing";
import type { Filters } from "./SearchPage";

type Catalog = {
  talent?: TalentIndex | null;
  categories: { id: string; slug: string; name: string; name_ar?: string | null }[];
  emirates: { slug: string; name: string; name_ar?: string | null }[];
};
export function ListingSearch({ catalog, categorySlug, emirateSlug, filters }: { catalog: Catalog; categorySlug: string; emirateSlug?: string | undefined; filters: Filters }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [text, setText] = useState(filters.q ?? "");
  // Talent starts on All so a search is never tied to the page's category; after a search it shows what was searched.
  const [category, setCategory] = useState(filters.q ? categorySlug : ALL);
  const [city, setCity] = useState(emirateSlug ?? ALL);
  const submit = () => {
    const target = searchTarget(text, category, city);
    // A specialty belongs to one category, so it only survives a search inside that same category.
    const search: Filters = { ...filters, sub: target.category === categorySlug ? filters.sub : undefined, q: target.search.q };
    if (target.emirate) void navigate({ to: "/$category/$emirate", params: { category: target.category, emirate: target.emirate }, search });
    else void navigate({ to: "/$category", params: { category: target.category }, search });
  };
  return <form role="search" className="reference-search" onSubmit={e => { e.preventDefault(); submit(); }}>
    <div className="reference-search-text"><Search className="h-5 w-5" /><Input aria-label={t("Search talent")} type="search" maxLength={80} placeholder={t("Name, talent or city")} value={text} onChange={e => setText(e.target.value)} /></div>
    <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label={t("Talent")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("All")}</SelectItem>{withTalent({ categories: catalog.categories, subcategories: [], talent: catalog.talent }, categorySlug).categories.map(c => <SelectItem key={c.slug} value={c.slug}>{localName(lang, c)}</SelectItem>)}</SelectContent></Select>
    <Select value={city} onValueChange={setCity}><SelectTrigger aria-label={t("City")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("All")}</SelectItem>{catalog.emirates.map(c => <SelectItem key={c.slug} value={c.slug}>{localName(lang, c)}</SelectItem>)}</SelectContent></Select>
    <Button type="submit" className="reference-gold">{t("Search")}<ArrowRight className="h-4 w-4" /></Button>
  </form>;
}
