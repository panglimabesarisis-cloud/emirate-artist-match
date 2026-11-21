import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, MiniMap, Controls, Handle, Position, addEdge, useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cardTitle, FIELD_TYPES, FORM_FIELD_PRESETS, type FormField, type FieldType, type UrlButton, DEFAULT_FLOW, FLOW_GROUPS, FLOW_KINDS, isBranching, kindColor, kindLabel, type FlowData, type FlowEdge, type FlowKind, type FlowNode } from "@/lib/ai-flow";
import { collectFlowVariables } from "@/lib/flow-variables";
import { FlowVariableSelect } from "./FlowVariableSelect";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { approvalAction, whatsappEdges } from "@/lib/ai-flow";
import { useI18n } from "@/lib/i18n";
import { CalendarDays, Eye, Settings2, Trash2 } from "lucide-react";
import { FlowChatPreview } from "./FlowChatPreview";
import { FlowTemplateLibrary } from "./FlowTemplateLibrary";
import type { TemplateFlow } from "@/lib/flow-templates";
import { StudioHeading } from "@/components/dashboard/StudioPage";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Data = FlowData;
const EMOJI = ["😊", "👋", "🎉", "🎤", "🎶", "💃", "📅", "⏰", "📍", "💰", "✅", "🙏"];

function StepNode({ data, type, selected }: NodeProps<Node<Data>>) {
  const { t } = useI18n();
  const k = type as FlowKind;
  const branch = isBranching(k);
  const color = `var(${kindColor(k)})`;
  return (
    <div className={`studio-flow-node w-56 overflow-visible text-card-foreground shadow-sm transition ${selected ? "ring-2 ring-primary" : ""}`}>
      {k !== "start" && <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border !border-border !bg-background" />}
      <div className="flex items-center gap-2 px-3 pt-2.5 text-xs font-semibold">
        <span className="grid h-5 w-5 place-items-center rounded text-[10px] text-primary-foreground" style={{ background: color }}>{kindLabel(k)[0]}</span>
        <span className="truncate" title={cardTitle({ type: k, data })}>{cardTitle({ type: k, data })}</span>
      </div>
      <div className="px-3 pb-2.5 pt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">{data.text || t("Click to edit…")}</div>
      {k === "knowledge" && <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">{data.knowledgeQA?.length ?? 0} {t("Q&A")}</div>}
      {k === "whatsapp" && <div className="border-t px-3 py-2 text-[11px] text-muted-foreground"><div>{data.destinationPhone || t("Artist's WhatsApp")}</div><div>{t("Approval → Invoice")}</div></div>}
      {data.saveAs && <div className="mx-3 mb-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">→ {"{"}{data.saveAs}{"}"}</div>}
      {k === "form" && (
        <div className="space-y-1 border-t px-3 py-2">
          {(data.fields ?? []).map((f, i) => <div key={i} className="flex justify-between rounded border bg-background px-2 py-1 text-[11px]"><span className="font-medium">{f.label || t("Field")}</span><span className="text-muted-foreground">{f.type}</span></div>)}
        </div>
      )}
      {k === "buttons" && (
        <div className="space-y-1 border-t px-3 py-2">
          {(data.buttons ?? []).map((b, i) => (
            <div key={i} className="relative rounded border bg-background px-2 py-1 text-center text-[11px] font-medium">
              {b || t("Button")}
              <Handle id={`b${i}`} type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-background" style={{ background: color, right: -16 }} />
            </div>
          ))}
          {(data.urlButtons ?? []).map((u, i) => <div key={`u${i}`} className="rounded border border-dashed px-2 py-1 text-center text-[11px] text-primary">🔗 {u.label || t("Link")}</div>)}
        </div>
      )}
      {branch ? (
        <div className="flex justify-between px-4 pb-2 text-[10px] font-semibold text-muted-foreground"><span>{k === "calendar" ? t("Available") : t("Yes")}</span><span>{k === "calendar" ? t("Busy") : t("No")}</span>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "20%", background: color }} className="!h-2.5 !w-2.5" />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: "80%", background: color }} className="!h-2.5 !w-2.5" />
        </div>
      ) : k !== "handover" && k !== "booking" ? <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border !border-border !bg-background" /> : null}
    </div>
  );
}
const nodeTypes = Object.fromEntries(FLOW_KINDS.map((k) => [k.kind, StepNode]));

