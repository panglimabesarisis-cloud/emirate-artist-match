import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { adminEscrow, adminReleaseEscrow, adminResolveDispute } from "@/lib/bookings.functions";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const ESCROW: Record<string, string> = { held: "Held", release_pending: "48h hold", frozen: "Frozen", released: "Released", refunded: "Refunded", partially_refunded: "Part refunded" };

export function AdminEscrow() {
  const qc = useQueryClient();
  const get$ = useServerFn(adminEscrow);
  const release$ = useServerFn(adminReleaseEscrow);
  const resolve$ = useServerFn(adminResolveDispute);
  const { data } = useQuery({ queryKey: ["admin-escrow"], queryFn: () => get$() });
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: ["admin-escrow"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const rows = data?.bookings ?? [];
  const sum = (f: (b: (typeof rows)[number]) => boolean, v: (b: (typeof rows)[number]) => number) => rows.filter(f).reduce((a, b) => a + v(b), 0);
  const totals = [
    ["In escrow", sum((b) => ["held", "release_pending", "frozen"].includes(b.escrow_status), (b) => Number(b.paid_amount))],
    ["Frozen (disputes)", sum((b) => b.escrow_status === "frozen", (b) => Number(b.paid_amount))],
    ["Released", sum((b) => ["released", "partially_refunded"].includes(b.escrow_status), (b) => Number(b.paid_amount) - Number(b.refund_amount))],
    ["Refunded", sum(() => true, (b) => Number(b.refund_amount))],
  ] as const;
  const open = rows.flatMap((b) => (b.disputes ?? []).filter((d) => d.status === "open").map((d) => ({ d, b })));

  return (
    <div className="mt-6 space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {totals.map(([k, v]) => <div key={k} className="rounded-xl bg-card p-4 shadow-card"><div className="text-xs text-muted-foreground">{k}</div><div className="text-xl font-semibold">{aed(v)}</div></div>)}
      </div>

      <section>
        <h2 className="text-lg font-semibold">Open disputes ({open.length})</h2>
        <div className="mt-3 space-y-3">
          {open.length === 0 && <p className="text-sm text-muted-foreground">No open disputes.</p>}
          {open.map(({ d, b }) => (
            <div key={d.id} className="rounded-xl bg-card p-4 shadow-card space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <div className="font-semibold">{b.artists?.stage_name} ↔ {b.client_name} · {b.package_title}</div>
                <Badge>Opened by {d.opened_by}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">{b.event_date} · paid {aed(Number(b.paid_amount))} · {b.invoice_no}</div>
              <p className="text-sm" dir="auto">{d.reason}</p>
              <Textarea rows={2} placeholder="Decision note (shared with both parties)" value={notes[d.id] ?? ""} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy} onClick={() => run(() => resolve$({ data: { disputeId: d.id, resolution: "release_to_artist", note: notes[d.id] ?? "" } }), "Released to artist")}>Release to artist</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => resolve$({ data: { disputeId: d.id, resolution: "refund_full", note: notes[d.id] ?? "" } }), "Client fully refunded")}>Full refund</Button>
                <Input className="w-32" type="number" placeholder="AED" value={partial[d.id] ?? ""} onChange={(e) => setPartial({ ...partial, [d.id]: e.target.value })} />
                <Button size="sm" variant="outline" disabled={busy || !partial[d.id]} onClick={() => run(() => resolve$({ data: { disputeId: d.id, resolution: "refund_partial", refund: Number(partial[d.id]), note: notes[d.id] ?? "" } }), "Partial refund issued")}>Partial refund</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Escrow ledger</h2>
        <div className="mt-3 overflow-x-auto rounded-xl bg-card shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">Invoice</th><th>Artist</th><th>Client</th><th>Event</th><th className="text-right">Paid</th><th className="text-right">Refunded</th><th className="pl-4">Escrow</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="p-4 text-muted-foreground">No paid bookings yet.</td></tr>}
              {rows.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="p-3">{b.invoice_no ?? "—"}</td><td>{b.artists?.stage_name}</td><td>{b.client_name}</td><td>{b.event_date}</td>
                  <td className="text-right">{aed(Number(b.paid_amount))}</td><td className="text-right">{Number(b.refund_amount) ? aed(Number(b.refund_amount)) : "—"}</td>
                  <td className="pl-4"><Badge variant={b.escrow_status === "frozen" ? "destructive" : "secondary"}>{ESCROW[b.escrow_status] ?? b.escrow_status}</Badge></td>
                  <td className="pr-3 text-right">{b.escrow_status === "release_pending" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => release$({ data: { id: b.id } }), "Released")}>Release now</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Booking messages (email & WhatsApp)</h2>
        <p className="text-sm text-muted-foreground">"Waiting for setup" means the email domain or WhatsApp is not connected yet.</p>
        <div className="mt-3 space-y-2">
          {data?.notifications.length === 0 && <p className="text-sm text-muted-foreground">Nothing sent yet.</p>}
          {data?.notifications.map((n) => (
            <div key={n.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-card p-3 text-sm shadow-card">
              <span>{n.channel === "email" ? "Email" : "WhatsApp"} → {n.audience} · {n.kind.replace("_", " ")} · {n.recipient}</span>
              <span className="text-muted-foreground">{n.status === "pending_setup" ? "Waiting for setup" : n.status} · {new Date(n.created_at).toLocaleString("en-GB")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
