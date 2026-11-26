import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n, localName } from "@/lib/i18n";
import { HomeHero } from "./HomeHero";
import { FeaturedTalents } from "./FeaturedTalents";
import { AgentShowcase } from "./showcase/AgentShowcase";
import { WorkflowShowcase } from "./showcase/WorkflowShowcase";
import { InvoiceJourney } from "./showcase/InvoiceJourney";
import { PayLinkDemo } from "./showcase/PayLinkDemo";
import { HomeWhy } from "./HomeWhy";
import { HomeArtists } from "./HomeArtists";
import { HomeFooter } from "./HomeFooter";
import { useHomeAnimations } from "./useHomeAnimations";
import type { HomeData } from "./types";
import "./home.css";
import "./showcase/showcase.css";
import { withTalent } from "@/lib/catalog-listing";
import { HideForArtist } from "@/components/shared/HideForArtist";

export function DealmakerHome({ catalog, featured }: HomeData) {
  const ref = useRef<HTMLDivElement>(null);
  const { t, lang } = useI18n();
  useHomeAnimations(ref);
  // The running strip offers only categories with talent; a short list repeats so the strip stays full.
  const listed = withTalent(catalog).categories;
  const strip = listed.length ? Array.from({ length: Math.ceil(8 / listed.length) }, () => listed).flat() : [];
  return <div ref={ref} className="dm-home" dir={lang === "ar" ? "rtl" : "ltr"}>
    <a className="skip" href="#home-main">{t("Skip to content")}</a>
    <main id="home-main">
      <HomeHero catalog={catalog} />
      {strip.length > 0 && <div className="marquee"><div className="mq-track">{[0, 1].map((copy) => <div key={copy} className="mq-copy" aria-hidden={copy === 1}>{strip.map((c, i) => {
        // Only the first mention of each category is read out or reached by keyboard.
        const repeat = copy === 1 || i >= listed.length;
        return <Link key={`${c.slug}-${i}`} to="/$category" params={{ category: c.slug }} tabIndex={repeat ? -1 : undefined} aria-hidden={repeat || undefined}>{localName(lang, c)}</Link>;
      })}</div>)}</div></div>}
      <AgentShowcase />
      <WorkflowShowcase />
      <InvoiceJourney />
      <HomeWhy />
      <PayLinkDemo />
      <HomeArtists />
      <FeaturedTalents artists={featured} />
      <section className="doors">
        <div className="door a"><p className="eyebrow">{t("For event organisers")}</p><div><h3>{t("Looking for")} <em>{t("talent?")}</em></h3><p>{t("Browse performers across the UAE and find the right talent for your next event.")}</p><Button asChild className="btn btn-dark"><Link to="/$category" params={{ category: "all" }}>{t("Explore talent")}<ArrowRight className="arr h-4 w-4" /></Link></Button></div><div className="big" aria-hidden="true">→</div></div>
        <div className="door b"><p className="eyebrow">{t("For performers")}</p><div><h3>{t("Are you a")} <em className="it">{t("performer?")}</em></h3><p>{t("Create your profile and let your AI manager handle enquiries while you perform.")}</p><HideForArtist><Button asChild className="btn btn-gold"><Link to="/join">{t("Create a profile")}<ArrowRight className="arr h-4 w-4" /></Link></Button></HideForArtist></div><div className="big" aria-hidden="true">✦</div></div>
      </section>
    </main>
    <HomeFooter />
  </div>;
}