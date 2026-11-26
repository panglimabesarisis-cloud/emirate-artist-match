import { ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** The talent's two own addresses, shown as read-only fields that open the page. */
export function ProfileLinks({ slug, approved }: { slug: string; approved: boolean }) {
  const { t } = useI18n();
  const host = typeof window === "undefined" ? "" : window.location.host.replace(/^www\./, "");
  const rows = [
    { id: "pf-url", label: "URL Profile", path: `/artist/${slug}`, note: approved ? "" : "Clients can open it after your profile is approved." },
    { id: "pf-ai-url", label: "Personal AI Agent", path: `/ai/${slug}`, note: "" },
  ];
  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="dmr-qe-f">
          <label id={`${row.id}-l`}>{t(row.label)}</label>
          {/* A new tab keeps unsaved profile edits. */}
          <a id={row.id} className="dmr-pf-link" href={row.path} target="_blank" rel="noopener" aria-labelledby={`${row.id}-l ${row.id}`} dir="ltr">
            <span>{host}{row.path}</span><ArrowUpRight aria-hidden="true" />
          </a>
          {row.note && <span className="dmr-f-hint">{t(row.note)}</span>}
        </div>
      ))}
    </>
  );
}