const toRF = (f: { nodes: FlowNode[]; edges: FlowEdge[] }) => ({
  nodes: f.nodes as Node<Data>[],
  edges: whatsappEdges(f.nodes, f.edges).map((e) => ({ ...e, type: "smoothstep", label: e.sourceHandle === "yes" ? "Yes" : e.sourceHandle === "no" ? "No" : undefined })) as Edge[],
});

/** Rich text box with a WotNot/TinyMCE-style toolbar; formatting is saved as simple markdown. */
function RichText({ value, onChange, disabled, variables }: { value: string; onChange: (v: string) => void; disabled?: boolean; variables: string[] }) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrapSel = (before: string, after = before, fallback = "text") => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    const inner = value.slice(a, b) || fallback;
    const next = value.slice(0, a) + before + inner + after + value.slice(b);
    onChange(next.slice(0, 5000));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + inner.length); });
  };
  const insert = (t: string) => wrapSel("", "", t);
  const linePrefix = (pre: (i: number) => string) => {
    const el = ref.current; if (!el) return;
    const a = value.lastIndexOf("\n", el.selectionStart - 1) + 1, b = el.selectionEnd;
    const block = value.slice(a, b).split("\n").map((l, i) => pre(i) + l).join("\n");
    onChange((value.slice(0, a) + block + value.slice(b)).slice(0, 5000));
  };
  const Tb = ({ label, title, onClick, className = "" }: { label: string; title: string; onClick: () => void; className?: string }) => (
    <Button variant="ghost" type="button" title={title} disabled={disabled} onClick={onClick} className={`grid h-7 min-w-7 place-items-center rounded px-1 text-xs hover:bg-muted disabled:opacity-40 ${className}`}>{label}</Button>
  );
  return (
    <div className="rounded-md border focus-within:ring-1 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-0.5">
        <Tb label="B" title={t("Bold")} className="font-bold" onClick={() => wrapSel("**")} />
        <Tb label="I" title={t("Italic")} className="italic" onClick={() => wrapSel("_")} />
        <Tb label="U" title={t("Underline")} className="underline" onClick={() => wrapSel("__")} />
        <Tb label="•" title={t("Bullet list")} onClick={() => linePrefix(() => "- ")} />
        <Tb label="1." title={t("Numbered list")} onClick={() => linePrefix((i) => `${i + 1}. `)} />
        <Tb label="🔗" title={t("Link")} onClick={() => wrapSel("[", "](https://)", "link")} />
        <Popover>
          <PopoverTrigger asChild><Button variant="ghost" type="button" disabled={disabled} title={t("Insert variable")} className="grid h-7 place-items-center rounded px-1.5 font-mono text-xs hover:bg-muted">{t("{x}")}</Button></PopoverTrigger>
          <PopoverContent className="max-h-72 w-60 overflow-y-auto p-1">{variables.map((v) => <Button key={v} type="button" variant="ghost" onClick={() => insert(`{${v}}`)} className="h-auto w-full justify-start break-all px-2 py-1 font-mono text-xs">{v}</Button>)}</PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild><Button variant="ghost" type="button" disabled={disabled} title={t("Emoji")} className="ms-auto grid h-7 w-7 place-items-center rounded hover:bg-muted">☺</Button></PopoverTrigger>
          <PopoverContent className="grid w-44 grid-cols-6 gap-1 p-2">{EMOJI.map((e) => <Button variant="ghost" key={e} type="button" onClick={() => insert(e)} className="rounded p-0.5 text-lg hover:bg-muted">{e}</Button>)}</PopoverContent>
        </Popover>
      </div>
      <textarea ref={ref} rows={5} maxLength={5000} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}
        className="block w-full resize-none bg-transparent px-3 py-2 text-sm outline-none" />
      <div className="flex justify-between px-3 pb-1.5 text-[10px] text-muted-foreground"><span>{t("Insert a variable with")} {t("{x}")}</span><span>{value.length}/5000</span></div>
    </div>
  );
}

const GROUP_LABEL: Record<string, string> = { Send: "Talk", Ask: "Collect", Logic: "Logic", Actions: "Integrations" };

