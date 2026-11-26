import { useEffect, useRef } from "react";
import { ArrowDown } from "lucide-react";
import { OrderFormFields, type OrderField } from "@/components/dashboard/OrderFormBuilder";
import { Button } from "@/components/ui/button";
import { finishesItself, mayContinue, visibleQuestions } from "@/lib/form-steps";
import { useI18n } from "@/lib/i18n";

/** The artist's questions, opening one after the other so a long form never shows all at once. */
export function StepFields({ fields, values, opened, onOpen, onChange }: {
  fields: OrderField[]; values: Record<string, string>; opened: number; onOpen: (count: number) => void; onChange: (id: string, value: string) => void;
}) {
  const { t } = useI18n();
  const shown = visibleQuestions(fields, opened, values);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  // The question the visitor moved on to gets the cursor.
  const focus = useRef<number | null>(null);
  useEffect(() => {
    const index = focus.current;
    if (index === null || index >= shown) return;
    focus.current = null;
    const row = rows.current[index];
    row?.querySelector<HTMLElement>("input, textarea, [role=combobox]")?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [shown]);

  const next = (index: number) => {
    focus.current = index + 1;
    onOpen(index + 2);
  };

  return (
    <div className="space-y-4">
      {fields.slice(0, shown).map((field, i) => {
        const current = i === shown - 1 && shown < fields.length;
        const ready = mayContinue(field, values);
        return (
          <div key={field.id} ref={(element) => { rows.current[i] = element; }} className="animate-in fade-in slide-in-from-bottom-2 duration-500"
            onKeyDown={(event) => {
              // Enter moves to the next question; a long answer keeps Enter for new lines.
              if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
              event.preventDefault();
              if (current && ready) next(i);
            }}>
            <OrderFormFields fields={[field]} values={values} onChange={(id, value) => { onChange(id, value); if (current && finishesItself(field, value)) next(i); }} />
            {current && (
              <div className="mt-2 flex justify-end">
                <Button type="button" size="sm" variant="gold" disabled={!ready} onClick={() => next(i)}>
                  {t((values[field.id] ?? "").trim() || field.required ? "Next" : "Skip")}<ArrowDown className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-center text-[11px] text-muted-foreground" aria-live="polite">{shown} / {fields.length}</p>
    </div>
  );
}
