import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { toCsv, downloadCsv } from "@/lib/csv";
import { adminEscrow, adminReleaseEscrow, adminResolveDispute } from "@/lib/bookings.functions";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookingInvoiceDialog } from "@/components/admin/documents/BookingInvoice";
import { ListState } from "@/components/admin/artists/parts";

const ESCROW: Record<string, string> = { held: "Funds on hold", release_pending: "Release in 48h", frozen: "Frozen", released: "Released", refunded: "Refunded", partially_refunded: "Part refunded", none: "Not paid" };
const TONE: Record<string, string> = { held: "pending", release_pending: "approved", frozen: "rejected", released: "paid", refunded: "expired", partially_refunded: "partial" };

/** Funds on hold, dispute cases and every escrow booking with its invoice. */
export function AdminEscrow() {
  const qc = useQueryClient();
  const get$ = useServerFn(adminEscrow);
  const release$ = useServerFn(adminReleaseEscrow);
  const resolve$ = useServerFn(adminResolveDispute);
  const query = useQuery({ queryKey: ["admin-escrow"], queryFn: () => get$() });
  const data = query.data;
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [note, setNote] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); setResolving(null); await qc.invalidateQueries({ queryKey: ["admin-escrow"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const rows = data?.bookings ?? [];
  type Row = (typeof rows)[number];
  const sum = (states: string[], value: (b: Row) => number = (b) => Number(b.paid_amount)) => rows.filter((b) => states.includes(b.escrow_status)).reduce((n, b) => n + value(b), 0);
  const kpis: [string, number, string, number][] = [
    ["Funds on hold (active jobs)", sum(["held"]), "Waiting for the job to be completed", rows.filter((b) => b.escrow_status === "held").length],
    ["Release eligible", sum(["release_pending"]), "Completed, released after 48 hours", rows.filter((b) => b.escrow_status === "release_pending").length],
    ["Frozen in disputes", sum(["frozen"]), "Locked until the admin decides", rows.filter((b) => b.escrow_status === "frozen").length],
    ["Released", sum(["released", "partially_refunded"], (b) => Number(b.paid_amount) - Number(b.refund_amount)), `Refunded ${aed(rows.reduce((n, b) => n + Number(b.refund_amount), 0))}`, rows.filter((b) => ["released", "partially_refunded"].includes(b.escrow_status)).length],
  ];
  const disputes = rows.flatMap((b) => (b.disputes ?? []).map((d) => ({ d, b }))).sort((x, y) => Number(y.d.status === "open") - Number(x.d.status === "open"));
  const target = disputes.find((x) => x.d.id === resolving);
  const viewed = rows.find((b) => b.id === invoice);
  const reference = (b: Row) => b.invoice_no ?? `BK-${b.id.slice(0, 8).toUpperCase()}`;
  const invoiceLink = (b: Row) => <button type="button" className="adm-link font-bold" onClick={() => setInvoice(b.id)} aria-label={`Open invoice ${reference(b)}`}>{reference(b)}</button>;

  return (
    <div className="space-y-6">
      <div className="adm-grid is-kpi">{kpis.map(([label, amount, sub, count]) => <section key={label} className="adm-panel !gap-1"><span className="adm-meta">{label}</span><b className="font-display text-4xl font-normal">{aed(amount)}</b><span className="adm-meta">{count} booking{count === 1 ? "" : "s"} · {sub}</span></section>)}</div>
      <ListState pending={query.isPending} error={query.error} empty={null}>
        <section className="space-y-3" aria-labelledby="dispute-title">
          <div><h2 id="dispute-title" className="font-display text-3xl">Dispute cases ({disputes.length})</h2><p className="adm-meta">Money stays frozen until a case is released to the artist or refunded to the client.</p></div>
          <div className="admin-table-wrap"><table><thead><tr><th>Dispute</th><th>Booking</th><th>Parties</th><th className="text-end">Frozen amount</th><th>Issue</th><th>Status</th><th>Resolution</th></tr></thead><tbody>
            {disputes.map(({ d, b }) => (
              <tr key={d.id}>
                <td><b>DSP-{d.id.slice(0, 6).toUpperCase()}</b></td>
                <td>{invoiceLink(b)}</td>
                <td><b>{b.artists?.stage_name}</b><div className="admin-row-detail">vs {b.client_name} · opened by {d.opened_by}</div></td>
                <td className="admin-money text-end">{aed(d.status === "open" ? Number(b.paid_amount) : 0)}</td>
                <td className="max-w-[260px] whitespace-pre-wrap break-words" dir="auto">{d.reason}</td>
                <td><span className={`adm-pill is-${d.status === "open" ? "rejected" : "paid"}`}>{d.status}</span></td>
                <td>{d.status === "open" ? <Button size="sm" onClick={() => { setResolving(d.id); setNote(""); setPartial(""); }}>Resolve</Button> : <span className="adm-meta">{d.resolution?.replace(/_/g, " ") ?? "Closed"}</span>}</td>
              </tr>
            ))}
            {!disputes.length && <tr><td colSpan={7}>No dispute case.</td></tr>}
          </tbody></table></div>
        </section>
        <section className="space-y-3" aria-labelledby="escrow-title">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="escrow-title" className="font-display text-3xl">Escrow ledger</h2>
            <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCsv(`dealmaker-escrow-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, [["Invoice", reference], ["Artist", (b) => b.artists?.stage_name], ["Client", (b) => b.client_name], ["Event", (b) => b.event_date], ["Paid", (b) => b.paid_amount], ["Refunded", (b) => b.refund_amount], ["Escrow", (b) => ESCROW[b.escrow_status] ?? b.escrow_status]]))}>Export CSV</Button>
          </div>
          <div className="admin-table-wrap"><table><thead><tr><th>Invoice</th><th>Artist</th><th>Client</th><th>Event</th><th className="text-end">Paid</th><th className="text-end">Refunded</th><th>Escrow</th><th>Action</th></tr></thead><tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{invoiceLink(b)}</td><td>{b.artists?.stage_name}</td><td>{b.client_name}</td><td>{b.event_date}</td>
                <td className="admin-money text-end">{aed(Number(b.paid_amount))}</td><td className="admin-money text-end">{Number(b.refund_amount) ? aed(Number(b.refund_amount)) : "—"}</td>
                <td><span className={`adm-pill is-${TONE[b.escrow_status] ?? "expired"}`}>{ESCROW[b.escrow_status] ?? b.escrow_status}</span></td>
                <td><div className="adm-actions"><Button size="sm" variant="outline" onClick={() => setInvoice(b.id)}>Invoice</Button>{b.escrow_status === "release_pending" && <Button size="sm" disabled={busy} onClick={() => void run(() => release$({ data: { id: b.id } }), "Released")}>Release now</Button>}</div></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8}>No paid booking yet.</td></tr>}
          </tbody></table></div>
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-3xl">Booking messages</h2>
          <p className="adm-meta">Email and WhatsApp deliveries. "Waiting for setup" means the channel is not connected yet.</p>
          <div className="admin-table-wrap"><table><thead><tr><th>Channel</th><th>To</th><th>Message</th><th>Recipient</th><th>Status</th><th>Time</th></tr></thead><tbody>
            {data?.notifications.map((n) => <tr key={n.id}><td>{n.channel === "email" ? "Email" : "WhatsApp"}</td><td>{n.audience}</td><td>{n.kind.replace(/_/g, " ")}</td><td className="break-all">{n.recipient}</td><td>{n.status === "pending_setup" ? "Waiting for setup" : n.status}</td><td>{new Date(n.created_at).toLocaleString("en-GB")}</td></tr>)}
            {!data?.notifications.length && <tr><td colSpan={6}>Nothing sent yet.</td></tr>}
          </tbody></table></div>
        </section>
      </ListState>
      <Dialog open={!!target} onOpenChange={(open) => { if (!open) setResolving(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve dispute</DialogTitle><DialogDescription>{target ? `${reference(target.b)} · paid ${aed(Number(target.b.paid_amount))}` : ""}</DialogDescription></DialogHeader>
          {target && <div className="grid gap-3">
            <p className="whitespace-pre-wrap text-sm" dir="auto">{target.d.reason}</p>
            <Textarea rows={3} aria-label="Decision note" placeholder="Decision note (shared with both parties)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy} onClick={() => void run(() => resolve$({ data: { disputeId: target.d.id, resolution: "release_to_artist", note } }), "Released to artist")}>Release to artist</Button>
              <Button variant="outline" disabled={busy} onClick={() => { if (confirm("Refund the full amount to the client?")) void run(() => resolve$({ data: { disputeId: target.d.id, resolution: "refund_full", note } }), "Client fully refunded"); }}>Refund client</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-36" type="number" min={1} aria-label="Partial refund in AED" placeholder="AED" value={partial} onChange={(e) => setPartial(e.target.value)} />
              <Button variant="outline" disabled={busy || !partial} onClick={() => void run(() => resolve$({ data: { disputeId: target.d.id, resolution: "refund_partial", refund: Number(partial), note } }), "Partially refunded")}>Partial refund</Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
      {viewed && <BookingInvoiceDialog booking={{ ...viewed, artist_name: viewed.artists?.stage_name ?? "Artist" }} onClose={() => setInvoice(null)} />}
    </div>
  );
}
