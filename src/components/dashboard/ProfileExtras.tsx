import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { useProfilePhoto } from "@/hooks/use-profile-photo";

const BUCKET = "artist-media";

/** Profile photo: uploads to the private artist-media bucket and stores the path on the artist row. */
export function ProfilePhoto({ artistId, name, photoPath, onSaved }: { artistId: string; name: string; photoPath: string | null; onSaved: () => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data: url } = useProfilePhoto(artistId, photoPath);
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

const BODY_FIELDS: Array<[string, string, "number" | "select"]> = [
  ["height_cm", "Height (cm)", "number"], ["weight_kg", "Weight (kg)", "number"], ["hair", "Hair color", "select"],
  ["eyes", "Eye color", "select"], ["clothing", "Clothing size", "select"], ["shoe_eu", "Shoe size (EU)", "number"],
];
const BODY_HINT: Record<string, string> = { height_cm: "120 to 230.", weight_kg: "30 to 200.", shoe_eu: "30 to 55." };
const BODY_OPTIONS: Record<string, string[]> = {
  hair: ["Black", "Dark brown", "Brown", "Light brown", "Blonde", "Red", "Grey or white", "Dyed", "Bald"],
  eyes: ["Brown", "Dark brown", "Hazel", "Green", "Blue", "Grey", "Black"],
  clothing: ["XS", "S", "M", "L", "XL", "XXL"],
};

/** Physical details stored in artists.body (keys limited by a database check). */
export function PhysicalFields({ body, onChange }: { body: Record<string, unknown>; onChange: (b: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const setKey = (k: string, v: string, numeric: boolean) => { const next = { ...body }; if (v === "") delete next[k]; else next[k] = numeric ? Number(v.replace(/\D/g, "")) : v; onChange(next); };
  return (
    <>
    <div className="dmr-pf-bd">
      {BODY_FIELDS.map(([k, label, kind]) => (
        <div key={k} className="dmr-qe-f">
          <label htmlFor={`body-${k}`}>{t(label)}</label>
          {kind === "select"
            ? <select id={`body-${k}`} value={String(body[k] ?? "")} onChange={(e) => setKey(k, e.target.value, false)}><option value="">{t("Choose")}</option>{[...new Set([...(BODY_OPTIONS[k] ?? []), ...(body[k] ? [String(body[k])] : [])])].map((o) => <option key={o}>{o}</option>)}</select>
            : <input id={`body-${k}`} inputMode="numeric" maxLength={k === "shoe_eu" ? 2 : 3} autoComplete="off" value={String(body[k] ?? "")} onChange={(e) => setKey(k, e.target.value, true)} />}
          <span className="dmr-f-hint">{BODY_HINT[k] ? t(BODY_HINT[k]!) : ""}</span>
        </div>
      ))}
    </div>
    <p className="dmr-cr-note" style={{ marginTop: 12 }}>{t("Shown to clients only on your model bookings and in casting requests.")}</p>
    </>
  );
}

const WORK_KINDS = ["Live show", "Corporate event", "Wedding", "Video", "Press", "Other"];
const WORK_LIMIT: Record<string, number> = { free: 3, basic: 6, medium: 12, pro: 24 };
const CLIENT_LIMIT = 10;
const ini = (n: string) => (n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const YEARS = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - i);

function usePlanCode(artistId: string) {
  return useQuery({ queryKey: ["effective-plan", artistId], queryFn: async () => ((await supabase.rpc("effective_artist_plan", { _artist: artistId })).data as string | null) ?? "free" });
}

function WorkImage({ path, title }: { path: string | null; title: string }) {
  const { data: url } = useQuery({ queryKey: ["work-img", path], enabled: !!path, staleTime: 50 * 60_000, queryFn: async () => (path ? (await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)).data?.signedUrl ?? null : null) });
  return <div className="dmr-im">{url ? <img src={url} alt={title} /> : ini(title)}</div>;
}

type Work = { id: string; title: string; year: number | null; kind: string | null; link: string | null; description: string | null; image_path: string | null };

/** Portfolio items (artist_portfolio): cards, an "Add work" tile and the add/edit window from the mock. */
export function PortfolioSection({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["portfolio", artistId];
  const { data = [] } = useQuery({ queryKey: key, queryFn: async () => ((await supabase.from("artist_portfolio").select("*").eq("artist_id", artistId).order("sort").order("created_at")).data ?? []) as Work[] });
  const plan = usePlanCode(artistId).data ?? "free";
  const max = WORK_LIMIT[plan] ?? 3;
  const full = data.length >= max;
  const [dlg, setDlg] = useState<{ work: Work | null } | null>(null);

  const remove = async (w: Work) => {
    if (!confirm(`${t("Remove")} "${w.title}"?`)) return;
    const { error } = await supabase.from("artist_portfolio").delete().eq("id", w.id);
    if (error) { toast.error(error.message); return; }
    if (w.image_path) await supabase.storage.from(BUCKET).remove([w.image_path]);
    toast.success(`"${w.title}" ${t("removed")}`);
    void qc.invalidateQueries({ queryKey: key });
  };
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
  return (
    <section id="pf-po-s" className="dmr-panel dmr-pf-sec" aria-labelledby="pf-po-h">
      <div className="dmr-a-top"><div><h2 className="dmr-serif" id="pf-po-h">{t("Portfolio of")} <span className="it">{t("work")}</span></h2><p>{t("Shows of yours that prove it. A photo makes each one far more convincing.")}</p></div>
        <div className={`dmr-pf-lim${full ? " full" : ""}`} style={{ margin: 0 }}><span><b>{data.length}</b> {t("of")} <b>{max}</b> {t("on the")} {planName} {t("plan")}</span></div></div>
      <div className="dmr-pf-works">
        {data.map((w) => (
          <article key={w.id} className="dmr-pf-w">
            <WorkImage path={w.image_path} title={w.title} />
            <div className="dmr-bd"><b>{w.title}</b><small>{[w.kind, w.year].filter(Boolean).join(" · ")}</small>{w.description && <p>{w.description}</p>}</div>
            <div className="dmr-ac">
              <button type="button" className="dmr-ab" aria-label={`${t("Edit")} ${w.title}`} onClick={() => setDlg({ work: w })}><Pencil /></button>
              <button type="button" className="dmr-ab del" aria-label={`${t("Remove")} ${w.title}`} onClick={() => void remove(w)}><Trash2 /></button>
            </div>
          </article>
        ))}
        <button type="button" className="dmr-pf-add" disabled={full} onClick={() => setDlg({ work: null })}><Plus />{full ? t("Plan limit reached") : t("Add work")}</button>
      </div>
      {dlg && <WorkDialog artistId={artistId} work={dlg.work} count={data.length} max={max} onClose={() => setDlg(null)} onSaved={() => { setDlg(null); void qc.invalidateQueries({ queryKey: key }); }} />}
    </section>
  );
}

function WorkDialog({ artistId, work, count, max, onClose, onSaved }: { artistId: string; work: Work | null; count: number; max: number; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ title: work?.title ?? "", year: String(work?.year ?? YEARS[0]), kind: work?.kind ?? "Live show", link: work?.link ?? "", description: work?.description ?? "" });
  const [file, setFile] = useState<File | null>(null);
  const [hints, setHints] = useState<{ title?: string; link?: string }>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => first.current?.focus(), 30);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { window.clearTimeout(id); window.removeEventListener("keydown", k); };
  }, []);
  const kinds = WORK_KINDS.includes(f.kind) ? WORK_KINDS : [...WORK_KINDS, f.kind];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = f.title.trim(), link = f.link.trim(); const h: { title?: string; link?: string } = {};
    if (title.length < 3) h.title = t("Give it a title of at least 3 characters.");
    if (link && !/^https:\/\/[^\s.]+\.[^\s]{2,}$/i.test(link)) h.link = t("Use a full link starting with https://");
    setHints(h);
    if (h.title || h.link) return;
    if (!work && count >= max) return setErr(`${t("Your plan allows")} ${max} ${t("works.")}`);
    setBusy(true); setErr("");
    try {
      let image_path = work?.image_path ?? null;
      if (file) {
        const path = `${artistId}/work-${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (up.error) throw new Error(up.error.message);
        if (image_path) await supabase.storage.from(BUCKET).remove([image_path]);
        image_path = path;
      }
      const row = { title: title.slice(0, 120), year: Number(f.year) || null, kind: f.kind || null, link: link || null, description: f.description.trim() || null, image_path };
      const res = work
        ? await supabase.from("artist_portfolio").update(row).eq("id", work.id)
        : await supabase.from("artist_portfolio").insert({ ...row, artist_id: artistId, sort: count + 1 });
      if (res.error) throw new Error(res.error.message);
      toast.success(work ? t("Work updated") : t("Work added"));
      onSaved();
    } catch (x) { setErr(x instanceof Error ? x.message : t("Could not save.")); } finally { setBusy(false); }
  };
  const choose = (fl: File | undefined) => {
    if (!fl) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(fl.type)) return setErr(t("Use a JPG, PNG or WebP photo."));
    if (fl.size > 5 * 1024 * 1024) return setErr(t("That photo is over 5 MB."));
    setErr(""); setFile(fl);
  };
  return (
    <div className="dmr-dlg-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dmr-tm-m" role="dialog" aria-modal="true" aria-labelledby="pw-h">
        <h2 className="dmr-serif" id="pw-h">{work ? t("Edit") : t("Add")} <span className="it">{t("work")}</span></h2>
        <p className="dmr-sub">{t("A show, video, press mention or project you want clients to see.")}</p>
        <form noValidate onSubmit={(e) => void submit(e)}>
          <div className="dmr-qe-f"><label htmlFor="pw-t">{t("Title")}</label><input ref={first} id="pw-t" maxLength={60} autoComplete="off" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><span className={`dmr-f-hint${hints.title ? " bad" : ""}`}>{hints.title ?? ""}</span></div>
          <div className="dmr-a-grid">
            <div className="dmr-qe-f"><label htmlFor="pw-y">{t("Year")}</label><select id="pw-y" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })}>{[...new Set([...YEARS.map(String), f.year])].map((y) => <option key={y}>{y}</option>)}</select></div>
            <div className="dmr-qe-f"><label htmlFor="pw-k">{t("Type")}</label><select id="pw-k" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{kinds.map((k) => <option key={k}>{k}</option>)}</select></div>
          </div>
          <div className="dmr-qe-f"><label htmlFor="pw-l">{t("Link (optional)")}</label><input id="pw-l" maxLength={200} autoComplete="off" placeholder="https://" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /><span className={`dmr-f-hint${hints.link ? " bad" : ""}`}>{hints.link ?? ""}</span></div>
          <div className="dmr-qe-f"><label htmlFor="pw-d">{t("Short description (optional)")} <span className="dmr-cnt">{f.description.length} / 200</span></label><textarea id="pw-d" maxLength={200} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="dmr-qe-f"><label>{t("Photo (optional)")}</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><button type="button" className="dmr-btn dmr-btn-line" style={{ padding: "9px 14px", fontSize: 12.5 }} onClick={() => pick.current?.click()}>{t("Choose photo")}</button><span className="dmr-f-hint" style={{ minHeight: 0 }}>{file ? file.name : work?.image_path ? t("Photo added") : t("JPG, PNG or WebP, up to 5 MB")}</span></div>
            <input ref={pick} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} /></div>
          <p className="dmr-qe-err" role="alert">{err}</p>
          <div className="dmr-dlg-b"><button type="button" className="dmr-btn dmr-btn-line" onClick={onClose}>{t("Cancel")}</button><button type="submit" className="dmr-btn dmr-btn-gold" disabled={busy}>{work ? t("Save work") : t("Add work")}</button></div>
        </form>
      </div>
    </div>
  );
}

type ClientRow = { id: string; name: string; year: number | null; is_public: boolean };

/** Past clients (artist_clients); public ones may be shown on the profile. */
export function ClientsSection({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["clients", artistId];
  const { data = [] } = useQuery({ queryKey: key, queryFn: async () => ((await supabase.from("artist_clients").select("*").eq("artist_id", artistId).order("created_at")).data ?? []) as ClientRow[] });
  const [name, setName] = useState("");
  const [year, setYear] = useState(String(YEARS[0]));
  const [err, setErr] = useState("");
  const add = async () => {
    const nm = name.trim().replace(/\s+/g, " ");
    if (nm.length < 2) return setErr(t("Enter the client name."));
    if (data.some((c) => c.name.toLowerCase() === nm.toLowerCase())) return setErr(t("That client is already in your list."));
    if (data.length >= CLIENT_LIMIT) return setErr(`${t("You can list up to")} ${CLIENT_LIMIT} ${t("clients.")}`);
    const { error } = await supabase.from("artist_clients").insert({ artist_id: artistId, name: nm.slice(0, 60), year: Number(year) || null, is_public: true });
    if (error) return setErr(error.message);
    setErr(""); setName(""); void qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (c: ClientRow) => {
    const { error } = await supabase.from("artist_clients").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${c.name} ${t("removed")}`);
    void qc.invalidateQueries({ queryKey: key });
  };
  const toggle = async (c: ClientRow, v: boolean) => {
    const { error } = await supabase.from("artist_clients").update({ is_public: v }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: key });
  };
  return (
    <section id="pf-cl-s" className="dmr-panel dmr-pf-sec" aria-labelledby="pf-cl-h">
      <div className="dmr-a-top"><div><h2 className="dmr-serif" id="pf-cl-h">{t("Clients you have")} <span className="it">{t("worked with")}</span></h2><p>{t("Companies and hosts you have performed for. Untick Public to keep one private.")}</p></div>
        <div className="dmr-pf-lim" style={{ margin: 0 }}><span><b>{data.length}</b> {t("of")} <b>{CLIENT_LIMIT}</b> {t("clients")}</span></div></div>
      <div className="dmr-pf-cl">
        {data.length ? data.map((c) => (
          <div key={c.id} className="dmr-pf-cr"><span className="dmr-lg" aria-hidden="true">{ini(c.name)}</span><b>{c.name}</b><small>{c.year ?? ""}</small>
            <label><input type="checkbox" checked={c.is_public} onChange={(e) => void toggle(c, e.target.checked)} />{t("Public")}</label>
            <button type="button" className="dmr-ab del" aria-label={`${t("Remove")} ${c.name}`} onClick={() => void remove(c)}><Trash2 /></button></div>
        )) : <div className="dmr-pf-empty">{t("No clients yet")}</div>}
      </div>
      <div className="dmr-pf-cadd">
        <div className="dmr-qe-f"><label htmlFor="pf-cn">{t("Client name")}</label><input id="pf-cn" maxLength={60} autoComplete="off" placeholder="e.g. Grand Hotel Events" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} /></div>
        <div className="dmr-qe-f"><label htmlFor="pf-cy">{t("Year")}</label><select id="pf-cy" value={year} onChange={(e) => setYear(e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></div>
        <button type="button" className="dmr-btn dmr-btn-gold" disabled={data.length >= CLIENT_LIMIT} onClick={() => void add()}><Plus width={14} height={14} />{t("Add client")}</button>
      </div>
      <p className="dmr-qe-err" role="alert">{err}</p>
    </section>
  );
}
