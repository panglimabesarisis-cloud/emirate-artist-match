import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { vatParts } from "@/lib/admin-documents";
import { invoiceMoney } from "@/lib/invoice";
import { issuerLines } from "@/lib/site-settings";
import { A4Dialog, A4Statement } from "./A4Dialog";
import { BookingInvoiceById } from "./BookingInvoice";

const dayText = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" }) : null);

/** A payment transaction on A4: the booking's invoice, or a platform receipt for an artist's purchase. */
export function PaymentDocument({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const issuer = useSiteSettings().invoice;
  const query = useQuery({
    queryKey: ["admin-payment-document", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_orders").select("id, kind, status, amount_minor, target_id, credits, plan_code, created_at, paid_at, artists(stage_name)").eq("id", orderId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Payment not found");
      let bookingId = data.kind === "booking" ? data.target_id : null;
      if (data.kind === "invoice" && data.target_id) bookingId = (await supabase.from("service_invoices").select("booking_id").eq("id", data.target_id).maybeSingle()).data?.booking_id ?? null;
      return { order: data, bookingId };
    },
  });
  if (query.data?.bookingId) return <BookingInvoiceById bookingId={query.data.bookingId} onClose={onClose} />;
  const order = query.data?.order;
  if (!order) return <A4Dialog title="Payment" onClose={onClose}><p role={query.isPending ? "status" : "alert"} className="p-8 text-center text-muted-foreground">{query.isPending ? "Loading payment…" : "This payment cannot be opened."}</p></A4Dialog>;
  const amount = order.amount_minor / 100;
  const parts = vatParts(amount);
  const label = order.kind === "credits" ? `${order.credits} AI credits` : order.kind === "deposit" ? "Registration deposit" : order.kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const paid = order.status === "paid";
  return (
    <A4Dialog title="Payment" onClose={onClose}>
      <A4Statement heading={paid ? "INVOICE" : "PAYMENT REQUEST"} number={`PAY-${order.id.slice(0, 8).toUpperCase()}`} status={order.status} tone={paid ? "paid" : "unpaid"}
        parties={[["From", issuerLines(issuer).length ? issuerLines(issuer) : ["Dealmaker"]], ["Billed to", [order.artists?.stage_name ?? "Artist", "Artist", `Created ${dayText(order.created_at)}`, paid ? `Paid ${dayText(order.paid_at)}` : null]]]}
        rows={[{ label, detail: order.plan_code ? `Plan chosen: ${order.plan_code}` : undefined, amount: invoiceMoney(parts.net) }]}
        totals={[["Subtotal", invoiceMoney(parts.net)], ["VAT 5%", invoiceMoney(parts.vat)], [paid ? "Total paid" : "Total", invoiceMoney(parts.gross)]]}
        note={issuer.footer || undefined} />
    </A4Dialog>
  );
}
