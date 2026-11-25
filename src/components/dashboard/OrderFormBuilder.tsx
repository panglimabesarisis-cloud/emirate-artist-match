import { FormTemplates } from "./FormTemplates";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Copy, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { StudioHeading } from "./StudioPage";
import { useArtistPlan } from "./PromptLibrary";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OrderFieldType = "short" | "paragraph" | "choice" | "checkbox" | "dropdown" | "date" | "time" | "number";
export type OrderField = { id: string; label: string; type: OrderFieldType; required: boolean; options: string[] };

const TYPES: { v: OrderFieldType; l: string }[] = [
  { v: "short", l: "Short answer" }, { v: "paragraph", l: "Paragraph" }, { v: "choice", l: "Multiple choice" },
  { v: "checkbox", l: "Checkboxes" }, { v: "dropdown", l: "Dropdown" }, { v: "date", l: "Date" }, { v: "time", l: "Time" }, { v: "number", l: "Number" },
];
const hasOptions = (t: OrderFieldType) => t === "choice" || t === "checkbox" || t === "dropdown";
const newId = () => Math.random().toString(36).slice(2, 10);
const QUICK: [string, () => Omit<OrderField, "id">][] = [
  ["Event date", () => ({ label: "Event date", type: "date", required: true, options: [] })],
  ["Venue", () => ({ label: "Venue", type: "short", required: true, options: [] })],
  ["Guests", () => ({ label: "Number of guests", type: "number", required: false, options: [] })],
  ["Budget", () => ({ label: "Budget (AED)", type: "number", required: false, options: [] })],
  ["Event type", () => ({ label: "Event type", type: "dropdown", required: true, options: ["Wedding", "Corporate", "Birthday", "Other"] })],
  ["Phone", () => ({ label: "Phone (WhatsApp)", type: "short", required: false, options: [] })],
  ["Notes", () => ({ label: "Anything else we should know?", type: "paragraph", required: false, options: [] })],
  ["Requirement", () => ({ label: "Can you meet these requirements?", type: "checkbox", required: true, options: ["Sound system and microphone provided", "Secure changing room", "Parking on site", "Meal during the booking"] })],
];
/** The fallback form, used for any speciality the artist did not write one for. */
const ALL = "all";
type SavedForm = { id: string; title: string; description: string | null; fields: OrderField[]; enabled: boolean; subcategory_id: string | null };
const label = "text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground";
const paperInput = "w-full rounded-[10px] border border-[#d9d0bd] bg-white px-3 py-2.5 text-sm text-[#14172a] outline-none focus:outline-2 focus:outline-[#e8b04a]";

