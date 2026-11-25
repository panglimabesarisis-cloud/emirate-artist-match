/** Turns the bills of a booking chat into the dashboard's invoice sheet (PaperData) and its PDF. */
import type { PaperData, PaperStatus } from "@/components/dashboard/InvoicePaper";
import type { Invoice, InvoiceItem } from "./invoice";
import type { ArchiveInvoice } from "./invoice-pdf";
import { dubaiToday, invoiceExpired } from "./unpaid-expiry";

/** What a chat knows about a stored invoice besides the document posted in the message. */
export type SavedInvoice = { id: string; status: string; paid_at?: string | null; created_at?: string | null; paid?: number; client?: string | null; client_email?: string | null };
export type InvoiceParties = { artistName: string; trn?: string | null | undefined; client?: string | null | undefined; clientEmail?: string | null | undefined };
export type BookingBill = {
  title: string; total: number; amount?: number; vat?: number; number?: string | null; items?: unknown; createdAt?: string | null;
  paidAmount?: number; paidAt?: string | null; client?: string | null; clientEmail?: string | null;
};

type InvoiceRow = { id: string; status: string; total: number | string; paid_at?: string | null; created_at?: string | null; deleted_at?: string | null; document?: unknown };
type LinkedBooking = { paid_amount?: number | string | null; client_name?: string | null; client_email?: string | null };

/** The paid part follows the dashboard: the linked booking's money, otherwise all or nothing. */
export function savedInvoice(row: InvoiceRow, booking?: LinkedBooking | null, fallback: { client?: string | null | undefined; email?: string | null | undefined } = {}): SavedInvoice {
  const total = Number(row.total);
  const due = (row.document as { due?: string | null } | null | undefined)?.due;
  return {
    id: row.id,
    status: invoiceExpired({ status: row.status, due, deletedAt: row.deleted_at, bookingPaid: Number(booking?.paid_amount ?? 0) }) ? "expired" : row.status,
    paid_at: row.paid_at ?? null,
    created_at: row.created_at ?? null,
    paid: booking ? Math.min(total, Number(booking.paid_amount ?? 0)) : row.status === "paid" ? total : 0,
    client: booking?.client_name ?? fallback.client ?? null,
    client_email: booking?.client_email ?? fallback.email ?? null,
  };
}

const day = (timestamp: string | null | undefined) => (timestamp ? dubaiToday(new Date(timestamp)) : null);

/** A message-only invoice with no stored row gets no status: payment state is never inferred. */
export function paperForInvoice(inv: Invoice, saved: SavedInvoice | undefined, parties: InvoiceParties, today = dubaiToday()): PaperData {
  const paid = saved?.paid ?? (saved?.status === "paid" ? inv.total : 0);
  let status: PaperStatus = "none";
  if (saved) {
    status = saved.status === "paid" ? "paid"
      : saved.status === "expired" || invoiceExpired({ status: saved.status, due: inv.due, bookingPaid: paid }, today) ? "expired"
      : paid > 0 ? "partial" : "unpaid";
  }
  return {
    number: inv.no, artistName: parties.artistName, trn: parties.trn ?? null,
    client: saved?.client ?? parties.client ?? null, clientEmail: saved?.client_email ?? parties.clientEmail ?? null,
    issued: day(saved?.created_at), due: inv.due, items: inv.items, subtotal: inv.subtotal, vat: inv.vat, total: inv.total,
    paid: status === "paid" ? inv.total : paid, paidAt: saved?.paid_at ?? null, status, notes: inv.notes,
  };
}

const money = (value: number) => Math.round(value * 100) / 100;
const isItem = (value: unknown): value is InvoiceItem => !!value && typeof (value as InvoiceItem).title === "string" && Number.isFinite((value as InvoiceItem).qty) && Number.isFinite((value as InvoiceItem).price);

/** The sheet of a booking offer that has no posted invoice, from the booking's own saved amounts. */
export function paperForBooking(booking: BookingBill, parties: InvoiceParties): PaperData {
  const total = booking.total;
  const subtotal = booking.amount || money(total / 1.05);
  const vat = booking.vat || money(total - subtotal);
  const listed = Array.isArray(booking.items) ? booking.items.filter(isItem) : [];
  // The saved lines are used only when they add up to the saved amount.
  const items = listed.length && Math.abs(listed.reduce((sum, i) => sum + i.qty * i.price, 0) - subtotal) < 0.01 ? listed : [{ title: booking.title, qty: 1, price: subtotal }];
  const paid = Math.min(total, booking.paidAmount ?? 0);
  return {
    number: booking.number || "Pending", artistName: parties.artistName, trn: parties.trn ?? null,
    client: booking.client ?? parties.client ?? null, clientEmail: booking.clientEmail ?? parties.clientEmail ?? null,
    issued: day(booking.createdAt), due: null, items, subtotal, vat, total, paid, paidAt: booking.paidAt ?? null,
    status: total > 0 && paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid", notes: null,
  };
}

export function archiveFromPaper(paper: PaperData): ArchiveInvoice {
  return {
    number: paper.number ?? "-", artistName: paper.artistName, client: paper.client ?? "", clientEmail: paper.clientEmail ?? null,
    issued: paper.issued ?? dubaiToday(), due: paper.due, items: paper.items, subtotal: paper.subtotal, vat: paper.vat, total: paper.total,
    paid: paper.paid ?? 0, paidAt: paper.paidAt ?? null, status: paper.status === "draft" ? "none" : paper.status, notes: paper.notes, trn: paper.trn ?? null,
  };
}

export const invoiceFileName = (paper: PaperData) => `invoice-${(paper.number ?? "draft").replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
