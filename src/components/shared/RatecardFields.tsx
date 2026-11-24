import { useId, useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RATE_UNITS, rateTotals, type RateDraft } from "@/lib/ratecard";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

function UnitPicker({ value, units, onChange, label }: { value: string; units: string[]; onChange: (v: string) => void; label: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-between" aria-label={label}><span className="truncate">{t(value)}</span><ChevronDown className="h-4 w-4 shrink-0" /></Button></PopoverTrigger><PopoverContent className="w-64 p-2" align="start">
    <div className="max-h-48 overflow-y-auto">{[...new Set([...RATE_UNITS, ...units, value])].map(unit => <Button key={unit} type="button" variant="ghost" className="w-full justify-start" aria-pressed={value === unit} onClick={() => { onChange(unit); setOpen(false); }}>{t(unit)}</Button>)}</div>
    <div className="mt-2 flex gap-2 border-t border-border pt-2"><Input aria-label={t("New custom unit")} placeholder={t("New unit")} maxLength={40} value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} /><Button type="button" size="icon" aria-label={t("Add custom unit")} disabled={!custom.trim()} onClick={() => { onChange(custom.trim()); setCustom(""); setOpen(false); }}><Plus className="h-4 w-4" /></Button></div>
  </PopoverContent></Popover>;
}

export function RatecardFields({ value, onChange, units = [], disabled = false }: { value: RateDraft; onChange: (v: RateDraft) => void; units?: string[]; disabled?: boolean }) {
  const id = useId();
  const { t } = useI18n();
  const totals = rateTotals(value.items);
  const update = (index: number, field: string, next: string) => onChange({ ...value, items: value.items.map((item, i) => i === index ? { ...item, [field]: next } : item) });
  return <fieldset disabled={disabled} className="min-w-0 space-y-5">
    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-2"><Label htmlFor={`${id}-title`}>{t("Job / service title")}</Label><Input id={`${id}-title`} maxLength={100} placeholder={t("e.g. Logo design, Website design, Event hosting")} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></div>
      <div className="space-y-2"><Label>{t("Unit / item")}</Label><UnitPicker label={t("Package unit")} value={value.unit_label} units={units} onChange={unit => onChange({ ...value, unit_label: unit, items: value.items.map(item => item.unit === value.unit_label ? { ...item, unit } : item) })} /></div>
    </div>
    <div className="space-y-3 border-y border-border py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold">{t("Item & pricing breakdown")} <span className="text-sm font-normal text-muted-foreground">({value.items.length})</span></h3><Button type="button" size="sm" variant="outline" disabled={value.items.length >= 20} onClick={() => onChange({ ...value, items: [...value.items, { desc: "", qty: "1", price: "", type: "addon", unit: value.unit_label }] })}><Plus className="me-2 h-4 w-4" />{t("Add field")}</Button></div>
      {value.items.map((item, index) => <div key={index} className="grid min-w-0 gap-3 border-b border-border pb-4 last:border-0 last:pb-0 lg:grid-cols-[minmax(0,2.4fr)_minmax(75px,.7fr)_minmax(90px,1fr)_minmax(110px,1fr)_minmax(130px,1.3fr)_36px]">
        <div className="space-y-1.5"><Label htmlFor={`${id}-desc-${index}`}>{t("Item description")}</Label><Input id={`${id}-desc-${index}`} maxLength={300} placeholder={t("Deliverable or extra revision")} value={item.desc} onChange={e => update(index, "desc", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-qty-${index}`}>{t("Qty / scope")}</Label><Input id={`${id}-qty-${index}`} type="number" min="0.01" max="1000000" step="any" value={item.qty} onChange={e => update(index, "qty", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor={`${id}-price-${index}`}>{t("Price (AED)")}</Label><Input id={`${id}-price-${index}`} type="number" min="0" max="1000000" step="0.01" value={item.price} onChange={e => update(index, "price", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>{t("Item unit")}</Label><UnitPicker label={`${t("Unit for item")} ${index + 1}`} value={item.unit} units={[...units, value.unit_label, ...value.items.map(i => i.unit)]} onChange={unit => update(index, "unit", unit)} /></div>
        <div className="space-y-1.5"><Label>{t("Item type")}</Label><Select value={item.type} onValueChange={v => update(index, "type", v)}><SelectTrigger aria-label={`${t("Type for item")} ${index + 1}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="base">{t("Base package")}</SelectItem><SelectItem value="addon">{t("Add-on / extra")}</SelectItem></SelectContent></Select></div>
        <Button type="button" variant="ghost" size="icon" className="self-end" aria-label={`${t("Remove item")} ${index + 1}`} disabled={value.items.length === 1} onClick={() => onChange({ ...value, items: value.items.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
      </div>)}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>{t("Base package price")}: <b className="text-gold" dir="ltr">{aed(totals.base)}</b></span><span>{t("Optional add-ons total")}: <b dir="ltr">{aed(totals.addons)}</b></span></div>
      <p className="text-xs text-muted-foreground">{t("Each price covers its stated quantity. Add-ons are excluded from the base price. Prices exclude VAT.")}</p>
    </div>
    <div className="space-y-2"><Label htmlFor={`${id}-included`}>{t("What is included")}</Label><Textarea id={`${id}-included`} maxLength={1000} rows={2} value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} /></div>
    <div className="space-y-2"><div className="flex justify-between gap-2"><Label htmlFor={`${id}-rules`}>{t("Rules of work")}</Label><span className="text-xs text-muted-foreground">{value.rules_of_work.length} / 600</span></div><Textarea id={`${id}-rules`} maxLength={600} rows={3} placeholder={t("Revision limits, extra fees, exclusions, delivery terms")} value={value.rules_of_work} onChange={e => onChange({ ...value, rules_of_work: e.target.value })} /></div>
  </fieldset>;
}