/** The cream paper a client sees. Controls here are for show; nothing is sent from the preview. */
function PaperForm({ title, desc, fields, shown, t }: { title: string; desc: string; fields: OrderField[]; shown: boolean; t: (s: string) => string }) {
  return (
    <div className="overflow-hidden rounded-[20px] bg-[#fbf7ef] text-[#1b1d2a] shadow-[0_20px_50px_rgba(0,0,0,.4)] lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto" data-shown={shown}>
      <div className="h-2 bg-[linear-gradient(100deg,#f0c062,#e8a33f_45%,#d4842a)]" />
      <div className="px-[22px] pb-6 pt-[22px]">
        <h3 className="font-display text-[30px] font-normal leading-[1.05] tracking-[.03em] text-[#14172a]">{title.trim() || t("Untitled form")}</h3>
        {desc.trim() && <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] text-[#5a5d6e]">{desc}</p>}
        {fields.length === 0 ? <div className="mt-[18px] rounded-xl border border-dashed border-[#d9d0bd] p-[18px] text-center text-[13px] text-[#7a7c8c]">{t("Your questions will appear here.")}</div> : fields.map((f) => {
          const l = <>{f.label.trim() || t("Untitled question")}{f.required && <span className="ms-0.5 text-[#c0392b]" aria-hidden>*</span>}</>;
          const opts = f.options.filter(Boolean);
          return (
            <div key={f.id} className="mt-[18px] grid gap-1.5">
              <b className="text-[13.5px] font-bold text-[#14172a]">{l}</b>
              {f.type === "paragraph" ? <textarea readOnly rows={3} className={`${paperInput} min-h-[84px]`} />
                : f.type === "dropdown" ? <select disabled className={paperInput}><option>{t("Choose")}</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
                : f.type === "choice" || f.type === "checkbox" ? opts.map((o) => <label key={o} className="flex items-center gap-2 py-0.5 text-sm text-[#2a2d3d]"><input disabled type={f.type === "choice" ? "radio" : "checkbox"} className="h-4 w-4 accent-[#d4842a]" />{o}</label>)
                : <input readOnly type={f.type === "short" ? "text" : f.type} className={paperInput} />}
            </div>
          );
        })}
        <button type="button" onClick={() => toast(t("Preview only. Nothing is sent from here."))} className="mt-[22px] w-full rounded-xl bg-[#14172a] py-[13px] text-sm font-bold text-white hover:bg-[#232846]">{t("Send request")}</button>
      </div>
    </div>
  );
}



/** Renders the custom questions for clients (used on the artist page and in preview). */
export function OrderFormFields({ fields, values, onChange }: { fields: OrderField[]; values: Record<string, string>; onChange: (id: string, v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const v = values[f.id] ?? "";
        const label = <Label className="text-xs">{f.label || t("Untitled question")}{f.required && <span className="text-destructive"> *</span>}</Label>;
        if (f.type === "paragraph") return <div key={f.id}>{label}<Textarea value={v} onChange={(e) => onChange(f.id, e.target.value)} maxLength={500} /></div>;
        if (f.type === "choice") return (
          <div key={f.id}>{label}{f.options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm"><input type="radio" className="accent-gold" name={f.id} checked={v === o} onChange={() => onChange(f.id, o)} />{o}</label>
          ))}</div>
        );
        if (f.type === "checkbox") {
          const set = v ? v.split(", ") : [];
          return (
            <div key={f.id}>{label}{f.options.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-gold" checked={set.includes(o)}
                onChange={(e) => onChange(f.id, (e.target.checked ? [...set, o] : set.filter((x) => x !== o)).join(", "))} />{o}</label>
            ))}</div>
          );
        }
        if (f.type === "dropdown") return (
          <div key={f.id}>{label}
            <Select value={v} onValueChange={(x) => onChange(f.id, x)}>
              <SelectTrigger><SelectValue placeholder={t("Choose")} /></SelectTrigger>
              <SelectContent>{f.options.filter(Boolean).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        );
        const type = f.type === "short" ? "text" : f.type;
        return <div key={f.id}>{label}<Input type={type} value={v} onChange={(e) => onChange(f.id, e.target.value)} maxLength={200} /></div>;
      })}
    </div>
  );
}

