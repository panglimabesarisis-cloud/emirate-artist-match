/** What the admin's A4 documents print, built from recorded bookings and payments. */
import type { PaperData, PaperStatus } from "@/components/dashboard/InvoicePaper";
import type { InvoiceItem } from "./invoice";

export type BookingForInvoice = {
  id: string; invoice_no: string | null; artist_name: string; client_name: string; client_email?: string | null | undefined; package_title: string | null;
  amount: number | string; vat_amount: number | string; total: number | string; paid_amount: number | string; paid_at?: string | null | undefined;
  created_at?: string | null | undefined; event_date: string | null; status: string; invoice_items?: unknown; notes?: string | null | undefined;
};

const items = (value: unknown): InvoiceItem[] => (Array.isArray(value) ? value : []).flatMap((item) => {
  const x = item as Partial<InvoiceItem> | null;
  return x && typeof x.title === "string" && Number(x.qty) > 0 && Number.isFinite(Number(x.price)) ? [{ title: x.title, qty: Number(x.qty), price: Number(x.price) }] : [];
});

/** Paid only when the whole total has been collected; a cancelled unpaid booking is no longer payable. */
export function paymentState(total: number, paid: number, status = ""): Extract<PaperStatus, "paid" | "partial" | "unpaid" | "expired"> {
  if (total > 0 && paid >= total) return "paid";
  if (paid > 0) return "partial";
  return status === "cancelled" ? "expired" : "unpaid";
}

export function bookingPaper(b: BookingForInvoice, trn: string | null = null): PaperData {
  const lines = items(b.invoice_items);
  const total = Number(b.total), paid = Number(b.paid_amount);
  return {
    number: b.invoice_no ?? `BK-${b.id.slice(0, 8).toUpperCase()}`, artistName: b.artist_name, client: b.client_name, clientEmail: b.client_email ?? null,
    issued: (b.created_at ?? b.paid_at ?? b.event_date)?.slice(0, 10) ?? null, due: b.event_date,
    items: lines.length ? lines : [{ title: b.package_title ?? "Booking", qty: 1, price: Number(b.amount) }],
    subtotal: Number(b.amount), vat: Number(b.vat_amount), total, paid, paidAt: b.paid_at ?? null, status: paymentState(total, paid, b.status), notes: b.notes ?? null, trn,
  };
}

/** Prices include 5% VAT; the two parts always add up to the amount charged. */
export function vatParts(gross: number) {
  const net = Math.round((gross / 1.05) * 100) / 100;
  return { net, vat: Math.round((gross - net) * 100) / 100, gross: Math.round(gross * 100) / 100 };
}

export type LedgerLine = { journal: string; entry_date: string; reference: string; account: string; debit: number | string; credit: number | string; memo: string };
export const ACCOUNTS: { name: string; type: "Asset" | "Liability" | "Revenue" | "Expense" }[] = [
  { name: "Cash at payment processor", type: "Asset" },
  { name: "Customer funds held in escrow", type: "Liability" },
  { name: "Artist payable", type: "Liability" },
  { name: "Client commission payable", type: "Liability" },
  { name: "Registration deposits held", type: "Liability" },
  { name: "VAT payable (5%)", type: "Liability" },
  { name: "Platform commission revenue", type: "Revenue" },
  { name: "Subscription and credit revenue", type: "Revenue" },
  { name: "Client commission expense", type: "Expense" },
  { name: "Cancellation fee revenue", type: "Revenue" },
  { name: "Payment processor fees", type: "Expense" },
  { name: "Adjustments", type: "Expense" },
];
const cents = (value: number | string) => Math.round(Number(value) * 100);

/** Debit, credit and balance per ledger account, with the balance on the side that account normally carries. */
export function trialBalance(lines: LedgerLine[]) {
  const names = [...ACCOUNTS.map((a) => a.name), ...new Set(lines.map((l) => l.account).filter((n) => !ACCOUNTS.some((a) => a.name === n)))];
  const accounts = names.map((name) => {
    const own = lines.filter((l) => l.account === name);
    const debit = own.reduce((n, l) => n + cents(l.debit), 0), credit = own.reduce((n, l) => n + cents(l.credit), 0);
    const type = ACCOUNTS.find((a) => a.name === name)?.type ?? "Liability";
    const balance = type === "Asset" || type === "Expense" ? debit - credit : credit - debit;
    return { name, type, entries: own.length, debit: debit / 100, credit: credit / 100, balance: balance / 100 };
  }).filter((a) => a.entries > 0);
  const debit = lines.reduce((n, l) => n + cents(l.debit), 0), credit = lines.reduce((n, l) => n + cents(l.credit), 0);
  const of = (type: string) => accounts.filter((a) => a.type === type).reduce((n, a) => n + cents(a.balance), 0) / 100;
  return { accounts, debit: debit / 100, credit: credit / 100, balanced: debit === credit, revenue: of("Revenue"), expense: of("Expense"), liabilities: of("Liability"), assets: of("Asset") };
}

