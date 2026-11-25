import { Link } from "@tanstack/react-router";
import { Star, MapPin, ArrowRight, BadgeCheck, RotateCw } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArtistAvatar } from "@/components/site/ArtistCard";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { ArtistCard } from "@/lib/public.functions";
import { useFeaturedChoreography } from "./useFeaturedChoreography";
import "./featured-choreography.css";

function RevealTalent({ name, children }: { name: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [turning, setTurning] = useState(false);
  const { lang } = useI18n();
  const reveal = async () => {
    if (revealed || turning || !ref.current) return;
    setTurning(true);
    const { gsap } = await import("gsap");
    const element = ref.current;
    if (!element) return;
    const timeline = gsap.timeline({ onComplete: () => { setTurning(false); element.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true }); } });
    timeline.to(element, { rotationY: 90, duration: .3, ease: "power2.in" });
    timeline.call(() => setRevealed(true));
    timeline.to(element, { rotationY: 360, duration: .65, ease: "power3.out" });
  };
  return <div className="talent-flipper" ref={ref} data-revealed={revealed}>
    {children}
    <Button variant="ghost" className="talent-cover" disabled={turning} onClick={() => void reveal()} aria-label={lang === "ar" ? `عرض الفنان ${name}` : `Reveal ${name}`}><span aria-hidden="true">DEALMAKER</span><RotateCw aria-hidden="true" /></Button>
  </div>;
}

export function FeaturedTalents({ artists }: { artists: ArtistCard[] }) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  useFeaturedChoreography(stageRef, artists.length);
  return <section className="cream" aria-labelledby="featured-title"><div className="wrap sec">
    <div className="sh sh-c"><div><p className="eyebrow rv">{t("Featured in Dubai")}</p><h2 className="serif rv" id="featured-title"><span className="line"><span>{t("THE BEST PERFORMER")}</span></span><span className="line"><span className="gld">{t("READY FOR BOOKING")}</span></span></h2></div></div>
    <div className="talent-choreography" ref={stageRef}><div className="talent-scene">
    <div className="talent-word" aria-hidden="true">{"DEALMAKER".split("").map((letter, i) => <span className="talent-letter" key={i}>{letter}</span>)}</div>
    <div className="fgrid talent-grid">{artists.map((a, i) => <div key={a.id} className="talent-slot"><RevealTalent name={a.stage_name}><Link to="/artist/$slug" params={{ slug: a.slug }} className="fc talent-front" aria-label={`${t("Request a quick quote")} — ${a.stage_name}`}>
      <div className="v"><ArtistAvatar name={a.stage_name} hue={a.hue} src={a.profilePhotoUrl} className="mono" /><div className="badges">{a.badges.includes("top_performer") && <span className="tag top">{t("Top performer")}</span>}{a.badges.some((b) => b.startsWith("verified")) && <span className="tag"><BadgeCheck className="h-3 w-3" />{t("Verified")}</span>}</div><span className="rank">{String(i + 1).padStart(2, "0")}</span></div>
      <div className="b"><span className="role">{a.subcategory?.name ?? a.category?.name}</span><h3>{a.stage_name}</h3><p className="bio">{a.tagline}</p><div className="row2"><div>{a.stats.rating !== null && <span className="rating"><Star className="st h-3 w-3" /><b>{a.stats.rating.toFixed(1)}</b> ({a.stats.review_count})</span>}{a.stats.completed_orders !== null && <span> · {a.stats.completed_orders} {t("bookings")}</span>}<span className="card-location"><MapPin className="h-3 w-3" />{a.area?.name ?? a.emirate?.name}</span></div><span className="pr"><small>{t("from")}</small>{aed(a.base_price)}</span></div></div>
      <div className="glare" /><div className="cta">{t("Request a quick quote")}<ArrowRight className="h-4 w-4" /></div>
    </Link></RevealTalent></div>)}</div>
    </div></div>
    {artists.length === 0 && <p className="home-empty">{t("No featured artists in this category yet.")}</p>}
    <div className="see-all see-all-c rv"><p className="explore-ask">{t("WANT EXPLORE ALL PERFORMER ?")}</p><Button asChild className="btn btn-dark"><Link to="/$category" params={{ category: "all" }}>{t("See all talent")}<ArrowRight className="arr h-4 w-4" /></Link></Button></div>
  </div></section>;
}