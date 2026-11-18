import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Printer, ShieldCheck, Star } from "lucide-react";
import { getBooking, acceptAndPay, cancelBookingAsClient, submitBookingReview } from "@/lib/bookings.functions";
import { CONTRACT_TERMS, refundAmount } from "@/lib/booking-rules";
import { aed } from "@/lib/format";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/booking/$id")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ k: typeof s["k"] === "string" ? s["k"] : "" }),
  head: () => ({ meta: [{ title: "Your booking | Dealmaker" }, { name: "description", content: "Review your Dealmaker booking, contract and VAT invoice." }, { name: "robots", content: "noindex" }] }),
  component: BookingPage,
});

const STATUS: Record<string, string> = { quoted: "Awaiting your payment", confirmed: "Confirmed · funds in escrow", completed: "Completed", cancelled: "Cancelled" };
const ESCROW: Record<string, string> = { none: "Not paid", held: "Held in escrow", released: "Released to artist", refunded: "Refunded", partially_refunded: "Partially refunded" };

function BookingPage() {
  const { id } = Route.useParams();
  const { k } = Route.useSearch();
  const qc = useQueryClient();
  const get$ = useServerFn(getBooking);
  const pay$ = useServerFn(acceptAndPay);
  const cancel$ = useServerFn(cancelBookingAsClient);
  const review$ = useServerFn(submitBookingReview);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const { data: b, error } = useQuery({ queryKey: ["booking", id], queryFn: () => get$({ data: { id, key: k } }), retry: false });

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await qc.invalidateQueries({ queryKey: ["booking", id] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  if (error) return <PublicLayout><div className="p-16 text-center">This booking link is invalid.</div></PublicLayout>;
  if (!b) return <PublicLayout><div className="p-16 text-center text-muted-foreground">Loading…</div></PublicLayout>;
  const paid = Number(b.paid_amount);
  const review = b.reviews?.[0];

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="text-3xl font-semibold">{b.package_title ?? "Booking"}</h1>
            <p className="text-muted-foreground">with <Link to="/artist/$slug" params={{ slug: b.artists?.slug ?? "" }} className="text-gold underline">{b.artists?.stage_name}</Link> · {b.event_date}</p>
          </div>
          <Badge variant={b.status === "cancelled" ? "secondary" : "default"}>{STATUS[b.status] ?? b.status}</Badge>
        </div>

        {/* Invoice */}
        <section className="rounded-2xl bg-card p-6 shadow-card">
          <div className="flex justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{b.invoice_no ? "Tax invoice" : "Pro-forma quote"}</div>
              <div className="text-lg font-semibold">{b.invoice_no ?? "Not yet issued"}</div>
              {b.paid_at && <div className="text-xs text-muted-foreground">Issued {new Date(b.paid_at).toLocaleDateString("en-GB")}</div>}
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold">{b.artists?.stage_name}</div>
              <div className="text-muted-foreground">TRN: {b.artists?.trn || "Not VAT registered (demo)"}</div>
              <div className="mt-2 text-muted-foreground">Billed to: {b.client_name}</div>
            </div>
          </div>
          <table className="mt-6 w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="py-2">{b.package_title}{b.event_types?.name ? ` · ${b.event_types.name}` : ""} · {b.event_date}</td><td className="py-2 text-right">{aed(Number(b.amount))}</td></tr>
              <tr><td className="py-2 text-muted-foreground">VAT 5%</td><td className="py-2 text-right">{aed(Number(b.vat_amount))}</td></tr>
              <tr className="border-t font-semibold"><td className="py-2">Total</td><td className="py-2 text-right">{aed(Number(b.total))}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Payment</td><td className="py-1 text-right">{ESCROW[b.escrow_status] ?? b.escrow_status}</td></tr>
              {Number(b.refund_amount) > 0 && <tr><td className="py-1 text-muted-foreground">Refunded</td><td className="py-1 text-right">{aed(Number(b.refund_amount))}</td></tr>}
            </tbody>
          </table>
          {b.notes && <p className="mt-4 text-sm text-muted-foreground" dir="auto">{b.notes}</p>}
          {b.invoice_no && <Button variant="outline" size="sm" className="mt-4 print:hidden" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print / save PDF</Button>}
        </section>

        {/* Contract */}
        <section className="rounded-2xl bg-card p-6 shadow-card print:hidden">
          <h2 className="font-semibold">Booking contract</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">{CONTRACT_TERMS.map((t) => <li key={t}>{t}</li>)}</ol>
          {b.contract_accepted_at && <p className="mt-3 text-xs text-muted-foreground">Accepted {new Date(b.contract_accepted_at).toLocaleString("en-GB")}</p>}
          {b.status === "quoted" && (
            <div className="mt-5 space-y-4">
              <label className="flex items-start gap-2 text-sm"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} /> I accept the contract terms above.</label>
              <Button disabled={!agree || busy} className="w-full bg-gradient-gold text-gold-foreground" onClick={() => run(() => pay$({ data: { id, key: k, agree } }), "Payment received — booking confirmed")}>
                <ShieldCheck className="mr-2 h-4 w-4" />Pay {aed(Number(b.total))} into escrow (demo)
              </Button>
              <p className="text-xs text-muted-foreground">DEMO MODE · no real money is charged.</p>
            </div>
          )}
        </section>

        {(b.status === "quoted" || b.status === "confirmed") && (
          <section className="rounded-2xl bg-card p-6 shadow-card print:hidden">
            <h2 className="font-semibold">Cancel booking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {paid > 0 ? <>If you cancel today you get back <b>{aed(refundAmount(paid, "client", b.event_date))}</b> of {aed(paid)}.</> : "Nothing has been paid yet."}
            </p>
            <Button variant="outline" className="mt-3" disabled={busy} onClick={() => { if (confirm("Cancel this booking?")) run(() => cancel$({ data: { id, key: k } }), "Booking cancelled"); }}>Cancel booking</Button>
          </section>
        )}

        {b.status === "completed" && (
          <section className="rounded-2xl bg-card p-6 shadow-card print:hidden">
            <h2 className="font-semibold">{review ? "Your verified review" : "Leave a verified review"}</h2>
            {review ? (
              <div className="mt-2 text-sm"><div className="text-gold">{"★".repeat(review.rating)}</div><p dir="auto">{review.body}</p></div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(n)}><Star className={`h-6 w-6 ${n <= rating ? "fill-gold text-gold" : "text-muted-foreground"}`} /></button>
                ))}</div>
                <Textarea rows={4} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="How was the performance?" />
                <Button disabled={busy || body.trim().length < 10} onClick={() => run(() => review$({ data: { id, key: k, rating, body } }), "Thank you for your review!")}>Publish review</Button>
              </div>
            )}
          </section>
        )}
      </div>
    </PublicLayout>
  );
}
