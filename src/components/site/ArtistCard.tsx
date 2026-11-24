import { Link } from "@tanstack/react-router";
import { Star, BadgeCheck, Trophy, MapPin } from "lucide-react";
import type { ArtistCard as Card } from "@/lib/public.functions";
import { aed, initials } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function ArtistAvatar({ name, hue, src, className = "" }: { name: string; hue: number; src?: string | null | undefined; className?: string }) {
  if (src) return <div className={`overflow-hidden ${className}`}><img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" /></div>;
  return (
    <div
      className={`grid place-items-center font-display font-semibold text-night-foreground ${className}`}
      style={{ background: `linear-gradient(135deg, oklch(0.42 0.1 ${hue}), oklch(0.2 0.06 ${hue + 40}))` }}
    >
      {initials(name)}
    </div>
  );
}

export function ArtistCardView({ a, compact = false }: { a: Card; compact?: boolean }) {
  const verified = a.badges.some((b) => b.startsWith("verified"));
  const top = a.badges.includes("top_performer");
  const { t } = useI18n();
  return (
    <Link
      to="/artist/$slug"
      params={{ slug: a.slug }}
      className={`group rounded-2xl bg-card shadow-card overflow-hidden flex flex-col transition-transform hover:-translate-y-1 ${compact ? "home-artist-card" : ""}`}
    >
      <div className={compact ? "relative h-[150px] shrink-0" : "relative aspect-[4/3]"}>
        <ArtistAvatar name={a.stage_name} hue={a.hue} src={a.profilePhotoUrl} className="absolute inset-0 text-5xl" />
        <div className="absolute top-3 start-3 flex gap-1.5">
          {top && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-gold text-gold-foreground text-[11px] font-bold px-2 py-0.5">
              <Trophy className="h-3 w-3" /> {t("Top Performer")}
            </span>
          )}
          {verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card/90 text-primary text-[11px] font-bold px-2 py-0.5">
              <BadgeCheck className="h-3 w-3 text-success" /> {t("Verified")}
            </span>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{a.subcategory?.name}</div>
        <div className="font-display text-lg font-semibold group-hover:text-gold transition-colors">{a.stage_name}</div>
        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{a.tagline}</p>
        <div className="mt-3 flex items-center gap-3 text-sm">
          {a.stats.rating != null && (
            <span className="inline-flex items-center gap-1 font-semibold">
              <Star className="h-4 w-4 fill-gold text-gold" /> {a.stats.rating.toFixed(1)}
              <span className="text-muted-foreground font-normal">({a.stats.review_count})</span>
            </span>
          )}
          {a.stats.completed_orders != null && (
            <span className="text-muted-foreground">{a.stats.completed_orders} {t("bookings")}</span>
          )}
        </div>
        <div className="mt-auto pt-4 flex items-end justify-between">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {a.area?.name}
          </span>
          <span className="text-sm">
            {t("from")} <span className="font-bold text-base">{aed(a.base_price)}</span>
          </span>
        </div>
        {compact && <Button asChild variant="secondary" className="home-book mt-4 w-full"><span>{t("Book Artist")}</span></Button>}
      </div>
    </Link>
  );
}
