import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { expiryState, maskNumber } from "@/lib/admin-artists";
import { ArtistProfileDialog } from "./artists/ArtistProfileDialog";
import { dateLabel, useArtistPhotos, useArtists, useArtistStats } from "./artists/data";
import { Cover, ListState, StatusPill, usePaged } from "./artists/parts";
import { detailsOf, requirementsOf, useApplications, VerificationPanel, waiting } from "./artists/VerificationPanel";

const FILTERS = [["all", "All artists"], ["waiting", "Waiting for review"], ["expiry", "Expired or expiring"], ["missing", "Missing documents"], ["trn", "No TRN"]] as const;

/** One card per artist: the identity documents verification requires, their expiry and the tax number. */
export function AdminDocuments() {
  const query = useArtists();
  const applications = useApplications();
  const stats = useArtistStats().data;
  const log = useQuery({
    queryKey: ["admin-document-opens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("verification_access_log").select("application_id,opened_at").order("opened_at", { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<string | null>(null);
  const latest = (artistId: string) => applications.data?.find((a) => a.artist_id === artistId);
  const complete = (artistId: string) => requirementsOf(latest(artistId)).every((r) => r.ok);
  const expiry = (artistId: string) => expiryState(detailsOf(latest(artistId))?.doc_expiry);
  // What needs the admin first: a review, then an expiry, then submitted files.
  const urgency = (artistId: string) => { const app = latest(artistId); return !app ? 0 : waiting(app) ? 3 : expiry(artistId) === "expired" || expiry(artistId) === "soon" ? 2 : 1; };
  const rows = (query.data ?? []).filter((a) => {
    const app = latest(a.id);
    return a.stage_name.toLowerCase().includes(q.trim().toLowerCase()) && (
      filter === "all" ? true : filter === "waiting" ? !!app && waiting(app) : filter === "expiry" ? expiry(a.id) === "expired" || expiry(a.id) === "soon" : filter === "missing" ? !complete(a.id) : !a.trn?.trim());
  }).sort((a, b) => urgency(b.id) - urgency(a.id));
  const { slice, pager, first } = usePaged(rows);
  const photos = useArtistPhotos(slice);
  const viewed = query.data?.find((a) => a.id === viewing);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">UAE residents send both sides of the Emirates ID; others send a passport, date of birth, nationality and address. Everyone adds three selfies and confirms a phone number. Documents are deleted 30 days after a decision.</p>
      <div className="admin-toolbar">
        <Input aria-label="Search artists" placeholder="Search artist…" value={q} onChange={(e) => { setQ(e.target.value); first(); }} />
        <Select value={filter} onValueChange={(value) => { setFilter(value); first(); }}><SelectTrigger className="w-56" aria-label="Show"><SelectValue /></SelectTrigger><SelectContent>{FILTERS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <span className="ms-auto text-sm text-muted-foreground">{rows.length} artists</span>
      </div>
      <ListState pending={query.isPending || applications.isPending} error={query.error ?? applications.error} empty={rows.length ? null : "No artist matches these filters."}>
        <div className="adm-grid">
          {slice.map((a) => {
            const app = latest(a.id), details = detailsOf(app), requirements = requirementsOf(app), state = expiry(a.id);
            const opened = log.data?.find((entry) => entry.application_id === app?.id);
            return (
              <article key={a.id} className="adm-card">
                <Cover artist={a} photo={photos.get(a.id)} plan={stats?.get(a.id)?.plan_code ?? a.plan} />
                <div className="adm-body">
                  <div className="adm-title"><h2>{a.stage_name}</h2>{app ? <StatusPill status={app.status} /> : <span className="adm-pill">Not submitted</span>}</div>
                  <dl className="adm-stats">
                    <div><dt>Residency</dt><dd>{details ? (details.residency === "foreign" ? "Outside the UAE" : "UAE resident") : "—"}</dd></div>
                    <div><dt>Legal name</dt><dd>{details?.full_name ?? "—"}</dd></div>
                    <div><dt>Document number</dt><dd dir="ltr">{maskNumber(details?.doc_number)}</dd></div>
                    <div><dt>Expiry</dt><dd className="flex items-center gap-2">{dateLabel(details?.doc_expiry)}{state !== "unknown" && state !== "valid" && <span className={`adm-pill is-${state}`}>{state === "soon" ? "Expiring" : "Expired"}</span>}</dd></div>
                    <div><dt>TRN (tax number)</dt><dd dir="ltr">{a.trn?.trim() || "Not added"}</dd></div>
                  </dl>
                  <p className="adm-heading">Required · {requirements.filter((r) => r.ok).length} of {requirements.length}</p>
                  <ul className="adm-checks">{requirements.map((r) => <li key={r.label} className={r.ok ? "ok" : ""}>{r.label}<span className="sr-only">{r.ok ? " received" : " missing"}</span></li>)}</ul>
                  <div className="adm-foot"><span className="adm-meta">{opened ? `Documents last opened ${dateLabel(opened.opened_at)}` : "Documents not opened yet"}</span><Button size="sm" onClick={() => setViewing(a.id)} aria-label={`Review documents of ${a.stage_name}`}>Review</Button></div>
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
