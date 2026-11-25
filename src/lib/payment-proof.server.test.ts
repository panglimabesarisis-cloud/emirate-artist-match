import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, inserts: [] as Record<string, unknown>[], updates: 0, receipt: vi.fn() }));

vi.mock("./receipt.server", () => ({ orderReceipt: mocks.receipt }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain = {
        select: () => chain, eq: () => chain,
        single: async () => ({ data: mocks.rows[table] ?? null, error: null }),
        insert: async (row: Record<string, unknown>) => {
          if (mocks.inserts.some(saved => saved["id"] === row["id"])) return { error: { code: "23505" } };
          mocks.inserts.push(row);
          return { error: null };
        },
        update: () => ({ eq: async () => { mocks.updates++; return { error: null }; } }),
      };
      return chain;
    },
  },
}));

import { paymentChatPath, postPaymentProof } from "./payment-proof.server";
import { buildReceipt } from "./receipt";
import { decodeReceipt, receiptSummary } from "./receipt-message";

const receipt = buildReceipt({ reference: "order-0000abcd", label: "Booking payment: Host Event", totalWithVat: 210, issued: "2026-11-26", paidAt: "2026-11-26", billTo: "Maya", billEmail: "maya@example.com" });

beforeEach(() => {
  mocks.inserts.length = 0; mocks.updates = 0;
  mocks.receipt.mockReset().mockResolvedValue(receipt);
  mocks.rows = {
    payment_orders: { id: "o1", kind: "booking", target_id: "b1", status: "paid" },
    bookings: { conversation_id: "c1", total: 1050, paid_amount: 210 },
    conversations: { access_key: "chat-key", deleted_at: null },
  };
});

describe("payment proof", () => {
  it("posts the paid invoice to the chat once, without contact details", async () => {
    await postPaymentProof("o1");
    await postPaymentProof("o1");
    expect(mocks.inserts).toHaveLength(1);
    expect(mocks.inserts[0]).toMatchObject({ id: "o1", conversation_id: "c1", sender: "system" });
    const body = String(mocks.inserts[0]!["body"]);
    expect(body).not.toContain("maya@example.com");
    const saved = decodeReceipt(body)!;
    expect(saved.lines[0]!.detail).toBe("Booking total AED 1,050.00 · Paid AED 210.00 · Balance AED 840.00");
    expect(receiptSummary(saved)).toBe(`Payment received · AED 210.00 · ${receipt.number}`);
    expect(mocks.updates).toBe(1);
  });

  it("returns the payer to the chat of the booking or invoice", async () => {
    expect(await paymentChatPath("o1")).toBe("/chat/c1?k=chat-key");
    mocks.rows["payment_orders"] = { id: "o2", kind: "invoice", target_id: "i1", status: "paid" };
    mocks.rows["service_invoices"] = { conversation_id: "c2" };
    expect(await paymentChatPath("o2")).toBe("/chat/c2?k=chat-key");
  });

  it("does nothing for unpaid orders, other purchases or a removed chat", async () => {
    for (const order of [{ kind: "booking", status: "pending" }, { kind: "deposit", status: "paid" }]) {
      mocks.rows["payment_orders"] = { id: "o3", target_id: "x", ...order };
      await postPaymentProof("o3");
      expect(await paymentChatPath("o3")).toBeNull();
    }
    expect(mocks.inserts).toHaveLength(0);
    mocks.rows["payment_orders"] = { id: "o1", kind: "booking", target_id: "b1", status: "paid" };
    mocks.rows["conversations"] = { access_key: "chat-key", deleted_at: "2026-11-26" };
    expect(await paymentChatPath("o1")).toBeNull();
  });

  it("rejects text that only looks like a receipt", () => {
    expect(decodeReceipt("[[RECEIPT]]{\"status\":\"paid\"}")).toBeNull();
    expect(decodeReceipt("[[RECEIPT]]not json")).toBeNull();
    expect(decodeReceipt("Hello")).toBeNull();
  });
});