function Canvas({ initial, readOnly, onSave, saving }: { initial: { nodes: FlowNode[]; edges: FlowEdge[] }; readOnly?: boolean; onSave: (f: { nodes: FlowNode[]; edges: FlowEdge[] }) => void; saving: boolean }) {
  const { t } = useI18n();
  const start = useMemo(() => toRF(initial), [initial]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Data>>(start.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(start.edges);
  const [sel, setSel] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<string>("All");
  const [panel, setPanel] = useState<"edit" | "preview">("edit");
  const wrap = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();
  useEffect(() => { setNodes(start.nodes); setEdges(start.edges); setSel(null); setEdgeId(null); }, [start, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: crypto.randomUUID(), type: "smoothstep", label: c.sourceHandle === "yes" ? "Yes" : c.sourceHandle === "no" ? "No" : undefined }, es)), [setEdges]);
  const add = (kind: FlowKind, pos?: { x: number; y: number }, datePicker = false) => {
    const def = FLOW_KINDS.find((k) => k.kind === kind);
    if (!def) return;
    const id = crypto.randomUUID();
    const position = pos ?? rf.screenToFlowPosition({ x: (wrap.current?.getBoundingClientRect().left ?? 0) + 200, y: (wrap.current?.getBoundingClientRect().top ?? 0) + 120 });
    setNodes((ns) => [...ns, { id, type: kind, position, data: datePicker ? { text: "Please select your preferred event date", fields: [{ label: "Event date", type: "date", saveAs: "event_date" }] } : kind === "buttons" ? { text: def.placeholder, buttons: ["Option 1", "Option 2"] } : kind === "form" ? { text: def.placeholder, fields: [{ label: "Name", type: "text", saveAs: "client_name" }, { label: "Email", type: "email" }, { label: "Phone", type: "phone" }, ...FORM_FIELD_PRESETS.slice(0, 4).map((f) => ({ ...f }))] } : { text: def.placeholder } }]);
    setSel(id);
  };
  const selected = nodes.find((x) => x.id === sel);
  const variables = useMemo(() => collectFlowVariables(nodes), [nodes]);
  const selectedEdge = edges.find((edge) => edge.id === edgeId);
  const deleteConnection = () => {
    if (readOnly || !selectedEdge) return;
    setEdges((current) => current.filter((edge) => edge.id !== selectedEdge.id));
    setEdgeId(null);
  };
  const patch = (id: string, f: (d: Data) => Data) => setNodes((ns) => ns.map((x) => (x.id === id ? { ...x, data: f(x.data) } : x)));
  const setButtons = (id: string, f: (bs: string[]) => string[]) => patch(id, (d) => ({ ...d, buttons: f(d.buttons ?? []) }));
  const setFields = (id: string, f: (fs: FormField[]) => FormField[]) => patch(id, (d) => ({ ...d, fields: f(d.fields ?? []) }));
  const setUrls = (id: string, f: (bs: UrlButton[]) => UrlButton[]) => patch(id, (d) => ({ ...d, urlButtons: f(d.urlButtons ?? []) }));
  const save = () => onSave({
    nodes: nodes.map((x) => {
      const d: FlowNode["data"] = { text: x.data.text };
      if (x.data.title?.trim()) d.title = x.data.title.trim();
      if (x.type === "knowledge") d.knowledgeQA = (x.data.knowledgeQA ?? []).map(pair => ({ question: pair.question.trim(), answer: pair.answer.trim() })).filter(pair => pair.question && pair.answer);
      if (x.data.buttons) d.buttons = x.data.buttons.map((b) => b.trim()).filter(Boolean);
      const urls = (x.data.urlButtons ?? []).filter((u) => u.label.trim() && /^https?:\/\//.test(u.url));
      if (urls.length) d.urlButtons = urls;
      if (x.data.saveAs) d.saveAs = x.data.saveAs;
      if (x.type === "ratecard") { d.rateDescription = x.data.rateDescription?.trim() ?? ""; d.ratePrice = Math.max(0, Number(x.data.ratePrice) || 0); }
      if (x.type === "whatsapp") d.destinationPhone = x.data.destinationPhone?.trim() ?? "";
      const fields = (x.data.fields ?? []).map((f) => ({ ...f, label: f.label.trim() })).filter((f) => f.label);
      if (fields.length) d.fields = fields;
      return { id: x.id, type: x.type as FlowKind, position: { x: Math.round(x.position.x), y: Math.round(x.position.y) }, data: d };
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  });
  const blocks = FLOW_KINDS.filter((k) => (tab === "All" || k.group === tab) && k.label.toLowerCase().includes(q.toLowerCase()));
  const canSave = selected && !["start", "message", "handover", "booking", "form", "whatsapp", "knowledge"].includes(selected.type as string);

  return (
    <div className="studio-flow-canvas">
      <div className="studio-flow-toolbar">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{t("Blocks:")} {nodes.length}</span>
        <Button size="sm" variant="outline" onClick={() => setPanel("preview")}><Eye className="size-4" />{t("Test bot")}</Button>
        {!readOnly && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { const d = toRF(DEFAULT_FLOW); setNodes(d.nodes); setEdges(d.edges); setSel(null); }}>{t("Reset")}</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? t("Saving…") : t("Save flow")}</Button>
          </div>
        )}
      </div>
      <div className="studio-flow-columns [&>*]:min-w-0">
        {!readOnly && (
          <div className="studio-flow-palette space-y-3">
            <Input placeholder={t("Search…")} value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-sm" />
            <div className="flex flex-wrap gap-1">
              {["All", ...FLOW_GROUPS].map((g) => <Button variant="ghost" key={g} onClick={() => setTab(g)} className={`rounded-full border px-2 py-0.5 text-[11px] ${tab === g ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{g === "All" ? t("All") : t(GROUP_LABEL[g] ?? g)}</Button>)}
            </div>
            <div className="studio-flow-blocks lg:space-y-0.5">
              {(tab === "All" || tab === "Ask") && "date picker".includes(q.toLowerCase()) && <Button variant="ghost" className="h-auto shrink-0 justify-start px-2 py-1.5 text-sm lg:w-full" onClick={() => add("form", undefined, true)}><CalendarDays className="size-5 text-primary" />{t("Date picker")}</Button>}
              {blocks.map((k) => (
                <Button variant="ghost" key={k.kind} draggable onDragStart={(e) => e.dataTransfer.setData("application/flow", k.kind)} onClick={() => add(k.kind)} title={t(k.hint)}
                  className="studio-flow-block">
                  <span className="grid h-5 w-5 place-items-center rounded text-[10px] text-primary-foreground" style={{ background: `var(${k.color})` }}>{k.label[0]}</span>{t(k.label)}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div ref={wrap} className={`relative studio-flow-surface ${readOnly ? "lg:col-span-2" : ""}`}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("application/flow") as FlowKind; if (k) add(k, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
          {!readOnly && selectedEdge && <Button variant="destructive" size="icon" className="absolute end-3 top-3 z-10" aria-label={t("Delete connection")} title={t("Delete connection")} onClick={deleteConnection}><Trash2 className="size-4" /></Button>}
          <ReactFlow nodes={nodes} edges={edges} defaultEdgeOptions={{ interactionWidth: 28 }} nodeTypes={nodeTypes} {...(readOnly ? {} : { onNodesChange, onEdgesChange, onConnect })} onNodeClick={(_, n) => { setSel(n.id); setEdgeId(null); }} onEdgeClick={(_, edge) => { setEdgeId(edge.id); setSel(null); setPanel("edit"); }} onPaneClick={() => { setSel(null); setEdgeId(null); }}
            nodesDraggable={!readOnly} nodesConnectable={!readOnly} deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]} fitView fitViewOptions={{ maxZoom: 1, padding: 0.2 }}>
            <Background gap={16} size={1.2} /><Controls position="bottom-center" orientation="horizontal" /><MiniMap pannable zoomable style={{ width: 140, height: 90 }} className="!hidden md:!block" />
          </ReactFlow>
        </div>
        <div className="studio-flow-inspector space-y-4">
          <div className="grid grid-cols-2 gap-1 border-b pb-3"><Button size="sm" variant={panel === "edit" ? "secondary" : "ghost"} onClick={() => setPanel("edit")}><Settings2 className="size-4" />{t("Edit block")}</Button><Button size="sm" variant={panel === "preview" ? "secondary" : "ghost"} onClick={() => setPanel("preview")}><Eye className="size-4" />{t("Preview")}</Button></div>
          {panel === "preview" ? <FlowChatPreview key={sel ?? "start"} nodes={nodes as FlowNode[]} edges={edges} selectedId={sel} /> : selectedEdge ? <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("Connection")}</h3>
            <div className="space-y-2 text-sm"><div className="break-words"><span className="text-muted-foreground">{t("From")}: </span>{kindLabel((nodes.find(node => node.id === selectedEdge.source)?.type ?? "message") as FlowKind)}</div><div className="break-words"><span className="text-muted-foreground">{t("To")}: </span>{kindLabel((nodes.find(node => node.id === selectedEdge.target)?.type ?? "message") as FlowKind)}</div></div>
            {!readOnly && <Button variant="destructive" className="w-full" onClick={deleteConnection}><Trash2 className="size-4" />{t("Delete connection")}</Button>}
          </div> : selected ? (<>
            <div>
              <div className="text-xs text-muted-foreground">{kindLabel(selected.type as FlowKind)}</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold"><span className="grid h-6 w-6 place-items-center rounded text-[11px] text-primary-foreground" style={{ background: `var(${kindColor(selected.type as FlowKind)})` }}>{kindLabel(selected.type as FlowKind)[0]}</span>{kindLabel(selected.type as FlowKind)}</div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flow-card-title" className="text-xs">{t("Card title")}</Label>
              <Input id="flow-card-title" maxLength={80} disabled={!!readOnly} placeholder={kindLabel(selected.type as FlowKind)} value={selected.data.title ?? ""} onChange={e => patch(selected.id, d => ({ ...d, title: e.target.value }))} />
            </div>
            {selected.type === "knowledge" ? <div className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="knowledge-facts" className="text-xs">{t("General information")}</Label><Textarea id="knowledge-facts" rows={7} disabled={!!readOnly} value={selected.data.text} onChange={e => patch(selected.id, d => ({ ...d, text: e.target.value }))} /></div>
              <div className="space-y-3"><Label className="text-xs">{t("Questions & answers")}</Label>
                {(selected.data.knowledgeQA ?? []).map((pair, index) => <div key={index} className="space-y-2 border-b pb-3">
                  <div className="flex items-center justify-between"><Label htmlFor={`knowledge-question-${index}`} className="text-xs">{t("Question")} {index + 1}</Label>{!readOnly && <Button size="icon" variant="ghost" aria-label={`${t("Delete question")} ${index + 1}`} title={t("Delete question")} onClick={() => patch(selected.id, d => ({ ...d, knowledgeQA: (d.knowledgeQA ?? []).filter((_, i) => i !== index) }))}><Trash2 className="size-4" /></Button>}</div>
                  <Input id={`knowledge-question-${index}`} disabled={!!readOnly} value={pair.question} onChange={e => patch(selected.id, d => ({ ...d, knowledgeQA: (d.knowledgeQA ?? []).map((item, i) => i === index ? { ...item, question: e.target.value } : item) }))} />
                  <Label htmlFor={`knowledge-answer-${index}`} className="text-xs">{t("Answer")} {index + 1}</Label>
                  <Textarea id={`knowledge-answer-${index}`} disabled={!!readOnly} value={pair.answer} onChange={e => patch(selected.id, d => ({ ...d, knowledgeQA: (d.knowledgeQA ?? []).map((item, i) => i === index ? { ...item, answer: e.target.value } : item) }))} />
                </div>)}
                {!readOnly && <Button size="sm" variant="outline" className="w-full" onClick={() => patch(selected.id, d => ({ ...d, knowledgeQA: [...(d.knowledgeQA ?? []), { question: "", answer: "" }] }))}>{t("Add question & answer")}</Button>}
              </div>
            </div> : <div className="space-y-1.5">
              <Label className="text-xs">{t("Bot asks / does this")}</Label>
              <RichText variables={variables} disabled={!!readOnly} value={selected.data.text} onChange={(v) => patch(selected.id, (d) => ({ ...d, text: v }))} />
            </div>}
            {selected.type === "form" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Fields included in the form")}</Label>
                {!readOnly && FORM_FIELD_PRESETS.some((preset) => !(selected.data.fields ?? []).some((f) => f.saveAs === preset.saveAs || f.label === preset.label)) && (
                  <Select value="" disabled={(selected.data.fields?.length ?? 0) >= 8} onValueChange={(value) => {
                    const preset = FORM_FIELD_PRESETS.find((f) => f.saveAs === value);
                    if (!preset) return;
                    setFields(selected.id, (fs) => fs.length >= 8 || fs.some((f) => f.saveAs === preset.saveAs || f.label === preset.label) ? fs : [...fs, { ...preset }]);
                  }}>
                    <SelectTrigger aria-label={t("Add booking field")} className="h-8 text-xs"><SelectValue placeholder={t("Add booking field")} /></SelectTrigger>
                    <SelectContent>{FORM_FIELD_PRESETS.filter((preset) => !(selected.data.fields ?? []).some((f) => f.saveAs === preset.saveAs || f.label === preset.label)).map((preset) => <SelectItem key={preset.saveAs} value={preset.saveAs ?? preset.label}>{preset.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {(selected.data.fields ?? []).map((f, i) => (
                  <div key={i} className="space-y-1 rounded-md border p-2">
                    <div className="flex gap-1">
                      <Input className="h-7 text-xs" placeholder={t("Field label")} value={f.label} maxLength={30} disabled={readOnly} onChange={(e) => setFields(selected.id, (fs) => fs.map((v, j) => (j === i ? { ...v, label: e.target.value.replace(/[|:\]\[]/g, "") } : v)))} />
                      {!readOnly && <Button variant="ghost" size="sm" className="h-7 px-2" title={t("Remove field")} onClick={() => setFields(selected.id, (fs) => fs.filter((_, j) => j !== i))}>✕</Button>}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Select disabled={!!readOnly} value={f.type} onValueChange={(v) => setFields(selected.id, (fs) => fs.map((x, j) => (j === i ? { ...x, type: v as FieldType } : x)))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FIELD_TYPES.map((fieldType) => <SelectItem key={fieldType} value={fieldType}>{t(fieldType)}</SelectItem>)}</SelectContent>
                      </Select>
                      <FlowVariableSelect key={`${selected.id}-${i}`} compact label={`Save to ${f.label}`} variables={variables} disabled={!!readOnly} value={f.saveAs} onChange={v => setFields(selected.id, fs => fs.map((x, j) => j === i ? { ...x, saveAs: v } : x))} />
                    </div>
                    {f.type === "dropdown" && <div className="space-y-1">
                      <Select disabled={!!readOnly} value={f.source ?? "custom"} onValueChange={value => setFields(selected.id, fs => fs.map((field, j) => j === i ? value === "event_types" ? { ...field, source: "event_types" } : { label: field.label, type: field.type, ...(field.saveAs ? { saveAs: field.saveAs } : {}), options: field.options ?? [] } : field))}>
                        <SelectTrigger aria-label={`Options for ${f.label}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="event_types">{t("Event types")}</SelectItem><SelectItem value="custom">{t("Custom options")}</SelectItem></SelectContent>
                      </Select>
                      {f.source !== "event_types" && <Textarea aria-label={`Dropdown options for ${f.label}`} disabled={!!readOnly} value={(f.options ?? []).join("\n")} placeholder={t("One option per line")} onChange={event => setFields(selected.id, fs => fs.map((field, j) => j === i ? { ...field, options: event.target.value.split("\n") } : field))} />}
                    </div>}
                  </div>
                ))}
                {!readOnly && <Button variant="outline" size="sm" className="w-full" disabled={(selected.data.fields?.length ?? 0) >= 8} onClick={() => setFields(selected.id, (fs) => [...fs, { label: `Field ${fs.length + 1}`, type: "text" }])}>{t("+ Form field")}</Button>}
                <p className="text-[11px] text-muted-foreground">{t("The client sees one form with all fields and sends it in one go.")}</p>
              </div>
            )}
            {selected.type === "ratecard" && <div className="space-y-3"><div><Label htmlFor="rate-description">{t("Service description")}</Label><Textarea id="rate-description" value={selected.data.rateDescription ?? ""} maxLength={120} disabled={readOnly} onChange={e => patch(selected.id, d => ({ ...d, rateDescription:e.target.value }))} /></div><div><Label htmlFor="rate-price">{t("Price excl. VAT (AED)")}</Label><Input id="rate-price" type="number" min={0} step="0.01" disabled={readOnly} value={selected.data.ratePrice ?? 0} onChange={e => patch(selected.id, d => ({ ...d, ratePrice:Number(e.target.value) }))} /></div></div>}
            {selected.type === "whatsapp" && <div className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="approval-phone">{t("Artist WhatsApp number")}</Label><Input id="approval-phone" aria-label={t("Artist WhatsApp number")} type="tel" dir="ltr" maxLength={32} placeholder="0501234567 / 971501234567" value={selected.data.destinationPhone ?? ""} disabled={readOnly} onChange={e => patch(selected.id, d => ({ ...d, destinationPhone: e.target.value.replace(/[^+\d\s()-]/g, "") }))} /></div>
              <div className="space-y-1.5"><Label>{t("Destination")}</Label><div className="text-sm text-muted-foreground">{selected.data.destinationPhone || t("Artist's saved WhatsApp number")}</div></div>
              <div className="space-y-1.5"><Label>{t("Yes · Artist approves")}</Label><div className="text-sm">{t("Continue Yes branch")}</div></div>
              <div className="space-y-1.5"><Label>{t("No · Artist declines")}</Label><div className="text-sm text-muted-foreground">{t("Continue No branch")}</div></div>
            </div>}
            {selected.type === "buttons" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Display as")}</Label>
                {(selected.data.buttons ?? []).map((b, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-md bg-primary px-2 text-primary-foreground">
                    <input value={b} maxLength={30} disabled={readOnly} onChange={(e) => setButtons(selected.id, (bs) => bs.map((v, j) => (j === i ? e.target.value.replace(/[|\]\[]/g, "") : v)))}
                      className="h-8 flex-1 bg-transparent text-center text-sm outline-none placeholder:text-primary-foreground/60" placeholder={t("Button")} />
                    {!readOnly && <Button variant="ghost" title={t("Remove")} onClick={() => { setButtons(selected.id, (bs) => bs.filter((_, j) => j !== i)); setEdges((es) => es.filter((e) => !(e.source === selected.id && e.sourceHandle?.startsWith("b")))); }} className="text-xs opacity-70 hover:opacity-100">✕</Button>}
                  </div>
                ))}
                {(selected.data.urlButtons ?? []).map((u, i) => (
                  <div key={`u${i}`} className="space-y-1 rounded-md border border-dashed p-2">
                    <div className="flex gap-1"><Input className="h-7 text-xs" placeholder={t("Label")} value={u.label} maxLength={30} disabled={readOnly} onChange={(e) => setUrls(selected.id, (us) => us.map((v, j) => (j === i ? { ...v, label: e.target.value } : v)))} />
                      {!readOnly && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setUrls(selected.id, (us) => us.filter((_, j) => j !== i))}>✕</Button>}</div>
                    <Input className="h-7 text-xs" placeholder={t("https://…")} value={u.url} maxLength={300} disabled={readOnly} onChange={(e) => setUrls(selected.id, (us) => us.map((v, j) => (j === i ? { ...v, url: e.target.value } : v)))} />
                  </div>
                ))}
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" disabled={(selected.data.buttons?.length ?? 0) >= 6} onClick={() => setButtons(selected.id, (bs) => [...bs, `Option ${bs.length + 1}`])}>{t("+ Branch button")}</Button>
                    <Button variant="outline" size="sm" className="flex-1" disabled={(selected.data.urlButtons?.length ?? 0) >= 3} onClick={() => setUrls(selected.id, (us) => [...us, { label: "Open link", url: "https://" }])}>{t("+ URL button")}</Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">{t("Drag from the dot beside each branch button to the step it leads to.")}</p>
              </div>
            )}
            {canSave && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Save response")}</Label>
                <FlowVariableSelect key={selected.id} variables={variables} disabled={!!readOnly} value={selected.data.saveAs} onChange={v => patch(selected.id, d => ({ ...d, saveAs: v }))} />
                <p className="text-[11px] text-muted-foreground">{t("Use it later in any step as")} {"{"}{t("variable")}{"}"}{t(", e.g. \"Hi")} {t("{client_name}")}".</p>
              </div>
            )}
            {selected.type === "calendar" && <div className="text-xs text-muted-foreground">{t("Google Calendar")}</div>}
            {!readOnly && <Button variant="outline" size="sm" className="w-full" onClick={() => { setNodes((ns) => ns.filter((x) => x.id !== selected.id)); setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id)); setSel(null); }}>{t("Delete block")}</Button>}
          </>) : <p className="text-xs text-muted-foreground">{t("Click a block to edit it. Connect blocks by dragging from the dot at the bottom of one to the top of another.")}</p>}
        </div>
      </div>
    </div>
  );
}

