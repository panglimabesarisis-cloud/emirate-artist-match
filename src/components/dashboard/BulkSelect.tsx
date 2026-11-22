import { useState, type ReactNode } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export type SoftDeleteRpc = "soft_delete_quote_requests" | "soft_delete_bookings" | "soft_delete_invoices";

/** Selected row ids for a table, with select-all over the rows that can be selected. */
export function useSelection() {
  const [sel, setSel] = useState<string[]>([]);
  const toggle = (id: string, on: boolean) => setSel((cur) => (on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id)));
  const toggleAll = (ids: string[], on: boolean) => setSel((cur) => (on ? Array.from(new Set([...cur, ...ids])) : cur.filter((x) => !ids.includes(x))));
  const clear = () => setSel([]);
  return { sel, toggle, toggleAll, clear, has: (id: string) => sel.includes(id) };
}

/** Checkbox cell content with a consistent, themed look. */
export function RowCheckbox({ checked, onChange, label, disabled = false, title }: { checked: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean; title?: string | undefined }) {
  return <input type="checkbox" className="h-4 w-4 cursor-pointer accent-gold disabled:cursor-not-allowed disabled:opacity-30" aria-label={label} checked={checked} disabled={disabled} title={title} onChange={(e) => onChange(e.target.checked)} />;
}

/** "n selected" bar with the delete action. Extra actions go in children. */
export function BulkBar({ count, busy, onDelete, onClear, children }: { count: number; busy?: boolean; onDelete: () => void; onClear: () => void; children?: ReactNode }) {
  const { t } = useI18n();
  if (count === 0) return null;
  return (
    <div role="region" aria-label={t("Selected rows")} className="flex flex-wrap items-center gap-2.5 border-b border-border bg-gold/[.06] px-5 py-2.5 text-[13px] font-bold">
      <span>{count} {t("selected")}</span>
      {children}
      <Button size="sm" variant="outline" className="rounded-full" onClick={onClear}>{t("Clear")}</Button>
      <Button size="sm" variant="outline" className="rounded-full border-red-400/40 text-red-300 hover:bg-red-500/10" disabled={busy} onClick={onDelete}><Trash2 className="me-1 h-3.5 w-3.5" />{t("Delete")}</Button>
    </div>
  );
}

/**
 * Soft delete through the protected database functions. Rows that are paid, in escrow or completed are skipped by the database,
 * so the result says how many were hidden and how many were kept.
 */
export function useHideRows(rpc: SoftDeleteRpc, invalidate: QueryKey[], after?: () => void) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (ids: string[], what: string) => {
    if (ids.length === 0) return;
    if (!confirm(`${t("Delete")} ${ids.length} ${t(what)}? ${t("They are hidden from your lists. Paid or completed records are never deleted.")}`)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(rpc, { _ids: ids });
      if (error) throw error;
      const hidden = Number(data ?? 0);
      const kept = ids.length - hidden;
      if (hidden > 0) toast.success(`${hidden} ${t("deleted")}${kept > 0 ? `, ${kept} ${t("kept because they are paid or completed")}` : ""}`);
      else toast.error(t("Nothing was deleted: these records are paid, in escrow or completed."));
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
      after?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Delete failed"));
    } finally { setBusy(false); }
  };
  return { run, busy };
}

/** Rules mirrored from the database: only unpaid offers, enquiries and cancelled bookings can be hidden. */
export function bookingDeletable(b: { status: string; paid_amount: number | string; escrow_status?: string | null }) {
  return Number(b.paid_amount) === 0 && ["inquiry", "quoted", "cancelled"].includes(b.status) && !["held", "released"].includes(b.escrow_status ?? "");
}
export const NOT_DELETABLE = "Paid, confirmed or completed records can't be deleted";
