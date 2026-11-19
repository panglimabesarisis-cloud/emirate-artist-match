import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, MiniMap, Controls, Handle, Position, addEdge, useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FIELD_TYPES, FORM_FIELD_PRESETS, type FormField, type FieldType, FLOW_VARIABLES, type UrlButton, DEFAULT_FLOW, FLOW_GROUPS, FLOW_KINDS, isBranching, kindColor, kindLabel, type FlowEdge, type FlowKind, type FlowNode } from "@/lib/ai-flow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { approvalAction } from "@/lib/ai-flow";
import { useI18n } from "@/lib/i18n";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Data = { text: string; buttons?: string[]; urlButtons?: UrlButton[]; saveAs?: string | undefined; fields?: FormField[]; destinationPhone?: string };
const EMOJI = ["😊", "👋", "🎉", "🎤", "🎶", "💃", "📅", "⏰", "📍", "💰", "✅", "🙏"];

function StepNode({ data, type, selected }: NodeProps<Node<Data>>) {
  const k = type as FlowKind;
  const branch = isBranching(k);
  const color = `var(${kindColor(k)})`;
  return (
    <div className={`w-56 overflow-visible rounded-lg border bg-card text-card-foreground shadow-sm transition ${selected ? "ring-2 ring-primary" : ""}`}>
      {k !== "start" && <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border !border-border !bg-background" />}
      <div className="flex items-center gap-2 px-3 pt-2.5 text-xs font-semibold">
        <span className="grid h-5 w-5 place-items-center rounded text-[10px] text-primary-foreground" style={{ background: color }}>{kindLabel(k)[0]}</span>
        <span className="truncate">{kindLabel(k)}</span>
      </div>
      <div className="px-3 pb-2.5 pt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">{data.text || "Click to edit…"}</div>
      {k === "whatsapp" && <div className="border-t px-3 py-2 text-[11px] text-muted-foreground"><div>{data.destinationPhone || "Artist's WhatsApp"}</div><div>Approval → Invoice</div></div>}
      {data.saveAs && <div className="mx-3 mb-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">→ {"{"}{data.saveAs}{"}"}</div>}
      {k === "form" && (
        <div className="space-y-1 border-t px-3 py-2">
          {(data.fields ?? []).map((f, i) => <div key={i} className="flex justify-between rounded border bg-background px-2 py-1 text-[11px]"><span className="font-medium">{f.label || "Field"}</span><span className="text-muted-foreground">{f.type}</span></div>)}
        </div>
      )}
      {k === "buttons" && (
        <div className="space-y-1 border-t px-3 py-2">
          {(data.buttons ?? []).map((b, i) => (
            <div key={i} className="relative rounded border bg-background px-2 py-1 text-center text-[11px] font-medium">
              {b || "Button"}
              <Handle id={`b${i}`} type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-background" style={{ background: color, right: -16 }} />
            </div>
          ))}
          {(data.urlButtons ?? []).map((u, i) => <div key={`u${i}`} className="rounded border border-dashed px-2 py-1 text-center text-[11px] text-primary">🔗 {u.label || "Link"}</div>)}
        </div>
      )}
      {branch ? (
        <div className="flex justify-between px-4 pb-2 text-[10px] font-semibold text-muted-foreground"><span>{k === "calendar" ? "Available" : "Yes"}</span><span>{k === "calendar" ? "Busy" : "No"}</span>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "20%", background: color }} className="!h-2.5 !w-2.5" />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: "80%", background: color }} className="!h-2.5 !w-2.5" />
        </div>
      ) : k !== "handover" && k !== "booking" && k !== "whatsapp" ? <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border !border-border !bg-background" /> : null}
    </div>
  );
}
const nodeTypes = Object.fromEntries(FLOW_KINDS.map((k) => [k.kind, StepNode]));

const toRF = (f: { nodes: FlowNode[]; edges: FlowEdge[] }) => ({
  nodes: f.nodes as Node<Data>[],
  edges: f.edges.map((e) => ({ ...e, type: "smoothstep", label: e.sourceHandle === "yes" ? "Yes" : e.sourceHandle === "no" ? "No" : undefined })) as Edge[],
});

