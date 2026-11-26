import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }) }) }));
const { clientAddress, conciergeLimits, newChatLimits, withinLimits } = await import("./rate-limit.server");

describe("rate limits", () => {
  beforeEach(() => rpc.mockReset());
  it("passes only when every limit has room, and stops at the first full one", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await withinLimits(newChatLimits("u1"))).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    rpc.mockReset().mockResolvedValue({ data: false, error: null });
    expect(await withinLimits(conciergeLimits("203.0.113.7"))).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("refuses when the counter cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await withinLimits(newChatLimits("u1"))).toBe(false);
  });
  it("uses the first forwarded address", () => { expect(clientAddress()).toBe("203.0.113.7"); });
});
