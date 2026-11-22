import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { HourlyDay } from "./HourlyDay";

export type BusySlot = { date: string; start: string | null; end: string | null };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Public availability: only "Not available" is shown; client names and events never reach this view. */
export function ScheduleDialog({ open, onOpenChange, blocked, busy, name }: { open: boolean; onOpenChange: (o: boolean) => void; blocked: string[]; busy: BusySlot[]; name: string }) {
  const { t } = useI18n();
  const now = new Date();
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [day, setDay] = useState<string | null>(null);
  const blockedSet = useMemo(() => new Set(blocked), [blocked]);
  const busyBy = useMemo(() => { const m = new Map<string, BusySlot[]>(); for (const b of busy) m.set(b.date, [...(m.get(b.date) ?? []), b]); return m; }, [busy]);
  const today = ymd(now);
  const cells = useMemo(() => {
    const first = (month.getDay() + 6) % 7;
    const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))] as (Date | null)[];
  }, [month]);
  const dayBlocks = day ? (blockedSet.has(day) ? [{ start: null, end: null }] : (busyBy.get(day) ?? []).map((b) => ({ start: b.start, end: b.end }))) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setDay(null); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogTitle>{t("Check schedule")} · {name}</DialogTitle>
        <DialogDescription>{t("Dates marked Not available are already taken.")}</DialogDescription>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button size="icon" variant="outline" aria-label={t("Previous")} onClick={() => day ? setDay(ymd(new Date(new Date(`${day}T00:00:00`).getTime() - 864e5))) : setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" aria-label={t("Next")} onClick={() => day ? setDay(ymd(new Date(new Date(`${day}T00:00:00`).getTime() + 864e5))) : setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <b>{day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
          <div className="flex gap-1">
            {day && <Button size="sm" variant="ghost" onClick={() => setDay(null)}>{t("Month")}</Button>}
            <Button size="sm" variant="outline" onClick={() => { setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setDay(today); }}>{t("Today")}</Button>
          </div>
        </div>
        {day ? <HourlyDay blocks={dayBlocks} busyLabel={t("Not available")} /> : (
          <div className="grid grid-cols-7 gap-1 text-center">
            {DOW.map((d) => <div key={d} className="py-1 text-[11px] font-bold uppercase text-muted-foreground">{t(d)}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const k = ymd(d), past = k < today, off = blockedSet.has(k) || busyBy.has(k);
              return (
                <button key={k} type="button" disabled={past} onClick={() => setDay(k)}
                  className={`flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-lg border p-1 text-sm hover:border-gold disabled:opacity-35 ${k === today ? "border-gold" : "border-border"} ${off ? "bg-destructive/10" : ""}`}>
                  <span className="font-semibold">{d.getDate()}</span>
                  {off && <span className="text-[9px] font-bold leading-tight text-destructive">{t("Not available")}</span>}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
