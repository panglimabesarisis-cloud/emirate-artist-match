import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, Handle, Position, addEdge, useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_FLOW, FLOW_KINDS, isBranching, kindLabel, type FlowEdge, type FlowKind, type FlowNode } from "@/lib/ai-flow";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Data = { text: string };

function StepNode({ data, type, selected }: NodeProps<Node<Data>>) {
  const branch = isBranching(type as FlowKind);
  return (
    <div className={`w-56 rounded-lg border bg-card text-card-foreground shadow-sm ${selected ? "ring-2 ring-primary" : ""}`}>
      {type !== "start" && <Handle type="target" position={Position.Top} />}
      <div className="rounded-t-lg bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">{kindLabel(type as FlowKind)}</div>
      <div className="px-3 py-2 text-xs line-clamp-3">{data.text || <span className="text-muted-foreground">Click to edit…</span>}</div>
      {branch ? (
        <div className="flex justify-between px-3 pb-1 text-[10px] text-muted-foreground"><span>Yes</span><span>No</span>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "20%" }} />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: "80%" }} />
        </div>
      ) : type !== "handover" && type !== "booking" ? <Handle type="source" position={Position.Bottom} /> : null}
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
    setNodes((ns) => [...ns, { id, type: kind, position, data: { text: def.placeholder } }]);
    setSel(id);
  };
  const selected = nodes.find((x) => x.id === sel);
  const save = () => onSave({
    nodes: nodes.map((x) => ({ id: x.id, type: x.type as FlowKind, position: { x: Math.round(x.position.x), y: Math.round(x.position.y) }, data: { text: x.data.text } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[180px_1fr_260px]">
      {!readOnly && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Drag a step onto the canvas</p>
          {FLOW_KINDS.map((k) => (
            <button key={k.kind} draggable onDragStart={(e) => e.dataTransfer.setData("application/flow", k.kind)} onClick={() => add(k.kind)}
              className="w-full cursor-grab rounded-md border bg-card px-3 py-2 text-start text-sm hover:border-primary">
              <div className="font-medium">{k.label}</div><div className="text-[11px] text-muted-foreground">{k.hint}</div>
            </button>
          ))}
        </div>
      )}
      <div ref={wrap} className={`h-[560px] rounded-lg border bg-background ${readOnly ? "lg:col-span-2" : ""}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("application/flow") as FlowKind; if (k) add(k, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} {...(readOnly ? {} : { onNodesChange, onEdgesChange, onConnect })} onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)}
          nodesDraggable={!readOnly} nodesConnectable={!readOnly} deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]} fitView>
          <Background gap={16} /><Controls />
        </ReactFlow>
      </div>
      <div className="space-y-3">
        {selected ? (
          <div className="space-y-2 rounded-lg border bg-card p-3">
            <div className="text-sm font-semibold">{kindLabel(selected.type as FlowKind)}</div>
            <Label className="text-xs">What the AI should do in this step</Label>
            <Textarea rows={6} maxLength={500} disabled={readOnly} value={selected.data.text}
              onChange={(e) => setNodes((ns) => ns.map((x) => (x.id === selected.id ? { ...x, data: { text: e.target.value } } : x)))} />
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
