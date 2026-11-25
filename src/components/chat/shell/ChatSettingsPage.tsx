import { useState, type ReactNode } from "react";
import { CreditCard, FileText, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PaperData } from "@/components/dashboard/InvoicePaper";
import { useI18n } from "@/lib/i18n";
import { aed } from "@/lib/format";
import { invoiceMoney } from "@/lib/invoice";
import { paperForBooking, paperForInvoice, type InvoiceParties } from "@/lib/chat-invoice";
import { bookingExpired } from "@/lib/unpaid-expiry";
import { splitBilling, type ChatBooking, type ChatInvoice, type Payable } from "./billing-split";
import { ChatInvoiceDialog, DownloadInvoiceButton, InvoiceBlock } from "./InvoiceSheet";
import type { ChatSetting } from "./ChatShell";

const STATUS: Record<string, string> = { inquiry: "Waiting for approval", quoted: "Awaiting payment", confirmed: "Paid", completed: "Completed", disputed: "Disputed", cancelled: "Cancelled", paid: "Paid", unpaid: "Unpaid", expired: "Expired" };

export function LanguageChoice() {
  const { t, lang, setLang } = useI18n();
  return (
    <article className="dmc-card">
      <h2>{t("Language")}</h2>
      <div className="dmc-actions">
        <Button type="button" variant={lang === "en" ? "default" : "outline"} className="rounded-full" onClick={() => setLang("en")}>English</Button>
        <Button type="button" variant={lang === "ar" ? "default" : "outline"} className="rounded-full" onClick={() => setLang("ar")}>العربية</Button>
      </div>
    </article>
  );
}

/** What only the paying side can do. The artist's view passes none, so it never shows a pay button or a client link. */
export type Payments = {
  pay: (item: Payable) => Promise<void>;
  /** A page where this bill can be paid, to copy or share. */
  link: (item: Payable) => string;
};

