import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AdminContractTemplates, AdminFormTemplates, AdminModelRates, AdminPrompts } from "./AdminMarketplace";

type Tab = "prompts" | "flows" | "forms" | "contracts" | "rates";
const card = "rounded-xl border bg-card";

/** Live and draft counts for each library, straight from the tables artists read. */
function useLibraryCounts() {
  return useQuery({
    queryKey: ["admin-library-counts"],
    refetchInterval: 30000,
    queryFn: async () => {
      const [p, f, o, c, r] = await Promise.all([
        supabase.from("agent_prompts").select("id, is_active"),
        supabase.from("ai_flow_templates").select("id, published"),
        supabase.from("order_form_templates").select("id, is_active"),
        supabase.from("contract_templates").select("id, is_active").is("artist_id", null),
        supabase.from("ai_model_rates").select("model, is_active"),
      ]);
      const split = <T,>(rows: T[] | null, live: (x: T) => boolean) => ({ total: rows?.length ?? 0, live: (rows ?? []).filter(live).length });
      return {
        prompts: split(p.data, (x) => x.is_active), flows: split(f.data, (x) => x.published), forms: split(o.data, (x) => x.is_active),
        contracts: split(c.data, (x) => x.is_active), rates: split(r.data, (x) => x.is_active),
      };
    },
  });
}

/** Workflow templates the artists can buy and copy. Editing the flow itself happens on the canvas in the AI flow builder. */
function AdminFlowTemplates({ onOpenBuilder }: { onOpenBuilder: () => void }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin-flow-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_flow_templates").select("id, name, description, price_aed, published, updated_at, nodes").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-flow-templates"] }); void qc.invalidateQueries({ queryKey: ["admin-library-counts"] }); };
  const setLive = async (id: string, published: boolean) => {
    const { error } = await supabase.from("ai_flow_templates").update({ published }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(published ? "Workflow is live for artists" : "Workflow hidden from artists");
    refresh();
  };
  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete the workflow "${name}"? Artists who already bought it keep their copy.`)) return;
    const { error } = await supabase.from("ai_flow_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Ready-made chat workflows artists can buy and copy into their own AI flow. Drafts stay hidden until you switch them on.</p>
        <Button variant="outline" onClick={onOpenBuilder}><ExternalLink className="me-1 h-4 w-4" />Create or edit on the canvas</Button>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{["Name", "Blocks", "Price (AED)", "Status", "Updated", "Live", ""].map((h) => <th key={h} className="p-3 text-start">{h}</th>)}</tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No workflow templates yet. Build one on the canvas and save it as a template.</td></tr>}
            {list.data?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3"><b>{r.name}</b><div className="max-w-md truncate text-xs text-muted-foreground">{r.description}</div></td>
                <td className="p-3">{Array.isArray(r.nodes) ? r.nodes.length : 0}</td>
                <td className="p-3">{Number(r.price_aed) > 0 ? Number(r.price_aed).toFixed(0) : "Free"}</td>
                <td className="p-3"><Badge variant={r.published ? "default" : "secondary"}>{r.published ? "Live" : "Draft"}</Badge></td>
                <td className="whitespace-nowrap p-3 text-muted-foreground">{new Date(r.updated_at).toLocaleDateString("en-GB")}</td>
                <td className="p-3"><Switch checked={r.published} onCheckedChange={(v) => void setLive(r.id, v)} aria-label={`Live: ${r.name}`} /></td>
                <td className="whitespace-nowrap p-3 text-end"><Button size="icon" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => void remove(r.id, r.name)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "prompts", label: "Agent prompts", hint: "Instructions and knowledge artists switch on for their AI agent." },
  { id: "flows", label: "Workflow templates", hint: "Chat workflows artists copy into their AI flow." },
  { id: "forms", label: "Form templates", hint: "Ready-made order forms artists copy into their booking form." },
  { id: "contracts", label: "Contract templates", hint: "Formal contracts artists attach to bookings." },
  { id: "rates", label: "AI model rates", hint: "Provider prices behind the token cost artists see." },
];

/** One place for everything the master admin publishes to artists: what is live, what is draft, and where artists see it. */
export function AdminLibrary({ onOpenFlowBuilder }: { onOpenFlowBuilder: () => void }) {
  const [tab, setTab] = useState<Tab>("prompts");
  const counts = useLibraryCounts();
  const c = counts.data;
  const count = (id: Tab) => c?.[id === "flows" ? "flows" : id];
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Everything here is read by the artist dashboards right away. Live items appear for artists on a matching plan; drafts stay hidden. Artists see prompts under AI agent, workflows under AI flow, forms under Order form and contracts under Contract.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {TABS.map((x) => {
          const n = count(x.id);
          return (
            <button key={x.id} type="button" onClick={() => setTab(x.id)} aria-pressed={tab === x.id} className={`rounded-2xl border p-4 text-start transition-colors ${tab === x.id ? "border-gold bg-gold/[.08]" : "border-border hover:border-gold/50"}`}>
              <small className="block text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{x.label}</small>
              <b className="mt-1 block font-display text-3xl font-normal">{n ? n.live : "-"}<span className="ms-1 text-sm text-muted-foreground">{n ? `live of ${n.total}` : ""}</span></b>
              <span className="mt-1 block text-xs text-muted-foreground">{n && n.total - n.live > 0 ? `${n.total - n.live} draft` : x.hint}</span>
            </button>
          );
        })}
      </div>
      <section aria-label={TABS.find((x) => x.id === tab)?.label}>
        {tab === "prompts" && <AdminPrompts />}
        {tab === "flows" && <AdminFlowTemplates onOpenBuilder={onOpenFlowBuilder} />}
        {tab === "forms" && <AdminFormTemplates />}
        {tab === "contracts" && <AdminContractTemplates />}
        {tab === "rates" && <AdminModelRates />}
      </section>
    </div>
  );
}
