import { describe, it, expect, vi } from "vitest";
import { eligibleContracts, executeAgentTool, type AgentDb, type AgentToolContext } from "./my-agent-tools.server";
const artistId = "10000000-0000-4000-8000-000000000001";
const invoiceId = "20000000-0000-4000-8000-000000000001";
function context(record: unknown, sort = 1) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: record, error: null })),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: record, error: null }).then(resolve),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.order.mockReturnValue(query);
  const from = vi.fn(() => query);
  const rpc = vi.fn();
  const db = { from, rpc } as unknown as AgentDb;
  const ctx: AgentToolContext = {
    db,
    artistId,
    plan: {
      code: "free",
      name: "Free",
      sort,
      features: [],
      allowed_models: ["fast"],
      max_own_prompts: 5,
      max_active_prompts: 6,
      max_flow_blocks: 5,
      max_form_questions: 5,
      inheritedFeatures: [],
      tiers: [
        {
          code: "free",
          name: "Free",
          sort: 1,
          features: [],
          allowed_models: ["fast"],
          max_own_prompts: 5,
          max_active_prompts: 6,
          max_flow_blocks: 5,
          max_form_questions: 5,
        },
        {
          code: "pro",
          name: "Pro",
          sort: 4,
          features: [],
          allowed_models: ["advanced"],
          max_own_prompts: 40,
          max_active_prompts: 50,
          max_flow_blocks: 100,
          max_form_questions: 100,
        },
      ],
    },
    reports: [],
    invoices: [],
    contracts: [],
    proposals: [],
    attachedFiles: [],
  };
  rpc.mockImplementation(async (name: string) => ({
    data: name === "effective_artist_plan" ? "free" : record,
    error: null,
  }));
  from.mockImplementation((table?: string) => {
    if (table === "plan_tiers") {
      return { select: () => ({ order: async () => ({ data: ctx.plan.tiers, error: null }) }) } as typeof query;
    }
    return query;
  });
  return { ctx, from, query, rpc };
}
describe("Private artist agent tools", () => {
  it("shows the stored invoice privately without creating it or sending a client message", async () => {
    const record = {
      id: invoiceId,
      number: "INV-123",
      status: "paid",
      total: 1050,
      document: {
        no: "INV-123",
        items: [{ title: "Performance", qty: 1, price: 1000 }],
        subtotal: 1000,
        vat: 50,
        total: 1050,
        due: "2026-12-01",
        notes: null,
      },
    };
    const { ctx, from, query } = context(record);
    await expect(executeAgentTool("show_invoice", { id: invoiceId }, ctx)).resolves.toMatchObject({
      displayedPrivately: true,
      number: "INV-123",
      total: 1050,
    });
    expect(ctx.invoices[0]).toMatchObject({ id: invoiceId, status: "paid", total: 1050 });
    expect(from.mock.calls).toEqual([["service_invoices"]]);
    expect(query.eq).toHaveBeenCalledWith("artist_id", artistId);
    expect(ctx.proposals).toHaveLength(0);
  });
  it("rejects a contract above the artist tier before reading clauses", async () => {
    const { ctx, query } = context([
      { id: invoiceId, artist_id: artistId, name: "Pro contract", tier: "pro", is_active: true, unlocked: true },
    ]);
    await expect(executeAgentTool("get_contract_template", { id: invoiceId }, ctx)).rejects.toThrow(
      "not included",
    );
    expect(query.maybeSingle).not.toHaveBeenCalled();
    expect(ctx.contracts).toEqual([]);
  });
  it("reads an unlocked Free contract through the artist-scoped RPC without direct table access", async () => {
    const clauses = [{ title: "Performance", body: "Agreed performance terms." }];
    const { ctx, from, rpc } = context([
      { id: invoiceId, artist_id: null, name: "Free contract", tier: "free", is_active: true, unlocked: true, clauses, rider: null },
    ]);
    await expect(executeAgentTool("get_contract_template", { id: invoiceId }, ctx)).resolves.toMatchObject({ displayedPrivately: true });
    expect(ctx.contracts).toEqual([{ id: invoiceId, name: "Free contract", clauses, rider: null }]);
    expect(rpc).toHaveBeenCalledWith("list_contract_templates", { _artist: artistId });
    expect(from.mock.calls).toEqual([["plan_tiers"]]);
  });
  it("blocks a locked paid contract even when its tier is Free", async () => {
    const { ctx } = context([
      { id: invoiceId, artist_id: null, name: "Paid contract", tier: "free", is_active: true, unlocked: false, clauses: null, rider: null },
    ]);
    await expect(executeAgentTool("get_contract_template", { id: invoiceId }, ctx)).rejects.toThrow("not included");
    expect(ctx.contracts).toEqual([]);
  });
  it("rechecks the effective Free subscription after a cached Pro plan expires", async () => {
    const { ctx, rpc } = context([
      { id: invoiceId, artist_id: null, name: "Pro contract", tier: "pro", is_active: true, unlocked: true },
    ], 4);
    ctx.plan.code = "pro";
    await expect(executeAgentTool("get_contract_template", { id: invoiceId }, ctx)).rejects.toThrow("not included");
    expect(rpc).toHaveBeenCalledWith("effective_artist_plan", { _artist: artistId });
    expect(ctx.contracts).toEqual([]);
  });
  it("allows Pro content when the effective subscription is Pro", async () => {
    const { ctx, rpc } = context([
      { id: invoiceId, artist_id: null, name: "Pro contract", tier: "pro", is_active: true, unlocked: true, clauses: [], rider: null },
    ]);
    rpc.mockImplementation(async (name: string) => ({ data: name === "effective_artist_plan" ? "pro" : [{ id: invoiceId, artist_id: null, name: "Pro contract", tier: "pro", is_active: true, unlocked: true, clauses: [], rider: null }], error: null }));
    await executeAgentTool("get_contract_template", { id: invoiceId }, ctx);
    expect(ctx.contracts).toHaveLength(1);
  });
  it("passes eligible metadata to the model without clauses or rider", async () => {
    const { ctx } = context([
      { id: invoiceId, artist_id: null, name: "Free contract", category: "Singer", description: "Terms", tier: "free", is_active: true, unlocked: true, clauses: [{ title: "Private", body: "Content" }], rider: "Rider" },
    ]);
    const result = await eligibleContracts(ctx.db, artistId, ctx.plan);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("clauses");
    expect(result[0]).not.toHaveProperty("rider");
  });
  it("fails closed when the contract RPC denies access", async () => {
    const { ctx, rpc } = context([]);
    rpc.mockImplementation(async (name: string) => name === "effective_artist_plan" ? { data: "free", error: null } : { data: null, error: new Error("Forbidden") });
    await expect(executeAgentTool("get_contract_template", { id: invoiceId }, ctx)).rejects.toThrow("Forbidden");
    expect(ctx.contracts).toEqual([]);
  });
  it("rejects event preparation when Calendar is not in the artist subscription", async () => {
    const { ctx } = context(null);
    await expect(
      executeAgentTool(
        "prepare_calendar_event",
        {
          title: "Show",
          date: "2026-12-01",
          startTime: "18:00",
          endTime: "20:00",
          description: null,
          attendees: [],
        },
        ctx,
      ),
    ).rejects.toThrow("Calendar sync");
    expect(ctx.proposals).toEqual([]);
  });
  it("only prepares a Calendar proposal and never contacts anyone before confirmation", async () => {
    const { ctx, from } = context(null, 3);
    ctx.plan.inheritedFeatures = ["Calendar sync"];
    await expect(
      executeAgentTool(
        "prepare_calendar_event",
        {
          title: "Show",
          date: "2026-12-01",
          startTime: "18:00",
          endTime: "20:00",
          description: null,
          attendees: ["guest@example.com"],
        },
        ctx,
      ),
    ).resolves.toMatchObject({ prepared: true, confirmationRequired: true });
    expect(from).not.toHaveBeenCalled();
    expect(ctx.proposals).toHaveLength(1);
  });
});
