import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, localName } from "@/lib/i18n";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { RotatingWord } from "./RotatingWord";
import { ALL, searchTarget } from "@/lib/artist-search";
import { withTalent } from "@/lib/catalog-listing";
import type { HomeCatalog } from "./types";

export function HomeHero({ catalog }: { catalog: HomeCatalog }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>(ALL);
  const [city, setCity] = useState<string>(ALL);
  const [text, setText] = useState("");
  const listed = withTalent(catalog);
  const open = (slug: string, search: { q?: string; sub?: string }) => {
    if (city === ALL) void navigate({ to: "/$category", params: { category: slug }, search });
    else void navigate({ to: "/$category/$emirate", params: { category: slug, emirate: city }, search });
  };
  const go = () => { const target = searchTarget(text, category, city); open(target.category, target.search); };
  // A popular specialty opens its own category, filtered to that specialty, in the chosen city.
  const popular = (specialty: HomeCatalog["subcategories"][number]) => {
    const parent = catalog.categories.find((c) => c.id === specialty.category_id);
    if (parent) open(parent.slug, { sub: specialty.slug });
  };
  return <section className="hero" aria-labelledby="home-title">
    <SceneBackground />
    <div className="wrap hero-in">
      <p className="eyebrow rv">{t("Dubai · Abu Dhabi · Sharjah")}</p>
      <h1 className="serif rv" id="home-title"><span className="line"><span>{t("Book the talent")}</span></span><span className="line"><span>{t("that makes")} <RotatingWord /></span></span></h1>
      <p className="hero-sub rv d2"><strong>{t("Verified singers, DJs and cultural acts")}</strong>{t(", with an AI booking agent that quotes you in seconds.")}</p>
      <form className="search rv d3" role="search" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <div className="s-f s-q"><label className="s-l" htmlFor="home-query">{t("Search")}</label><div className="s-in"><Search className="h-4 w-4 shrink-0" /><input id="home-query" type="search" placeholder={t("Name, talent or city")} autoComplete="off" maxLength={80} list="home-search-suggestions" value={text} onChange={(e) => setText(e.target.value)} /></div></div>
        <div className="s-f"><span className="s-l" id="home-talent-label">{t("Talent")}</span><Select value={category} onValueChange={setCategory}><SelectTrigger aria-labelledby="home-talent-label"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("All")}</SelectItem>{listed.categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{localName(lang, c)}</SelectItem>)}</SelectContent></Select></div>
        <div className="s-f"><span className="s-l" id="home-city-label">{t("City")}</span><Select value={city} onValueChange={setCity}><SelectTrigger aria-labelledby="home-city-label"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("All")}</SelectItem>{catalog.emirates.map((e) => <SelectItem key={e.slug} value={e.slug}>{localName(lang, e)}</SelectItem>)}</SelectContent></Select></div>
        <Button type="submit" className="btn btn-gold s-go">{t("Search")}<ArrowRight className="arr h-4 w-4" /></Button>
      </form>
      <datalist id="home-search-suggestions">{[...listed.categories, ...listed.subcategories, ...catalog.emirates, ...catalog.areas].map((c) => <option key={`${c.id}-${c.slug}`} value={c.name} />)}</datalist>
      {listed.subcategories.length > 0 && <div className="hints rv d4"><span>{t("Popular:")}</span>{listed.subcategories.slice(0, 4).map((s) => <Button key={s.slug} variant="ghost" onClick={() => popular(s)}>{t(s.name)}</Button>)}</div>}
      <div className="stats rv d4"><div><b>24/7</b><span>{t("AI booking agent")}</span></div><div><b>{t("Verified")}</b><span>{t("Talent only")}</span></div><div><b>AED</b><span>{t("Transparent pricing")}</span></div></div>
    </div>
  </section>;
}