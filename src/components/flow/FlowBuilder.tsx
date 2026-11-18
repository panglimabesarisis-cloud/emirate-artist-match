import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, MiniMap, Controls, Handle, Position, addEdge, useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_FLOW, FLOW_GROUPS, FLOW_KINDS, isBranching, kindColor, kindLabel, type FlowEdge, type FlowKind, type FlowNode } from "@/lib/ai-flow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Data = { text: string; buttons?: string[] };

function StepNode({ data, type, selected }: NodeProps<Node<Data>>) {
  const k = type as FlowKind;
  const branch = isBranching(k);
  const color = `var(${kindColor(k)})`;
  return (
    <div className={`w-64 overflow-visible rounded-xl border-2 bg-card text-card-foreground shadow-md transition ${selected ? "border-primary shadow-lg" : "border-transparent"}`}>
      {k !== "start" && <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-background" style={{ background: color }} />}
      <div className="flex items-center gap-2 rounded-t-xl px-3 py-2 text-xs font-semibold" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{kindLabel(k)}
      </div>
      <div className="px-3 py-2">
        <div className="rounded-lg bg-muted px-3 py-2 text-xs line-clamp-3">{data.text || <span className="text-muted-foreground">Click to edit…</span>}</div>
      </div>
      {k === "buttons" && (
        <div className="space-y-1.5 px-3 pb-3">
          {(data.buttons ?? []).map((b, i) => (
            <div key={i} className="relative rounded-full border px-3 py-1 text-center text-xs font-medium" style={{ borderColor: color }}>
              {b || "Button"}
              <Handle id={`b${i}`} type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-background" style={{ background: color, right: -18 }} />
            </div>
          ))}
        </div>
      )}
      {branch ? (
        <div className="flex justify-between px-4 pb-2 text-[10px] font-semibold text-muted-foreground"><span>{k === "calendar" ? "Available" : "Yes"}</span><span>{k === "calendar" ? "Busy" : "No"}</span>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "20%", background: color }} className="!h-3 !w-3" />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: "80%", background: color }} className="!h-3 !w-3" />
        </div>
      ) : k !== "handover" && k !== "booking" ? <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-background" style={{ background: color }} /> : null}
    </div>
  );
}
const nodeTypes = Object.fromEntries(FLOW_KINDS.map((k) => [k.kind, StepNode]));

const toRF = (f: { nodes: FlowNode[]; edges: FlowEdge[] }) => ({
  nodes: f.nodes as Node<Data>[],
  edges: f.edges.map((e) => ({ ...e, label: e.sourceHandle === "yes" ? "Yes" : e.sourceHandle === "no" ? "No" : undefined })) as Edge[],
});

