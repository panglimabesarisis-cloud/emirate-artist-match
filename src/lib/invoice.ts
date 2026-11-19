import { priceBreakdown } from "./booking-rules";

export type InvoiceItem = { title: string; qty: number; price: number };
export type Invoice = { no: string; items: InvoiceItem[]; subtotal: number; vat: number; total: number; due: string | null; notes: string | null };

const MARK = "[[INVOICE]]";

/** Builds totals (5% VAT) from line items. */
export function buildInvoice(no: string, items: InvoiceItem[], due: string | null, notes: string | null): Invoice {
  const clean = items.filter((i) => i.title.trim() && i.qty > 0 && i.price >= 0).map((i) => ({ title: i.title.trim().slice(0, 120), qty: Math.min(99, Math.floor(i.qty)), price: Math.round(i.price * 100) / 100 }));
  if (clean.length === 0) throw new Error("Add at least one service");
  const p = priceBreakdown(clean.reduce((s, i) => s + i.qty * i.price, 0));
  return { no, items: clean, subtotal: p.subtotal, vat: p.vat, total: p.total, due, notes };
}

export const encodeInvoice = (inv: Invoice) => `${MARK}${JSON.stringify(inv)}`;
export function decodeInvoice(body: string): Invoice | null {
  if (!body.startsWith(MARK)) return null;
  try { return JSON.parse(body.slice(MARK.length)) as Invoice; } catch { return null; }
}
