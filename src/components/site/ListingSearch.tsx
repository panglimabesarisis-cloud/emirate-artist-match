import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import type { Filters } from "./SearchPage";

type Catalog = {
  categories: { id: string; slug: string; name: string }[];
  emirates: { id: string; slug: string; name: string }[];
  subcategories: { slug: string; name: string; category_id: string }[];
  areas: { slug: string; name: string; emirate_id: string }[];
};
export function ListingSearch({ catalog, categorySlug, emirateSlug, filters }: { catalog: Catalog; categorySlug: string; emirateSlug?: string | undefined; filters: Filters }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [category, setCategory] = useState(categorySlug);
  const [city, setCity] = useState(emirateSlug ?? "any");
  const [error, setError] = useState("");
  const submit = () => {
    const q = text.trim().toLowerCase();
    const match = (x: { name: string; slug: string }) => x.name.toLowerCase() === q || x.slug === q;
    const cat = q ? catalog.categories.find(match) : undefined;
    const sub = q ? catalog.subcategories.find(match) : undefined;
    const parent = sub ? catalog.categories.find(c => c.id === sub.category_id) : undefined;
    const area = q ? catalog.areas.find(match) : undefined;
    const emirate = area ? catalog.emirates.find(c => c.id === area.emirate_id) : undefined;
    if (q && !cat && !sub && !area) { setError(t("No matching category, specialty or area found.")); return; }
    setError("");
    const selected = cat?.slug ?? parent?.slug ?? category;
    const search = sub ? { ...filters, sub: sub.slug } : filters;
    if (area && emirate) void navigate({ to: "/$category/$emirate/$area", params: { category: selected, emirate: emirate.slug, area: area.slug }, search });
    else if (city !== "any") void navigate({ to: "/$category/$emirate", params: { category: selected, emirate: city }, search });
    else void navigate({ to: "/$category", params: { category: selected }, search });
  };
  return <><form role="search" className="reference-search" onSubmit={e => { e.preventDefault(); submit(); }}>
    <div className="reference-search-text"><Search className="h-5 w-5" /><Input aria-label={t("Search talent")} type="search" placeholder={t("Talent, specialty or area")} value={text} onChange={e => setText(e.target.value)} /></div>
    <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label={t("Talent")}><SelectValue /></SelectTrigger><SelectContent>{catalog.categories.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}</SelectContent></Select>
    <Select value={city} onValueChange={setCity}><SelectTrigger aria-label={t("City")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">{t("All UAE")}</SelectItem>{catalog.emirates.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}</SelectContent></Select>
    <Button type="submit" className="reference-gold">{t("Search")}<ArrowRight className="h-4 w-4" /></Button>
  </form>{error && <p className="reference-error" role="alert">{error}</p>}</>;
}