import { useId, useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RATE_UNITS, RULE_SNIPPETS, appendRule, rateTotals, type RateDraft } from "@/lib/ratecard";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import "./ratecard-fields.css";

function UnitPicker({ value, units, onChange, label }: { value: string; units: string[]; onChange: (v: string) => void; label: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="ratecard-field w-full justify-between" aria-label={label}><span className="truncate">{t(value)}</span><ChevronDown className="h-4 w-4 shrink-0" /></Button></PopoverTrigger><PopoverContent className="ratecard-menu w-64 p-2" align="start">
    <div className="max-h-48 overflow-y-auto">{[...new Set([...RATE_UNITS, ...units, value])].map(unit => <Button key={unit} type="button" variant="ghost" className="w-full justify-start" aria-pressed={value === unit} onClick={() => { onChange(unit); setOpen(false); }}>{t(unit)}</Button>)}</div>
    <div className="mt-2 flex gap-2 border-t border-border pt-2"><Input aria-label={t("New custom unit")} placeholder={t("New unit")} maxLength={40} value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} /><Button type="button" size="icon" aria-label={t("Add custom unit")} disabled={!custom.trim()} onClick={() => { onChange(custom.trim()); setCustom(""); setOpen(false); }}><Plus className="h-4 w-4" /></Button></div>
  </PopoverContent></Popover>;
}