/** Booking, invoice, account and payment pages of a chat. */
export function ChatSettingsPage({ page, bookings, invoices, parties, payments, account, commission, paymentNote }: {
  page: ChatSetting;
  bookings: ChatBooking[];
  invoices: ChatInvoice[];
  /** Printed on every invoice sheet. */
  parties: InvoiceParties;
  payments?: Payments;
  account: ReactNode;
  commission?: ReactNode;
  paymentNote: string;
}) {
  const { t } = useI18n();
  const [viewing, setViewing] = useState<PaperData | null>(null);
  const [busy, setBusy] = useState(false);
  const bills = splitBilling(bookings, invoices);
  const empty = (text: string) => <p className="dmc-empty">{t(text)}</p>;
  const invoicePaper = (row: ChatInvoice) => paperForInvoice(row.inv, row.saved, parties);
  const bookingPaper = (b: ChatBooking) => paperForBooking(b, parties);

  const pay = async (item: Payable) => {
    if (!payments) return;
    setBusy(true);
    try { await payments.pay(item); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("Checkout unavailable")); }
    finally { setBusy(false); }
  };
  const copy = async (item: Payable) => {
    try { await navigator.clipboard.writeText(payments!.link(item)); toast.success(t("Payment link copied")); }
    catch { toast.error(t("Could not copy the link")); }
  };
  const payButtons = (item: Payable) => payments && <>
    <Button type="button" size="sm" className="dmc-pay" disabled={busy} onClick={() => void pay(item)}><CreditCard className="me-1.5 h-4 w-4" />{t("Pay now")}</Button>
    <Button type="button" size="icon" variant="outline" className="h-8 w-8 rounded-full" aria-label={t("Copy payment link")} title={t("Copy payment link")} onClick={() => void copy(item)}><Link2 className="h-4 w-4" /></Button>
  </>;
  const viewButton = (paper: () => PaperData) => <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setViewing(paper())}><FileText className="me-1.5 h-4 w-4" />{t("View invoice")}</Button>;
  const pill = (status: string) => <span className={`dmc-pill ${status === "expired" || status === "cancelled" ? "off" : ""}`}>{t(STATUS[status] ?? status)}</span>;

  /** The open bill of a booking, else its paid one: the invoice posted for it, or the offer itself. */
  const billOf = (b: ChatBooking): { paper: (() => PaperData) | null; item: Payable | null } => {
    const open = bills.unpaidInvoices.find((row) => row.inv.bookingId === b.id);
    if (open) return { paper: () => invoicePaper(open), item: { kind: "invoice", row: open } };
    const done = [...bills.paidInvoices].reverse().find((row) => row.inv.bookingId === b.id);
    if (done) return { paper: () => invoicePaper(done), item: null };
    if (bills.unpaidBookings.includes(b)) return { paper: () => bookingPaper(b), item: { kind: "booking", booking: b } };
    return { paper: bills.paidBookings.includes(b) && b.total > 0 ? () => bookingPaper(b) : null, item: null };
  };

  const bookingCard = (b: ChatBooking) => {
    const { paper, item } = billOf(b);
    const expired = bookingExpired(b);
    return (
      <article key={b.id} className="dmc-card dmc-row">
        <div className="min-w-0">
          <h2>{b.title}</h2>
          <p>{b.date ?? t("Event date TBC")}{b.total > 0 ? ` · ${aed(b.total)} ${t("incl. VAT")}` : ""}</p>
          {b.status === "inquiry" && !expired && !paper && <small>{t("The invoice appears after the offer.")}</small>}
        </div>
        {pill(expired ? "expired" : b.status)}
        {(paper || (item && payments)) && <div className="flex flex-wrap items-center gap-2">{paper && viewButton(paper)}{item && payButtons(item)}</div>}
      </article>
    );
  };

  const unpaid = () => bills.payable.length ? <>
    {bills.payable.map((item) => (
      <div key={item.kind === "invoice" ? item.row.messageId : item.booking.id} className="dmc-bill">
        <InvoiceBlock paper={item.kind === "invoice" ? invoicePaper(item.row) : bookingPaper(item.booking)} actions={payButtons(item)} />
      </div>
    ))}
  </> : empty("No unpaid invoices. You are all settled.");

  /** What was bought with a payment: the booking when there is one, otherwise the invoice lines. */
  const job = (booking: ChatBooking | undefined, row?: ChatInvoice) => {
    const paidAt = row?.saved.paid_at ?? booking?.paidAt;
    const facts: [string, string][] = [
      ["Job", booking?.title ?? row?.inv.items.map((i) => i.title).join(", ") ?? ""],
      ["Event date", booking?.date ?? ""],
      ["Time", booking?.start ? [booking.start.slice(0, 5), booking.end?.slice(0, 5)].filter(Boolean).join(" – ") : ""],
      ["Guests", booking?.guests ? String(booking.guests) : ""],
      ["Includes", row?.inv.items.map((i) => `${i.qty} × ${i.title} (${invoiceMoney(i.qty * i.price)})`).join("\n") ?? ""],
      ["Job details", booking?.detail ?? ""],
      ["Notes", [row?.inv.notes, booking?.notes].filter(Boolean).join("\n")],
      ["Paid on", paidAt ? new Date(paidAt).toLocaleDateString("en-GB") : ""],
    ];
    return <dl className="dmc-job">{facts.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd dir="auto">{value}</dd></div>)}</dl>;
  };

  const paidCard = (key: string, title: string, total: string, status: string, paper: () => PaperData, details: ReactNode) => (
    <article key={key} className="dmc-card">
      <div className="dmc-row"><div><h2>{title}</h2><p>{total}</p></div>{pill(status)}<div className="flex flex-wrap items-center gap-2">{viewButton(paper)}<DownloadInvoiceButton paper={paper()} /></div></div>
      {details}
    </article>
  );

  let body: ReactNode;
  if (page === "account") body = account;
  else if (page === "commission") body = commission;
  else if (page === "unpaid") body = unpaid();
  else if (page === "paid") {
    body = bills.paidInvoices.length || bills.paidBookings.length ? <>
      {bills.paidInvoices.map((row) => paidCard(row.messageId, `${t("Invoice")} ${row.inv.no}`, invoiceMoney(row.inv.total), "paid", () => invoicePaper(row), job(bookings.find((b) => b.id === row.inv.bookingId), row)))}
      {bills.paidBookings.map((b) => paidCard(b.id, b.title, `${aed(b.total)} ${t("incl. VAT")}`, b.status, () => bookingPaper(b), job(b)))}
    </> : empty("Nothing has been paid in this chat yet.");
  } else if (page === "payment") {
    const next = bills.payable[0];
    body = <>
      <article className="dmc-card dmc-total">
        <p>{t("Amount due in this chat")}</p><strong>{aed(bills.outstanding)}</strong><small>{t(paymentNote)}</small>
        {payments && <div className="dmc-actions"><Button type="button" className="dmc-pay h-11 px-8" disabled={!next || busy} onClick={() => next && void pay(next)}><CreditCard className="me-2 h-4 w-4" />{t("Payment")}{next ? ` · ${next.kind === "invoice" ? invoiceMoney(next.row.inv.total) : aed(next.booking.total)}` : ""}</Button></div>}
      </article>
      {unpaid()}
    </>;
  } else {
    // Booking Info: the bookings, then one table of the bills that are open or paid. Expired ones are left out.
    const rows = [
      ...[...bills.unpaidInvoices, ...bills.paidInvoices].map((row) => {
        const booking = bookings.find((b) => b.id === row.inv.bookingId);
        const item: Payable | null = row.status === "unpaid" ? { kind: "invoice", row } : null;
        return { key: row.messageId, number: row.inv.no, title: booking?.title ?? row.inv.items.map((i) => i.title).join(", "), date: booking?.date ?? row.inv.due, amount: invoiceMoney(row.inv.total), status: row.status, item, paper: () => invoicePaper(row) };
      }),
      ...[...bills.unpaidBookings, ...bills.paidBookings].map((b) => {
        const item: Payable | null = bills.unpaidBookings.includes(b) ? { kind: "booking", booking: b } : null;
        return { key: b.id, number: b.number || "—", title: b.title, date: b.date, amount: aed(b.total), status: b.status, item, paper: () => bookingPaper(b) };
      }),
    ];
    body = bookings.length || rows.length ? <>
      {bookings.map(bookingCard)}
      {rows.length > 0 && (
        <section className="dmc-card">
          <h2>{t("Invoices & payments")}</h2>
          <div className="dmc-table">
            <table>
              <thead><tr>{["Invoice", "Job", "Date", "Amount", "Status", "Action"].map((h) => <th key={h} scope="col">{t(h)}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.number}</td><td className="dmc-wide">{r.title}</td><td>{r.date ?? t("TBC")}</td><td>{r.amount}</td><td>{pill(r.status)}</td>
                    <td><div className="flex items-center gap-2">{viewButton(r.paper)}{r.item && payButtons(r.item)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </> : empty("No booking yet. Send your event details in the chat.");
  }

  return (
    <>
      {body}
      <ChatInvoiceDialog paper={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
