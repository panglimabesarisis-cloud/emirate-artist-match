import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArtistProfileDialog } from "./artists/ArtistProfileDialog";
import { BADGE_NAMES, dateLabel, useArtistPhotos, useArtists, useArtistStats, useBadges } from "./artists/data";
import { Badges, Cover, ListState, StatusPill, usePaged } from "./artists/parts";
import { detailsOf, requirementsOf, useApplications, VerificationPanel, waiting } from "./artists/VerificationPanel";

const MEANING: Record<string, string> = {
  verified_identity: "Identity documents approved by the admin.",
  verified_business: "Business documents approved by the admin.",
  verified_performer: "Performer application approved by the admin.",
  top_performer: "Recognised for strong performance.",
  top: "Monthly: top 10% of the category, 3+ clients, no disputes, paid plan and verified identity.",
};
const FILTERS = [["all", "All artists"], ["waiting", "Waiting for review"], ["verified", "Identity verified"], ["none", "Not submitted"]] as const;

export function AdminVerification() {
  const query = useArtists();
  const applications = useApplications();
  const badges = useBadges().data ?? [];
  const stats = useArtistStats().data;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<string | null>(null);
  const latest = (artistId: string) => applications.data?.find((a) => a.artist_id === artistId);
  const badgesOf = (artistId: string) => badges.filter((b) => b.artist_id === artistId).map((b) => b.badge);
  const rows = (query.data ?? []).filter((a) => {
    const app = latest(a.id);
    return a.stage_name.toLowerCase().includes(q.trim().toLowerCase()) &&
      (filter === "all" || (filter === "waiting" ? !!app && waiting(app) : filter === "verified" ? badgesOf(a.id).includes("verified_identity") : !app));
  }).sort((a, b) => Number(!!latest(b.id) && waiting(latest(b.id)!)) - Number(!!latest(a.id) && waiting(latest(a.id)!)));
  const { slice, pager, first } = usePaged(rows);
  const photos = useArtistPhotos(slice);
  const viewed = query.data?.find((a) => a.id === viewing);
  const queue = applications.data?.filter(waiting).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="adm-grid">
        {Object.entries(MEANING).map(([badge, meaning]) => (
          <section key={badge} className="adm-panel !gap-2">
            <div className="adm-title"><span className="adm-pill is-badge">{BADGE_NAMES[badge]}</span><b className="adm-money">{badges.filter((b) => b.badge === badge).length}</b></div>
            <p className="adm-meta">{meaning}</p>
          </section>
        ))}
      </div>
      <div className="admin-toolbar">
        <Input aria-label="Search artists" placeholder="Search artist…" value={q} onChange={(e) => { setQ(e.target.value); first(); }} />
        <Select value={filter} onValueChange={(value) => { setFilter(value); first(); }}><SelectTrigger className="w-56" aria-label="Show"><SelectValue /></SelectTrigger><SelectContent>{FILTERS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <span className="ms-auto text-sm text-muted-foreground">{queue} waiting for review · {rows.length} shown</span>
      </div>
      <ListState pending={query.isPending || applications.isPending} error={query.error ?? applications.error} empty={rows.length ? null : "No artist matches these filters."}>
        <div className="adm-grid">
          {slice.map((a) => {
            const app = latest(a.id), requirements = requirementsOf(app), done = requirements.filter((r) => r.ok).length;
            return (
              <article key={a.id} className="adm-card">
                <Cover artist={a} photo={photos.get(a.id)} plan={stats?.get(a.id)?.plan_code ?? a.plan}><Badges badges={badgesOf(a.id)} /></Cover>
                <div className="adm-body">
                  <div className="adm-title"><h2>{a.stage_name}</h2>{app ? <StatusPill status={app.status} /> : <span className="adm-pill">Not submitted</span>}</div>
                  <p className="adm-meta">Plan <b className="capitalize">{stats?.get(a.id)?.plan_code ?? a.plan}</b> · <b>{stats?.get(a.id)?.job_done ?? 0}</b> jobs done</p>
                  <p className="adm-meta">Documents <b>{done} of {requirements.length}</b> · Expires <b>{dateLabel(detailsOf(app)?.doc_expiry)}</b></p>
                  <div className="adm-foot"><span className="adm-meta">{app ? `Sent ${dateLabel(app.created_at)}` : "No application"}</span><Button size="sm" onClick={() => setViewing(a.id)} aria-label={`Preview ${a.stage_name}`}>Preview</Button></div>
                </div>
              </article>
            );
          })}
        </div>
      </ListState>
      {pager}
      {viewed && <ArtistProfileDialog artist={viewed} onClose={() => setViewing(null)} extra={<VerificationPanel key={latest(viewed.id)?.id ?? viewed.id} application={latest(viewed.id)} />} />}
    </div>
  );
}