/** Rich text box with a WotNot/TinyMCE-style toolbar; formatting is saved as simple markdown. */
function RichText({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrapSel = (before: string, after = before, fallback = "text") => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    const inner = value.slice(a, b) || fallback;
    const next = value.slice(0, a) + before + inner + after + value.slice(b);
    onChange(next.slice(0, 500));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + inner.length); });
  };
  const insert = (t: string) => wrapSel("", "", t);
  const linePrefix = (pre: (i: number) => string) => {
    const el = ref.current; if (!el) return;
    const a = value.lastIndexOf("\n", el.selectionStart - 1) + 1, b = el.selectionEnd;
    const block = value.slice(a, b).split("\n").map((l, i) => pre(i) + l).join("\n");
    onChange((value.slice(0, a) + block + value.slice(b)).slice(0, 500));
  };
  const Tb = ({ label, title, onClick, className = "" }: { label: string; title: string; onClick: () => void; className?: string }) => (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`grid h-7 min-w-7 place-items-center rounded px-1 text-xs hover:bg-muted disabled:opacity-40 ${className}`}>{label}</button>
  );
  return (
    <div className="rounded-md border focus-within:ring-1 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-0.5">
        <Tb label="B" title="Bold" className="font-bold" onClick={() => wrapSel("**")} />
        <Tb label="I" title="Italic" className="italic" onClick={() => wrapSel("_")} />
        <Tb label="U" title="Underline" className="underline" onClick={() => wrapSel("__")} />
        <Tb label="•" title="Bullet list" onClick={() => linePrefix(() => "- ")} />
        <Tb label="1." title="Numbered list" onClick={() => linePrefix((i) => `${i + 1}. `)} />
        <Tb label="🔗" title="Link" onClick={() => wrapSel("[", "](https://)", "link")} />
        <Popover>
          <PopoverTrigger asChild><button type="button" disabled={disabled} title="Insert variable" className="grid h-7 place-items-center rounded px-1.5 font-mono text-xs hover:bg-muted">{"{x}"}</button></PopoverTrigger>
          <PopoverContent className="w-48 p-1">{FLOW_VARIABLES.map((v) => <button key={v} type="button" onClick={() => insert(`{${v}}`)} className="block w-full rounded px-2 py-1 text-start font-mono text-xs hover:bg-muted">{v}</button>)}</PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild><button type="button" disabled={disabled} title="Emoji" className="ms-auto grid h-7 w-7 place-items-center rounded hover:bg-muted">☺</button></PopoverTrigger>
          <PopoverContent className="grid w-44 grid-cols-6 gap-1 p-2">{EMOJI.map((e) => <button key={e} type="button" onClick={() => insert(e)} className="rounded p-0.5 text-lg hover:bg-muted">{e}</button>)}</PopoverContent>
        </Popover>
      </div>
      <textarea ref={ref} rows={5} maxLength={500} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}
        className="block w-full resize-none bg-transparent px-3 py-2 text-sm outline-none" />
      <div className="flex justify-between px-3 pb-1.5 text-[10px] text-muted-foreground"><span>Insert a variable with {"{x}"}</span><span>{value.length}/500</span></div>
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
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<string>("All");
  const wrap = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();
  useEffect(() => { setNodes(start.nodes); setEdges(start.edges); setSel(null); }, [start, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: crypto.randomUUID(), type: "smoothstep", label: c.sourceHandle === "yes" ? "Yes" : c.sourceHandle === "no" ? "No" : undefined }, es)), [setEdges]);
  const add = (kind: FlowKind, pos?: { x: number; y: number }) => {
    const def = FLOW_KINDS.find((k) => k.kind === kind);
    if (!def) return;
    const id = crypto.randomUUID();
    const position = pos ?? rf.screenToFlowPosition({ x: (wrap.current?.getBoundingClientRect().left ?? 0) + 200, y: (wrap.current?.getBoundingClientRect().top ?? 0) + 120 });
    setNodes((ns) => [...ns, { id, type: kind, position, data: kind === "buttons" ? { text: def.placeholder, buttons: ["Option 1", "Option 2"] } : kind === "form" ? { text: def.placeholder, fields: [{ label: "Name", type: "text", saveAs: "client_name" }, { label: "Email", type: "email" }, { label: "Phone", type: "phone" }, ...FORM_FIELD_PRESETS.map((f) => ({ ...f }))] } : { text: def.placeholder } }]);
    setSel(id);
  };
  const selected = nodes.find((x) => x.id === sel);
  const patch = (id: string, f: (d: Data) => Data) => setNodes((ns) => ns.map((x) => (x.id === id ? { ...x, data: f(x.data) } : x)));
  const setButtons = (id: string, f: (bs: string[]) => string[]) => patch(id, (d) => ({ ...d, buttons: f(d.buttons ?? []) }));
  const setFields = (id: string, f: (fs: FormField[]) => FormField[]) => patch(id, (d) => ({ ...d, fields: f(d.fields ?? []) }));
  const setUrls = (id: string, f: (bs: UrlButton[]) => UrlButton[]) => patch(id, (d) => ({ ...d, urlButtons: f(d.urlButtons ?? []) }));
  const save = () => onSave({
    nodes: nodes.map((x) => {
      const d: FlowNode["data"] = { text: x.data.text };
      if (x.data.buttons) d.buttons = x.data.buttons.map((b) => b.trim()).filter(Boolean);
      const urls = (x.data.urlButtons ?? []).filter((u) => u.label.trim() && /^https?:\/\//.test(u.url));
      if (urls.length) d.urlButtons = urls;
      if (x.data.saveAs) d.saveAs = x.data.saveAs;
      if (x.type === "whatsapp") d.destinationPhone = x.data.destinationPhone?.trim() ?? "";
      const fields = (x.data.fields ?? []).map((f) => ({ ...f, label: f.label.trim() })).filter((f) => f.label);
      if (fields.length) d.fields = fields.map((f) => (f.saveAs ? f : { label: f.label, type: f.type }));
      return { id: x.id, type: x.type as FlowKind, position: { x: Math.round(x.position.x), y: Math.round(x.position.y) }, data: d };
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  });
  const blocks = FLOW_KINDS.filter((k) => (tab === "All" || k.group === tab) && k.label.toLowerCase().includes(q.toLowerCase()));
  const canSave = selected && !["start", "message", "handover", "booking", "form", "whatsapp"].includes(selected.type as string);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b bg-card px-3 py-2">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Blocks: {nodes.length}</span>
        {!readOnly && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { const d = toRF(DEFAULT_FLOW); setNodes(d.nodes); setEdges(d.edges); setSel(null); }}>Reset</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save flow"}</Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_320px] [&>*]:min-w-0">
        {!readOnly && (
          <div className="space-y-2 border-b bg-card p-3 lg:border-b-0 lg:border-e">
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-sm" />
            <div className="flex flex-wrap gap-1">
              {["All", ...FLOW_GROUPS].map((g) => <button key={g} onClick={() => setTab(g)} className={`rounded-full border px-2 py-0.5 text-[11px] ${tab === g ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>{g === "All" ? "All" : GROUP_LABEL[g]}</button>)}
            </div>
            <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
              {blocks.map((k) => (
                <button key={k.kind} draggable onDragStart={(e) => e.dataTransfer.setData("application/flow", k.kind)} onClick={() => add(k.kind)} title={k.hint}
                  className="flex shrink-0 cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted lg:w-full">
                  <span className="grid h-5 w-5 place-items-center rounded text-[10px] text-primary-foreground" style={{ background: `var(${k.color})` }}>{k.label[0]}</span>{k.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={wrap} className={`h-[480px] bg-muted/30 lg:h-[680px] ${readOnly ? "lg:col-span-2" : ""}`}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("application/flow") as FlowKind; if (k) add(k, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} {...(readOnly ? {} : { onNodesChange, onEdgesChange, onConnect })} onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)}
            nodesDraggable={!readOnly} nodesConnectable={!readOnly} deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]} fitView>
            <Background gap={16} size={1.2} /><Controls position="bottom-center" orientation="horizontal" /><MiniMap pannable zoomable style={{ width: 140, height: 90 }} className="!hidden md:!block" />
          </ReactFlow>
        </div>
        <div className="space-y-4 border-t bg-card p-4 lg:border-s lg:border-t-0">
          {selected ? (<>
            <div>
              <div className="text-xs text-muted-foreground">{kindLabel(selected.type as FlowKind)}</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold"><span className="grid h-6 w-6 place-items-center rounded text-[11px] text-primary-foreground" style={{ background: `var(${kindColor(selected.type as FlowKind)})` }}>{kindLabel(selected.type as FlowKind)[0]}</span>{kindLabel(selected.type as FlowKind)}</div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bot asks / does this</Label>
              <RichText disabled={!!readOnly} value={selected.data.text} onChange={(v) => patch(selected.id, (d) => ({ ...d, text: v }))} />
            </div>
            {selected.type === "form" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Fields included in the form</Label>
                {!readOnly && FORM_FIELD_PRESETS.some((preset) => !(selected.data.fields ?? []).some((f) => f.saveAs === preset.saveAs || f.label === preset.label)) && (
                  <Select value="" disabled={(selected.data.fields?.length ?? 0) >= 8} onValueChange={(value) => {
                    const preset = FORM_FIELD_PRESETS.find((f) => f.saveAs === value);
                    if (!preset) return;
                    setFields(selected.id, (fs) => fs.length >= 8 || fs.some((f) => f.saveAs === preset.saveAs || f.label === preset.label) ? fs : [...fs, { ...preset }]);
                  }}>
                    <SelectTrigger aria-label="Add booking field" className="h-8 text-xs"><SelectValue placeholder="Add booking field" /></SelectTrigger>
                    <SelectContent>{FORM_FIELD_PRESETS.filter((preset) => !(selected.data.fields ?? []).some((f) => f.saveAs === preset.saveAs || f.label === preset.label)).map((preset) => <SelectItem key={preset.saveAs} value={preset.saveAs ?? preset.label}>{preset.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {(selected.data.fields ?? []).map((f, i) => (
                  <div key={i} className="space-y-1 rounded-md border p-2">
                    <div className="flex gap-1">
                      <Input className="h-7 text-xs" placeholder="Field label" value={f.label} maxLength={30} disabled={readOnly} onChange={(e) => setFields(selected.id, (fs) => fs.map((v, j) => (j === i ? { ...v, label: e.target.value.replace(/[|:\]\[]/g, "") } : v)))} />
                      {!readOnly && <Button variant="ghost" size="sm" className="h-7 px-2" title="Remove field" onClick={() => setFields(selected.id, (fs) => fs.filter((_, j) => j !== i))}>✕</Button>}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Select disabled={!!readOnly} value={f.type} onValueChange={(v) => setFields(selected.id, (fs) => fs.map((x, j) => (j === i ? { ...x, type: v as FieldType } : x)))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select disabled={!!readOnly} value={f.saveAs ?? "none"} onValueChange={(v) => setFields(selected.id, (fs) => fs.map((x, j) => (j === i ? { ...x, saveAs: v === "none" ? undefined : v } : x)))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Save to" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Don't save</SelectItem>{FLOW_VARIABLES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
                {!readOnly && <Button variant="outline" size="sm" className="w-full" disabled={(selected.data.fields?.length ?? 0) >= 8} onClick={() => setFields(selected.id, (fs) => [...fs, { label: `Field ${fs.length + 1}`, type: "text" }])}>+ Form field</Button>}
                <p className="text-[11px] text-muted-foreground">The client sees one form with all fields and sends it in one go.</p>
              </div>
            )}
            {selected.type === "whatsapp" && <div className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="approval-phone">{t("Artist WhatsApp number")}</Label><Input id="approval-phone" aria-label="Artist WhatsApp number" type="tel" dir="ltr" maxLength={16} placeholder="+971501234567" value={selected.data.destinationPhone ?? ""} disabled={readOnly} onChange={e => patch(selected.id, d => ({ ...d, destinationPhone: e.target.value.replace(/[^+\d]/g, "") }))} /></div>
              <div className="space-y-1.5"><Label>{t("Destination")}</Label><div className="text-sm text-muted-foreground">{selected.data.destinationPhone || t("Artist's saved WhatsApp number")}</div></div>
              <div className="space-y-1.5"><Label>{t("On approval")}</Label><div className="text-sm">{t("Send invoice to client chat")}</div></div>
              <div className="space-y-1.5"><Label>{t("If declined")}</Label><div className="text-sm text-muted-foreground">{t("No invoice · artist takes over")}</div></div>
            </div>}
            {selected.type === "buttons" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Display as</Label>
                {(selected.data.buttons ?? []).map((b, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-md bg-primary px-2 text-primary-foreground">
                    <input value={b} maxLength={30} disabled={readOnly} onChange={(e) => setButtons(selected.id, (bs) => bs.map((v, j) => (j === i ? e.target.value.replace(/[|\]\[]/g, "") : v)))}
                      className="h-8 flex-1 bg-transparent text-center text-sm outline-none placeholder:text-primary-foreground/60" placeholder="Button" />
                    {!readOnly && <button title="Remove" onClick={() => { setButtons(selected.id, (bs) => bs.filter((_, j) => j !== i)); setEdges((es) => es.filter((e) => !(e.source === selected.id && e.sourceHandle?.startsWith("b")))); }} className="text-xs opacity-70 hover:opacity-100">✕</button>}
                  </div>
                ))}
                {(selected.data.urlButtons ?? []).map((u, i) => (
                  <div key={`u${i}`} className="space-y-1 rounded-md border border-dashed p-2">
                    <div className="flex gap-1"><Input className="h-7 text-xs" placeholder="Label" value={u.label} maxLength={30} disabled={readOnly} onChange={(e) => setUrls(selected.id, (us) => us.map((v, j) => (j === i ? { ...v, label: e.target.value } : v)))} />
                      {!readOnly && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setUrls(selected.id, (us) => us.filter((_, j) => j !== i))}>✕</Button>}</div>
                    <Input className="h-7 text-xs" placeholder="https://…" value={u.url} maxLength={300} disabled={readOnly} onChange={(e) => setUrls(selected.id, (us) => us.map((v, j) => (j === i ? { ...v, url: e.target.value } : v)))} />
                  </div>
                ))}
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" disabled={(selected.data.buttons?.length ?? 0) >= 6} onClick={() => setButtons(selected.id, (bs) => [...bs, `Option ${bs.length + 1}`])}>+ Branch button</Button>
                    <Button variant="outline" size="sm" className="flex-1" disabled={(selected.data.urlButtons?.length ?? 0) >= 3} onClick={() => setUrls(selected.id, (us) => [...us, { label: "Open link", url: "https://" }])}>+ URL button</Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">Drag from the dot beside each branch button to the step it leads to.</p>
              </div>
            )}
            {canSave && (
              <div className="space-y-1.5">
                <Label className="text-xs">Save response</Label>
                <Select disabled={!!readOnly} value={selected.data.saveAs ?? "none"} onValueChange={(v) => patch(selected.id, (d) => ({ ...d, saveAs: v === "none" ? undefined : v }))}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Select variable" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Don't save</SelectItem>{FLOW_VARIABLES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Use it later in any step as {"{"}variable{"}"}, e.g. "Hi {"{client_name}"}".</p>
              </div>
            )}
            {selected.type === "calendar" && <p className="rounded-md bg-muted p-2 text-[11px] text-muted-foreground">Uses the artist's blocked dates and confirmed bookings. "Available" and "Busy" outputs lead to different steps.</p>}
            {!readOnly && <Button variant="outline" size="sm" className="w-full" onClick={() => { setNodes((ns) => ns.filter((x) => x.id !== selected.id)); setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id)); setSel(null); }}>Delete block</Button>}
          </>) : <p className="text-xs text-muted-foreground">Click a block to edit it. Connect blocks by dragging from the dot at the bottom of one to the top of another.</p>}
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
  const { data, isLoading } = useQuery({
    queryKey: ["ai-flow", artistId],
    queryFn: async () => {
      const master = (await supabase.from("ai_flows").select("*").is("artist_id", null).maybeSingle()).data;
      const own = artistId ? (await supabase.from("ai_flows").select("*").eq("artist_id", artistId).maybeSingle()).data : null;
      return { master, own };
    },
  });
  if (isLoading || !data) return <div className="p-8 text-center text-muted-foreground">Loading flow…</div>;
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
    qc.invalidateQueries({ queryKey: ["ai-flow", artistId] });
  };

  return (
    <ReactFlowProvider>
      <div className="space-y-4">
        {artistId ? (
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
            <div>
              <div className="font-medium">Custom conversation flow</div>
              <p className="text-sm text-muted-foreground">{custom ? "Your AI assistant follows your own flow below." : "Off: your AI assistant follows the standard Dealmaker flow (shown below, read-only). Turn on to customise it."}</p>
            </div>
            <Switch disabled={!canEdit || saving} checked={custom} onCheckedChange={(on) => persist(parse(data.own) ?? masterFlow, on)} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This is the standard flow every artist's AI assistant follows unless the artist turns on their own custom flow.</p>
        )}
        <Canvas initial={artistId && custom ? parse(data.own) ?? masterFlow : masterFlow} readOnly={!canEdit || (!!artistId && !custom)} onSave={(f) => persist(f, true)} saving={saving} />
      </div>
    </ReactFlowProvider>
  );
}
