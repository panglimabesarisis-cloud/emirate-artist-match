import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { FormField } from "@/lib/ai-flow";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function ChatFlowButtons({ buttons, busy = false, onSelect }: { buttons: string[]; busy?: boolean; onSelect: (value: string) => void }) {
  return <div className="mt-3 grid w-full max-w-sm grid-cols-1 gap-2">{buttons.map((button, i) =>
    <Button key={`${i}-${button}`} variant="outline" disabled={busy} onClick={() => onSelect(button)} className="h-auto min-h-10 w-full whitespace-normal break-words rounded-md border-primary/40 bg-background px-3 py-2 text-center text-sm text-primary hover:bg-primary hover:text-primary-foreground" dir="auto">{button}</Button>
  )}</div>;
}

function DateField({ label, value, onChange, disabled, inline }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; inline: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const date = value ? parseISO(value) : undefined;
  const calendar = <Calendar mode="single" weekStartsOn={1} selected={date} onSelect={(day) => { onChange(day ? format(day, "yyyy-MM-dd") : ""); if (!inline) setOpen(false); }} disabled={disabled} className="pointer-events-auto mx-auto max-w-full rounded-md" />;
  if (inline) return <div aria-label={label} className="overflow-x-auto">{calendar}</div>;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" variant="outline" disabled={disabled} aria-label={label} className="h-10 w-full justify-between rounded-md bg-background text-start font-normal"><span className="min-w-0 truncate">{date ? format(date, "dd MMM yyyy") : t("Select date")}</span><CalendarDays className="size-4 shrink-0 text-muted-foreground" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">{calendar}</PopoverContent>
  </Popover>;
}

export function ChatFlowForm({ fields, busy = false, onSubmit }: { fields: FormField[]; busy?: boolean; onSubmit: (text: string) => void }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<number, string>>({});
  const types: Record<string, string> = { text: "text", email: "email", phone: "tel", number: "number", time: "time" };
  const inlineDate = fields.length === 1 && fields[0]?.type === "date";
  const complete = fields.every((_, i) => (values[i] ?? "").trim());
  return <form className="mt-3 w-full max-w-sm space-y-2 rounded-lg bg-muted/60 p-3" onSubmit={(event) => {
    event.preventDefault();
    if (!complete || busy) return;
    onSubmit(fields.map((field, i) => `${field.label}: ${(values[i] ?? "").trim()}`).join("\n"));
  }}>
    {fields.map((field, i) => <div key={i} className="min-w-0 space-y-1">
      <label htmlFor={`flow-field-${i}`} className="block break-words text-xs font-medium">{field.label}<span className="ms-1 text-destructive">*</span></label>
      {field.type === "date" ? <DateField label={field.label} value={values[i] ?? ""} disabled={busy} inline={inlineDate} onChange={(value) => setValues((current) => ({ ...current, [i]: value }))} /> :
        <Input id={`flow-field-${i}`} aria-label={field.label} required disabled={busy} type={types[field.type] ?? "text"} value={values[i] ?? ""} placeholder={field.type === "phone" ? "+971" : field.label} maxLength={200} onChange={(event) => setValues((current) => ({ ...current, [i]: event.target.value }))} className="h-10 rounded-md bg-background text-sm" dir={field.type === "phone" ? "ltr" : "auto"} />}
    </div>)}
    <Button type="submit" disabled={busy || !complete} className="h-9 w-full rounded-md">{t("Submit")}</Button>
  </form>;
}