import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Printer, Link2, Star } from "lucide-react";
import { getBooking, acceptBookingOffer, acceptAndPay, cancelBookingAsClient, submitBookingReview, openDisputeAsClient } from "@/lib/bookings.functions";
import { bookingPayment, canCheckoutBooking } from "@/lib/booking-payment-rules";
import { bookingIsFullyPaid } from "@/lib/payment-rules";
import { validateHostedUrl } from "@/lib/hosted-checkout";
import { PaidStamp } from "@/components/site/PaidStamp";
import { invoiceMoney as aed, type InvoiceItem } from "@/lib/invoice";
import { CONTRACT_TERMS, refundAmount, canDispute } from "@/lib/booking-rules";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentTestModeBanner, type CheckoutSession } from "@/components/site/SandboxCheckout";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/booking/$id")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ k: typeof s["k"] === "string" ? s["k"] : "" }),
  head: () => ({ meta: [{ title: "Your booking | Dealmaker" }, { name: "description", content: "Review your Dealmaker booking, contract and VAT invoice." }, { name: "robots", content: "noindex" }, { property: "og:title", content: "Your booking | Dealmaker" }, { property: "og:description", content: "Review your booking and pay safely in Stripe sandbox." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BookingPage,
});

const STATUS: Record<string, string> = { inquiry: "Waiting for artist approval", disputed: "Under review by Dealmaker", quoted: "Awaiting your payment", confirmed: "Confirmed · funds in escrow", completed: "Completed", cancelled: "Cancelled" };
const ESCROW: Record<string, string> = { none: "Not paid", held: "Held in escrow", released: "Released to artist", release_pending: "Held 48h after the event, then released", frozen: "Frozen during dispute review", refunded: "Refunded", partially_refunded: "Partially refunded" };

function BookingPage() {
  const { id } = Route.useParams();
  const { k } = Route.useSearch();
  const qc = useQueryClient();
  const get$ = useServerFn(getBooking);
  const pay$ = useServerFn(acceptAndPay);
  const accept$ = useServerFn(acceptBookingOffer);
  const cancel$ = useServerFn(cancelBookingAsClient);
  const review$ = useServerFn(submitBookingReview);
  const [checkout, setCheckout] = useState<(CheckoutSession & { dueMinor: number }) | null>(null);
  const [phone,setPhone]=useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [subs, setSubs] = useState({ performance: 5, punctuality: 5, communication: 5 });
  const [body, setBody] = useState("");
  const dispute$ = useServerFn(openDisputeAsClient);
  const [problem, setProblem] = useState("");
  const { data: b, error } = useQuery({ queryKey: ["booking", id], queryFn: () => get$({ data: { id, key: k } }), retry: false, refetchInterval: 5000 });

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
  const payment = bookingPayment(Number(b.total),paid,b.deposit_pct);
  const canPay = canCheckoutBooking(b.invoice_no, payment.dueMinor);
  const quote = b.conversations?.quote_requests;
  const items = Array.isArray(b.invoice_items) ? b.invoice_items as InvoiceItem[] : [];

  return (
    <PublicLayout>
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <h1 className="break-words text-3xl font-semibold">Booking offer · {b.package_title ?? "Booking"}</h1>
            <p className="text-muted-foreground">with <Link to="/artist/$slug" params={{ slug: b.artists?.slug ?? "" }} className="text-gold underline">{b.artists?.stage_name}</Link> · {b.event_date}</p>
          </div>
          <Badge variant={b.status === "cancelled" ? "secondary" : "default"}>{STATUS[b.status] ?? b.status}</Badge>
        </div>

        <section className="min-w-0"><h2 className="mb-3 font-semibold">Booking details</h2><dl className="text-sm">{[["Client",b.client_name],["Event date",b.event_date],["Time",`${(b.start_time ?? quote?.start_time)?.slice(0,5)??"—"} – ${(b.end_time ?? quote?.end_time)?.slice(0,5)??"—"}`],["Duration",quote?.perform_minutes ? `${quote.perform_minutes} minutes` : "See event details below"],["Venue / emirate",quote?.areas?.name ?? "See event details below"],["Guests",b.guests ?? "—"],["Job detail",b.job_detail??"—"],["Payment",paid>0?`Paid ${payment.percent}%`:"Unpaid"],["Balance",aed(payment.balance)],["Calendar",b.calendar_sync_status]].map(([label,value])=><div key={label} className="grid gap-1 border-b py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"><dt className="font-medium">{label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{value}</dd></div>)}</dl></section>
        {/* Invoice */}
        <section className="rounded-2xl bg-card p-6 shadow-card">
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{b.invoice_no ? "Tax invoice" : "Pro-forma quote"}</div>
              <div className="text-lg font-semibold">{b.invoice_no ?? "Not yet issued"}</div>
              {b.paid_at && <div className="text-xs text-muted-foreground">Issued {new Date(b.paid_at).toLocaleDateString("en-GB")}</div>}
            </div>
            <div className="min-w-0 break-words text-start text-sm sm:text-end">
              <div className="font-semibold">{b.artists?.stage_name}</div>
              <div className="text-muted-foreground">TRN: {b.artists?.trn || "Not VAT registered (demo)"}</div>
              <div className="mt-2 text-muted-foreground">Billed to: {b.client_name}</div>
            </div>
          </div>
          <table className="mt-6 w-full table-fixed text-sm">
            <tbody>
              {items.map((item,i)=><tr key={i} className="border-b"><td className="break-words py-2 pe-3 [overflow-wrap:anywhere]">{item.qty} × {item.title}<div className="text-xs text-muted-foreground">{aed(item.price)} each</div></td><td className="break-words py-2 text-end">{aed(item.qty*item.price)}</td></tr>)}
              {!items.length && <tr className="border-b"><td className="py-2">{b.package_title}{b.event_types?.name ? ` · ${b.event_types.name}` : ""} · {b.event_date}</td><td className="py-2 text-right">{aed(Number(b.amount))}</td></tr>}
              <tr><td className="py-2 text-muted-foreground">Subtotal</td><td className="py-2 text-end">{aed(payment.subtotal)}</td></tr>
              <tr><td className="py-2 text-muted-foreground">UAE VAT (5%)</td><td className="py-2 text-end">{aed(payment.vatAmount)}</td></tr>
              <tr className="border-t font-semibold"><td className="py-2 pe-3">Total (VAT Inclusive)</td><td className="py-2 text-end">{aed(payment.total)}</td></tr>
              <tr><td className="py-1 text-muted-foreground">Payment</td><td className="py-1 text-right">{ESCROW[b.escrow_status] ?? b.escrow_status}</td></tr>
              {Number(b.refund_amount) > 0 && <tr><td className="py-1 text-muted-foreground">Refunded</td><td className="py-1 text-right">{aed(Number(b.refund_amount))}</td></tr>}
            </tbody>
          </table>
          {b.notes && <div className="mt-4 border-t pt-4"><h3 className="mb-2 text-sm font-semibold">Event details</h3><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground [overflow-wrap:anywhere]" dir="auto">{b.notes}</p></div>}
          {bookingIsFullyPaid(Number(b.total), paid, Number(b.refund_amount)) && <div className="mt-4 flex justify-end border-t pt-3"><PaidStamp /></div>}
          {b.invoice_no && <Button variant="outline" size="sm" className="mt-4 print:hidden" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print / save PDF</Button>}
        </section>

        {/* Contract */}
        <section className="rounded-2xl bg-card p-6 shadow-card print:hidden">
          <h2 className="font-semibold">Booking contract</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">{CONTRACT_TERMS.map((t) => <li key={t}>{t}</li>)}</ol>
          {b.contract_accepted_at && <p className="mt-3 text-xs text-muted-foreground">Accepted {new Date(b.contract_accepted_at).toLocaleString("en-GB")}</p>}
          {b.status === "inquiry" && <p className="mt-4 text-sm text-muted-foreground">The artist is reviewing these details. You can pay once they approve.</p>}
          {["quoted","confirmed"].includes(b.status) && (
            <div className="mt-5 space-y-4">
              <div><Label htmlFor="client-whatsapp">WhatsApp for payment reminders</Label><Input id="client-whatsapp" type="tel" dir="ltr" placeholder="+971501234567" value={phone || b.client_phone || ""} onChange={e=>setPhone(e.target.value.replace(/[^+\d]/g,""))} /></div>
              <label className="flex items-start gap-2 text-sm"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} /> I accept the contract terms above.</label>
              {!b.invoice_no && payment.dueMinor > 0 && <><p role="status" className="text-sm text-muted-foreground">Invoice status: Not yet issued. Accept this offer to issue the invoice before payment.</p><Button variant="outline" disabled={!agree || busy} className="h-auto w-full whitespace-normal px-4 py-3" onClick={() => run(() => accept$({ data: { id, key: k, agree } }), "Offer accepted · invoice issued")}>Accept offer &amp; issue invoice</Button></>}
              {checkout && checkout.dueMinor === payment.dueMinor && agree && canPay ? (
                <Button asChild variant="link" className="h-auto min-h-12 w-full gap-2 whitespace-normal px-4 py-3 text-center leading-relaxed">
                  <a href={checkout.checkoutUrl}><Link2 className="shrink-0" /><span className="min-w-0">{paid>0?"Pay Balance":"Pay Deposit"}{paid===0?` ${b.deposit_pct}%`:""} — {aed(payment.dueAmount)}</span></a>
                </Button>
              ) : (
                <Button disabled={!agree || busy || !canPay} className="h-auto min-h-12 w-full gap-2 whitespace-normal bg-gradient-gold px-4 py-3 text-center leading-relaxed text-gold-foreground" onClick={() => run(async () => { if (!canPay) return; const r = await pay$({ data: { id, key: k, agree, phone:phone || b.client_phone || undefined } }); if ("error" in r) throw new Error(r.error); setCheckout({ ...r, dueMinor: payment.dueMinor, checkoutUrl: validateHostedUrl(r.checkoutUrl) }); }, "Payment link ready")}>
                  <Link2 className="shrink-0" /><span className="min-w-0">{busy?"Preparing payment link…":"Get payment link"} — {aed(payment.dueAmount)}</span>
                </Button>
              )}
              <div className="flex justify-center"><Badge variant="secondary">Stripe Sandbox</Badge></div>
              {payment.dueMinor <= 0 && <p role="status" className="text-sm text-muted-foreground">No payment is due.</p>}
              <p className="text-xs text-muted-foreground">DEMO MODE · no real money is charged.</p>
            </div>
          )}
        </section>

        {canDispute(b.status, b.escrow_status) && (
          <section className="rounded-2xl bg-card p-6 shadow-card print:hidden">
            <h2 className="font-semibold">Report a problem</h2>
            <p className="mt-1 text-sm text-muted-foreground">Funds stay frozen in escrow while Dealmaker reviews your case.</p>
            <Textarea className="mt-3" rows={3} maxLength={1500} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What went wrong?" />
            <Button variant="outline" className="mt-3" disabled={busy || problem.trim().length < 10} onClick={() => run(() => dispute$({ data: { id, key: k, reason: problem } }), "Dispute opened — our team will review it")}>Open dispute</Button>
          </section>
        )}
        {b.disputes?.map((d) => (
          <section key={d.id} className="rounded-2xl bg-card p-6 shadow-card print:hidden">
            <h2 className="font-semibold">Dispute · {d.status === "open" ? "under review" : "resolved"}</h2>
            <p className="mt-1 text-sm" dir="auto">{d.reason}</p>
            {d.resolution && <p className="mt-2 text-sm text-muted-foreground">Decision: {d.resolution === "release_to_artist" ? "payment released to the artist" : d.resolution === "refund_full" ? "full refund" : "partial refund"}</p>}
          </section>
        ))}

        {(b.status === "inquiry" || b.status === "quoted" || b.status === "confirmed") && (
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
                {(["performance", "punctuality", "communication"] as const).map((k) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="capitalize text-muted-foreground">{k}</span>
                    <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" aria-label={`${k} ${n} stars`} onClick={() => setSubs({ ...subs, [k]: n })}><Star className={`h-4 w-4 ${n <= subs[k] ? "fill-gold text-gold" : "text-muted-foreground"}`} /></button>
                    ))}</div>
                  </div>
                ))}
                <Textarea rows={4} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="How was the performance?" />
                <Button disabled={busy || body.trim().length < 10} onClick={() => run(() => review$({ data: { id, key: k, rating, body, ...subs } }), "Thank you for your review!")}>Publish review</Button>
              </div>
            )}
          </section>
        )}
      </div>
    </PublicLayout>
  );
}
