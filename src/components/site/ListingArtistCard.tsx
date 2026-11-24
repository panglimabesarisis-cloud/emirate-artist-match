import { Link } from "@tanstack/react-router";
import { Star, BadgeCheck, Trophy, MapPin, ArrowUpRight } from "lucide-react";
import type { ArtistCard } from "@/lib/public.functions";
import { aed } from "@/lib/format";
import { ArtistAvatar } from "./ArtistCard";
import { useI18n } from "@/lib/i18n";

function MatchText({ text, match }: { text: string; match: string }) {
  if (!match) return <>{text}</>;
  const at = text.toLowerCase().indexOf(match.toLowerCase());
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + match.length)}</mark>{text.slice(at + match.length)}</>;
}
export function ListingArtistCard({ artist: a, match }: { artist: ArtistCard; match: string }) {
  const { t } = useI18n();
  return <Link to="/artist/$slug" params={{ slug: a.slug }} className="listing-artist">
    <div className="listing-portrait"><ArtistAvatar name={a.stage_name} hue={a.hue} src={a.profilePhotoUrl} className="absolute inset-0 text-7xl" /><div className="listing-badges">{a.badges.includes("top_performer") && <span><Trophy className="h-3 w-3" />{t("Top Performer")}</span>}{a.badges.some(b => b.startsWith("verified")) && <span><BadgeCheck className="h-3 w-3" />{t("Verified")}</span>}</div><ArrowUpRight className="listing-arrow h-6 w-6" /></div>
    <div className="listing-artist-body"><p className="listing-role"><MatchText text={a.subcategory?.name ?? a.category?.name ?? ""} match={match} /></p><h2><MatchText text={a.stage_name} match={match} /></h2><p className="listing-tagline">{a.tagline}</p><div className="listing-stats">{a.stats.rating !== null && <span><Star className="h-3 w-3" />{a.stats.rating.toFixed(1)} ({a.stats.review_count})</span>}{a.stats.completed_orders !== null && <span>{a.stats.completed_orders} {t("bookings")}</span>}</div><div className="listing-card-bottom"><span><MapPin className="h-3 w-3" />{a.area?.name ?? a.emirate?.name}</span><b><small>{t("from")}</small>{aed(a.base_price)}</b></div><p className="listing-quote">{t("Request a quick quote")} →</p></div>
  </Link>;
}