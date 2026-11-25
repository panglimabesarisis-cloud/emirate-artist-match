import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";
import { BADGE_NAMES, type AdminArtist } from "./data";
import "./admin-artists.css";

/** The corner ribbon shows the subscription: white Free, blue Basic, dark gold Medium, gold Pro. */
export function Cover({ artist, photo, plan, children }: { artist: Pick<AdminArtist, "stage_name">; photo?: string | undefined; plan?: string | undefined; children?: ReactNode }) {
  return (
    <div className="adm-cover">
      {photo ? <img src={photo} alt={`${artist.stage_name} photo`} loading="lazy" /> : <span className="adm-initials" aria-hidden="true">{initials(artist.stage_name)}</span>}
      {plan && <span className={`adm-ribbon is-${plan}`}><span className="sr-only">Subscription </span>{plan}</span>}
      {children && <div className="adm-cover-tags">{children}</div>}
    </div>
  );
}

export const StatusPill = ({ status }: { status: string }) => <span className={`adm-pill is-${status}`}>{status.replace(/_/g, " ")}</span>;
export const Badges = ({ badges }: { badges: string[] }) => <>{badges.map((badge) => <span key={badge} className="adm-pill is-badge">{BADGE_NAMES[badge] ?? badge}</span>)}</>;

/** Loading, failed and empty states share one place so no list is silently blank. */
export function ListState({ pending, error, empty, children }: { pending: boolean; error: unknown; empty: string | null; children: ReactNode }) {
  if (error) return <p role="alert" className="adm-empty text-destructive">Could not load this list. {error instanceof Error ? error.message : ""}</p>;
  if (pending) return <p className="adm-empty" role="status">Loading…</p>;
  if (empty) return <p className="adm-empty">{empty}</p>;
  return <>{children}</>;
}

export function usePaged<T>(list: T[], size = 12) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const at = Math.min(page, pages - 1);
  const pager = pages > 1 && (
    <nav className="adm-pager" aria-label="Pages">
      <span>Page {at + 1} of {pages}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={at === 0} onClick={() => setPage(at - 1)}>Previous</Button>
        <Button size="sm" variant="outline" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next</Button>
      </div>
    </nav>
  );
  return { slice: list.slice(at * size, (at + 1) * size), pager, first: () => setPage(0) };
}
