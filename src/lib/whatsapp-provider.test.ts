import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ config: vi.fn(), fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ select: () => ({ in: mocks.config }) }) } }));
import { sendWhatsApp } from "./whatsapp-provider.server";
import { internationalPhone, requireWhatsAppAdmin, whatsappProvider } from "./whatsapp-provider";

describe("WhatsApp provider selection", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway"); vi.stubEnv("WHATSAPP_API_KEY", "test-meta");
  });
  it("defaults to Meta for existing installations", () => expect(whatsappProvider(undefined)).toBe("meta"));
  it("allows only verified administrators", () => {
    expect(() => requireWhatsAppAdmin(false)).toThrow("Forbidden");
    expect(() => requireWhatsAppAdmin("true")).toThrow("Forbidden");
    expect(() => requireWhatsAppAdmin(true)).not.toThrow();
  });
  it("does not accept an unknown provider", () => expect(() => whatsappProvider("other")).toThrow());
  it("preserves UAE and Indonesian full international numbers", () => {
    expect(internationalPhone("+971 50 123 4567")).toBe("971501234567");
    expect(internationalPhone("+62 812-3456-7890")).toBe("6281234567890");
    expect(() => internationalPhone("081234567890")).toThrow();
  });
  it.each(["0501234567", "50 123 4567", "971501234567", "+971501234567", "00971501234567"])("normalizes UAE mobile %s", (phone) => {
    expect(internationalPhone(phone)).toBe("971501234567");
  });
  it.each(["050123456", "9715012345678", "0511234567", "0501234567abc"])("rejects malformed UAE mobile %s", (phone) => {
    expect(() => internationalPhone(phone)).toThrow();
  });
  it.each(["0521234567", "0541234567", "0551234567", "0561234567", "0581234567"])("retains UAE mobile prefix in %s", (phone) => {
    expect(internationalPhone(phone)).toBe(`971${phone.slice(1)}`);
  });
  it("sends a local UAE number to Fonnte with its full country code", async () => {
    mocks.config.mockResolvedValue({ data: [{ key: "whatsapp_provider", value: "fonnte" }, { key: "fonnte_token", value: "fixture-token" }] });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: true, id: [1234] })));
    expect((await sendWhatsApp("0501234567", "Booking", "Please approve", "")).status).toBe("accepted");
    const request = mocks.fetch.mock.calls[0]?.[1];
    expect(request?.body.get("target")).toBe("971501234567");
    expect(request?.body.get("countryCode")).toBe("0");
  });
  it("routes Fonnte only to Fonnte with unmodified country code and approval link", async () => {
    mocks.config.mockResolvedValue({ data: [{ key: "whatsapp_provider", value: "fonnte" }, { key: "fonnte_token", value: "fixture-token" }] });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: true, id: [1234] })));
    expect(await sendWhatsApp("+971501234567", "Booking", "Please approve", "https://dealmakertalent.com/approve/test?k=fixture")).toEqual({ status: "accepted", messageId: "fonnte:1234" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const call = mocks.fetch.mock.calls[0];
    if (!call) throw new Error("Expected Fonnte request");
    const [url, request] = call;
    expect(url).toBe("https://api.fonnte.com/send");
    expect(request.body.get("countryCode")).toBe("0");
    expect(request.body.get("target")).toBe("971501234567");
    expect(request.body.get("message")).toContain("/approve/test?k=fixture");
  });
  it("retains the Meta template route when Meta is selected", async () => {
    mocks.config.mockResolvedValue({ data: [{ key: "whatsapp_provider", value: "meta" }] });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] })));
    expect((await sendWhatsApp("+971501234567", "Booking", "Details", "https://dealmakertalent.com")).messageId).toBe("wamid.test");
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe("https://connector-gateway.lovable.dev/whatsapp/messages");
    expect(JSON.parse(mocks.fetch.mock.calls[0]?.[1].body).type).toBe("template");
  });
  it("never falls back to Meta when Fonnte has no token", async () => {
    mocks.config.mockResolvedValue({ data: [{ key: "whatsapp_provider", value: "fonnte" }] });
    expect((await sendWhatsApp("+971501234567", "Booking", "Details", "")).status).toBe("pending_setup");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("treats HTTP 200 provider rejection as failure without leaking its body", async () => {
    mocks.config.mockResolvedValue({ data: [{ key: "whatsapp_provider", value: "fonnte" }, { key: "fonnte_token", value: "fixture-token" }] });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: false, reason: "fixture-token" })));
    const result = await sendWhatsApp("+971501234567", "Booking", "Details", "");
    expect(result.status).toBe("failed"); expect(JSON.stringify(result)).not.toContain("fixture-token");
  });
});