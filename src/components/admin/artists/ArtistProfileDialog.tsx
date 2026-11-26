import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RatecardDetails } from "@/components/shared/RatecardDetails";
import { aed } from "@/lib/format";
import { publicPhysicalDetails } from "@/lib/public-profile";
import { categoryIdsOf, specialityIdsOf } from "@/lib/admin-artists";
import { missingProfileItems, profileChecks, profilePercent, reminderMessage } from "@/lib/profile-completeness";
import { dateLabel, signMedia, useCategories, useSpecialities, type AdminArtist } from "./data";
import { StatusPill } from "./parts";

function useProfileExtras(artist: AdminArtist) {
  return useQuery({
    queryKey: ["admin-artist-profile", artist.id],
    queryFn: async () => {
      const [account, rates, works, clients, media, reminder] = await Promise.all([
        supabase.rpc("admin_artist_account", { _artist: artist.id }),
        supabase.from("rate_cards").select("*").eq("artist_id", artist.id).order("sort"),
        supabase.from("artist_portfolio").select("*").eq("artist_id", artist.id).order("sort"),
        supabase.from("artist_clients").select("id,name,year,is_public").eq("artist_id", artist.id).order("created_at"),
        supabase.from("artist_media").select("id,kind,url,storage_path,caption").eq("artist_id", artist.id).order("sort"),
        supabase.from("artist_profile_reminders").select("id,created_at,resolved_at").eq("artist_id", artist.id).order("created_at", { ascending: false }).limit(1),
      ]);
      const failed = [account, rates, works, clients, media, reminder].find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
      const links = await signMedia([
        { artistId: artist.id, path: artist.photo_path },
        ...(media.data ?? []).map((m) => ({ artistId: artist.id, path: m.storage_path })),
        ...(works.data ?? []).map((w) => ({ artistId: artist.id, path: w.image_path })),
      ]);
      return { account: account.data?.[0], rates: rates.data ?? [], works: works.data ?? [], clients: clients.data ?? [], media: media.data ?? [], reminder: reminder.data?.[0], links };
    },
  });
}

