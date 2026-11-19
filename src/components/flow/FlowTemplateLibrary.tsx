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
import { FlowChatPreview } from "./FlowChatPreview";

type Row = Database["public"]["Tables"]["ai_flow_templates"]["Row"];
const flowOf = (row: Row): TemplateFlow => ({ nodes: row.nodes as TemplateFlow["nodes"], edges: row.edges as TemplateFlow["edges"] });
type Editor = { id?: string; name: string; description: string; published: boolean; flow: TemplateFlow };

export function FlowTemplateLibrary({ admin, current, onUse, renderEditor }: {
  admin: boolean; current: TemplateFlow; onUse: (flow: TemplateFlow) => void;
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
  const query = useQuery({ queryKey: ["flow-templates", admin], queryFn: async () => {
    let request = supabase.from("ai_flow_templates").select("*").order("name");
    if (!admin) request = request.eq("published", true);
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } });
  const save = async (flow: TemplateFlow) => {
    if (!editor || !editor.name.trim()) { toast.error(t("Template name is required")); return; }
    setSaving(true);
    const safe = copyTemplate(flow);
    const payload = { name: editor.name.trim(), description: editor.description.trim(), published: editor.published, nodes: safe.nodes as unknown as Json, edges: safe.edges as unknown as Json, updated_at: new Date().toISOString() };
    const result = editor.id ? await supabase.from("ai_flow_templates").update(payload).eq("id", editor.id).select("id").single() : await supabase.from("ai_flow_templates").insert(payload).select("id").single();
    setSaving(false);
    if (result.error) { toast.error(result.error.message); return; }
    setEditor(null); await qc.invalidateQueries({ queryKey: ["flow-templates"] }); toast.success(t("Template saved"));
  };
  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await supabase.from("ai_flow_templates").delete().eq("id", deleting.id).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setDeleting(null); await qc.invalidateQueries({ queryKey: ["flow-templates"] });
  };
  const list = <div className="space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {admin && <h2 className="text-lg font-semibold">{t("Flow templates")}</h2>}
      <Input aria-label={t("Search templates")} placeholder={t("Search templates")} value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
      {admin && <Button onClick={() => setEditor({ name: "", description: "", published: false, flow: copyTemplate(current.nodes.length ? current : DEFAULT_FLOW) })}><Plus className="size-4" />{t("New template")}</Button>}
    </div>
    {query.isPending ? <p>{t("Loading templates…")}</p> : query.error ? <div className="flex items-center gap-3 text-destructive">{t("Templates could not be loaded")}<Button variant="outline" onClick={() => query.refetch()}>{t("Retry")}</Button></div> : <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">{t("Template")}</th><th className="hidden p-3 text-start sm:table-cell">{t("Blocks")}</th>{admin && <th className="p-3 text-start">{t("Status")}</th>}<th className="p-3 text-end">{t("Actions")}</th></tr></thead>
        <tbody>{(query.data ?? []).filter(row => `${row.name} ${row.description}`.toLowerCase().includes(search.toLowerCase())).map(row => {
          const flow = flowOf(row);
          return <tr key={row.id} className="border-t"><td className="p-3 align-top"><div className="font-medium break-words">{row.name}</div><div className="mt-1 text-xs text-muted-foreground break-words">{row.description}</div><div className="mt-2 flex flex-wrap gap-1">{[...new Set(flow.nodes.map(n => n.type))].filter(k => ["calendar", "whatsapp", "form", "buttons"].includes(k)).map(k => <Badge key={k} variant="secondary">{t(kindLabel(k))}</Badge>)}</div></td><td className="hidden p-3 sm:table-cell">{flow.nodes.length}</td>{admin && <td className="p-3"><Badge variant={row.published ? "default" : "secondary"}>{t(row.published ? "Published" : "Draft")}</Badge></td>}<td className="p-3"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPreview(row)}><Eye className="size-4" />{t("Preview")}</Button>{admin ? <><Button size="icon" variant="ghost" title={t("Edit template")} aria-label={`${t("Edit template")} ${row.name}`} onClick={() => setEditor({ id: row.id, name: row.name, description: row.description, published: row.published, flow })}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" title={t("Delete template")} aria-label={`${t("Delete template")} ${row.name}`} onClick={() => setDeleting(row)}><Trash2 className="size-4 text-destructive" /></Button></> : <Button size="sm" onClick={() => setConfirm(row)}><Check className="size-4" />{t("Use template")}</Button>}</div></td></tr>;
        })}</tbody></table>
      {!query.data?.length && <p className="p-6 text-sm text-muted-foreground">{t("No templates yet")}</p>}
    </div>}
  </div>;
  return <>
    {admin ? list : <><Button variant="outline" onClick={() => setOpen(true)}><Library className="size-4" />{t("Choose template")}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto"><DialogTitle>{t("Flow templates")}</DialogTitle><DialogDescription className="sr-only">{t("Choose template")}</DialogDescription>{list}</DialogContent></Dialog></>}
    <Dialog open={!!editor} onOpenChange={value => { if (!value && !saving) setEditor(null); }}><DialogContent className="max-h-[94dvh] w-[calc(100%-1rem)] max-w-[1500px] overflow-y-auto"><DialogTitle>{t(editor?.id ? "Edit template" : "New template")}</DialogTitle><DialogDescription className="sr-only">{t("Flow templates")}</DialogDescription>{editor && <><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="template-name">{t("Template name")}</Label><Input id="template-name" value={editor.name} maxLength={100} onChange={e => setEditor({ ...editor, name: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="template-description">{t("Description")}</Label><Textarea id="template-description" value={editor.description} maxLength={500} onChange={e => setEditor({ ...editor, description: e.target.value })} /></div><div className="flex items-center gap-3"><Switch id="template-published" checked={editor.published} onCheckedChange={published => setEditor({ ...editor, published })} /><Label htmlFor="template-published">{t("Published")}</Label></div></div>{renderEditor(editor.flow, save, saving)}</>}</DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={value => { if (!value) setPreview(null); }}><DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto"><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{preview?.description}</DialogDescription>{preview && <div className="grid min-w-0 gap-5 md:grid-cols-[1fr_320px]"><ol className="max-h-[60dvh] space-y-3 overflow-y-auto">{flowOf(preview).nodes.map(node => <li key={node.id} className="border-s-2 border-primary ps-3"><div className="text-sm font-medium">{t(kindLabel(node.type))}</div><p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{node.data.text}</p></li>)}</ol><FlowChatPreview key={preview.id} {...flowOf(preview)} selectedId={null} /></div>}{!admin && <Button onClick={() => { setConfirm(preview); setPreview(null); }}>{t("Use template")}</Button>}</DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={value => { if (!value) setConfirm(null); }}><DialogContent><DialogTitle>{t("Replace current workflow?")}</DialogTitle><DialogDescription>{t("This replaces the workflow in your editor, including unsaved changes. Your active flow changes only after Save flow.")}</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirm(null)}><ArrowLeft className="size-4" />{t("Cancel")}</Button><Button onClick={() => { if (!confirm) return; onUse(copyTemplate(flowOf(confirm))); setConfirm(null); setOpen(false); }}>{t("Use template")}</Button></div></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={value => { if (!value) setDeleting(null); }}><DialogContent><DialogTitle>{t("Delete template")}</DialogTitle><DialogDescription>{t("Existing artist workflows remain unchanged.")} {deleting?.name}</DialogDescription><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleting(null)}>{t("Cancel")}</Button><Button variant="destructive" disabled={saving} onClick={remove}>{t("Delete template")}</Button></div></DialogContent></Dialog>
  </>;
}