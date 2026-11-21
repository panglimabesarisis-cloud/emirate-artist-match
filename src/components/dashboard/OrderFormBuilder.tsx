import { FormTemplates } from "./FormTemplates";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { StudioHeading, StudioSection, StudioSoon } from "./StudioPage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OrderFieldType = "short" | "paragraph" | "choice" | "checkbox" | "dropdown" | "date" | "time" | "number";
export type OrderField = { id: string; label: string; type: OrderFieldType; required: boolean; options: string[] };

const TYPES: { v: OrderFieldType; l: string }[] = [
  { v: "short", l: "Short answer" }, { v: "paragraph", l: "Paragraph" }, { v: "choice", l: "Multiple choice" },
  { v: "checkbox", l: "Checkboxes" }, { v: "dropdown", l: "Dropdown" }, { v: "date", l: "Date" }, { v: "time", l: "Time" }, { v: "number", l: "Number" },
];
const hasOptions = (t: OrderFieldType) => t === "choice" || t === "checkbox" || t === "dropdown";
const newId = () => Math.random().toString(36).slice(2, 10);

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

/** Google-Form-style editor for an artist's custom booking questions, with live preview. */
export function OrderFormBuilder({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["order-form", artistId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: async () => {
    const { data } = await (supabase as any).from("artist_order_forms").select("*").eq("artist_id", artistId).maybeSingle();
    return data as { title: string; description: string | null; fields: OrderField[]; enabled: boolean } | null;
  } });
  const [title, setTitle] = useState("Booking details");
  const [desc, setDesc] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [fields, setFields] = useState<OrderField[]>([]);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setTitle(data.title); setDesc(data.description ?? ""); setEnabled(data.enabled); setFields(data.fields ?? []);
  }, [data]);

  const patch = (id: string, p: Partial<OrderField>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const move = (i: number, d: number) => setFields((fs) => { const n = [...fs]; const j = i + d; if (j < 0 || j >= n.length) return fs; const a = n[i]!; n[i] = n[j]!; n[j] = a; return n; });
  const add = () => setFields((fs) => [...fs, { id: newId(), label: "", type: "short", required: false, options: ["Option 1"] }]);

  const save = async () => {
    const clean = fields.map((f) => ({ ...f, label: f.label.trim().slice(0, 120), options: hasOptions(f.type) ? f.options.map((o) => o.trim()).filter(Boolean).slice(0, 20) : [] }));
    if (clean.some((f) => !f.label)) { toast.error(t("Every question needs a title")); return; }
    if (clean.some((f) => hasOptions(f.type) && f.options.length === 0)) { toast.error(t("Choice questions need at least one option")); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("artist_order_forms").upsert({ artist_id: artistId, title: title.trim() || "Booking details", description: desc.trim() || null, fields: clean, enabled, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Order form saved"));
    qc.invalidateQueries({ queryKey: key });
  };

  if (isLoading) return <div className="mt-6 text-sm text-muted-foreground">{t("Loading…")}</div>;

  return <div className="dmr-wrap dmr-ofpage"><StudioHeading title="Order" accent="form" /><div className="dmr-c-12"><FormTemplates artistId={artistId} onUsed={() => { void qc.invalidateQueries({ queryKey: key }); }} />      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-1">
          {(["edit", "preview"] as const).map((v) => (
            <Button variant="ghost" key={v} type="button" onClick={() => setTab(v)} className={`rounded-md px-4 py-1.5 text-sm ${tab === v ? "bg-gold text-gold-foreground" : "text-muted-foreground"}`}>{v === "edit" ? t("Questions") : t("Preview")}</Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={enabled} onCheckedChange={setEnabled} />{t("Show on my page")}</label>
          <Button onClick={save} disabled={saving} className="bg-gradient-gold text-gold-foreground">{saving ? t("Saving…") : t("Save form")}</Button>
        </div>
      </div>

</div><div className={`studio-order-layout ${tab === "preview" ? "is-preview" : "is-edit"}`}><div className="studio-order-editor space-y-4">
            <div className="studio-order-title">
              <Input className="border-0 border-b rounded-none text-2xl font-semibold px-0 focus-visible:ring-0" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("Form title")} />
              <Input className="border-0 border-b rounded-none px-0 focus-visible:ring-0" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={300} placeholder={t("Form description")} />
            </div>
            {fields.map((f, i) => (
              <div key={f.id} className="studio-order-question space-y-3">
                <div className="grid gap-2 md:grid-cols-[1fr_200px]">
                  <Input value={f.label} onChange={(e) => patch(f.id, { label: e.target.value })} placeholder={t("Question")} maxLength={120} />
                  <Select value={f.type} onValueChange={(v) => patch(f.id, { type: v as OrderFieldType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TYPES.map((tp) => <SelectItem key={tp.v} value={tp.v}>{t(tp.l)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {hasOptions(f.type) && (
                  <div className="space-y-2">
                    {f.options.map((o, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm w-5">{f.type === "dropdown" ? `${oi + 1}.` : f.type === "choice" ? "○" : "☐"}</span>
                        <Input value={o} onChange={(e) => patch(f.id, { options: f.options.map((x, xi) => (xi === oi ? e.target.value : x)) })} maxLength={80} />
                        <Button size="icon" variant="ghost" aria-label={t("Remove option")} onClick={() => patch(f.id, { options: f.options.filter((_, xi) => xi !== oi) })}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => patch(f.id, { options: [...f.options, `Option ${f.options.length + 1}`] })}>{t("+ Add option")}</Button>
                  </div>
                )}
                <div className="flex items-center justify-end gap-1 border-t pt-3">
                  <Button size="icon" variant="ghost" aria-label={t("Move up")} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={t("Move down")} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={t("Delete question")} onClick={() => setFields(fields.filter((x) => x.id !== f.id))}><Trash2 className="h-4 w-4" /></Button>
                  <label className="ms-3 flex items-center gap-2 text-sm">{t("Required")} <Switch checked={f.required} onCheckedChange={(v) => patch(f.id, { required: v })} /></label>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={add} disabled={fields.length >= 20}><Plus className="me-1 h-4 w-4" />{t("Add question")}</Button>
</div><aside className="studio-order-preview"><div className="dmr-ph"><h2>{t("Live")} <span className="it">{t("preview")}</span></h2><span className="studio-soon">{t(enabled ? "Visible" : "Hidden")}</span></div><div className="studio-order-paper"><h3 className="text-3xl">{title || t("Form title")}</h3>{desc && <p className="mt-3 text-sm">{desc}</p>}<p className="my-5 text-xs">{t("* Required")}</p>{fields.length === 0 ? <p className="text-sm">{t("No questions yet.")}</p> : <OrderFormFields fields={fields} values={preview} onChange={(id,v)=>setPreview({...preview,[id]:v})} />}</div></aside></div><StudioSection title="Form" accent="templates" className="dmr-c-12"><StudioSoon label="Ready-made templates" /></StudioSection></div>;

}
