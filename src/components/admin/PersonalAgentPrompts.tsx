import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PROMPT_LIMIT } from "@/lib/personal-prompts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ListState } from "./artists/parts";

type Draft = { id: string | null; title: string; body: string };

/** Agent prompts of the Personal AI Agent: a prompt that is on is part of what every agent knows and does. */
export function PersonalAgentPrompts() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-personal-prompts"],
    queryFn: async () => {
      const r = await supabase.from("personal_agent_prompts").select("id, title, body, enabled").order("created_at");
      if (r.error) throw new Error("Unable to load agent prompts");
      return r.data ?? [];
    },
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = query.data ?? [];
  const on = rows.filter((r) => r.enabled).length;
  const full = rows.length >= PROMPT_LIMIT;
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-personal-prompts"] });
  const ready = !!draft && draft.title.trim().length >= 2 && draft.body.trim().length >= 2;
  // Row security turns a change without permission into no rows rather than an error.
  const failed = (r: { error: unknown; data: unknown[] | null }) => !!r.error || !r.data?.length;
  const save = async () => {
    if (!draft || !ready || busy) return;
    setBusy(true);
    const row = { title: draft.title.trim(), body: draft.body.trim() };
    const r = draft.id
      ? await supabase.from("personal_agent_prompts").update(row).eq("id", draft.id).select("id")
      : await supabase.from("personal_agent_prompts").insert(row).select("id");
    setBusy(false);
    if (failed(r)) { toast.error("Could not save the prompt"); return; }
    setDraft(null);
    toast.success("Prompt saved");
    await refresh();
  };
  const toggle = async (id: string, enabled: boolean) => {
    if (failed(await supabase.from("personal_agent_prompts").update({ enabled }).eq("id", id).select("id"))) toast.error("Could not change the prompt");
    else toast.success(enabled ? "On. The agent uses it from the next message." : "Off");
    await refresh();
  };
  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    if (failed(await supabase.from("personal_agent_prompts").delete().eq("id", id).select("id"))) toast.error("Could not delete the prompt");
    await refresh();
  };

  return (
    <article className="adm-panel min-w-0 md:col-span-2" aria-labelledby="pa-prompts">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="pa-prompts">Agent Prompts</h2><p className="adm-meta">{on} on · {rows.length} / {PROMPT_LIMIT} · used by every Personal AI Agent</p></div>
        <Button size="sm" disabled={full || query.isPending} onClick={() => setDraft({ id: null, title: "", body: "" })}><Plus />{full ? "Prompt limit reached" : "Add Prompt"}</Button>
      </div>
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No prompt yet. Add one to give the agent a task or knowledge."}>
        <div className="min-w-0 overflow-x-auto"><table className="w-full table-fixed text-sm">
          <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="w-1/4 py-2 pe-2 text-start">Title</th><th className="py-2 pe-2 text-start">Prompt AI</th><th className="w-14 py-2 text-center">Edit</th><th className="w-14 py-2 text-center">On</th><th className="w-14 py-2 text-center">Delete</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border align-top last:border-0">
                <td className="break-words py-3 pe-2" dir="auto"><b>{p.title}</b></td>
                <td className="py-3 pe-2"><span className="line-clamp-2 break-words" dir="auto">{p.body}</span></td>
                <td className="py-2 text-center"><Button size="icon" variant="outline" aria-label={`Edit ${p.title}`} onClick={() => setDraft({ id: p.id, title: p.title, body: p.body })}><Pencil /></Button></td>
                <td className="py-3 text-center"><Switch checked={p.enabled} aria-label={`Use ${p.title}`} onCheckedChange={(value) => void toggle(p.id, value)} /></td>
                <td className="py-2 text-center"><Button size="icon" variant="ghost" aria-label={`Delete ${p.title}`} onClick={() => void remove(p.id, p.title)}><Trash2 /></Button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </ListState>
      <Dialog open={!!draft} onOpenChange={(open) => { if (!open && !busy) setDraft(null); }}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit Prompt" : "Add Prompt"}</DialogTitle><DialogDescription>A task or knowledge for the Personal AI Agent.</DialogDescription></DialogHeader>
          {draft && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <div className="space-y-1"><Label htmlFor="pa-title">Title</Label><Input id="pa-title" maxLength={120} dir="auto" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div className="space-y-1"><div className="flex justify-between"><Label htmlFor="pa-body">Prompt AI</Label><small className="adm-meta">{draft.body.length} / 4000</small></div><Textarea id="pa-body" rows={9} maxLength={4000} dir="auto" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={!ready || busy}>Save</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}
