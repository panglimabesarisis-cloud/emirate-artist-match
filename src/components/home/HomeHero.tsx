import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n, localName } from "@/lib/i18n";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { RotatingWord } from "./RotatingWord";
import { resolveHomeSearch } from "./search";
import type { HomeCatalog } from "./types";

export function HomeHero({ catalog }: { catalog: HomeCatalog }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [category, setCategory] = useState(catalog.categories[0]?.slug ?? "musicians");
  const [city, setCity] = useState("dubai");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const go = (query = text) => {
    const result = resolveHomeSearch(catalog, query, category, city);
    if (!result) { setError(t("No matching category, specialty or area found.")); return; }
    setError("");
    if ("area" in result && result.area) void navigate({ to: "/$category/$emirate/$area", params: { category: result.category, emirate: result.emirate, area: result.area } });
    else void navigate({ to: "/$category/$emirate", params: { category: result.category, emirate: result.emirate }, search: "sub" in result && result.sub ? { sub: result.sub } : {} });
  };
  return <section className="hero" aria-labelledby="home-title">
    <SceneBackground />
    <div className="wrap hero-in">
      <p className="eyebrow rv">{t("Dubai · Abu Dhabi · Sharjah")}</p>
      <h1 className="serif rv" id="home-title"><span className="line"><span>{t("Book the talent")}</span></span><span className="line"><span>{t("that makes")} <RotatingWord /></span></span></h1>
      <p className="hero-sub rv d2"><strong>{t("Verified singers, DJs and cultural acts")}</strong>{t(", with an AI booking agent that quotes you in seconds.")}</p>
      <form className="search rv d3" role="search" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <div className="s-f s-q"><label className="s-l" htmlFor="home-query">{t("Search")}</label><div className="s-in"><Search className="h-4 w-4 shrink-0" /><input id="home-query" type="search" placeholder={t("Talent, specialty or area")} autoComplete="off" list="home-search-suggestions" value={text} onChange={(e) => { setText(e.target.value); setError(""); }} aria-describedby={error ? "home-search-error" : undefined} /></div></div>
        <div className="s-f"><span className="s-l" id="home-talent-label">{t("Talent")}</span><Select value={category} onValueChange={setCategory}><SelectTrigger aria-labelledby="home-talent-label"><SelectValue /></SelectTrigger><SelectContent>{catalog.categories.map((c) => <SelectItem key={c.slug} value={c.slug}>{localName(lang, c)}</SelectItem>)}</SelectContent></Select></div>
        <div className="s-f"><span className="s-l" id="home-city-label">{t("City")}</span><Select value={city} onValueChange={setCity}><SelectTrigger aria-labelledby="home-city-label"><SelectValue /></SelectTrigger><SelectContent>{catalog.emirates.map((e) => <SelectItem key={e.slug} value={e.slug}>{localName(lang, e)}</SelectItem>)}</SelectContent></Select></div>
        <Button type="submit" className="btn btn-gold s-go">{t("Search")}<ArrowRight className="arr h-4 w-4" /></Button>
      </form>
      <datalist id="home-search-suggestions">{[...catalog.categories, ...catalog.subcategories, ...catalog.areas].map((c) => <option key={`${c.id}-${c.slug}`} value={c.name} />)}</datalist>
      {error && <p id="home-search-error" role="alert" className="home-search-error">{error}</p>}
      <div className="hints rv d4"><span>{t("Popular:")}</span>{catalog.subcategories.slice(0, 4).map((s) => <Button key={s.slug} variant="ghost" onClick={() => { setText(s.name); go(s.name); }}>{t(s.name)}</Button>)}</div>
      <div className="stats rv d4"><div><b>24/7</b><span>{t("AI booking agent")}</span></div><div><b>{t("Verified")}</b><span>{t("Talent only")}</span></div><div><b>AED</b><span>{t("Transparent pricing")}</span></div></div>
    </div>
  </section>;
}