/** Opening balance, period movement and closing balance per account. `lines` must include everything before `from`. */
export function ledgerReport(lines: LedgerLine[], from: string) {
  const period = lines.filter((l) => l.entry_date >= from);
  const before = trialBalance(lines.filter((l) => l.entry_date < from));
  const during = trialBalance(period);
  const all = trialBalance(lines);
  const find = (list: typeof all.accounts, name: string) => list.find((a) => a.name === name);
  const accounts = all.accounts.map((a) => ({
    name: a.name, type: a.type, opening: find(before.accounts, a.name)?.balance ?? 0,
    debit: find(during.accounts, a.name)?.debit ?? 0, credit: find(during.accounts, a.name)?.credit ?? 0, closing: a.balance,
  }));
  return { accounts, period, debit: during.debit, credit: during.credit, balanced: during.balanced && all.balanced, revenue: during.revenue, expense: during.expense };
}

/** One account's movements oldest first, each with the balance after it. */
export function accountStatement(lines: LedgerLine[], account: string, opening: number) {
  const debitNormal = ["Asset", "Expense"].includes(ACCOUNTS.find((a) => a.name === account)?.type ?? "Liability");
  let balance = cents(opening);
  return lines.filter((l) => l.account === account).sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.journal.localeCompare(b.journal)).map((line) => {
    balance += (cents(line.debit) - cents(line.credit)) * (debitNormal ? 1 : -1);
    return { ...line, balance: balance / 100 };
  });
}

/** "Chrome 130 · Windows" from a browser's user-agent text. */
export function browserName(agent: string | null | undefined) {
  if (!agent) return "—";
  const found = [["Edge", /Edg(?:e|A|iOS)?\/(\d+)/], ["Opera", /OPR\/(\d+)/], ["Samsung Internet", /SamsungBrowser\/(\d+)/], ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/], ["Chrome", /(?:Chrome|CriOS)\/(\d+)/], ["Safari", /Version\/(\d+).*Safari/]] as const;
  const match = found.map(([name, pattern]) => [name, agent.match(pattern)?.[1]] as const).find(([, version]) => version);
  const system = /Windows/.test(agent) ? "Windows" : /Android/.test(agent) ? "Android" : /iPhone|iPad|iPod/.test(agent) ? "iOS" : /Mac OS X/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  return [match ? `${match[0]} ${match[1]}` : agent.slice(0, 40), system].filter(Boolean).join(" · ");
}

export type PermissionRow = { module: string; can_read: boolean; can_edit: boolean; can_delete: boolean };
export const MODULES: { id: string; label: string; detail: string }[] = [
  { id: "artists", label: "Artists", detail: "Directory, requests, categories, verification, ratecards, documents, analytics" },
  { id: "operations", label: "Operations", detail: "Contracts, client accounts, reviews, event types, support" },
  { id: "finance", label: "Finance", detail: "Bookings, invoices, payments, escrow, payouts, commissions, ledger" },
  { id: "subscriptions", label: "Subscriptions", detail: "Packages, subscriptions, AI credits" },
  { id: "automation", label: "AI and automation", detail: "AI flows, model prices, notification delivery" },
  { id: "library", label: "Master library", detail: "Contract, workflow, form and prompt templates" },
  { id: "settings", label: "Settings", detail: "Website, invoice, payment and WhatsApp settings" },
  { id: "administration", label: "Administration", detail: "Users, permissions and audit logs" },
];

/** A module without a saved row is fully allowed, matching `admin_can` in the database. */
export function permissionFor(rows: PermissionRow[], module: string): PermissionRow {
  return rows.find((r) => r.module === module) ?? { module, can_read: true, can_edit: true, can_delete: true };
}
/** Editing or deleting needs reading; removing read removes both. */
export function togglePermission(row: PermissionRow, key: "can_read" | "can_edit" | "can_delete", value: boolean): PermissionRow {
  const next = { ...row, [key]: value };
  if (key === "can_read" && !value) return { ...next, can_edit: false, can_delete: false };
  return value ? { ...next, can_read: true } : next;
}
