import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(), notify: vi.fn(), rpc: vi.fn(),
  matched: true, changed: true,
  writes: [] as { table: string; values: Record<string, unknown> }[],
}));
const id = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";

vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => { validate = fn; return builder; },
      handler: (fn: (args: { data: unknown }) => unknown) => (args: { data: unknown }) => fn({ data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("https://example.com/approve") }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./agent.server", () => ({ runAgent: mocks.runAgent }));
vi.mock("./notify.server", () => ({ notifyBooking: mocks.notify, siteOrigin: () => "https://example.com" }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: (table: string) => {
      let updating = false;
      const row = { id, artist_id: "artist", conversation_id: conversationId, status: "inquiry", artist_invoice_required: false, amount: 1000, event_date: "2026-12-20", package_title: "Performance", access_key: key, client_email: null, client_phone: null, artists: { stage_name: "Test Artist" } };
      const chain = {
        select: () => chain, eq: () => chain,
        update: (values: Record<string, unknown>) => { updating = true; mocks.writes.push({ table, values }); return chain; },
        insert: (values: Record<string, unknown>) => { mocks.writes.push({ table, values }); return Promise.resolve({ error: null }); },
        maybeSingle: () => Promise.resolve({ data: updating ? (mocks.changed ? { id } : null) : (mocks.matched ? row : null), error: null }),
        single: () => Promise.resolve({ data: row, error: null }),
        then: (resolve: (result: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
        or: () => Promise.resolve({ error: null, data: [{ artist_id: "artist", enabled: true, nodes: [
          { id: "wa", type: "whatsapp", data: { text: "Confirm" }, position: { x: 0, y: 0 } },
          { id: "invoice", type: "invoice", data: { text: "Invoice" }, position: { x: 0, y: 100 } },
          { id: "alternative", type: "question", data: { text: "Alternative date?" }, position: { x: 100, y: 100 } },
        ], edges: [{ id: "yes", source: "wa", target: "invoice", sourceHandle: "yes" }, { id: "no", source: "wa", target: "alternative", sourceHandle: "no" }] }] }),
      };
      return chain;
    },
  },
}));

import { approveBooking, declineBooking } from "./bookings.functions";

beforeEach(() => {
  vi.clearAllMocks(); mocks.matched = true; mocks.changed = true; mocks.writes = [];
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe("secret artist approval resumes AI", () => {
  it("runs Yes only after atomic invoice approval", async () => {
    await approveBooking({ data: { id, key, title: "Performance", amount: 1000, eventDate: "2026-12-20" } });
    expect(mocks.rpc).toHaveBeenCalledWith("approve_flow_booking", expect.objectContaining({ _id: id, _key: key, _amount: 1000 }));
    expect(mocks.runAgent).toHaveBeenCalledWith(conversationId, id);
    const commitOrder = mocks.rpc.mock.invocationCallOrder[0];
    const agentOrder = mocks.runAgent.mock.invocationCallOrder[0];
    expect(commitOrder).toBeDefined(); expect(agentOrder).toBeDefined();
    if (commitOrder !== undefined && agentOrder !== undefined) expect(commitOrder).toBeLessThan(agentOrder);
  });
  it("does not run Yes when atomic approval reports an already handled booking", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(approveBooking({ data: { id, key, title: "Performance", amount: 1000, eventDate: "2026-12-20" } })).rejects.toThrow("already handled");
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });
  it("posts No and returns control to AI on the configured No branch", async () => {
    await declineBooking({ data: { id, key, note: "Please choose another date" } });
    expect(mocks.writes).toContainEqual({ table: "bookings", values: expect.objectContaining({ status: "cancelled", cancelled_by: "artist" }) });
    expect(mocks.writes).toContainEqual({ table: "messages", values: { conversation_id: conversationId, sender: "artist", body: "Please choose another date" } });
    expect(mocks.runAgent).toHaveBeenCalledWith(conversationId, id);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("does not post duplicate No responses", async () => {
    mocks.changed = false;
    await expect(declineBooking({ data: { id, key, note: "Please choose another date" } })).rejects.toThrow("already handled");
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.writes.filter(w => w.table === "messages")).toHaveLength(0);
  });
  it("rejects an unverified artist link without changing bookings or running AI", async () => {
    mocks.matched = false;
    await expect(declineBooking({ data: { id, key, note: "Please choose another date" } })).rejects.toThrow("Approval link not found");
    expect(mocks.writes).toHaveLength(0);
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });
});