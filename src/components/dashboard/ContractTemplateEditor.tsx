import { useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { CONTRACT_PLACEHOLDERS, type Clause } from "@/lib/contract-terms";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ReactNode } from "react";
import "./contract-library.css";

export type ContractDraft = { id?: string; name: string; category: string; role: string; description: string; clauses: Clause[]; rider: string };
export const contractCategories = ["Performers", "Screen and broadcast", "Hosts and moderators", "Speakers", "Models", "Brand and digital"];

/** Shared content editor; admin publication/price controls remain separate from artist ownership. */
export function ContractTemplateEditor<T extends ContractDraft>({ draft, onChange, onClose, onSave, onPreview, saving, settings, error = "" }: {
  draft: T | null; onChange: (value: T) => void; onClose: () => void; onSave: () => void;
  onPreview: () => void; saving: boolean; settings?: ReactNode; error?: string;
}) {
  const { t } = useI18n();
  const areas = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focused = useRef(0);
  const clause = (index: number, patch: Partial<Clause>) => {
    if (draft) onChange({ ...draft, clauses: draft.clauses.map((c, i) => i === index ? { ...c, ...patch } : c) });
  };
  const insert = (value: string) => {
    if (!draft) return;
    const index = focused.current;
    const item = draft.clauses[index];
    if (!item) return;
    const area = areas.current[index];
    const start = area?.selectionStart ?? item.body.length;
    const end = area?.selectionEnd ?? start;
    clause(index, { body: item.body.slice(0, start) + value + item.body.slice(end) });
    window.setTimeout(() => { area?.focus(); area?.setSelectionRange(start + value.length, start + value.length); }, 0);
  };
  const move = (index: number, offset: number) => {
    if (!draft) return;
    const rows = [...draft.clauses]; const current = rows[index]; const other = rows[index + offset];
    if (!current || !other) return;
    rows[index] = other; rows[index + offset] = current;
    onChange({ ...draft, clauses: rows });
  };
  return <Dialog open={!!draft} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="contract-editor">
      <DialogHeader className="text-start"><DialogTitle className="font-display text-[32px] font-normal">{t(draft?.id ? "Edit template" : "New template")}</DialogTitle><DialogDescription className="sr-only">{t("Contract template")}</DialogDescription></DialogHeader>
      {draft && <form className="contract-editor-form" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <div className="contract-editor-grid">
          <div className="contract-editor-field"><Label htmlFor="contract-name">{t("Template name")}</Label><Input id="contract-name" autoFocus required maxLength={100} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} /></div>
          <div className="contract-editor-field"><Label htmlFor="contract-category">{t("Category")}</Label><select id="contract-category" value={draft.category} onChange={(e) => onChange({ ...draft, category: e.target.value })}><option value="">{t("Choose")}</option>{[...contractCategories, ...(draft.category && !contractCategories.includes(draft.category) ? [draft.category] : [])].map((value) => <option key={value}>{value}</option>)}</select></div>
          <div className="contract-editor-field"><Label htmlFor="contract-role">{t("Role label")}</Label><Input id="contract-role" maxLength={40} value={draft.role} onChange={(e) => onChange({ ...draft, role: e.target.value })} /></div>
        </div>
        {settings}
        <div className="contract-placeholders"><span>{t("Insert into clause:")}</span><div>{CONTRACT_PLACEHOLDERS.map((ph) => <Button key={ph} type="button" variant="outline" size="sm" onMouseDown={(event) => event.preventDefault()} onClick={() => insert(`{${ph}}`)}>{`{${ph}}`}</Button>)}</div></div>
        <p className="text-xs text-muted-foreground">{t("Each clause becomes an Article. Leave an empty line inside a clause to start a numbered sub-clause (1.1, 1.2).")}</p>
        <ol className="contract-clause-list">{draft.clauses.map((item, index) => <li key={index} className="contract-clause">
          <span className="font-display text-[22px] text-gold" aria-hidden>{index + 1}</span>
          <div className="flex min-w-0 flex-col gap-2"><Input aria-label={`${t("Clause title")} ${index + 1}`} required maxLength={120} placeholder={t("Clause title")} value={item.title} onChange={(e) => clause(index, { title: e.target.value })} /><Textarea ref={(area) => { areas.current[index] = area; }} aria-label={`${t("Clause text")} ${index + 1}`} required maxLength={2000} placeholder={t("Clause text")} value={item.body} onFocus={() => { focused.current = index; }} onChange={(e) => clause(index, { body: e.target.value })} /></div>
          <div className="contract-clause-tools">{([-1, 1] as const).map((offset) => <Button key={offset} size="icon" type="button" variant="outline" disabled={offset < 0 ? index === 0 : index === draft.clauses.length - 1} aria-label={`${t("Move clause")} ${index + 1} ${t(offset < 0 ? "up" : "down")}`} title={t(offset < 0 ? "Move up" : "Move down")} onClick={() => move(index, offset)}>{offset < 0 ? <ArrowUp /> : <ArrowDown />}</Button>)}<Button type="button" size="icon" variant="outline" title={t("Remove clause")} aria-label={`${t("Remove clause")} ${index + 1}`} onClick={() => onChange({ ...draft, clauses: draft.clauses.filter((_, i) => i !== index) })}><Trash2 /></Button></div>
        </li>)}</ol>
        <Button type="button" variant="outline" className="rounded-full" onClick={() => onChange({ ...draft, clauses: [...draft.clauses, { title: "", body: "" }] })}><Plus />{t("Add clause")}</Button>
        <div className="contract-editor-field mt-3"><Label htmlFor="contract-rider">{t("Schedule C: technical and hospitality rider (one item per line)")}</Label><Textarea id="contract-rider" rows={5} maxLength={2000} value={draft.rider} onChange={(e) => onChange({ ...draft, rider: e.target.value })} /></div>
        <p role="alert" className="min-h-4 text-xs text-destructive">{error}</p>
        <div className="contract-editor-footer"><Button type="button" variant="outline" onClick={onPreview}>{t("Preview")}</Button><Button type="button" variant="outline" disabled={saving} onClick={onClose}>{t("Cancel")}</Button><Button type="submit" disabled={saving} className="bg-gradient-gold text-gold-foreground">{t(saving ? "Saving…" : "Save template")}</Button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}