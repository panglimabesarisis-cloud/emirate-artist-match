import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LIMITS, limitProblem, parseLimits } from "./security-limits";
import { withSecurityHeaders } from "./security-headers";

const rows = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ select: () => ({ in: async () => ({ data: rows() }) }) }) } }));
const { sendEmail } = await import("./email-provider.server");

describe("security limits", () => {
  it("keeps saved values inside their bounds", () => {
    expect(parseLimits('{"chatsPerHour":8,"chatsPerDay":0,"messagesPerHour":"abc"}')).toMatchObject({ chatsPerHour: 8, chatsPerDay: DEFAULT_LIMITS.chatsPerDay, messagesPerHour: 60 });
    expect(parseLimits("not json")).toEqual(DEFAULT_LIMITS);
    expect(limitProblem(DEFAULT_LIMITS)).toBeNull();
    expect(limitProblem({ ...DEFAULT_LIMITS, conciergeTotal: 1 })).toMatch(/whole number/);
    expect(limitProblem({ ...DEFAULT_LIMITS, chatsPerHour: 20, chatsPerDay: 10 })).toMatch(/daily/);
  });
});

describe("security headers", () => {
  it("adds the headers and keeps the response as it was", async () => {
    const response = withSecurityHeaders(new Response("ok", { status: 201, headers: { "referrer-policy": "no-referrer" } }));
    expect([response.status, await response.text()]).toEqual([201, "ok"]);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors");
  });
});

describe("email", () => {
  beforeEach(() => { rows.mockReset(); vi.unstubAllGlobals(); });
  it("waits for setup, reports refusals, and never throws", async () => {
    rows.mockReturnValue([]);
    expect(await sendEmail("a@example.test", "s", "t")).toEqual({ status: "pending_setup" });
    rows.mockReturnValue([{ key: "resend_api_key", value: "re_test" }, { key: "email_from", value: "a@example.test" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"domain not verified"}', { status: 403 })));
    expect(await sendEmail("b@example.test", "s", "t")).toMatchObject({ status: "failed", error: expect.stringContaining("403") });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await sendEmail("b@example.test", "s", "t")).toMatchObject({ status: "failed" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    expect(await sendEmail("b@example.test", "s", "t")).toEqual({ status: "sent" });
  });
});