const parse = (row: { nodes: unknown; edges: unknown } | null | undefined) =>
  row && Array.isArray(row.nodes) && row.nodes.length ? { nodes: row.nodes as FlowNode[], edges: (row.edges ?? []) as FlowEdge[] } : null;

/** artistId = null edits the master flow (admin); otherwise the artist's own flow with fallback to master. */
export function FlowBuilder({ artistId, canEdit = true }: { artistId: string | null; canEdit?: boolean }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TemplateFlow | null>(null);
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["ai-flow", artistId],
    queryFn: async () => {
      const master = (await supabase.from("ai_flows").select("*").is("artist_id", null).maybeSingle()).data;
      const own = artistId ? (await supabase.from("ai_flows").select("*").eq("artist_id", artistId).maybeSingle()).data : null;
      return { master, own };
    },
  });
  const savedFlow = useMemo(() => {
    const master = parse(data?.master) ?? DEFAULT_FLOW;
    return artistId && data?.own?.enabled ? parse(data.own) ?? master : master;
  }, [data, artistId]);
  if (isLoading || !data) return <div className="p-8 text-center text-muted-foreground">{t("Loading flow…")}</div>;
  const masterFlow = parse(data.master) ?? DEFAULT_FLOW;
  const custom = !!artistId && !!data.own?.enabled;

  const persist = async (f: { nodes: FlowNode[]; edges: FlowEdge[] }, enabled = true) => {
    if (f.nodes.filter(n => n.type === "whatsapp").length > 1) { toast.error("Use one WhatsApp approval block per flow"); return; }
    try {
      for (const node of f.nodes.filter(n => n.type === "whatsapp")) approvalAction([node], []);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Invalid WhatsApp number"); return; }
    setSaving(true);
    const payload = { nodes: f.nodes, edges: f.edges, enabled, updated_at: new Date().toISOString() };
    const existing = artistId ? data.own : data.master;
    const { error } = existing
      ? await supabase.from("ai_flows").update(payload).eq("id", existing.id)
      : await supabase.from("ai_flows").insert({ ...payload, artist_id: artistId });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Flow saved");
    await qc.invalidateQueries({ queryKey: ["ai-flow", artistId] });
    setDraft(null);
  };

  return (
    <ReactFlowProvider>
      <div className="studio-flow-page">
        <StudioHeading title="AI" accent="flow"><Button variant="outline" asChild><a href="#studio-workflow-templates">{t("Choose template")}</a></Button></StudioHeading>

        {draft && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{t("Template loaded · not saved")}</span><Button variant="ghost" size="sm" onClick={() => setDraft(null)}>{t("Discard template")}</Button></div>}
        {artistId ? (
          <div className="studio-flow-custom">
            <div>
              <div className="font-medium">{t("Custom conversation flow")}</div>
              <p className="text-sm text-muted-foreground">{t(custom ? "Custom flow active" : "Standard flow active")}</p>
            </div>
            <Switch disabled={!canEdit || saving} checked={custom} onCheckedChange={(on) => persist(parse(data.own) ?? masterFlow, on)} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("This is the standard flow every artist's AI assistant follows unless the artist turns on their own custom flow.")}</p>
        )}
        <Canvas initial={draft ?? savedFlow} readOnly={!canEdit} onSave={(f) => persist(f, true)} saving={saving} />
        <section id="studio-workflow-templates" className="dmr-panel"><h2 className="mb-5">{t("Workflow")} <span className="it">{t("templates")}</span></h2>
        {canEdit && <FlowTemplateLibrary admin={!artistId} current={draft ?? savedFlow} onUse={setDraft} renderEditor={(flow, saveTemplate, templateSaving) => <ReactFlowProvider><Canvas initial={flow} onSave={saveTemplate} saving={templateSaving} /></ReactFlowProvider>} />}
        </section>
      </div>
    </ReactFlowProvider>
  );
}
