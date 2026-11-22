export type HourBlock = { start: string | null; end: string | null; label?: string; className?: string; onClick?: () => void };

const mins = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

/** True when the block overlaps hour h (0-23). A missing time means the whole day is taken; an earlier end runs past midnight. */
export function coversHour(b: { start: string | null; end: string | null }, h: number) {
  if (!b.start || !b.end) return true;
  const s = mins(b.start), e = mins(b.end), a = h * 60, z = a + 60;
  if (e > s) return s < z && e > a;
  return z > s || a < e;
}

/** 24 rows, 00:00 to 23:00, one hour apart. */
export function HourlyDay({ blocks, emptyLabel = "", busyLabel }: { blocks: HourBlock[]; emptyLabel?: string; busyLabel?: string }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {Array.from({ length: 24 }, (_, h) => {
        const here = blocks.filter((b) => coversHour(b, h));
        return (
          <div key={h} className="grid min-h-10 grid-cols-[4rem_minmax(0,1fr)] items-stretch">
            <div className="border-e border-border px-3 py-2 text-xs font-semibold text-muted-foreground" dir="ltr">{String(h).padStart(2, "0")}:00</div>
            <div className="flex flex-wrap items-center gap-1.5 px-2 py-1">
              {here.length === 0 && <span className="text-xs text-muted-foreground/50">{emptyLabel}</span>}
              {here.map((b, i) => b.onClick
                ? <button key={i} type="button" onClick={b.onClick} className={`rounded-md px-2 py-1 text-start text-xs font-bold ${b.className ?? ""}`}>{b.label ?? busyLabel}</button>
                : <span key={i} className={`rounded-md px-2 py-1 text-xs font-bold ${b.className ?? "bg-destructive/15 text-destructive"}`}>{b.label ?? busyLabel}</span>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
