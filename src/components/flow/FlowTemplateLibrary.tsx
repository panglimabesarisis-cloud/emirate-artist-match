import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Library, Pencil, Plus, Trash2, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { TemplateFlow } from "@/lib/flow-templates";
import { copyTemplate } from "@/lib/flow-templates";
import { DEFAULT_FLOW, kindLabel } from "@/lib/ai-flow";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { libraryRefresh, invalidateLibraries } from "@/lib/library-query";
import { FlowChatPreview } from "./FlowChatPreview";
import { ItemCheckoutDialog } from "@/components/dashboard/ItemCheckoutDialog";

type Row = Pick<Database["public"]["Tables"]["ai_flow_templates"]["Row"], "id" | "name" | "description" | "price_aed" | "published" | "nodes" | "edges" | "updated_at" | "tier" | "version"> & { unlocked?: boolean; block_types?: string[] };
const flowOf = (row: Row): TemplateFlow => ({ nodes: row.nodes as TemplateFlow["nodes"], edges: row.edges as TemplateFlow["edges"] });
type Editor = { id?: string; name: string; description: string; published: boolean; price: string; tier: string; flow: TemplateFlow };

export function FlowTemplateLibrary({ admin, current, onUse, renderEditor, artistId = null }: {
  admin: boolean; artistId?: string | null; current: TemplateFlow; onUse: (flow: TemplateFlow, source?: { id: string; version: number }) => void;
  renderEditor: (flow: TemplateFlow, save: (flow: TemplateFlow) => void, saving: boolean) => ReactNode;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState<Row | null>(null);
  const tiers = useQuery({ queryKey: ["admin-tiers"], queryFn: async () => { const { data, error } = await supabase.from("plan_tiers").select("code, name, sort").order("sort"); if (error) throw error; return data ?? []; } });
  const plan = useQuery({ queryKey: ["flow-template-plan", artistId], enabled: !!artistId, ...libraryRefresh, queryFn: async () => { if (!artistId) return "free"; const { data, error } = await supabase.rpc("effective_artist_plan", { _artist: artistId }); if (error) throw error; return data ?? "free"; } });
  const query = useQuery({ queryKey: ["flow-templates", admin, artistId], ...libraryRefresh, queryFn: async (): Promise<Row[]> => {
    if (!admin) {
      const { data, error } = await supabase.rpc("list_flow_templates");
      if (error) throw error;
      const meta = await supabase.from("ai_flow_templates").select("id, tier, version, updated_at");
      if (meta.error) throw meta.error;
      const byId = new Map((meta.data ?? []).map((r) => [r.id, r]));
      return (data ?? []).map((r): Row => ({
        id: r.id, name: r.name, description: r.description, price_aed: Number(r.price_aed), published: true,
        nodes: (r.unlocked ? r.nodes : []) as Json, edges: (r.unlocked ? r.edges : []) as Json,
        updated_at: byId.get(r.id)?.updated_at ?? "", tier: byId.get(r.id)?.tier ?? "pro", version: byId.get(r.id)?.version ?? 1, unlocked: r.unlocked, block_types: r.block_types,
      }));
    }
    const { data, error } = await supabase.rpc("admin_flow_template_content");
    if (error) throw error;
    return data ?? [];
  } });
  const save = async (flow: TemplateFlow) => {
    if (!editor || !editor.name.trim()) { toast.error(t("Template name is required")); return; }
    const price = Number(editor.price);
    if (!Number.isFinite(price) || price < 0) { toast.error(t("Invalid price")); return; }
    setSaving(true);
    const safe = copyTemplate(flow);
    const payload = { name: editor.name.trim(), description: editor.description.trim(), published: editor.published, price_aed: price, tier: editor.tier, nodes: safe.nodes as unknown as Json, edges: safe.edges as unknown as Json, updated_at: new Date().toISOString() };
    const result = editor.id ? await supabase.from("ai_flow_templates").update(payload).eq("id", editor.id).select("id").single() : await supabase.from("ai_flow_templates").insert(payload).select("id").single();
    setSaving(false);
    if (result.error) { toast.error(result.error.message); return; }
    setEditor(null); await invalidateLibraries(qc); toast.success(t("Template saved"));
  };
  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await supabase.from("ai_flow_templates").delete().eq("id", deleting.id).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setDeleting(null); await invalidateLibraries(qc);
  };
  const list = <div className="space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {admin && <h2 className="text-lg font-semibold">{t("Flow templates")}</h2>}
      <Input aria-label={t("Search templates")} placeholder={t("Search templates")} value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
      {!admin && <Button className="ms-auto shrink-0 bg-gradient-gold text-gold-foreground" onClick={() => setOpen(true)}><Library className="size-4" />{t("Choose template")}</Button>}
      {admin && <Button onClick={() => setEditor({ name: "", description: "", published: false, price: "0", tier: "free", flow: copyTemplate(current.nodes.length ? current : DEFAULT_FLOW) })}><Plus className="size-4" />{t("New template")}</Button>}
    </div>
    {!admin ? <div className="studio-flow-template-grid">{query.isPending ? <p>{t("Loading templates…")}</p> : query.error ? <div>{t("Templates could not be loaded")}<Button variant="outline" onClick={()=>query.refetch()}>{t("Retry")}</Button></div> : <>{(query.data ?? []).filter(row=>`${row.name} ${row.description}`.toLowerCase().includes(search.toLowerCase())).map(row=>{const flow=flowOf(row);return <article key={row.id} className="studio-flow-template-card"><Library className="size-7 text-gold" /><h3>{row.name}</h3><Badge variant="outline">{row.tier} · v{row.version}</Badge><p>{row.description}</p><div className="flex flex-wrap gap-1 my-4">{[...new Set<string>(row.block_types ?? flow.nodes.map(n=>n.type))].map(kind=><Badge key={kind}>{t(kindLabel(kind as Parameters<typeof kindLabel>[0]))}</Badge>)}</div>{Number(row.price_aed) > 0 && <p className="mb-3 text-sm font-semibold text-gold">AED {Number(row.price_aed).toFixed(0)} <span className="text-xs font-normal text-muted-foreground">+ {t("VAT 5%")}{row.unlocked ? ` · ${t("Owned")}` : ""}</span></p>}<div className="flex flex-wrap gap-2">{row.unlocked === false && ((tiers.data?.find(tier => tier.code === row.tier)?.sort ?? 99) > (tiers.data?.find(tier => tier.code === plan.data)?.sort ?? -1) || Number(row.price_aed) === 0) ? <span className="text-sm text-gold">{t("Needs")} {tiers.data?.find(tier => tier.code === row.tier)?.name ?? row.tier}</span> : row.unlocked === false ? <Button size="sm" className="bg-gradient-gold text-gold-foreground" onClick={()=>setBuying(row)}>{t("Buy")} · AED {(Number(row.price_aed) * 1.05).toFixed(2)}</Button> : <><Button size="sm" variant="outline" onClick={()=>setPreview(row)}><Eye className="size-4" />{t("Preview")}</Button><Button size="sm" onClick={()=>setConfirm(row)}><Check className="size-4" />{t("Use template")}</Button></>}</div></article>;})}{!query.data?.length && <p>{t("No templates yet")}</p>}</>}</div> : <>    {query.isPending ? <p>{t("Loading templates…")}</p> : query.error ? <div className="flex items-center gap-3 text-destructive">{t("Templates could not be loaded")}<Button variant="outline" onClick={() => query.refetch()}>{t("Retry")}</Button></div> : <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">{t("Template")}</th><th className="hidden p-3 text-start sm:table-cell">{t("Blocks")}</th>{admin && <th className="p-3 text-start">{t("Status")}</th>}<th className="p-3 text-end">{t("Actions")}</th></tr></thead>
        <tbody>{(query.data ?? []).filter(row => `${row.name} ${row.description}`.toLowerCase().includes(search.toLowerCase())).map(row => {
          const flow = flowOf(row);
          return <tr key={row.id} className="border-t"><td className="p-3 align-top"><div className="font-medium break-words">{row.name} <Badge variant="outline">{row.tier} · v{row.version}</Badge></div><div className="mt-1 text-xs text-muted-foreground break-words">{row.description}</div><div className="mt-2 flex flex-wrap gap-1">{[...new Set(flow.nodes.map(n => n.type))].filter(k => ["calendar", "whatsapp", "form", "buttons"].includes(k)).map(k => <Badge key={k} variant="secondary">{t(kindLabel(k))}</Badge>)}</div></td><td className="hidden p-3 sm:table-cell">{flow.nodes.length}</td>{admin && <td className="p-3"><Badge variant={row.published ? "default" : "secondary"}>{t(row.published ? "Published" : "Draft")}</Badge></td>}<td className="p-3"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPreview(row)}><Eye className="size-4" />{t("Preview")}</Button>{admin ? <><Button size="icon" variant="ghost" title={t("Edit template")} aria-label={`${t("Edit template")} ${row.name}`} onClick={() => setEditor({ id: row.id, name: row.name, description: row.description, published: row.published, price: String(row.price_aed ?? 0), tier: row.tier, flow })}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" title={t("Delete template")} aria-label={`${t("Delete template")} ${row.name}`} onClick={() => setDeleting(row)}><Trash2 className="size-4 text-destructive" /></Button></> : <Button size="sm" onClick={() => setConfirm(row)}><Check className="size-4" />{t("Use template")}</Button>}</div></td></tr>;
        })}</tbody></table>
      {!query.data?.length && <p className="p-6 text-sm text-muted-foreground">{t("No templates yet")}</p>}
    </div>}</>}
  </div>;
  return <>
    {admin ? list : <>{list}<Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto"><DialogTitle>{t("Flow templates")}</DialogTitle><DialogDescription className="sr-only">{t("Choose template")}</DialogDescription>{list}</DialogContent></Dialog></>}
    <Dialog open={!!editor} onOpenChange={value => { if (!value && !saving) setEditor(null); }}><DialogContent className="max-h-[94dvh] w-[calc(100%-1rem)] max-w-[1500px] overflow-y-auto"><DialogTitle>{t(editor?.id ? "Edit template" : "New template")}</DialogTitle><DialogDescription className="sr-only">{t("Flow templates")}</DialogDescription>{editor && <><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="template-name">{t("Template name")}</Label><Input id="template-name" value={editor.name} maxLength={100} onChange={e => setEditor({ ...editor, name: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="template-description">{t("Description")}</Label><Textarea id="template-description" value={editor.description} maxLength={500} onChange={e => setEditor({ ...editor, description: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="template-tier">{t("Plan tier")}</Label><Select value={editor.tier} onValueChange={tier => setEditor({ ...editor, tier })}><SelectTrigger id="template-tier"><SelectValue /></SelectTrigger><SelectContent>{tiers.data?.map(tier => <SelectItem key={tier.code} value={tier.code}>{tier.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="template-price">{t("Price (AED, excl. VAT; 0 = free)")}</Label><Input id="template-price" type="number" min={0} value={editor.price} onChange={e => setEditor({ ...editor, price: e.target.value })} /></div><div className="flex items-center gap-3"><Switch id="template-published" checked={editor.published} onCheckedChange={published => setEditor({ ...editor, published })} /><Label htmlFor="template-published">{t("Published")}</Label></div></div>{renderEditor(editor.flow, save, saving)}</>}</DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={value => { if (!value) setPreview(null); }}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto"><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{preview?.description}</DialogDescription>{preview && <div className="grid min-w-0 gap-5 md:grid-cols-[1fr_320px]"><ol className="max-h-[60dvh] space-y-3 overflow-y-auto">{flowOf(preview).nodes.map(node => <li key={node.id} className="border-s-2 border-primary ps-3"><div className="text-sm font-medium">{t(kindLabel(node.type))}</div><p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{node.data.text}</p></li>)}</ol><FlowChatPreview key={preview.id} {...flowOf(preview)} selectedId={null} /></div>}{!admin && <Button onClick={() => { setConfirm(preview); setPreview(null); }}>{t("Use template")}</Button>}</DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={value => { if (!value) setConfirm(null); }}><DialogContent><DialogTitle>{t("Replace current workflow?")}</DialogTitle><DialogDescription>{t("This replaces the workflow in your editor, including unsaved changes. Your active flow changes only after Save flow.")}</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(null)}><ArrowLeft className="size-4" />{t("Cancel")}</Button><Button onClick={() => { if (!confirm) return; onUse(copyTemplate(flowOf(confirm)), { id: confirm.id, version: confirm.version }); setConfirm(null); setOpen(false); }}>{t("Use template")}</Button></div></DialogContent></Dialog>
    {buying && <ItemCheckoutDialog kind="flow_template" itemId={buying.id} title={buying.name} priceAed={Number(buying.price_aed)} open onClose={() => setBuying(null)} onPaid={() => { void invalidateLibraries(qc); }} />}
    <Dialog open={!!deleting} onOpenChange={value => { if (!value) setDeleting(null); }}><DialogContent><DialogTitle>{t("Delete template")}</DialogTitle><DialogDescription>{t("Existing artist workflows remain unchanged.")} {deleting?.name}</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>{t("Cancel")}</Button><Button variant="destructive" disabled={saving} onClick={remove}>{t("Delete template")}</Button></div></DialogContent></Dialog>
  </>;
}