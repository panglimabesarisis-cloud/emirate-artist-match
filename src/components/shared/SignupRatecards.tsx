import { useEffect, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RatecardFields } from "./RatecardFields";
import { RatecardDetails } from "./RatecardDetails";
import { emptyRate, ratePayload, rateScope, rateTotals, restoreRateDraft, type RateDraft } from "@/lib/ratecard";
import { aed } from "@/lib/format";

export function SignupRatecards({ packages, onChange, draftKey, onPending }: { packages: RateDraft[]; onChange: (v: RateDraft[]) => void; draftKey: string; onPending: (v: boolean) => void }) {
  const [draft, setDraft] = useState<RateDraft>(emptyRate);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const pending = editing !== null || JSON.stringify(draft) !== JSON.stringify(emptyRate());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) { const saved = JSON.parse(raw); setDraft(restoreRateDraft(saved.draft)); setEditing(Number.isInteger(saved.editing) && saved.editing >= 0 && saved.editing < packages.length ? saved.editing : null); }
    } catch { localStorage.removeItem(draftKey); }
    setReady(true);
  }, [draftKey]);
  useEffect(() => {
    if (!ready) return;
    onPending(pending);
    if (pending) localStorage.setItem(draftKey, JSON.stringify({ draft, editing })); else localStorage.removeItem(draftKey);
  }, [ready, draft, editing, pending, draftKey, onPending]);
  const save = () => {
    try {
      ratePayload(draft);
      if (packages.some((p, i) => i !== editing && p.title.trim().toLowerCase() === draft.title.trim().toLowerCase())) throw new Error("This service title already exists.");
      onChange(editing === null ? [...packages, draft] : packages.map((p, i) => i === editing ? draft : p));
      setDraft(emptyRate()); setEditing(null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Check the package details."); }
  };
  return <div className="space-y-5">
    {(packages.length < 3 || editing !== null) && <section className="space-y-4 border-y border-border py-5">
      <h3 className="font-display text-2xl">{editing === null ? "Add ratecard" : "Edit ratecard"}</h3>
      <RatecardFields value={draft} onChange={setDraft} units={packages.flatMap(p => [p.unit_label, ...p.items.map(i => i.unit)])} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-3"><Button type="button" variant="outline" className="ratecard-reset" onClick={() => { setDraft(emptyRate()); setEditing(null); setError(""); }}>Reset / clear</Button><Button type="button" className="bg-gradient-gold text-gold-foreground" onClick={save}><Check className="me-2 h-4 w-4" />Save ratecard</Button></div>
    </section>}
    <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead className="border-y border-border text-muted-foreground"><tr>{["Job / service title", "Base price", "Unit & scope", "Actions"].map(label => <th key={label} className="p-3 text-start">{label}</th>)}</tr></thead><tbody>
      {packages.map((p, i) => {
        let row;
        try { row = ratePayload(p); } catch { row = null; }
        return <tr className="border-b border-border" key={i}><td className="p-3"><b>{p.title || "Untitled package"}</b>{row && <details className="mt-2"><summary className="cursor-pointer text-xs text-gold">{p.items.length} items · Rules of work</summary><div className="mt-3"><RatecardDetails rate={row} /></div></details>}</td><td className="p-3 text-gold" dir="ltr">{aed(rateTotals(p.items).base)}</td><td className="p-3">{row ? rateScope(row) : "Complete package details"}</td><td className="p-3"><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" aria-label={`Edit ${p.title}`} onClick={() => { setDraft(p); setEditing(i); setError(""); }}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${p.title}`} onClick={() => { onChange(packages.filter((_, j) => i !== j)); setEditing(null); setDraft(emptyRate()); }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>;
      })}
      {!packages.length && <tr><td colSpan={4} className="p-5 text-center text-muted-foreground">Add and save at least one ratecard to continue.</td></tr>}
    </tbody></table></div>
    {pending && <p className="text-sm text-gold">Save or clear the current ratecard before continuing.</p>}
  </div>;
}