import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { documentsPurged, expiryState, fileLabel, identityRequirements, type IdentityDetails } from "@/lib/admin-artists";
import { decideVerification, openVerificationFile } from "@/lib/verification.functions";
import { VERIFICATION_REASONS } from "@/lib/verification-rules";
import { dateLabel } from "./data";
import { StatusPill } from "./parts";

export function useApplications() {
  return useQuery({
    queryKey: ["admin-verif"],
    queryFn: async () => {
      const { data, error } = await supabase.from("verification_applications").select("*, verification_details(*), verification_files(*)").order("created_at", { ascending: false });
      if (error) throw new Error("Unable to load verification applications");
      return data ?? [];
    },
  });
}
export type Application = NonNullable<ReturnType<typeof useApplications>["data"]>[number];
export const detailsOf = (application: Application | undefined) => (application?.verification_details ?? null) as IdentityDetails | null;
export const requirementsOf = (application: Application | undefined) => identityRequirements(detailsOf(application), application?.verification_files.map((f) => f.kind) ?? []);
export const waiting = (application: Application) => application.status === "submitted" || application.status === "under_review" || application.status === "needs_more_info";

/** Opening a document goes through the server, which records who opened it and gives a two-minute link. */
export function DocumentButtons({ application }: { application: Application }) {
  const openFile = useServerFn(openVerificationFile);
  const purged = documentsPurged(application);
  const view = async (fileId?: string) => {
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    try {
      const result = await openFile({ data: fileId ? { applicationId: application.id, fileId } : { applicationId: application.id } });
      if (popup) popup.location.href = result.url;
      else toast.error("Allow pop-ups to view verification documents");
    } catch (error) { popup?.close(); toast.error(error instanceof Error ? error.message : "Could not open document"); }
  };
  const legacy = application.doc_path && !application.verification_files.some((file) => file.storage_path === application.doc_path);
  return (
    <div className="grid gap-2">
      <div className="adm-actions">
        {application.verification_files.map((file) => <Button key={file.id} size="sm" variant="outline" disabled={purged} onClick={() => void view(file.id)}>{fileLabel(file.kind)}</Button>)}
        {legacy && <Button size="sm" variant="outline" disabled={purged} onClick={() => void view()}>Legacy document</Button>}
      </div>
      {purged && <p className="adm-meta">Documents deleted under the 30-day privacy rule.</p>}
      {!purged && (application.verification_files.length > 0 || legacy) && <p className="adm-meta">Every document you open is recorded.</p>}
    </div>
  );
}

const addressText = (value: unknown) => (value && typeof value === "object" ? Object.values(value as Record<string, unknown>).filter(Boolean).join(", ") : "");

/** The latest application of one artist: what they sent, what is required and the admin's decision. */
export function VerificationPanel({ application }: { application: Application | undefined }) {
  const qc = useQueryClient();
  const saveDecision = useServerFn(decideVerification);
  const [reasons, setReasons] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const details = detailsOf(application);
  const requirements = requirementsOf(application);

  const decide = async (status: "approved" | "rejected" | "needs_more_info") => {
    if (!application) return;
    setBusy(true);
    try {
      const result = await saveDecision({ data: { applicationId: application.id, status, reasons: (reasons ?? application.reasons.join("\n")).split("\n").map((s) => s.trim()).filter(Boolean), admin_note: note ?? application.admin_note ?? "" } });
      if (!result.ok) { toast.error(result.error === "reasons_required" ? "Give at least one reason" : result.error); return; }
      toast.success(`Marked ${status.replace(/_/g, " ")}`);
      await Promise.all(["admin-verif", "admin-badges", "admin-overview"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save decision"); }
    finally { setBusy(false); }
  };
  const field = (label: string, value: string | null | undefined) => <div><dt>{label}</dt><dd>{value || (details?.redacted_at ? "Deleted for privacy" : "Not provided")}</dd></div>;

  return (
    <section className="adm-section" aria-label="Verification">
      <div className="adm-title"><h3 className="adm-heading">Verification{application ? ` · ${application.badge_type.replace("verified_", "")} application` : ""}</h3>{application ? <StatusPill status={application.status} /> : <span className="adm-pill">Not submitted</span>}</div>
      <ul className="adm-checks sm:grid-cols-2">{requirements.map((r) => <li key={r.label} className={r.ok ? "ok" : ""}>{r.label}<span className="sr-only">{r.ok ? " received" : " missing"}</span></li>)}</ul>
      {!application ? <p className="adm-meta">This artist has not sent identity documents yet.</p> : <>
        {details && <dl className="adm-dl">
          {field("Residency", details.residency === "foreign" ? "Outside the UAE" : "UAE resident")}
          {field("Full legal name", details.full_name)}
          {field("Document number", details.doc_number)}
          <div><dt>Expires</dt><dd className="flex flex-wrap items-center gap-2">{dateLabel(details.doc_expiry)}{details.doc_expiry && <span className={`adm-pill is-${expiryState(details.doc_expiry)}`}>{expiryState(details.doc_expiry) === "soon" ? "Expiring soon" : expiryState(details.doc_expiry)}</span>}</dd></div>
          {details.residency === "foreign" && <>{field("Date of birth", details.dob ? dateLabel(details.dob) : null)}{field("Nationality", details.nationality)}{field("Address", addressText(details.address))}</>}
          {field("Phone", details.phone ? `${details.phone}${details.phone_confirmed_at ? " (confirmed)" : ""}` : null)}
          {field("Submitted", dateLabel(application.created_at))}
        </dl>}
        {application.note && <p className="adm-meta">Artist note: {application.note}</p>}
        <DocumentButtons application={application} />
        <div className="grid gap-2">
          <label className="text-sm font-semibold" htmlFor={`reasons-${application.id}`}>What went wrong (needed to reject or ask for more)</label>
          <div className="adm-actions">{VERIFICATION_REASONS.map((reason) => <Button key={reason} size="sm" variant="outline" className="h-auto whitespace-normal py-1.5 text-start" onClick={() => setReasons([...new Set([...(reasons ?? application.reasons.join("\n")).split("\n").filter(Boolean), reason])].join("\n"))}>{reason}</Button>)}</div>
          <Textarea id={`reasons-${application.id}`} rows={3} placeholder="Choose a reason above or type one per line" value={reasons ?? application.reasons.join("\n")} onChange={(e) => setReasons(e.target.value)} />
          <Input aria-label="Note to artist" placeholder="Note to artist" value={note ?? application.admin_note ?? ""} onChange={(e) => setNote(e.target.value)} />
          <div className="adm-actions">
            <Button size="sm" disabled={busy || documentsPurged(application)} onClick={() => void decide("approved")}>Approve</Button>
            <Button size="sm" variant="outline" disabled={busy || documentsPurged(application)} onClick={() => void decide("needs_more_info")}>Need more info</Button>
            <Button size="sm" variant="ghost" disabled={busy || documentsPurged(application)} onClick={() => void decide("rejected")}>Reject</Button>
          </div>
        </div>
      </>}
    </section>
  );
}
