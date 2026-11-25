import { useId, useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RATE_UNITS, RULE_SNIPPETS, RUSH_OPTIONS, TURNAROUND_OPTIONS, appendRule, dealSplit, rateTotals, type RateDraft } from "@/lib/ratecard";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import "./ratecard-fields.css";

/** A themed list the artist can add to, shaped like the other selects in the form. */
function OptionPicker({ value, options, onChange, label, addLabel, placeholder, optional = false }: { value: string; options: string[]; onChange: (v: string) => void; label: string; addLabel: string; placeholder: string; optional?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const add = () => { const next = custom.trim(); if (!next) return; onChange(next); setCustom(""); setOpen(false); };
  const list = [...new Set([...options, value].filter(Boolean))];
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" role="combobox" aria-expanded={open} aria-label={label} className="ratecard-field dmr-rc-pick"><span className={value ? "truncate" : "truncate text-muted-foreground"}>{value ? t(value) : t(placeholder)}</span><ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" /></button></PopoverTrigger>
    <PopoverContent className="ratecard-menu w-56 p-1.5" align="start">
      <div className="max-h-48 overflow-y-auto" role="listbox" aria-label={label}>
        {optional && <button type="button" role="option" aria-selected={!value} className="dmr-rc-option" onClick={() => { onChange(""); setOpen(false); }}>{t("Not set")}</button>}
        {list.map(option => <button key={option} type="button" role="option" aria-selected={value === option} className="dmr-rc-option" onClick={() => { onChange(option); setOpen(false); }}>{t(option)}</button>)}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-border pt-1.5"><Input aria-label={t(addLabel)} placeholder={t(addLabel)} maxLength={40} value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} /><Button type="button" size="icon" aria-label={`${t("Add")}: ${t(addLabel)}`} disabled={!custom.trim()} onClick={add}><Plus className="h-4 w-4" /></Button></div>
    </PopoverContent>
  </Popover>;
}

export function RatecardFields({ value, onChange, units = [], disabled = false }: { value: RateDraft; onChange: (v: RateDraft) => void; units?: string[]; disabled?: boolean }) {
  const id = useId();
  const { t } = useI18n();
  const totals = rateTotals(value.items);
  const low = value.price_low.trim() === "" ? null : Number(value.price_low);
  const high = value.price_high.trim() === "" ? null : Number(value.price_high);
  const rangeProblem = low !== null && low > totals.base ? "Lowest price cannot be above the base package price."
    : high !== null && high < totals.base ? "Highest price cannot be below the base package price." : null;
  const rush = value.rush_items ?? [];
  const setRush = (rush_items: NonNullable<RateDraft["rush_items"]>) => onChange({ ...value, rush_items });
  const deal = dealSplit(totals.base, value.deposit_pct);
  const update = (index: number, field: string, next: string) => onChange({ ...value, items: value.items.map((item, i) => i === index ? { ...item, [field]: next } : item) });
  return <fieldset disabled={disabled} className="dmr-rc-fields space-y-5">
    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-2"><Label htmlFor={`${id}-title`}>{t("Job / service title")}</Label><Input id={`${id}-title`} maxLength={100} placeholder={t("e.g. Logo design, Website design, Event hosting")} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></div>
      <div className="space-y-2"><Label>{t("Unit / item")}</Label><OptionPicker label={t("Package unit")} addLabel="New unit" placeholder="Choose" value={value.unit_label} options={[...RATE_UNITS, ...units]} onChange={unit => onChange({ ...value, unit_label: unit, items: value.items.map(item => item.unit === value.unit_label ? { ...item, unit } : item) })} /></div>
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
        <span>{t("Turnaround time")}</span>
        <span>{t("Remove")}</span>
      </div>

      {value.items.map((item, index) => <div key={index} className="dmr-rc-row">
        <div><Label htmlFor={`${id}-desc-${index}`}>{t("Item description")}</Label><Input id={`${id}-desc-${index}`} maxLength={300} placeholder={t("Deliverable or extra revision")} value={item.desc} onChange={e => update(index, "desc", e.target.value)} /></div>
        <div><Label htmlFor={`${id}-qty-${index}`}>{t("Qty / scope")}</Label><Input id={`${id}-qty-${index}`} type="number" min="0.01" max="1000000" step="any" value={item.qty} onChange={e => update(index, "qty", e.target.value)} /></div>
        <div><Label htmlFor={`${id}-price-${index}`}>{t("Price (AED)")}</Label><Input id={`${id}-price-${index}`} type="number" min="0" max="1000000" step="0.01" value={item.price} onChange={e => update(index, "price", e.target.value)} /></div>
        <div><Label>{t("Item unit")}</Label><OptionPicker label={`${t("Unit for item")} ${index + 1}`} addLabel="New unit" placeholder="Choose" value={item.unit} options={[...RATE_UNITS, ...units, value.unit_label, ...value.items.map(i => i.unit)]} onChange={unit => update(index, "unit", unit)} /></div>
        <div><Label>{t("Item type")}</Label><Select value={item.type} onValueChange={v => update(index, "type", v)}><SelectTrigger aria-label={`${t("Type for item")} ${index + 1}`} className="ratecard-field w-full"><SelectValue /></SelectTrigger><SelectContent className="ratecard-menu"><SelectItem value="base">{t("Base package")}</SelectItem><SelectItem value="addon">{t("Add-on / extra")}</SelectItem></SelectContent></Select></div>
        <div><Label>{t("Turnaround time")}</Label><OptionPicker optional label={`${t("Turnaround time for item")} ${index + 1}`} addLabel="New time" placeholder="Choose" value={item.turnaround ?? ""} options={[...TURNAROUND_OPTIONS, ...value.items.map(i => i.turnaround ?? "")]} onChange={turnaround => update(index, "turnaround", turnaround)} /></div>
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

    <div className="dmr-rc-break">
      <div className="dmr-rc-break-h">
        <div>
          <h3>{t("Add Cost Rush Job")} <span className="dmr-rc-count">{rush.length}</span></h3>
          <p>{t("What a faster delivery costs. The rush time sets the deadline when a client chooses it; the cost is not part of the base price.")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="ratecard-add" disabled={rush.length >= 10} onClick={() => setRush([...rush, { desc: "", rush: "1 Day", price: "" }])}><Plus className="me-2 h-4 w-4" />{t("Add field")}</Button>
      </div>
      {rush.length > 0 && <div className="dmr-rc-cols dmr-rc-rushcols" aria-hidden="true"><span>{t("Item description")}</span><span>{t("Rush time")}</span><span>{t("Price (AED)")}</span><span>{t("Remove")}</span></div>}
      {rush.map((item, index) => <div key={index} className="dmr-rc-row dmr-rc-rush">
        <div><Label htmlFor={`${id}-rush-desc-${index}`}>{t("Item description")}</Label><Input id={`${id}-rush-desc-${index}`} maxLength={300} placeholder={t("e.g. Same week delivery")} value={item.desc} onChange={e => setRush(rush.map((row, i) => i === index ? { ...row, desc: e.target.value } : row))} /></div>
        <div><Label>{t("Rush time")}</Label><OptionPicker label={`${t("Rush time for item")} ${index + 1}`} addLabel="New time" placeholder="Choose" value={item.rush} options={[...RUSH_OPTIONS, ...rush.map(i => i.rush)]} onChange={time => setRush(rush.map((row, i) => i === index ? { ...row, rush: time } : row))} /></div>
        <div><Label htmlFor={`${id}-rush-price-${index}`}>{t("Price (AED)")}</Label><Input id={`${id}-rush-price-${index}`} type="number" min="0" max="1000000" step="0.01" value={item.price} onChange={e => setRush(rush.map((row, i) => i === index ? { ...row, price: e.target.value } : row))} /></div>
        <Button type="button" variant="ghost" size="icon" className="dmr-rc-del self-end" aria-label={`${t("Remove rush job")} ${index + 1}`} onClick={() => setRush(rush.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
      </div>)}
      {!rush.length && <p className="dmr-rc-empty">{t("No rush options yet. Add one if you can deliver faster for an extra cost.")}</p>}
    </div>

    <div className="dmr-rc-nego">
      <div className="dmr-rc-nego-h">
        <h3>{t("How this job runs")}</h3>
        <p>{t("Stage work is booked for a date and paid after you perform. Deliverable work has a deadline and is paid in full before you hand the files over.")}</p>
      </div>
      <div className="dmr-rc-nego-grid">
        <div>
          <Label>{t("Job type")}</Label>
          <Select value={value.job_kind} onValueChange={v => onChange({ ...value, job_kind: v === "deliverable" ? "deliverable" : "stage" })}>
            <SelectTrigger className="ratecard-field w-full" aria-label={t("Job type")}><SelectValue /></SelectTrigger>
            <SelectContent className="ratecard-menu">
              <SelectItem value="stage">{t("Stage — booked for a date")}</SelectItem>
              <SelectItem value="deliverable">{t("Deliverable — has a deadline")}</SelectItem>
            </SelectContent>
          </Select>
          <small>{value.job_kind === "deliverable" ? t("The client sees a deadline instead of an event date.") : t("The client picks a date and time.")}</small>
        </div>
        <div>
          <Label htmlFor={`${id}-dep`}>{t("Book Before Deal · Deposit (%)")}</Label>
          <Input id={`${id}-dep`} type="number" min="10" max="100" step="1" value={value.deposit_pct} onChange={e => onChange({ ...value, deposit_pct: e.target.value })} />
          <small>{t("Paid to book the job.")} <b dir="ltr">{aed(deal.deposit)}</b></small>
        </div>
        <div>
          <Label>{t("Paid Before Finish · Payment (%)")}</Label>
          <output className="dmr-rc-nego-base" dir="ltr">{deal.balancePct}%</output>
          <small>{deal.balancePct === 0 ? t("The client pays the whole fee up front.") : <>{t("When you report the work is ready, the client pays this before you send it.")} <b dir="ltr">{aed(deal.balance)}</b></>}</small>
        </div>
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
