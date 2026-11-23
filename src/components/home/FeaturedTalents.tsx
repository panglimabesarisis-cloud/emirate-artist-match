import { Link } from "@tanstack/react-router";
import { Star, MapPin, ArrowRight, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtistAvatar } from "@/components/site/ArtistCard";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { ArtistCard } from "@/lib/public.functions";

export function FeaturedTalents({ artists, category }: { artists: ArtistCard[]; category: string }) {
  const { t } = useI18n();
  return <section className="cream" aria-labelledby="featured-title"><div className="wrap sec">
    <div className="sh sh-c"><div><p className="eyebrow rv">{t("Featured in Dubai")}</p><h2 className="serif rv" id="featured-title"><span className="line"><span>{t("THE BEST PERFORMER")}</span></span><span className="line"><span className="gld">{t("READY FOR BOOKING")}</span></span></h2></div></div>
    <div className="fgrid">{artists.map((a, i) => <Link key={a.id} to="/artist/$slug" params={{ slug: a.slug }} className="fc rv" aria-label={`${t("Request a quick quote")} — ${a.stage_name}`}>
      <div className="v"><ArtistAvatar name={a.stage_name} hue={a.hue} className="mono" /><div className="badges">{a.badges.includes("top_performer") && <span className="tag top">{t("Top performer")}</span>}{a.badges.some((b) => b.startsWith("verified")) && <span className="tag"><BadgeCheck className="h-3 w-3" />{t("Verified")}</span>}</div><span className="rank">{String(i + 1).padStart(2, "0")}</span></div>
      <div className="b"><span className="role">{a.subcategory?.name ?? a.category?.name}</span><h3>{a.stage_name}</h3><p className="bio">{a.tagline}</p><div className="row2"><div>{a.stats.rating !== null && <span className="rating"><Star className="st h-3 w-3" /><b>{a.stats.rating.toFixed(1)}</b> ({a.stats.review_count})</span>}{a.stats.completed_orders !== null && <span> · {a.stats.completed_orders} {t("bookings")}</span>}<span className="card-location"><MapPin className="h-3 w-3" />{a.area?.name ?? a.emirate?.name}</span></div><span className="pr"><small>{t("from")}</small>{aed(a.base_price)}</span></div></div>
      <div className="glare" /><div className="cta">{t("Request a quick quote")}<ArrowRight className="h-4 w-4" /></div>
    </Link>)}</div>
    {artists.length === 0 && <p className="home-empty">{t("No featured artists in this category yet.")}</p>}
    <div className="see-all see-all-c rv"><p className="explore-ask">{t("WANT EXPLORE ALL PERFORMER ?")}</p><Button asChild className="btn btn-dark"><Link to="/$category" params={{ category }}>{t("See all talent")}<ArrowRight className="arr h-4 w-4" /></Link></Button></div>
  </div></section>;
}