const Field = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => {
  const empty = children === null || children === undefined || children === "" || (Array.isArray(children) && !children.length);
  return <div className={wide ? "wide" : undefined}><dt>{label}</dt><dd>{empty ? <span className="text-muted-foreground">Not filled in</span> : children}</dd></div>;
};
const Section = ({ title, children }: { title: string; children: ReactNode }) => <section className="adm-section"><h3 className="adm-heading">{title}</h3>{children}</section>;
const safeLink = (value: string | null) => (value && /^https:\/\//i.test(value) ? value : null);

/** Everything the artist entered at sign-up and on "Your profile", with a reminder for what is missing. */
export function ArtistProfileDialog({ artist, onClose, extra, actions }: { artist: AdminArtist; onClose: () => void; extra?: ReactNode; actions?: ReactNode }) {
  const qc = useQueryClient();
  const categories = useCategories().data ?? [];
  const specialities = useSpecialities().data ?? [];
  const query = useProfileExtras(artist);
  const d = query.data;
  const categoryNames = categoryIdsOf(artist).flatMap((id) => categories.find((c) => c.id === id)?.name ?? []);
  const specialityNames = specialityIdsOf(artist).flatMap((id) => specialities.find((s) => s.id === id)?.name ?? []);
  const checks = d ? profileChecks({
    stageName: artist.stage_name, tagline: artist.tagline, bio: artist.bio, basePrice: artist.base_price, languages: artist.languages, skills: artist.skills, body: artist.body,
    photoPath: artist.photo_path, categories: categoryNames, specialities: specialityNames, area: artist.areas?.name ?? "", portfolio: d.works.length, clients: d.clients.length,
  }) : [];
  const missing = missingProfileItems(checks);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const send = async () => {
    const text = message?.trim();
    if (!text) { toast.error("Write the reminder first"); return; }
    setSending(true);
    // Only one reminder stays open, so the dashboard never stacks old ones.
    const closed = await supabase.from("artist_profile_reminders").update({ resolved_at: new Date().toISOString() }).eq("artist_id", artist.id).is("resolved_at", null);
    const sent = closed.error ? closed : await supabase.from("artist_profile_reminders").insert({ artist_id: artist.id, missing, message: text.slice(0, 1000) });
    setSending(false);
    if (sent.error) { toast.error(sent.error.message); return; }
    toast.success("Reminder sent to the artist dashboard");
    setMessage(null);
    await qc.invalidateQueries({ queryKey: ["admin-artist-profile", artist.id] });
  };
  const body = publicPhysicalDetails(artist.body);
  const photo = artist.photo_path ? d?.links.get(artist.photo_path) : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-24px)] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="border-b p-5 pe-12 text-start">
          <DialogTitle className="flex flex-wrap items-center gap-3 font-display text-3xl">{artist.stage_name}<StatusPill status={artist.status} /></DialogTitle>
          <DialogDescription>{[categoryNames.join(", ") || "No category", artist.emirates?.name].filter(Boolean).join(" · ")} · joined {dateLabel(artist.created_at)}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
          {query.error ? <p role="alert" className="text-destructive">Could not load this profile. {query.error.message}</p> : !d ? <p role="status">Loading profile…</p> : <>
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3 text-sm"><b>Profile {profilePercent(checks)}% complete</b><span className="text-muted-foreground">{missing.length ? `${missing.length} missing` : "Nothing missing"}</span></div>
              <div className="adm-bar" aria-hidden="true"><i style={{ width: `${profilePercent(checks)}%` }} /></div>
              <ul className="adm-checks sm:grid-cols-2">{checks.map(([label, ok]) => <li key={label} className={ok ? "ok" : ""}>{label}<span className="sr-only">{ok ? " done" : " missing"}</span></li>)}</ul>
              {d.reminder && <p className="adm-meta">Last reminder {dateLabel(d.reminder.created_at)} · {d.reminder.resolved_at ? `closed ${dateLabel(d.reminder.resolved_at)}` : "still open on the artist dashboard"}</p>}
            </div>
            {extra}
            <Section title="Sign-up account">
              <dl className="adm-dl">
                <Field label="Full name">{d.account?.full_name}</Field>
                <Field label="Email">{d.account?.email}</Field>
                <Field label="Account phone">{d.account?.phone ? `${d.account.phone}${d.account.phone_verified_at ? " (verified)" : " (not verified)"}` : null}</Field>
                <Field label="Account created">{d.account ? dateLabel(d.account.registered_at) : null}</Field>
                <Field label="Registration IP">{d.account?.signup_ip ? `${d.account.signup_ip}${d.account.signup_ip_at ? ` · ${dateLabel(d.account.signup_ip_at)}` : ""}` : "Not recorded"}</Field>
                <Field label="Last seen IP">{d.account?.last_ip ? `${d.account.last_ip}${d.account.last_ip_at ? ` · ${dateLabel(d.account.last_ip_at)}` : ""}` : "Not recorded"}</Field>
                <Field label="Registration form">{artist.onboarding_complete ? "Finished" : "Not finished"}</Field>
                <Field label="Registration deposit">{artist.registration_paid_at ? `Paid ${dateLabel(artist.registration_paid_at)}` : "Not paid"}</Field>
                <Field label="Contract accepted">{artist.contract_accepted_at ? dateLabel(artist.contract_accepted_at) : null}</Field>
                <Field label="Plan chosen / current">{`${artist.intended_plan ?? "—"} / ${artist.plan}`}</Field>
              </dl>
            </Section>
            <Section title="About">
              <div className="flex flex-wrap items-start gap-4">
                {photo ? <img src={photo} alt={`${artist.stage_name} profile photo`} className="size-28 rounded-lg object-cover" /> : <div className="grid size-28 place-items-center rounded-lg border text-xs text-muted-foreground">No photo</div>}
                <dl className="adm-dl min-w-0 flex-1">
                  <Field label="Stage name">{artist.stage_name}</Field>
                  <Field label="Tagline">{artist.tagline}</Field>
                  <Field label="Bio" wide>{artist.bio}</Field>
                </dl>
              </div>
            </Section>
            <Section title="What they do">
              <dl className="adm-dl">
                <Field label="Categories">{categoryNames.join(", ")}</Field>
                <Field label="Specialities">{specialityNames.join(", ")}</Field>
                <Field label="Skills">{(artist.skills ?? []).join(", ")}</Field>
                <Field label="Event types">{(artist.event_type_slugs ?? []).join(", ")}</Field>
                {body.map((item) => <Field key={item.label} label={item.label}>{item.value}</Field>)}
              </dl>
            </Section>
            <Section title="Where, how much and contact">
              <dl className="adm-dl">
                <Field label="Emirate">{artist.emirates?.name}</Field>
                <Field label="Base area">{artist.areas?.name}</Field>
                <Field label="Starting price">{artist.base_price ? aed(Number(artist.base_price)) : null}</Field>
                <Field label="Travel radius">{artist.travel_radius_km != null ? `${artist.travel_radius_km} km` : null}</Field>
                <Field label="Travel charge">{artist.travel_surcharge_enabled ? `${aed(Number(artist.travel_fee_per_step))} per ${artist.travel_step_km} km beyond the radius` : "None"}</Field>
                <Field label="Languages">{(artist.languages ?? []).join(", ")}</Field>
                <Field label="WhatsApp for bookings">{artist.notify_phone}</Field>
                <Field label="Manager phone">{artist.manager_phone}</Field>
                <Field label="TRN">{artist.trn}</Field>
              </dl>
            </Section>
            <Section title={`Rate cards (${d.rates.length})`}>
              {d.rates.length ? d.rates.map((rate) => <div key={rate.id} className="grid gap-2"><b className="text-sm">{rate.title} · {aed(Number(rate.price))}</b><RatecardDetails rate={rate} /></div>) : <p className="adm-meta">No rate card saved.</p>}
            </Section>
            <Section title={`Photos and videos (${d.media.length})`}>
              {d.media.length ? <div className="adm-thumbs">{d.media.map((m) => { const url = (m.storage_path && d.links.get(m.storage_path)) || safeLink(m.url); return <a key={m.id} href={url ?? undefined} target="_blank" rel="noreferrer">{m.kind === "photo" && url ? <img src={url} alt={m.caption || `${artist.stage_name} media`} loading="lazy" /> : <span>{m.caption || (m.kind === "photo" ? "Photo unavailable" : "Open video")}</span>}</a>; })}</div> : <p className="adm-meta">No media uploaded.</p>}
            </Section>
            <Section title={`Portfolio (${d.works.length})`}>
              {d.works.length ? <dl className="adm-dl">{d.works.map((w) => { const link = safeLink(w.link), image = w.image_path ? d.links.get(w.image_path) : undefined; return <Field key={w.id} label={[w.kind, w.year].filter(Boolean).join(" · ") || "Work"}><b>{w.title}</b>{w.description ? <><br />{w.description}</> : null}{link && <><br /><a className="text-gold underline" href={link} target="_blank" rel="noreferrer">Open link</a></>}{image && <><br /><a className="text-gold underline" href={image} target="_blank" rel="noreferrer">Open image</a></>}</Field>; })}</dl> : <p className="adm-meta">No work added.</p>}
            </Section>
            <Section title={`Past clients (${d.clients.length})`}>
              {d.clients.length ? <div className="adm-chips">{d.clients.map((c) => <span key={c.id} className="adm-pill">{c.name}{c.year ? ` · ${c.year}` : ""}{c.is_public ? "" : " · private"}</span>)}</div> : <p className="adm-meta">No client added.</p>}
            </Section>
          </>}
        </div>
        {message !== null && (
          <div className="grid gap-2 border-t p-5">
            <label htmlFor="profile-reminder" className="text-sm font-semibold">Reminder shown on the artist dashboard</label>
            <Textarea id="profile-reminder" autoFocus rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setMessage(null)}>Cancel</Button><Button disabled={sending || !message.trim()} onClick={() => void send()}>{sending ? "Sending…" : "Send reminder"}</Button></div>
          </div>
        )}
        <DialogFooter className="flex-row flex-wrap items-center justify-end gap-2 border-t p-4 sm:space-x-0">
          {artist.status === "approved" && <Button asChild variant="ghost" className="me-auto"><Link to="/artist/$slug" params={{ slug: artist.slug }}>Public page</Link></Button>}
          {actions}
          {message === null && missing.length > 0 && <Button variant="secondary" onClick={() => setMessage(reminderMessage(artist.stage_name, missing))}>Notify</Button>}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
