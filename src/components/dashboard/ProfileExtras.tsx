import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ExternalLink, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { StudioEmpty, StudioSection } from "./StudioPage";
import { ChipInput } from "./ChipInput";

const BUCKET = "artist-media";

/** Profile photo: uploads to the private artist-media bucket and stores the path on the artist row. */
export function ProfilePhoto({ artistId, name, photoPath, onSaved }: { artistId: string; name: string; photoPath: string | null; onSaved: () => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: url } = useQuery({
    queryKey: ["profile-photo", artistId, photoPath],
    enabled: !!photoPath,
    queryFn: async () => (photoPath ? (await supabase.storage.from(BUCKET).createSignedUrl(photoPath, 3600)).data?.signedUrl ?? null : null),
  });
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("Choose an image file")); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t("Max 5 MB")); return; }
    setBusy(true);
    const path = `${artistId}/profile-${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); toast.error(t("Upload failed")); return; }
    const save = await supabase.from("artists").update({ photo_path: path }).eq("id", artistId);
    setBusy(false);
    if (save.error) { await supabase.storage.from(BUCKET).remove([path]); toast.error(save.error.message); return; }
    if (photoPath) await supabase.storage.from(BUCKET).remove([photoPath]);
    toast.success(t("Photo updated"));
    onSaved();
  };
  const removePhoto = async () => {
    if (!photoPath || !confirm(t("Remove your profile photo?"))) return;
    setBusy(true);
    const res = await supabase.from("artists").update({ photo_path: null }).eq("id", artistId);
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    await supabase.storage.from(BUCKET).remove([photoPath]);
    toast.success(t("Photo removed"));
    onSaved();
  };
  return (
    <div id="pf-photo" className="dmr-pf-ph">
      <div className="dmr-pf-av" aria-hidden="true">{url ? <img src={url} alt="" /> : initials(name)}</div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label={t("Upload photo")} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="dmr-btn dmr-btn-line" disabled={busy} onClick={() => input.current?.click()}>{busy ? t("Uploading…") : t("Upload photo")}</button>
      {photoPath && <button type="button" className="dmr-pf-rm" disabled={busy} onClick={() => void removePhoto()}>{t("Remove photo")}</button>}
      <small>{t("JPG, PNG or WebP, up to 5 MB. Cropped to a square.")}</small>
    </div>
  );
}

const SKILL_IDEAS = ["Crowd work", "Improvisation", "Live vocals", "Stage presence", "Scriptwriting", "Corporate events", "Weddings", "Arabic and English", "MC and hosting", "Sound check", "Own sound system", "Costume design", "Kids events", "Hotel galas", "Sketch writing", "Audience interaction"].map((n) => ({ n }));
const LANG_IDEAS = ["English", "Arabic", "Hindi", "Urdu", "Tagalog", "French", "Russian", "Persian", "Spanish", "Malayalam", "Bengali", "Italian", "German"].map((n) => ({ n }));

/** Skills as tags (artists.skills text[]), the same tag box as the mock. */
export function SkillsField({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const { t } = useI18n();
  return <ChipInput id="pf-sk" label={t("Skills")} values={skills} onChange={onChange} source={SKILL_IDEAS} max={15} noun="skill" placeholder={t("e.g. Crowd work, Arabic and English, Corporate events")} />;
}

/** Languages as tags (artists.languages text[]). */
export function LanguagesField({ languages, onChange }: { languages: string[]; onChange: (s: string[]) => void }) {
  const { t } = useI18n();
  return <ChipInput id="pf-lg" label={t("Languages")} values={languages} onChange={onChange} source={LANG_IDEAS} max={6} noun="language" placeholder={t("e.g. English, Arabic")} />;
}

const BODY_FIELDS: Array<[string, string, "number" | "text"]> = [
  ["height_cm", "Height (cm)", "number"], ["weight_kg", "Weight (kg)", "number"], ["hair", "Hair color", "text"],
  ["eyes", "Eye color", "text"], ["clothing", "Clothing size", "text"], ["shoe_eu", "Shoe size (EU)", "number"],
];
const BODY_HINT: Record<string, string> = { height_cm: "120 to 230.", weight_kg: "30 to 200.", shoe_eu: "30 to 55." };

/** Physical details stored in artists.body (keys limited by a database check). */
export function PhysicalFields({ body, onChange }: { body: Record<string, unknown>; onChange: (b: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  return (
    <>
    <div className="dmr-pf-bd">
      {BODY_FIELDS.map(([k, label, type]) => (
        <div key={k} className="dmr-qe-f">
          <label htmlFor={`body-${k}`}>{t(label)}</label>
          <input id={`body-${k}`} type={type} inputMode={type === "number" ? "numeric" : undefined} min={type === "number" ? 0 : undefined} maxLength={20} autoComplete="off" value={String(body[k] ?? "")}
            onChange={(e) => { const next = { ...body }; const v = e.target.value; if (v === "") delete next[k]; else next[k] = type === "number" ? Number(v) : v; onChange(next); }} />
          <span className="dmr-f-hint">{BODY_HINT[k] ? t(BODY_HINT[k]!) : ""}</span>
        </div>
      ))}
    </div>
    <p className="dmr-cr-note" style={{ marginTop: 12 }}>{t("Shown to clients only on your model bookings and in casting requests.")}</p>
    </>
  );
}

/** Portfolio items (artist_portfolio). Count is capped by the plan in the database. */
export function PortfolioSection({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["portfolio", artistId];
  const { data = [] } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("artist_portfolio").select("*").eq("artist_id", artistId).order("sort").order("created_at")).data ?? [] });
  const empty = { title: "", year: "", kind: "", link: "", description: "" };
  const [f, setF] = useState(empty);
  const add = async () => {
    if (!f.title.trim()) { toast.error(t("Add a title")); return; }
    const link = f.link.trim();
    if (link && !/^https?:\/\//i.test(link)) { toast.error(t("Links must start with http:// or https://")); return; }
    const { error } = await supabase.from("artist_portfolio").insert({
      artist_id: artistId, title: f.title.trim().slice(0, 120), year: f.year ? Number(f.year) : null, kind: f.kind.trim() || null,
      link: link || null, description: f.description.trim() || null, sort: data.length + 1,
    });
    if (error) { toast.error(error.message); return; }
    setF(empty); qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (id: string) => {
    if (!confirm(t("Remove this item?"))) return;
    const { error } = await supabase.from("artist_portfolio").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: key });
  };
  return (
    <StudioSection id="pf-po-s" title="Portfolio of" accent="work" subtitle="Shows of yours that prove it. A photo makes each one far more convincing.">
      {data.length === 0 && <StudioEmpty title="No portfolio items yet" />}
      <ul className="divide-y divide-border">
        {data.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <b className="block truncate text-sm">{p.title}{p.year ? ` · ${p.year}` : ""}</b>
              <span className="text-xs text-muted-foreground">{[p.kind, p.description].filter(Boolean).join(" · ")}</span>
              {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-gold underline"><ExternalLink className="h-3 w-3" />{t("Open link")}</a>}
            </div>
            <Button type="button" size="icon" variant="ghost" aria-label={t("Remove")} onClick={() => void remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="dmr-qe-f"><Label htmlFor="pf-title">{t("Title")}</Label><Input id="pf-title" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="dmr-qe-f"><Label htmlFor="pf-kind">{t("Type")}</Label><Input id="pf-kind" maxLength={40} placeholder={t("Event, video, campaign…")} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} /></div>
        <div className="dmr-qe-f"><Label htmlFor="pf-year">{t("Year")}</Label><Input id="pf-year" type="number" min={1980} max={2100} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} /></div>
        <div className="dmr-qe-f"><Label htmlFor="pf-link">{t("Link")}</Label><Input id="pf-link" type="url" placeholder="https://" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></div>
      </div>
      <div className="dmr-qe-f mt-3"><Label htmlFor="pf-desc">{t("Description")}</Label><Textarea id="pf-desc" rows={2} maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <Button type="button" className="mt-3" variant="outline" onClick={() => void add()}>{t("Add portfolio item")}</Button>
    </StudioSection>
  );
}

/** Past clients (artist_clients); public ones may be shown on the profile. */
export function ClientsSection({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["clients", artistId];
  const { data = [] } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("artist_clients").select("*").eq("artist_id", artistId).order("created_at")).data ?? [] });
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const add = async () => {
    if (!name.trim()) { toast.error(t("Add a client name")); return; }
    const { error } = await supabase.from("artist_clients").insert({ artist_id: artistId, name: name.trim().slice(0, 80), year: year ? Number(year) : null, is_public: isPublic });
    if (error) { toast.error(error.message); return; }
    setName(""); setYear(""); qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("artist_clients").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: key });
  };
  return (
    <StudioSection id="pf-cl-s" title="Clients you have" accent="worked with" subtitle="Companies and hosts you have performed for. Untick Public to keep one private.">
      {data.length === 0 && <StudioEmpty title="No clients yet" />}
      <ul className="divide-y divide-border">
        {data.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0 truncate"><b>{c.name}</b>{c.year ? ` · ${c.year}` : ""} <span className="text-xs text-muted-foreground">{c.is_public ? t("Public") : t("Private")}</span></span>
            <Button type="button" size="icon" variant="ghost" aria-label={`${t("Remove")} ${c.name}`} onClick={() => void remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="dmr-qe-f"><Label htmlFor="cl-name">{t("Client name")}</Label><Input id="cl-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="dmr-qe-f"><Label htmlFor="cl-year">{t("Year")}</Label><Input id="cl-year" type="number" min={1980} max={2100} value={year} onChange={(e) => setYear(e.target.value)} /></div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><Switch checked={isPublic} onCheckedChange={setIsPublic} />{t("Show on my public profile")}</label>
      <Button type="button" className="mt-3" variant="outline" onClick={() => void add()}>{t("Add client")}</Button>
    </StudioSection>
  );
}
