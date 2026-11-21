import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const card = "rounded-xl border bg-card";
const field = "space-y-1.5";

function useTiers() {
  return useQuery({ queryKey: ["admin-tiers"], queryFn: async () => (await supabase.from("plan_tiers").select("code, name, sort").order("sort")).data ?? [] });
}

/* ---------------------------------------------------------------- AI prompts */

type PromptDraft = { id?: string; kind: "inst" | "know"; title: string; category: string; description: string; body: string; applies_when: string; priority: string; tier: string; price_aed: string; is_active: boolean };
const blankPrompt: PromptDraft = { kind: "inst", title: "", category: "", description: "", body: "", applies_when: "", priority: "medium", tier: "free", price_aed: "0", is_active: true };

export function AdminPrompts() {
  const qc = useQueryClient();
  const tiers = useTiers();
  const [edit, setEdit] = useState<PromptDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const list = useQuery({
    queryKey: ["admin-prompts"],
    queryFn: async () => (await supabase.from("agent_prompts").select("id, kind, title, category, description, applies_when, priority, tier, price_aed, is_active, updated_at").order("title")).data ?? [],
  });

  const open = async (row?: NonNullable<typeof list.data>[number]) => {
    if (!row) { setEdit({ ...blankPrompt }); return; }
    // The prompt text is hidden from normal reads; admins fetch it through a guarded function.
    const bodies = await supabase.rpc("admin_agent_prompt_bodies");
    if (bodies.error) { toast.error(bodies.error.message); return; }
    setEdit({
      id: row.id, kind: row.kind as "inst" | "know", title: row.title, category: row.category ?? "", description: row.description ?? "",
      body: bodies.data?.find((b) => b.id === row.id)?.body ?? "", applies_when: row.applies_when ?? "", priority: row.priority, tier: row.tier, price_aed: String(row.price_aed), is_active: row.is_active,
    });
  };
  const save = async () => {
    if (!edit) return;
    const price = Number(edit.price_aed);
    if (!edit.title.trim() || !edit.body.trim()) { toast.error("Title and prompt text are required"); return; }
    if (!Number.isFinite(price) || price < 0) { toast.error("Price must be 0 or more"); return; }
    const row = {
      kind: edit.kind, title: edit.title.trim(), category: edit.category.trim() || null, description: edit.description.trim() || null, body: edit.body,
      applies_when: edit.applies_when.trim() || null, priority: edit.priority, tier: edit.tier, price_aed: price, is_active: edit.is_active, updated_at: new Date().toISOString(),
    };
    setSaving(true);
    const { error } = edit.id ? await supabase.from("agent_prompts").update(row).eq("id", edit.id) : await supabase.from("agent_prompts").insert(row);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Prompt saved"); setEdit(null); void qc.invalidateQueries({ queryKey: ["admin-prompts"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this prompt? Artists who enabled it lose it. Purchases are removed too.")) return;
    const { error } = await supabase.from("agent_prompts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["admin-prompts"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Library of instructions and knowledge artists can switch on. Prompt text is never shown to artists.</p>
        <Button onClick={() => void open()}><Plus className="me-1 h-4 w-4" />New prompt</Button>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start text-xs uppercase text-muted-foreground"><tr>{["Title", "Type", "Tier", "Price (AED)", "Status", ""].map((h) => <th key={h} className="p-3 text-start">{h}</th>)}</tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No prompts yet.</td></tr>}
            {list.data?.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3"><b>{p.title}</b><div className="text-xs text-muted-foreground">{p.category ?? ""}</div></td>
                <td className="p-3">{p.kind === "know" ? "Knowledge" : "Instruction"}</td>
                <td className="p-3 capitalize">{p.tier}</td>
                <td className="p-3">{Number(p.price_aed) > 0 ? Number(p.price_aed).toFixed(0) : "Free"}</td>
                <td className="p-3"><Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Hidden"}</Badge></td>
                <td className="p-3 text-end whitespace-nowrap">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${p.title}`} onClick={() => void open(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${p.title}`} onClick={() => void remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => { if (!o && !saving) setEdit(null); }}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit prompt" : "New prompt"}</DialogTitle><DialogDescription>The text below is hidden from artists and added under the agent's pricing and safety rules.</DialogDescription></DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={field}><Label htmlFor="pr-title">Title</Label><Input id="pr-title" maxLength={100} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
              <div className={field}><Label htmlFor="pr-cat">Category</Label><Input id="pr-cat" maxLength={40} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></div>
              <div className={field}><Label>Type</Label>
                <Select value={edit.kind} onValueChange={(v) => setEdit({ ...edit, kind: v as "inst" | "know" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inst">Instruction</SelectItem><SelectItem value="know">Knowledge</SelectItem></SelectContent></Select></div>
              <div className={field}><Label>Priority</Label>
                <Select value={edit.priority} onValueChange={(v) => setEdit({ ...edit, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select></div>
              <div className={field}><Label>Plan tier</Label>
                <Select value={edit.tier} onValueChange={(v) => setEdit({ ...edit, tier: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{tiers.data?.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent></Select></div>
              <div className={field}><Label htmlFor="pr-price">Price (AED, excl. VAT; 0 = free)</Label><Input id="pr-price" type="number" min={0} value={edit.price_aed} onChange={(e) => setEdit({ ...edit, price_aed: e.target.value })} /></div>
              <div className={`${field} sm:col-span-2`}><Label htmlFor="pr-desc">Description shown to artists</Label><Textarea id="pr-desc" rows={2} maxLength={300} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div className={`${field} sm:col-span-2`}><Label htmlFor="pr-when">Applies when</Label><Input id="pr-when" maxLength={160} value={edit.applies_when} onChange={(e) => setEdit({ ...edit, applies_when: e.target.value })} /></div>
              <div className={`${field} sm:col-span-2`}><Label htmlFor="pr-body">Prompt text (hidden from artists)</Label><Textarea id="pr-body" rows={9} maxLength={4000} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={edit.is_active} onCheckedChange={(c) => setEdit({ ...edit, is_active: c })} />Visible in the artist library</label>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save prompt"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------------------------------------- Form templates */

type FormDraft = { id?: string; name: string; category: string; description: string; tier: string; price_aed: string; is_active: boolean; fields: string };
const sampleFields = JSON.stringify([{ id: "q1", label: "Venue name", type: "short", required: true, options: [] }], null, 2);
const FIELD_TYPES = ["short", "long", "choice", "checkbox", "dropdown", "date", "time", "number"];

function parseFields(text: string): { ok: true; value: Json } | { ok: false; error: string } {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, error: "Questions must be valid JSON" }; }
  if (!Array.isArray(v) || v.length === 0) return { ok: false, error: "Add at least one question" };
  if (v.length > 40) return { ok: false, error: "At most 40 questions" };
  for (const q of v as Array<Record<string, unknown>>) {
    if (!q || typeof q !== "object" || typeof q["id"] !== "string" || typeof q["label"] !== "string" || !String(q["label"]).trim()) return { ok: false, error: "Every question needs an id and a label" };
    if (typeof q["type"] !== "string" || !FIELD_TYPES.includes(q["type"])) return { ok: false, error: `Question type must be one of: ${FIELD_TYPES.join(", ")}` };
  }
  return { ok: true, value: v as Json };
}

export function AdminFormTemplates() {
  const qc = useQueryClient();
  const tiers = useTiers();
  const [edit, setEdit] = useState<FormDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const list = useQuery({
    queryKey: ["admin-form-templates"],
    queryFn: async () => (await supabase.from("order_form_templates").select("id, name, category, description, tier, price_aed, is_active, question_count").order("name")).data ?? [],
  });
  const open = async (row?: NonNullable<typeof list.data>[number]) => {
    if (!row) { setEdit({ name: "", category: "", description: "", tier: "free", price_aed: "0", is_active: true, fields: sampleFields }); return; }
    const res = await supabase.rpc("admin_order_form_template_fields", { _id: row.id });
    if (res.error) { toast.error(res.error.message); return; }
    setEdit({ id: row.id, name: row.name, category: row.category ?? "", description: row.description ?? "", tier: row.tier, price_aed: String(row.price_aed), is_active: row.is_active, fields: JSON.stringify(res.data ?? [], null, 2) });
  };
  const save = async () => {
    if (!edit) return;
    const parsed = parseFields(edit.fields);
    if (!edit.name.trim()) { toast.error("Name is required"); return; }
    if (!parsed.ok) { toast.error(parsed.error); return; }
    const price = Number(edit.price_aed);
    if (!Number.isFinite(price) || price < 0) { toast.error("Price must be 0 or more"); return; }
    const row = { name: edit.name.trim(), category: edit.category.trim() || null, description: edit.description.trim() || null, tier: edit.tier, price_aed: price, is_active: edit.is_active, fields: parsed.value, updated_at: new Date().toISOString() };
    setSaving(true);
    const { error } = edit.id ? await supabase.from("order_form_templates").update(row).eq("id", edit.id) : await supabase.from("order_form_templates").insert(row);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Template saved"); setEdit(null); void qc.invalidateQueries({ queryKey: ["admin-form-templates"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this template? Forms artists already copied stay as they are.")) return;
    const { error } = await supabase.from("order_form_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["admin-form-templates"] });
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Ready-made order forms. Artists see the name, price and question count; the questions unlock when free or bought.</p>
        <Button onClick={() => void open()}><Plus className="me-1 h-4 w-4" />New template</Button>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Name", "Questions", "Tier", "Price (AED)", "Status", ""].map((h) => <th key={h} className="p-3 text-start">{h}</th>)}</tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No templates yet.</td></tr>}
            {list.data?.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-3"><b>{t.name}</b><div className="text-xs text-muted-foreground">{t.category ?? ""}</div></td>
                <td className="p-3">{t.question_count ?? 0}</td>
                <td className="p-3 capitalize">{t.tier}</td>
                <td className="p-3">{Number(t.price_aed) > 0 ? Number(t.price_aed).toFixed(0) : "Free"}</td>
                <td className="p-3"><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Active" : "Hidden"}</Badge></td>
                <td className="p-3 text-end whitespace-nowrap">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => void open(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => void remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => { if (!o && !saving) setEdit(null); }}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit form template" : "New form template"}</DialogTitle><DialogDescription>Questions are a JSON list: id, label, type ({FIELD_TYPES.join(", ")}), required, options.</DialogDescription></DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={field}><Label htmlFor="ft-name">Name</Label><Input id="ft-name" maxLength={100} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className={field}><Label htmlFor="ft-cat">Category</Label><Input id="ft-cat" maxLength={40} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></div>
              <div className={field}><Label>Plan tier</Label>
                <Select value={edit.tier} onValueChange={(v) => setEdit({ ...edit, tier: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{tiers.data?.map((t) => <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>)}</SelectContent></Select></div>
              <div className={field}><Label htmlFor="ft-price">Price (AED, excl. VAT; 0 = free)</Label><Input id="ft-price" type="number" min={0} value={edit.price_aed} onChange={(e) => setEdit({ ...edit, price_aed: e.target.value })} /></div>
              <div className={`${field} sm:col-span-2`}><Label htmlFor="ft-desc">Description</Label><Textarea id="ft-desc" rows={2} maxLength={300} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div className={`${field} sm:col-span-2`}><Label htmlFor="ft-fields">Questions (JSON)</Label><Textarea id="ft-fields" rows={12} className="font-mono text-xs" value={edit.fields} onChange={(e) => setEdit({ ...edit, fields: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={edit.is_active} onCheckedChange={(c) => setEdit({ ...edit, is_active: c })} />Visible in the artist library</label>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save template"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------------------------------------- AI model rates */

type RateDraft = { model: string; label: string; usd_in_per_mtok: string; usd_cached_per_mtok: string; usd_out_per_mtok: string; effective_from: string; is_active: boolean; isNew: boolean };

export function AdminModelRates() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<RateDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const list = useQuery({ queryKey: ["admin-model-rates"], queryFn: async () => (await supabase.from("ai_model_rates").select("*").order("model")).data ?? [] });
  const save = async () => {
    if (!edit) return;
    const nums = [edit.usd_in_per_mtok, edit.usd_cached_per_mtok, edit.usd_out_per_mtok].map(Number);
    if (!edit.model.trim() || nums.some((n) => !Number.isFinite(n) || n < 0)) { toast.error("Model id and non-negative prices are required"); return; }
    const row = { model: edit.model.trim(), label: edit.label.trim() || null, usd_in_per_mtok: nums[0]!, usd_cached_per_mtok: nums[1]!, usd_out_per_mtok: nums[2]!, effective_from: edit.effective_from, is_active: edit.is_active };
    setSaving(true);
    const { error } = edit.isNew ? await supabase.from("ai_model_rates").insert(row) : await supabase.from("ai_model_rates").update(row).eq("model", edit.model);
    setSaving(false);
    if (error) { toast.error(error.code === "23505" ? "This model already has a rate" : error.message); return; }
    toast.success("Rate saved"); setEdit(null); void qc.invalidateQueries({ queryKey: ["admin-model-rates"] });
  };
  const remove = async (model: string) => {
    if (!confirm(`Delete the rate for ${model}? Past usage keeps its saved rate snapshot.`)) return;
    const { error } = await supabase.from("ai_model_rates").delete().eq("model", model);
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: ["admin-model-rates"] });
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">USD price per million tokens for each gateway model. Enter the provider's published prices; costs in artist usage reports are calculated from these rows.</p>
        <Button onClick={() => setEdit({ model: "", label: "", usd_in_per_mtok: "0", usd_cached_per_mtok: "0", usd_out_per_mtok: "0", effective_from: today, is_active: true, isNew: true })}><Plus className="me-1 h-4 w-4" />Add rate</Button>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Model", "Input $/M", "Cached $/M", "Output $/M", "From", "Status", ""].map((h) => <th key={h} className="p-3 text-start">{h}</th>)}</tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No rates yet. Costs stay blank until a rate exists for the model the agent uses.</td></tr>}
            {list.data?.map((r) => (
              <tr key={r.model} className="border-t">
                <td className="p-3"><b>{r.label || r.model}</b><div className="font-mono text-xs text-muted-foreground">{r.model}</div></td>
                <td className="p-3">{Number(r.usd_in_per_mtok)}</td><td className="p-3">{Number(r.usd_cached_per_mtok)}</td><td className="p-3">{Number(r.usd_out_per_mtok)}</td>
                <td className="p-3">{r.effective_from}</td>
                <td className="p-3"><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Off"}</Badge></td>
                <td className="p-3 text-end whitespace-nowrap">
                  <Button size="icon" variant="ghost" aria-label={`Edit ${r.model}`} onClick={() => setEdit({ model: r.model, label: r.label ?? "", usd_in_per_mtok: String(r.usd_in_per_mtok), usd_cached_per_mtok: String(r.usd_cached_per_mtok), usd_out_per_mtok: String(r.usd_out_per_mtok), effective_from: r.effective_from, is_active: r.is_active, isNew: false })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Delete ${r.model}`} onClick={() => void remove(r.model)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => { if (!o && !saving) setEdit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.isNew ? "Add model rate" : "Edit model rate"}</DialogTitle><DialogDescription>Prices are in US dollars per one million tokens.</DialogDescription></DialogHeader>
          {edit && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className={field}><Label htmlFor="mr-model">Gateway model id</Label><Input id="mr-model" disabled={!edit.isNew} placeholder="openai/gpt-5.6-luna" value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} /></div>
              <div className={field}><Label htmlFor="mr-label">Label</Label><Input id="mr-label" maxLength={60} value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></div>
              <div className={field}><Label htmlFor="mr-in">Input $ / M tokens</Label><Input id="mr-in" type="number" min={0} step="0.0001" value={edit.usd_in_per_mtok} onChange={(e) => setEdit({ ...edit, usd_in_per_mtok: e.target.value })} /></div>
              <div className={field}><Label htmlFor="mr-cached">Cached input $ / M tokens</Label><Input id="mr-cached" type="number" min={0} step="0.0001" value={edit.usd_cached_per_mtok} onChange={(e) => setEdit({ ...edit, usd_cached_per_mtok: e.target.value })} /></div>
              <div className={field}><Label htmlFor="mr-out">Output $ / M tokens</Label><Input id="mr-out" type="number" min={0} step="0.0001" value={edit.usd_out_per_mtok} onChange={(e) => setEdit({ ...edit, usd_out_per_mtok: e.target.value })} /></div>
              <div className={field}><Label htmlFor="mr-from">Effective from</Label><Input id="mr-from" type="date" value={edit.effective_from} onChange={(e) => setEdit({ ...edit, effective_from: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={edit.is_active} onCheckedChange={(c) => setEdit({ ...edit, is_active: c })} />Use this rate for new replies</label>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save rate"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
