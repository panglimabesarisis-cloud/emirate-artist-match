import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: {} as Record<string, unknown>, inserts: [] as Record<string, unknown>[], updates: 0, receipt: vi.fn() }));

vi.mock("./receipt.server", () => ({ orderReceipt: mocks.receipt }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: mocks.rows[table] ?? null, error: null }),
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
    payment_orders: { id: "o1", kind: "booking", target_id: "b1", status: "paid", amount_minor: 21000 },
    bookings: { artist_id: "a1", conversation_id: "c1", total: 1050, paid_amount: 210, client_name: "Maya", job_detail: "Emcee", notes: "Venue: Atlantis\nCall 0501234567", event_date: "2026-12-11", start_time: "21:00:00", end_time: "23:00:00", event_details: { indoorOutdoor: "Indoor", rehearsalDate: "2026-12-05" } },
    artists: { stage_name: "Sample Singer" },
    conversations: { access_key: "chat-key", deleted_at: null },
  };
});

describe("payment proof", () => {
  it("posts the paid invoice and the confirmation once, without contact details", async () => {
    await postPaymentProof("o1");
    await postPaymentProof("o1");
    expect(mocks.inserts).toHaveLength(2);
    expect(mocks.inserts[0]).toMatchObject({ id: "o1", conversation_id: "c1", sender: "system" });
    expect(mocks.inserts[1]).toMatchObject({ conversation_id: "c1", sender: "ai" });
    expect(mocks.inserts[1]!["id"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    const reply = String(mocks.inserts[1]!["body"]);
    expect(reply.split("\n").slice(0, 7)).toEqual(["Thank you! Maya", "Your payment: AED 210.00 (including VAT)", "Status: Received / Paid", "---", "This payment is for booking: Sample Singer", "Date Confirmed: 11 December 2026", "---"]);
    for (const line of ["Emcee", "Date Event: 2026-12-11", "Event Time: 21:00-23:00", "Event Type: Indoor", "Wardrobe: -", "Date: 5 December 2026",
      "Link Location: https://www.google.com/maps/search/?api=1&query=Atlantis", "https://dealmakertalent.com/client/dashboard"]) expect(reply).toContain(line);
    expect(reply).not.toContain("0501234567");
    const body = String(mocks.inserts[0]!["body"]);
    expect(body).not.toContain("maya@example.com");
    const saved = decodeReceipt(body)!;
    expect(saved.lines[0]!.detail).toBe("Booking total AED 1,050.00 · Paid AED 210.00 · Balance AED 840.00");
    expect(receiptSummary(saved)).toBe(`Payment received · AED 210.00 · ${receipt.number}`);
    expect(mocks.updates).toBe(2);
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