export function RatecardFields({ value, onChange, units = [], disabled = false }: { value: RateDraft; onChange: (v: RateDraft) => void; units?: string[]; disabled?: boolean }) {
  const id = useId();
  const { t } = useI18n();
  const totals = rateTotals(value.items);
  const low = value.price_low.trim() === "" ? null : Number(value.price_low);
  const high = value.price_high.trim() === "" ? null : Number(value.price_high);
  const rangeProblem = low !== null && low > totals.base ? "Lowest price cannot be above the base package price."
    : high !== null && high < totals.base ? "Highest price cannot be below the base package price." : null;
  const update = (index: number, field: string, next: string) => onChange({ ...value, items: value.items.map((item, i) => i === index ? { ...item, [field]: next } : item) });
  return <fieldset disabled={disabled} className="dmr-rc-fields space-y-5">
    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-2"><Label htmlFor={`${id}-title`}>{t("Job / service title")}</Label><Input id={`${id}-title`} maxLength={100} placeholder={t("e.g. Logo design, Website design, Event hosting")} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></div>
      <div className="space-y-2"><Label>{t("Unit / item")}</Label><UnitPicker label={t("Package unit")} value={value.unit_label} units={units} onChange={unit => onChange({ ...value, unit_label: unit, items: value.items.map(item => item.unit === value.unit_label ? { ...item, unit } : item) })} /></div>
    </div>

    <div className="dmr-rc-break">
      <div className="dmr-rc-break-h">
        <div>
          <h3>{t("Item & pricing breakdown")} <span className="dmr-rc-count">{value.items.length}</span></h3>
          <p>{t("List what the base price covers, then add optional extras such as overtime or an extra revision.")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="ratecard-add" disabled={value.items.length >= 20} onClick={() => onChange({ ...value, items: [...value.items, { desc: "", qty: "1", price: "", type: "addon", unit: value.unit_label }] })}><Plus className="me-2 h-4 w-4" />{t("Add field")}</Button>
      </div>

      <div className="dmr-rc-cols" aria-hidden="true">
        <span>{t("Item description")}</span>
        <span>{t("Qty / scope")}</span>
        <span>{t("Price (AED)")}</span>
        <span>{t("Item unit")}</span>
        <span>{t("Item type")}</span>
        <span>{t("Remove")}</span>
      </div>

      {value.items.map((item, index) => <div key={index} className="dmr-rc-row">
        <div><Label htmlFor={`${id}-desc-${index}`}>{t("Item description")}</Label><Input id={`${id}-desc-${index}`} maxLength={300} placeholder={t("Deliverable or extra revision")} value={item.desc} onChange={e => update(index, "desc", e.target.value)} /></div>
        <div><Label htmlFor={`${id}-qty-${index}`}>{t("Qty / scope")}</Label><Input id={`${id}-qty-${index}`} type="number" min="0.01" max="1000000" step="any" value={item.qty} onChange={e => update(index, "qty", e.target.value)} /></div>
        <div><Label htmlFor={`${id}-price-${index}`}>{t("Price (AED)")}</Label><Input id={`${id}-price-${index}`} type="number" min="0" max="1000000" step="0.01" value={item.price} onChange={e => update(index, "price", e.target.value)} /></div>
        <div><Label>{t("Item unit")}</Label><UnitPicker label={`${t("Unit for item")} ${index + 1}`} value={item.unit} units={[...units, value.unit_label, ...value.items.map(i => i.unit)]} onChange={unit => update(index, "unit", unit)} /></div>
        <div><Label>{t("Item type")}</Label><Select value={item.type} onValueChange={v => update(index, "type", v)}><SelectTrigger aria-label={`${t("Type for item")} ${index + 1}`} className="ratecard-field w-full"><SelectValue /></SelectTrigger><SelectContent className="ratecard-menu"><SelectItem value="base">{t("Base package")}</SelectItem><SelectItem value="addon">{t("Add-on / extra")}</SelectItem></SelectContent></Select></div>
        <Button type="button" variant="ghost" size="icon" className="dmr-rc-del self-end" aria-label={`${t("Remove item")} ${index + 1}`} disabled={value.items.length === 1} onClick={() => onChange({ ...value, items: value.items.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
      </div>)}

      <div className="dmr-rc-totals">
        <span className="dmr-rc-tot-sum">
          <span>{t("Base package price")}: <b className="gold" dir="ltr">{aed(totals.base)}</b></span>
          <span>{t("Optional add-ons total")}: <b dir="ltr">{aed(totals.addons)}</b></span>
        </span>
        <small>{t("Each price covers its stated quantity. Add-ons are excluded from the base price. Prices exclude VAT.")}</small>
      </div>
    </div>

    <div className="dmr-rc-nego">
      <div className="dmr-rc-nego-h">
        <h3>{t("Negotiation range")}</h3>
        <p>{t("What your AI agent may ask and may accept. It opens near the highest price, aims for the base, and never goes below the lowest.")}</p>
      </div>
      <div className="dmr-rc-nego-grid">
        <div>
          <Label htmlFor={`${id}-low`}>{t("Lowest price (AED)")}</Label>
          <Input id={`${id}-low`} type="number" min="0" max="20000000" step="0.01" placeholder={t("No floor set")} value={value.price_low} onChange={e => onChange({ ...value, price_low: e.target.value })} aria-describedby={`${id}-low-help`} />
          <small id={`${id}-low-help`}>{t("Hard floor. Leave empty to keep the plan's discount limit.")}</small>
        </div>
        <div>
          <Label>{t("Base price (AED)")}</Label>
          <output className="dmr-rc-nego-base" dir="ltr">{aed(totals.base)}</output>
          <small>{t("Adds up from your base items. Edit the items to change it.")}</small>
        </div>
        <div>
          <Label htmlFor={`${id}-high`}>{t("Highest price (AED)")}</Label>
          <Input id={`${id}-high`} type="number" min="0" max="20000000" step="0.01" placeholder={t("No anchor set")} value={value.price_high} onChange={e => onChange({ ...value, price_high: e.target.value })} aria-describedby={`${id}-high-help`} />
          <small id={`${id}-high-help`}>{t("Opening ask for busy dates or wider scope.")}</small>
        </div>
      </div>
      {rangeProblem && <p role="alert" className="dmr-rc-nego-error">{t(rangeProblem)}</p>}
    </div>

    <div className="space-y-2"><Label htmlFor={`${id}-included`}>{t("What is included")}</Label><Textarea id={`${id}-included`} maxLength={1000} rows={2} placeholder={t("What the client gets for the base price")} value={value.description} onChange={e => onChange({ ...value, description: e.target.value })} /></div>

    <div className="space-y-2">
      <div className="flex justify-between gap-2"><Label htmlFor={`${id}-rules`}>{t("Rules of work")}</Label><span className="dmr-rc-count-chars">{value.rules_of_work.length} / 600</span></div>
      <div className="dmr-rc-chips">
        <small>{t("Quick insert")}</small>
        {RULE_SNIPPETS.map(snippet => <Button key={snippet.label} type="button" variant="ghost" className="dmr-rc-chip" onClick={() => onChange({ ...value, rules_of_work: appendRule(value.rules_of_work, t(snippet.text)) })}>+ {t(snippet.label)}</Button>)}
      </div>
      <Textarea id={`${id}-rules`} maxLength={600} rows={3} placeholder={t("Revision limits, extra fees, exclusions, delivery terms")} value={value.rules_of_work} onChange={e => onChange({ ...value, rules_of_work: e.target.value })} />
    </div>
  </fieldset>;
}
