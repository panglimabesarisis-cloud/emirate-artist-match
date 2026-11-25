import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sentToday: 0, inserted: [] as Record<string, unknown>[], updated: [] as Record<string, unknown>[] }));
const send = vi.hoisted(() => vi.fn(async () => ({ status: "accepted", messageId: "fonnte:1" }) as { status: string; error?: string; messageId?: string }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => { const q: Record<string, unknown> = { then: (done: (v: unknown) => unknown) => Promise.resolve({ count: db.sentToday, error: null }).then(done) }; q["eq"] = () => q; q["gte"] = () => q; return q; },
      insert: (row: Record<string, unknown>) => { db.inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: "n1" }, error: null }) }) }; },
      update: (row: Record<string, unknown>) => { db.updated.push(row); return { eq: async () => ({ error: null }) }; },
    }),
  },
}));
vi.mock("./whatsapp-provider.server", () => ({ sendWhatsApp: send, readWhatsAppConfig: vi.fn(), WHATSAPP_TEMPLATE: {} }));

import { notifyClientChatLink } from "./notify.server";

const run = () => notifyClientChatLink("c1", "k1", "+971500000000", "chat");
beforeEach(() => { db.sentToday = 0; db.inserted = []; db.updated = []; send.mockClear(); });

describe("client chat link on WhatsApp", () => {
  it("sends the private link once and records the provider result without storing the link", async () => {
    await run();
    expect(send).toHaveBeenCalledWith("+971500000000", "DEALMAKER TALENT\nNew Chat Income", expect.stringContaining("view your conversation"), "https://dealmakertalent.com/chat/c1?k=k1", "---\nThank You\nDealmaker Team");
    expect(db.inserted).toEqual([{ conversation_id: "c1", audience: "client", channel: "whatsapp", kind: "chat_link", recipient: "+971500000000", status: "sending" }]);
    expect(db.updated).toEqual([{ status: "accepted", error: null, provider_message_id: "fonnte:1" }]);
    expect(JSON.stringify([db.inserted, db.updated])).not.toContain("k=k1");
  });

  it("stops after three messages a day to one number", async () => {
    db.sentToday = 3;
    await run();
    expect(send).not.toHaveBeenCalled();
    expect(db.inserted).toEqual([]);
  });

  it("records a failed send and never throws into the booking", async () => {
    send.mockRejectedValueOnce(new Error("bad number"));
    await expect(run()).resolves.toBeUndefined();
    expect(db.updated[0]).toMatchObject({ status: "failed" });
  });
});
