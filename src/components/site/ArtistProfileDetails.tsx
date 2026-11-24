import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";

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
};

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
        {a.categories.length > 0 && <div><h3>{t("Categories")}</h3><p>{a.categories.map(c => c.name).join(", ")}</p></div>}
        {a.specialties.length > 0 && <div><h3>{t("Specialities")}</h3><p>{a.specialties.map(c => c.name).join(", ")}</p></div>}
      </div>
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