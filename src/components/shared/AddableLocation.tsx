import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addLocation } from "@/lib/locations.functions";

type Option = { id: string; name: string };
type Props = {
  label: string; addLabel: string; placeholder: string; value: string; options: Option[];
  /** Set for areas: the emirate the new area belongs to. */
  emirateId?: string; disabled?: boolean; onChange: (id: string) => void; onAdded: () => void | Promise<unknown>;
};

/** Emirate or area dropdown that also lets the talent add a missing place. */
export function AddableLocation({ label, addLabel, placeholder, value, options, emirateId, disabled = false, onChange, onAdded }: Props) {
  const add$ = useServerFn(addLocation);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Keeps the new place selectable while the list reloads.
  const [created, setCreated] = useState<Option | null>(null);
  useEffect(() => { setCreated(null); setAdding(false); setName(""); }, [emirateId]);
  const list = created && !options.some((option) => option.id === created.id) ? [...options, created] : options;
  const save = async () => {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const made = await add$({ data: { name, ...(emirateId ? { emirateId } : {}) } });
      setCreated(made); await onAdded(); onChange(made.id); setName(""); setAdding(false);
      toast.success(`${made.name} added`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add this place."); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{list.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select>
      {adding ? (
        <div className="mt-2 flex items-center gap-2">
          <Input autoFocus aria-label={addLabel} placeholder={addLabel} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } if (e.key === "Escape") setAdding(false); }} />
          <Button type="button" className="rounded-full bg-gradient-gold font-bold text-gold-foreground" disabled={busy || name.trim().length < 2} onClick={() => void save()}>{busy ? "Adding…" : "Add"}</Button>
          <Button type="button" variant="outline" className="join-back" onClick={() => { setAdding(false); setName(""); }}>Cancel</Button>
        </div>
      ) : (
        <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-gold hover:underline disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} onClick={() => setAdding(true)}><Plus className="h-3 w-3" aria-hidden="true" />{addLabel}</button>
      )}
    </div>
  );
}
