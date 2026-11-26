import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNTS } from "@/lib/admin-documents";
import { ListState } from "./artists/parts";

const aed = (n: number | string) => `AED ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
export const REASON_MIN = 15;

/** Manual journal entries: posted once, never edited, undone only by a reversal. */
export function LedgerAdjustments() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-ledger-adjustments"],
    queryFn: async () => {
      const r = await supabase.from("ledger_adjustments").select("*").order("created_at", { ascending: false }).limit(200);
      if (r.error) throw new Error("Unable to load adjustments");
      return r.data ?? [];
    },
  });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: today(), debit: "", credit: "", amount: "", reason: "" });
  const valid = !!form.date && !!form.debit && !!form.credit && form.debit !== form.credit && Number(form.amount) > 0 && form.reason.trim().length >= REASON_MIN;
  const done = async (message: string) => {
    toast.success(message);
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-ledger-adjustments"] }), qc.invalidateQueries({ queryKey: ["admin-ledger"] })]);
  };
  const post = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("post_ledger_adjustment", { _date: form.date, _debit: form.debit, _credit: form.credit, _amount: Number(form.amount), _reason: form.reason.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setAdding(false); setForm({ date: today(), debit: "", credit: "", amount: "", reason: "" });
    await done("Adjustment posted");
  };
  const reverse = async (id: string, reference: string) => {
    const reason = (prompt(`Why is ${reference} being reversed? (at least ${REASON_MIN} characters)`) ?? "").trim();
    if (!reason) return;
    if (reason.length < REASON_MIN) { toast.error(`Write at least ${REASON_MIN} characters`); return; }
    const { error } = await supabase.rpc("reverse_ledger_adjustment", { _id: id, _reason: reason });
    if (error) { toast.error(error.message); return; }
    await done("Adjustment reversed");
  };
  const rows = query.data ?? [];
  const reversed = new Set(rows.map((r) => r.reverses).filter(Boolean));
  const account = (key: "debit" | "credit", label: string) => (
    <div className="space-y-1"><Label>{label}</Label>
      <Select value={form[key]} onValueChange={(v) => setForm({ ...form, [key]: v })}><SelectTrigger aria-label={label}><SelectValue placeholder="Choose an account" /></SelectTrigger>
        <SelectContent>{ACCOUNTS.map((a) => <SelectItem key={a.name} value={a.name}>{a.name} · {a.type}</SelectItem>)}</SelectContent></Select>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="adm-meta">Corrections that no payment records, such as processor fees. They change the ledger only, not artist or client balances.</p>
        <Button size="sm" onClick={() => setAdding(true)}><Plus />New adjustment</Button>
      </div>
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No manual adjustment has been posted."}>
        <div className="admin-table-wrap"><table><thead><tr><th>Reference</th><th>Date</th><th>Debit account</th><th>Credit account</th><th className="text-end">Amount</th><th>Reason</th><th>Action</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.reference}</b>{r.reverses && <div className="admin-row-detail">Reversal</div>}</td>
              <td className="whitespace-nowrap">{r.entry_date}</td><td>{r.debit_account}</td><td>{r.credit_account}</td>
              <td className="admin-money text-end">{aed(r.amount)}</td><td className="max-w-[280px] break-words" dir="auto">{r.reason}</td>
              <td>{r.reverses ? <span className="adm-meta">—</span> : reversed.has(r.id) ? <span className="adm-pill is-expired">reversed</span> : <Button size="sm" variant="outline" onClick={() => void reverse(r.id, r.reference)}>Reverse</Button>}</td>
            </tr>
          ))}
        </tbody></table></div>
      </ListState>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>New ledger adjustment</DialogTitle><DialogDescription>It cannot be edited or deleted after posting.</DialogDescription></DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void post(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="adj-date">Date</Label><Input id="adj-date" type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="adj-amount">Amount (AED)</Label><Input id="adj-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            </div>
            {account("debit", "Debit account")}
            {account("credit", "Credit account")}
            <div className="space-y-1"><Label htmlFor="adj-reason">Reason</Label><Textarea id="adj-reason" rows={3} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /><p className="adm-meta">{form.reason.trim().length} / at least {REASON_MIN} characters</p></div>
            {form.debit && form.debit === form.credit && <p role="alert" className="text-sm text-destructive">Debit and credit must be different accounts.</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={!valid || busy}>Post adjustment</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
