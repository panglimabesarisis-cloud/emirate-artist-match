/** The paid invoice a verified payment posts into its chat. Only trust it on `system` messages, which the server writes. */
import { invoiceMoney } from "./invoice";
import type { Receipt } from "./receipt";

const MARK = "[[RECEIPT]]";
export const encodeReceipt = (receipt: Receipt) => `${MARK}${JSON.stringify(receipt)}`;

export function decodeReceipt(body: string): Receipt | null {
  if (!body.startsWith(MARK)) return null;
  try {
    const value = JSON.parse(body.slice(MARK.length)) as Receipt;
    return value?.status === "paid" && typeof value.number === "string" && Number.isFinite(value.total) && Array.isArray(value.lines) && Array.isArray(value.later) ? value : null;
  } catch { return null; }
}

/** One line for chat lists and previews. */
export const receiptSummary = (receipt: Receipt) => `Payment received · ${invoiceMoney(receipt.total)} · ${receipt.number}`;
