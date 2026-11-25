/** The customer invoice shown around checkout. Amounts are AED; every charged total already includes 5% VAT. */
export type ReceiptLine = { label: string; detail?: string; amount: number };
export type Receipt = {
  number: string;
  issued: string;
  paidAt: string | null;
  status: "unpaid" | "paid";
  billTo: string;
  billEmail: string | null;
  /** Artist the money relates to, when there is one. */
  artist: string | null;
  lines: ReceiptLine[];
  subtotal: number;
  vat: number;
  total: number;
  /** Shown for information only and never part of the total: what is billed separately. */
  later: ReceiptLine[];
};

const money = (value: number) => Math.round(value * 100) / 100;
export function splitVat(totalWithVat: number) {
  const subtotal = money(totalWithVat / 1.05);
  return { subtotal, vat: money(totalWithVat - subtotal), total: money(totalWithVat) };
}
export const receiptNumber = (reference: string) => `DM-${reference.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase()}`;

export type PlanPrice = { name: string; monthly: number };
/** The plan picked at registration: billed from the dashboard, so it is listed outside the total. */
export function planLater(plan: PlanPrice | null | undefined): ReceiptLine[] {
  if (!plan || plan.monthly <= 0) return [];
  const withVat = money(plan.monthly * 1.05);
  return [{ label: `${plan.name} plan subscription, per month`, detail: `AED ${money(plan.monthly).toFixed(2)} + 5% VAT. Not charged today; subscribe from your dashboard.`, amount: withVat }];
}

type Party = { billTo: string; billEmail?: string | null; artist?: string | null };
export function buildReceipt(input: Party & { reference: string; label: string; detail?: string; totalWithVat: number; issued: string; paidAt?: string | null; later?: ReceiptLine[] }): Receipt {
  const amounts = splitVat(input.totalWithVat);
  return {
    number: receiptNumber(input.reference),
    issued: input.issued,
    paidAt: input.paidAt ?? null,
    status: input.paidAt ? "paid" : "unpaid",
    billTo: input.billTo,
    billEmail: input.billEmail ?? null,
    artist: input.artist ?? null,
    lines: [{ label: input.label, ...(input.detail ? { detail: input.detail } : {}), amount: amounts.subtotal }],
    ...amounts,
    later: input.later ?? [],
  };
}

/** Line wording for each kind of order in payment_orders. */
export function orderLabel(kind: string, extra: { credits?: number | null; title?: string | null } = {}) {
  switch (kind) {
    case "deposit": return "Talent registration deposit";
    case "credits": return `${extra.credits ?? 0} AI credits`;
    case "booking": return extra.title ? `Booking payment: ${extra.title}` : "Booking payment";
    case "invoice": return extra.title ? `Service invoice ${extra.title}` : "Service invoice";
    case "agent_prompt": return "Agent prompt";
    case "flow_template": return "AI flow template";
    case "order_form_template": return "Order form template";
    case "contract_template": return "Contract template";
    default: return "Dealmaker payment";
  }
}
