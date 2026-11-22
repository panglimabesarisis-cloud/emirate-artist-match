import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const types = ["short", "long", "choice", "checkbox", "dropdown", "date", "time", "number"];
type Question = Record<string, unknown>;
export function FormQuestionEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  let rows: Question[];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((q) => !q || typeof q !== "object")) throw new Error();
    rows = parsed as Question[];
  } catch {
    return <div className="space-y-2"><p role="alert" className="text-sm text-destructive">Unable to read saved questions.</p><Textarea aria-label="Saved questions" value={value} onChange={(e) => onChange(e.target.value)} /></div>;
  }
  const write = (next: Question[]) => onChange(JSON.stringify(next));
  const patch = (index: number, change: Question) => write(rows.map((q, i) => i === index ? { ...q, ...change } : q));
  const move = (index: number, direction: number) => {
    const next = [...rows]; const item = next[index]; const other = next[index + direction];
    if (!item || !other) return;
    next[index] = other; next[index + direction] = item; write(next);
  };
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><Label>Questions ({rows.length})</Label><Button type="button" size="sm" variant="outline" disabled={rows.length >= 40} onClick={() => write([...rows, { id: crypto.randomUUID(), label: "", type: "short", required: false, options: [] }])}><Plus className="size-4" />Add question</Button></div>
    <ol className="space-y-4">{rows.map((q, i) => <li key={String(q["id"] ?? i)} className="space-y-3 border-b border-border pb-4">
      <div className="flex items-center justify-between"><b className="text-sm">Question {i + 1}</b><div className="flex gap-1">
        <Button type="button" size="icon" variant="ghost" title="Move up" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
        <Button type="button" size="icon" variant="ghost" title="Move down" aria-label={`Move question ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
        <Button type="button" size="icon" variant="ghost" title="Remove question" aria-label={`Remove question ${i + 1}`} onClick={() => write(rows.filter((_, j) => i !== j))}><Trash2 className="size-4" /></Button>
      </div></div>
      <Input aria-label={`Question ${i + 1} label`} placeholder="Question label" value={String(q["label"] ?? "")} onChange={(e) => patch(i, { label: e.target.value })} />
      <div className="flex flex-wrap items-center gap-3"><Select value={String(q["type"] ?? "short")} onValueChange={(type) => patch(i, { type })}><SelectTrigger className="w-40" aria-label={`Question ${i + 1} type`}><SelectValue /></SelectTrigger><SelectContent>{types.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
      <Label className="flex items-center gap-2"><Checkbox checked={q["required"] === true} onCheckedChange={(required) => patch(i, { required: required === true })} />Required</Label></div>
      {["choice", "checkbox", "dropdown"].includes(String(q["type"])) && <Textarea aria-label={`Question ${i + 1} options`} placeholder="Options, one per line" value={Array.isArray(q["options"]) ? q["options"].map(String).join("\n") : ""} onChange={(e) => patch(i, { options: e.target.value.split("\n") })} />}
      <Input aria-label={`Question ${i + 1} variable`} placeholder="Save as variable" value={String(q["saveAs"] ?? "")} onChange={(e) => patch(i, { saveAs: e.target.value })} />
    </li>)}</ol>
  </div>;
}