import type { Invoice } from "@/lib/invoice";
import { decodeInvoice } from "@/lib/invoice";
import type { BookingBill, SavedInvoice } from "@/lib/chat-invoice";
import { bookingExpired, dubaiToday, invoiceExpired } from "@/lib/unpaid-expiry";

export type ChatBooking = BookingBill & {
  id: string; date: string | null; status: string; accessKey?: string;
  start?: string | null; end?: string | null; guests?: number | null; detail?: string | null; notes?: string | null;
};
export type ChatInvoice = { messageId: string; inv: Invoice; status: string; saved: SavedInvoice };
/** Something the client can pay: a standalone or booking invoice, or an offer that has no invoice. */
export type Payable = { kind: "invoice"; row: ChatInvoice } | { kind: "booking"; booking: ChatBooking };

/** Booking statuses that exist only after the client has paid. */
const PAID_BOOKING = ["confirmed", "completed", "disputed"];

/** The invoices posted in a chat with their saved payment status. Legacy chat-only invoices have none and are left out. */
export function chatInvoices(messages: { id: string; body: string }[], saved: SavedInvoice[]): ChatInvoice[] {
  const found = new Map<string, ChatInvoice>();
  for (const message of messages) {
    const inv = decodeInvoice(message.body);
    const row = saved.find((r) => r.id === inv?.id);
    if (inv?.id && row) found.set(inv.id, { messageId: message.id, inv, status: row.status, saved: row });
  }
  return [...found.values()];
}

/** Splits a chat's bookings and invoices into unpaid and paid, leaving expired bills out. A booking billed through an invoice is counted once. */
export function splitBilling(bookings: ChatBooking[], invoices: ChatInvoice[], today = dubaiToday()) {
  const linked = (id?: string) => bookings.find((b) => b.id === id);
  const unpaidInvoices = invoices.filter((i) => i.status === "unpaid" && !invoiceExpired({ status: i.status, due: i.inv.due, bookingPaid: linked(i.inv.bookingId)?.paidAmount }, today));
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const billed = new Set([...unpaidInvoices, ...paidInvoices].map((i) => i.inv.bookingId).filter(Boolean));
  const unpaidBookings = bookings.filter((b) => b.status === "quoted" && !billed.has(b.id) && !bookingExpired(b, today));
  const paidBookings = bookings.filter((b) => PAID_BOOKING.includes(b.status) && !billed.has(b.id));
  const outstanding = Math.round([...unpaidInvoices.map((i) => i.inv.total), ...unpaidBookings.map((b) => b.total)].reduce((sum, n) => sum + n, 0) * 100) / 100;
  // The one the Payment button opens: the nearest due date first, undated ones last.
  const payable: (Payable & { when: string })[] = [
    ...unpaidInvoices.map((row) => ({ kind: "invoice" as const, row, when: row.inv.due ?? "9999" })),
    ...unpaidBookings.map((booking) => ({ kind: "booking" as const, booking, when: booking.date ?? "9999" })),
  ].sort((a, b) => a.when.localeCompare(b.when));
  return { unpaidInvoices, paidInvoices, unpaidBookings, paidBookings, outstanding, payable: payable as Payable[] };
}
