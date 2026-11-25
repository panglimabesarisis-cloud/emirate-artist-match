import { useState } from "react";
import { BookmarkPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeFlowVariable, validFlowVariable } from "@/lib/flow-variables";
import { useI18n } from "@/lib/i18n";

export function FlowVariableSelect({ value, onChange, variables, disabled = false, label = "Save response", compact = false, button = false, captured = [] }: {
  value: string | undefined; onChange: (value: string | undefined) => void; variables: string[]; disabled?: boolean; label?: string; compact?: boolean;
  /** Shows the picker as a button. */
  button?: boolean;
  /** Listed first: answers the conversation already collects. */
  captured?: { name: string; from: string }[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const normalized = normalizeFlowVariable(name);
  const valid = validFlowVariable(normalized);
  const existing = variables.includes(normalized);
  return <>
    <Select disabled={disabled} value={value ?? "none"} onValueChange={v => {
      if (v === "__add_variable") { setName(""); setOpen(true); }
      else onChange(v === "none" ? undefined : v);
    }}>
      <SelectTrigger aria-label={t(label)} className={button ? "h-10 min-w-0 gap-2 border-primary text-sm font-semibold" : compact ? "h-7 min-w-0 text-xs" : "h-8 min-w-0"}>
        {button ? <div className="flex min-w-0 items-center gap-2"><BookmarkPlus className="size-4 shrink-0 text-primary" /><span className="truncate">{value ? `{${value}}` : t("Save response")}</span></div> : <SelectValue placeholder={t("Select variable")} />}
      </SelectTrigger>
      <SelectContent><SelectItem value="none">{t("Don't save")}</SelectItem>
        {captured.length > 0 && <SelectGroup><SelectLabel>{t("Taken from the conversation")}</SelectLabel>{captured.map(item => <SelectItem key={item.name} value={item.name}>{item.name} <span className="text-muted-foreground">· {item.from}</span></SelectItem>)}</SelectGroup>}
        <SelectGroup>{captured.length > 0 && <SelectLabel>{t("Other variables")}</SelectLabel>}
        {variables.filter(v => !captured.some(item => item.name === v)).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectGroup><SelectItem value="__add_variable"><span className="flex items-center gap-2"><Plus className="size-3" />{t("Add new variable")}</span></SelectItem></SelectContent>
    </Select>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>{t("Add new variable")}</DialogTitle></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); if (!valid || disabled) return; onChange(normalized); setOpen(false); }} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="new-flow-variable">{t("Variable name")}</Label><Input id="new-flow-variable" value={name} onChange={e => setName(e.target.value)} maxLength={64} placeholder="dress_code" autoFocus dir="ltr" />
          {name && <div className={valid ? "break-all font-mono text-xs text-muted-foreground" : "text-xs text-destructive"}>{valid ? `{${normalized}}` : t("Start with a letter; use letters, numbers and underscores.")}</div>}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={!valid || disabled}>{t(existing ? "Use variable" : "Add variable")}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </>;
}