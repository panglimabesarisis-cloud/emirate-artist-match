import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { JobScore } from "@/lib/job-score";

type ProfileDetails = {
  categories: { name: string }[];
  specialties: { name: string }[];
  skills: string[];
  physicalDetails: { label: string; value: string }[];
  area: { name: string } | null;
  emirate: { name: string } | null;
  languages: string[];
  travel_radius_km: number | null;
  portfolio: { id: string; title: string; year: number | null; kind: string | null; description: string | null; link: string | null; imageUrl: string | null }[];
  clients: { id: string; name: string; year: number | null }[];
  jobScores?: { categories: JobScore[]; specialties: JobScore[] };
};

function ScoreBars({ title, rows }: { title: string; rows: JobScore[] }) {
  const { t } = useI18n();
  return <div className="mt-4"><h3>{t(title)}</h3><div className="mt-3 space-y-3">{rows.map((r) => {
    const tip = `${r.incoming} ${t("Incoming Job")}\n${r.done} ${t("Job Done")}\n${r.waiting} ${t("Job Waiting")}`;
    return <div key={r.name} title={tip} aria-label={`${r.name}: ${r.pct}%. ${tip}`} className="group relative cursor-default">
      <div className="flex justify-between text-sm"><span>{t(r.name)}</span><b dir="ltr">{r.pct}%</b></div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-gold" style={{ width: `${r.pct}%` }} /></div>
      <div role="tooltip" className="pointer-events-none absolute end-0 top-full z-10 mt-1 hidden whitespace-pre rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md group-hover:block">{tip}</div>
    </div>;
  })}</div></div>;
}

export function ArtistProfileDetails({ artist: a }: { artist: ProfileDetails }) {
  const { t } = useI18n();
  const details = [
    { label: "Base area", value: [a.area?.name, a.emirate?.name].filter(Boolean).join(", ") },
    { label: "Languages", value: a.languages.join(", ") },
    ...(a.travel_radius_km !== null ? [{ label: "Travel radius", value: `${a.travel_radius_km} ${t("km")}` }] : []),
    ...a.physicalDetails,
  ].filter(row => row.value);
  return <>
    <section className="artist-profile-section" aria-labelledby="artist-specialties">
      <h2 id="artist-specialties">{t("What I do")}</h2>
      <div className="artist-profile-capabilities">
      </div>
      {(a.jobScores?.categories.length ?? 0) > 0 && <ScoreBars title="Categories" rows={a.jobScores!.categories} />}
      {(a.jobScores?.specialties.length ?? 0) > 0 && <ScoreBars title="Specialities" rows={a.jobScores!.specialties} />}
      {a.skills.length > 0 && <><h3 className="mt-6">{t("Skills")}</h3><ul className="artist-profile-skills">{a.skills.map(skill => <li key={skill}>{skill}</li>)}</ul></>}
    </section>
    {details.length > 0 && <section className="artist-profile-section" aria-labelledby="artist-professional-details">
      <h2 id="artist-professional-details">{t("Profile details")}</h2>
      <dl className="artist-profile-detail-grid">{details.map(row => <div key={row.label}><dt>{t(row.label)}</dt><dd dir="auto">{row.value}</dd></div>)}</dl>
    </section>}
    {a.portfolio.length > 0 && <section className="artist-profile-section" aria-labelledby="artist-work">
      <h2 id="artist-work">{t("Portfolio of work")}</h2>
      <div className="artist-profile-works">{a.portfolio.map(work => <article key={work.id} className="artist-profile-work">
        <div className="artist-profile-work-image">{work.imageUrl ? <img src={work.imageUrl} alt={work.title} loading="lazy" /> : <span aria-hidden="true">{initials(work.title)}</span>}</div>
        <div><h3>{work.title}</h3><p className="text-sm text-muted-foreground">{[work.kind, work.year].filter(Boolean).join(", ")}</p>{work.description && <p className="mt-3 text-sm" dir="auto">{work.description}</p>}
          {work.link && <Button asChild variant="link" className="px-0"><a href={work.link} target="_blank" rel="noopener noreferrer">{t("View work")}</a></Button>}
        </div>
      </article>)}</div>
    </section>}
    {a.clients.length > 0 && <section className="artist-profile-section" aria-labelledby="artist-clients">
      <h2 id="artist-clients">{t("Clients I have worked with")}</h2>
      <table className="artist-profile-client-table"><thead><tr><th scope="col">{t("Client")}</th><th scope="col">{t("Year")}</th></tr></thead><tbody>{a.clients.map(client => <tr key={client.id}><td dir="auto">{client.name}</td><td>{client.year ?? "—"}</td></tr>)}</tbody></table>
    </section>}
  </>;
}