/** Editor for an artist's custom booking questions: questions on the left, the client's view on the right, ready-made templates below. */
export function OrderFormBuilder({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["order-form", artistId];
  const plan = useArtistPlan(artistId);
  const { data: forms, isLoading } = useQuery({ queryKey: key, queryFn: async () => {
    const { data } = await (supabase as any).from("artist_order_forms").select("*").eq("artist_id", artistId);
    return (data ?? []) as SavedForm[];
  } });
  // The category and specialities the artist already chose on their profile.
  const scopeQ = useQuery({ queryKey: ["form-scope", artistId], queryFn: async () => {
    const { data: a } = await supabase.from("artists").select("category_id, specialty_ids, categories(name)").eq("id", artistId).maybeSingle();
    const ids = a?.specialty_ids ?? [];
    const { data: subs } = ids.length ? await supabase.from("subcategories").select("id, name").in("id", ids) : { data: [] };
    return { categoryId: a?.category_id ?? null, categoryName: a?.categories?.name ?? null, specialities: (subs ?? []) as { id: string; name: string }[] };
  } });
  const [scope, setScope] = useState<string>(ALL);
  const current = (forms ?? []).find(f => (f.subcategory_id ?? ALL) === scope) ?? null;
  const limitQ = useQuery({ queryKey: ["form-limit", artistId, plan.data?.code], enabled: !!plan.data, queryFn: async () => (await supabase.from("plan_tiers").select("max_form_questions").eq("code", plan.data?.code ?? "free").maybeSingle()).data?.max_form_questions ?? 20 });
  const maxQ = Math.min(limitQ.data ?? 20, 40);
  const [title, setTitle] = useState("Booking details");
  const [desc, setDesc] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [fields, setFields] = useState<OrderField[]>([]);
  const [base, setBase] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const snapshot = JSON.stringify({ title: title.trim(), desc: desc.trim(), enabled, fields });

  useEffect(() => {
    if (isLoading) return;
    const f = current?.fields ?? [];
    setTitle(current?.title ?? "Booking details"); setDesc(current?.description ?? ""); setEnabled(current?.enabled ?? false); setFields(f);
    setBase(JSON.stringify({ title: (current?.title ?? "Booking details").trim(), desc: (current?.description ?? "").trim(), enabled: current?.enabled ?? false, fields: f }));
    setErrors({});
  }, [current, isLoading]);
  const dirty = base !== "" && snapshot !== base;

  const patch = (id: string, p: Partial<OrderField>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const move = (i: number, d: number) => setFields((fs) => { const n = [...fs]; const j = i + d; if (j < 0 || j >= n.length) return fs; const a = n[i]!; n[i] = n[j]!; n[j] = a; return n; });
  const addField = (f: Omit<OrderField, "id">) => {
    if (fields.length >= maxQ) { toast(`${t("Your plan allows")} ${maxQ} ${t("questions.")}`); return; }
    const id = newId();
    setFields((fs) => [...fs, { id, ...f }]);
    window.setTimeout(() => { const el = document.querySelector<HTMLElement>(`[data-q="${id}"] input`); el?.focus(); el?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 50);
  };
  const duplicate = (f: OrderField, i: number) => { if (fields.length >= maxQ) return; setFields((fs) => [...fs.slice(0, i + 1), { ...f, id: newId() }, ...fs.slice(i + 1)]); };
  const removeQ = (f: OrderField, i: number) => {
    setFields((fs) => fs.filter((x) => x.id !== f.id));
    toast(t("Question deleted"), { duration: 6000, action: { label: t("Undo"), onClick: () => setFields((fs) => { const n = [...fs]; n.splice(Math.min(i, n.length), 0, f); return n; }) } });
  };
  const setType = (f: OrderField, type: OrderFieldType) => patch(f.id, { type, options: hasOptions(type) ? (f.options.filter(Boolean).length >= 2 ? f.options : ["Option 1", "Option 2"]) : f.options });

  const validate = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 3) e["title"] = t("Give the form a title of at least 3 characters.");
    for (const f of fields) {
      if (!f.label.trim()) e[f.id] = t("Write the question.");
      else if (hasOptions(f.type) && f.options.filter((o) => o.trim()).length < 2) e[f.id] = t("Add at least 2 options.");
    }
    if (enabled && fields.length === 0) e["show"] = t("Add a question before showing the form.");
    return e;
  };
  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast.error(Object.values(e)[0]!); return; }
    const clean = fields.map((f) => ({ ...f, label: f.label.trim().slice(0, 120), options: hasOptions(f.type) ? f.options.map((o) => o.trim()).filter(Boolean).slice(0, 20) : [] }));
    setSaving(true);
    const row = { title: title.trim(), description: desc.trim() || null, fields: clean, enabled, updated_at: new Date().toISOString() };
    // Partial unique indexes make ON CONFLICT unreliable here, so pick the write explicitly.
    const { error } = current
      ? await (supabase as any).from("artist_order_forms").update(row).eq("id", current.id)
      : await (supabase as any).from("artist_order_forms").insert({ ...row, artist_id: artistId, category_id: scopeQ.data?.categoryId ?? null, subcategory_id: scope === ALL ? null : scope });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Order form saved"));
    void qc.invalidateQueries({ queryKey: key });
  };
  const toggleShow = (on: boolean) => { if (on && fields.length === 0) { toast(t("Add at least one question before showing the form.")); return; } setEnabled(on); };

  if (isLoading) return <div className="mt-6 text-sm text-muted-foreground">{t("Loading…")}</div>;
  const full = fields.length >= maxQ;

  return (
    <div className="dmr-wrap dmr-ofpage">
      <StudioHeading title="Order" accent="form">
        <div className="flex flex-wrap items-center gap-3.5">
          {dirty && <span role="status" className="text-[12.5px] font-bold text-gold">{t("Unsaved changes")}</span>}
          <label className="inline-flex cursor-pointer select-none items-center gap-2.5 text-[13.5px] font-bold"><Switch checked={enabled} onCheckedChange={toggleShow} aria-label={t("Show on my page")} />{t("Show on my page")}</label>
          <Button onClick={() => void save()} disabled={saving || !dirty} className="rounded-full bg-gradient-gold font-bold text-gold-foreground"><Check className="me-1.5 h-4 w-4" />{saving ? t("Saving…") : t("Save form")}</Button>
        </div>
      </StudioHeading>
      <p className="dmr-c-12 -mt-2 text-sm text-muted-foreground">{t("The questions a client answers when they book you. Edit on the left, see exactly what they see on the right, or start from a ready made template below.")}</p>
      {errors["show"] && <p role="alert" className="dmr-c-12 text-sm text-[#ff8a7a]">{errors["show"]}</p>}

      <section className="dmr-panel dmr-c-12" aria-label={t("Which booking this form is for")}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className={label} htmlFor="of-cat">{t("Category")}</label>
            <Input id="of-cat" readOnly value={scopeQ.data?.categoryName ? t(scopeQ.data.categoryName) : t("Not set yet")} className="h-11 rounded-xl" />
            <p className="text-xs text-muted-foreground">
              {t("Taken from your profile.")}{" "}
              <Link to="/dashboard" search={{ tab: "profile" }} className="font-bold text-gold underline underline-offset-2">{t("Change it in your profile")}</Link>
            </p>
          </div>
          <div className="space-y-2">
            <label className={label} htmlFor="of-spec">{t("Speciality")}</label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger id="of-spec" className="h-11 rounded-xl" aria-label={t("Speciality this form is for")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("All specialities (fallback)")}</SelectItem>
                {(scopeQ.data?.specialities ?? []).map(sp => <SelectItem key={sp.id} value={sp.id}>{t(sp.name)}{(forms ?? []).some(f => f.subcategory_id === sp.id) ? "" : ` — ${t("no form yet")}`}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {scope === ALL ? t("Used for any speciality without a form of its own.") : t("Clients booking this speciality see these questions.")}{" "}
              <Link to="/dashboard" search={{ tab: "profile" }} className="font-bold text-gold underline underline-offset-2">{t("Add a speciality in your profile")}</Link>
            </p>
          </div>
        </div>
      </section>

      <div className="dmr-c-12 grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <section className="dmr-panel border-t-4 !border-t-gold !pt-5" aria-label={t("Form title and description")}>
            <div className="space-y-2"><label htmlFor="of-ttl" className={label}>{t("Form title")}</label>
              <Input id="of-ttl" maxLength={80} autoComplete="off" value={title} aria-invalid={!!errors["title"]} onChange={(e) => setTitle(e.target.value)} className="h-[54px] rounded-xl font-display text-[26px] tracking-[.03em]" />
              <span className={`block min-h-4 text-xs ${errors["title"] ? "text-[#ff8a7a]" : "text-muted-foreground/70"}`}>{errors["title"] ?? ""}</span></div>
            <div className="mt-3.5 space-y-2"><label htmlFor="of-d" className={`${label} flex justify-between`}><span>{t("Form description")}</span><span className="normal-case tracking-normal">{desc.length} / 300</span></label>
              <Textarea id="of-d" rows={2} maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("A line that tells clients what to expect after they send this.")} className="rounded-xl" /></div>
          </section>

          <ol className="flex list-none flex-col gap-3" aria-label={t("Questions")}>
            {fields.map((f, i) => (
              <li key={f.id} data-q={f.id} className="grid gap-3 rounded-[18px] border border-border bg-[linear-gradient(180deg,#0f1426,#0a0e1b)] p-4 pb-3.5 focus-within:border-gold/45">
                <div className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-3 md:grid-cols-[30px_minmax(0,1fr)_168px]">
                  <span className="text-center font-display text-[26px] leading-none text-gold" aria-hidden>{i + 1}</span>
                  <Input value={f.label} maxLength={120} autoComplete="off" placeholder={t("Question")} aria-label={`${t("Question")} ${i + 1}`} aria-invalid={!!errors[f.id]} onChange={(e) => patch(f.id, { label: e.target.value })} className="h-11 rounded-xl" />
                  <div className="col-span-2 md:col-span-1">
                    <Select value={f.type} onValueChange={(v) => setType(f, v as OrderFieldType)}>
                      <SelectTrigger className="h-11 rounded-xl" aria-label={`${t("Answer type for question")} ${i + 1}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPES.map((tp) => <SelectItem key={tp.v} value={tp.v}>{t(tp.l)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {errors[f.id] && <span role="alert" className="ps-[42px] text-xs text-[#ff8a7a]">{errors[f.id]}</span>}
                {hasOptions(f.type) && (
                  <div className="grid gap-2 md:ps-[42px]">
                    {f.options.map((o, oi) => (
                      <div key={oi} className="grid grid-cols-[18px_minmax(0,1fr)_34px] items-center gap-2.5">
                        <i className={`h-3.5 w-3.5 border-[1.5px] border-muted-foreground/60 ${f.type === "checkbox" ? "rounded" : "rounded-full"}`} aria-hidden />
                        <Input value={o} maxLength={60} autoComplete="off" placeholder={`${t("Option")} ${oi + 1}`} aria-label={`${t("Option")} ${oi + 1}`} onChange={(e) => patch(f.id, { options: f.options.map((x, xi) => (xi === oi ? e.target.value : x)) })} className="h-10 rounded-xl" />
                        <Button type="button" size="icon" variant="ghost" aria-label={`${t("Remove option")} ${oi + 1}`} disabled={f.options.length <= 2} onClick={() => patch(f.id, { options: f.options.filter((_, xi) => xi !== oi) })}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <button type="button" onClick={() => patch(f.id, { options: [...f.options, ""] })} className="self-start px-1 py-1.5 text-[12.5px] font-bold text-gold underline underline-offset-[3px]">{t("Add option")}</button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-dashed border-border pt-2.5">
                  <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13.5px] font-bold"><Switch checked={f.required} onCheckedChange={(v) => patch(f.id, { required: v })} aria-label={`${t("Required")} ${i + 1}`} />{t("Required")}</label>
                  <div className="flex gap-1.5">
                    <Button type="button" size="icon" variant="ghost" aria-label={`${t("Move question")} ${i + 1} ${t("up")}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`${t("Move question")} ${i + 1} ${t("down")}`} disabled={i === fields.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`${t("Duplicate question")} ${i + 1}`} disabled={full} onClick={() => duplicate(f, i)}><Copy className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`${t("Delete question")} ${i + 1}`} onClick={() => removeQ(f, i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {fields.length === 0 && <div className="rounded-[18px] border border-dashed border-border p-[26px] text-center text-[13.5px] text-muted-foreground">{t("No questions yet. Add one below or start from a template.")}</div>}
          <div className="flex flex-wrap items-center gap-2.5 rounded-[18px] border border-dashed border-border px-4 py-3.5">
            <Button type="button" variant="outline" className="rounded-full" disabled={full} onClick={() => addField({ label: "", type: "short", required: false, options: [] })}><Plus className="me-1.5 h-3.5 w-3.5" />{t("Add question")}</Button>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{t("Quick add")}</span>
              {QUICK.map(([l, make]) => <button key={l} type="button" disabled={full} onClick={() => addField(make())} className="rounded-full border border-border px-2.5 py-[5px] text-xs font-bold text-foreground transition-colors hover:bg-gradient-gold hover:text-gold-foreground disabled:pointer-events-none disabled:opacity-40">{t(l)}</button>)}</div>
            <span className="ms-auto text-xs text-muted-foreground"><b className={full ? "text-gold" : "text-foreground"}>{fields.length}</b> {t("of")} <b className={full ? "text-gold" : "text-foreground"}>{maxQ}</b> {t("questions on the")} {plan.data?.mine?.name ?? ""} {t("plan")}</span>
          </div>
        </div>

        <aside className="min-w-0 self-start lg:sticky lg:top-[84px]" aria-label={t("Live preview")}>
          <div className="mb-3 flex items-center justify-between gap-2.5"><h2 className="font-display text-[22px] leading-none">{t("Live")} <span className="it">{t("preview")}</span></h2>
            <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-[11px] text-[10.5px] font-extrabold before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-[''] ${enabled ? "border-emerald-300/35 bg-emerald-300/[.08] text-emerald-300" : "border-border text-muted-foreground"}`}>{t(enabled ? "Shown on your page" : "Hidden")}</span></div>
          <PaperForm title={title} desc={desc} fields={fields} shown={enabled} t={t} />
        </aside>
      </div>

      <div className="dmr-c-12"><FormTemplates artistId={artistId} onUsed={() => { void qc.invalidateQueries({ queryKey: key }); }} /></div>
    </div>
  );
}