function Canvas({ initial, readOnly, onSave, saving }: { initial: { nodes: FlowNode[]; edges: FlowEdge[] }; readOnly?: boolean; onSave: (f: { nodes: FlowNode[]; edges: FlowEdge[] }) => void; saving: boolean }) {
  const start = useMemo(() => toRF(initial), [initial]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Data>>(start.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(start.edges);
  const [sel, setSel] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();
  useEffect(() => { setNodes(start.nodes); setEdges(start.edges); setSel(null); }, [start, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: crypto.randomUUID(), label: c.sourceHandle === "yes" ? "Yes" : c.sourceHandle === "no" ? "No" : undefined }, es)), [setEdges]);
  const add = (kind: FlowKind, pos?: { x: number; y: number }) => {
    const def = FLOW_KINDS.find((k) => k.kind === kind)!;
    const id = crypto.randomUUID();
    const position = pos ?? rf.screenToFlowPosition({ x: (wrap.current?.getBoundingClientRect().left ?? 0) + 200, y: (wrap.current?.getBoundingClientRect().top ?? 0) + 120 });
    setNodes((ns) => [...ns, { id, type: kind, position, data: kind === "buttons" ? { text: def.placeholder, buttons: ["Option 1", "Option 2"] } : { text: def.placeholder } }]);
    setSel(id);
  };
  const selected = nodes.find((x) => x.id === sel);
  const setButtons = (id: string, f: (bs: string[]) => string[]) => setNodes((ns) => ns.map((x) => (x.id === id ? { ...x, data: { ...x.data, buttons: f(x.data.buttons ?? []) } } : x)));
  const save = () => onSave({
    nodes: nodes.map((x) => ({ id: x.id, type: x.type as FlowKind, position: { x: Math.round(x.position.x), y: Math.round(x.position.y) }, data: x.data.buttons ? { text: x.data.text, buttons: x.data.buttons.map((b) => b.trim()).filter(Boolean) } : { text: x.data.text } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[200px_1fr_280px]">
      {!readOnly && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Drag a block onto the canvas</p>
          {FLOW_GROUPS.map((g) => <div key={g} className="space-y-1.5"><div className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</div>
          {FLOW_KINDS.filter((k) => k.group === g).map((k) => (
            <button key={k.kind} draggable onDragStart={(e) => e.dataTransfer.setData("application/flow", k.kind)} onClick={() => add(k.kind)}
              className="flex w-full cursor-grab items-center gap-2 rounded-lg border bg-card px-3 py-2 text-start text-sm hover:border-primary">
              <span className="h-6 w-1 rounded-full" style={{ background: `var(${k.color})` }} />
              <span><span className="block font-medium">{k.label}</span><span className="block text-[11px] text-muted-foreground">{k.hint}</span></span>
            </button>
          ))}</div>)}
        </div>
      )}
      <div ref={wrap} className={`h-[640px] rounded-xl border bg-muted/30 ${readOnly ? "lg:col-span-2" : ""}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("application/flow") as FlowKind; if (k) add(k, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} {...(readOnly ? {} : { onNodesChange, onEdgesChange, onConnect })} onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)}
          nodesDraggable={!readOnly} nodesConnectable={!readOnly} deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]} fitView>
          <Background gap={20} size={1.5} /><Controls /><MiniMap pannable zoomable style={{ width: 140, height: 90 }} className="!hidden md:!block" />
        </ReactFlow>
      </div>
      <div className="space-y-3">
        {selected ? (
          <div className="space-y-2 rounded-lg border bg-card p-3">
            <div className="text-sm font-semibold">{kindLabel(selected.type as FlowKind)}</div>
            <Label className="text-xs">What the AI should do in this step</Label>
            <Textarea rows={6} maxLength={500} disabled={readOnly} value={selected.data.text}
              onChange={(e) => setNodes((ns) => ns.map((x) => (x.id === selected.id ? { ...x, data: { ...x.data, text: e.target.value } } : x)))} />
            {selected.type === "buttons" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Buttons (client taps one)</Label>
                {(selected.data.buttons ?? []).map((b, i) => (
                  <div key={i} className="flex gap-1">
                    <Input value={b} maxLength={30} disabled={readOnly} onChange={(e) => setButtons(selected.id, (bs) => bs.map((v, j) => (j === i ? e.target.value.replace(/[|\]\[]/g, "") : v)))} />
                    {!readOnly && <Button variant="ghost" size="sm" onClick={() => { setButtons(selected.id, (bs) => bs.filter((_, j) => j !== i)); setEdges((es) => es.filter((e) => !(e.source === selected.id && e.sourceHandle?.startsWith("b")))); }}>✕</Button>}
                  </div>
                ))}
                {!readOnly && (selected.data.buttons?.length ?? 0) < 6 && <Button variant="outline" size="sm" className="w-full" onClick={() => setButtons(selected.id, (bs) => [...bs, `Option ${bs.length + 1}`])}>+ Add button</Button>}
                <p className="text-[11px] text-muted-foreground">Drag from the dot beside each button to the step it should lead to.</p>
              </div>
            )}
            {selected.type === "calendar" && <p className="rounded-md bg-muted p-2 text-[11px] text-muted-foreground">Uses the artist's blocked dates and confirmed bookings. "Available" and "Busy" outputs lead to different steps.</p>}
            {!readOnly && <Button variant="outline" size="sm" className="w-full" onClick={() => { setNodes((ns) => ns.filter((x) => x.id !== selected.id)); setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id)); setSel(null); }}>Delete step</Button>}
          </div>
        ) : <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Click a step to edit its instruction. Connect steps by dragging from the dot at the bottom of one step to the top of another. Conditions have Yes / No outputs.</p>}
        {!readOnly && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save flow"}</Button>
            <Button variant="outline" onClick={() => { const d = toRF(DEFAULT_FLOW); setNodes(d.nodes); setEdges(d.edges); setSel(null); }}>Reset</Button>
          </div>
        )}
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
