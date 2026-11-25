/** The rule of the database job expire_unpaid_records(), so an expired bill stops being offered before the job runs. */
export const dubaiToday = (now: Date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** An unpaid invoice expires when it is removed or its due date has passed, unless its booking already holds money. */
export function invoiceExpired(invoice: { status: string; due?: string | null | undefined; deletedAt?: string | null | undefined; bookingPaid?: number | null | undefined }, today = dubaiToday()) {
  if (invoice.status === "paid") return false;
  if (invoice.deletedAt) return true;
  if (!invoice.due || !/^\d{4}-\d{2}-\d{2}$/.test(invoice.due) || invoice.due >= today) return false;
  return !Number(invoice.bookingPaid ?? 0);
}

/** An unpaid offer or request expires once its event date has passed. */
export function bookingExpired(booking: { status: string; date: string | null; paidAmount?: number | null | undefined }, today = dubaiToday()) {
  return (booking.status === "quoted" || booking.status === "inquiry") && !Number(booking.paidAmount ?? 0) && !!booking.date && booking.date < today;
}
