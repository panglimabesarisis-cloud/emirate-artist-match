import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: mocks.rpc,
  from: () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: mocks.read };
    return chain;
  },
} }));
import { AgentPricingUnavailableError, reserveAgentTask } from "./agent-task-billing.server";

beforeEach(() => { vi.clearAllMocks(); });
it.each([
  { data: null, error: null },
  { data: null, error: { message: "Unavailable" } },
  { data: { usd_in_per_mtok: 0, usd_out_per_mtok: 0 }, error: null },
])("does not reserve artist credits when pricing is unavailable or invalid: %j", async result => {
  mocks.read.mockResolvedValue(result);
  await expect(reserveAgentTask("artist", "chat", "openai/gpt-5.6-luna", [], "booking", 600)).rejects.toBeInstanceOf(AgentPricingUnavailableError);
  expect(mocks.rpc).not.toHaveBeenCalled();
});