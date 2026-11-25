import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ required: true as boolean | undefined, profile: null as null | { phone: string; phone_verified_at: string | null }, rpc: [] as { name: string; args: Record<string, unknown> }[], checked: { ok: true, phone: "+971501234567" } as Record<string, unknown>, updates: [] as unknown[] }));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("https://x.test", { headers: { "cf-connecting-ip": "203.0.113.9" } }) }));
vi.mock("./whatsapp-provider.server", () => ({ readWhatsAppConfig: async () => ({ provider: "fonnte", token: "test-token" }) }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "site_settings" ? { value: { required: db.required } } : db.profile }) }) }),
      update: (row: unknown) => { db.updates.push(row); return { eq: async () => ({ error: null }) }; },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => { db.rpc.push({ name, args }); return { error: null, data: name === "reserve_phone_otp" ? { ok: true, expires_in: 300, resend_after: 30 } : db.checked }; },
  },
}));

import { confirmCode, phoneProof, proofMatches, requestCode, requireVerifiedAccount, requireVerifiedPhone } from "./phone-otp.server";

const phone = "+971501234567";
beforeAll(() => { vi.stubEnv("VERIFICATION_OTP_HASH_SECRET", "test-secret"); vi.stubGlobal("fetch", fetchMock); });
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(() => { db.required = true; db.profile = null; db.rpc = []; db.updates = []; db.checked = { ok: true, phone }; fetchMock.mockReset(); fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: true, id: [7] }))); });

describe("WhatsApp verification", () => {
  it("accepts a proof only for its own number and only until it expires", async () => {
    const proof = await phoneProof(phone, 1000);
    expect(await proofMatches(phone, proof, 2000)).toBe(true);
    expect(await proofMatches("+971500000000", proof, 2000)).toBe(false);
    expect(await proofMatches(phone, proof, 1000 + 31 * 86400_000)).toBe(false);
    expect(await proofMatches(phone, `${Number(proof.split(".")[0]) + 1}.${proof.split(".")[1]}`, 2000)).toBe(false);
    expect(await proofMatches(phone, null)).toBe(false);
  });

  it("refuses an unverified or malformed number and normalizes a verified one", async () => {
    await expect(requireVerifiedPhone("0501234567", null, null)).rejects.toThrow("international format");
    await expect(requireVerifiedPhone(phone, "9999999999999.bad", null)).rejects.toThrow("Verify your WhatsApp number first");
    expect(await requireVerifiedPhone("+971 50 123 4567", await phoneProof(phone), null)).toBe(phone);
  });

  it("accepts the number already verified on the account", async () => {
    db.profile = { phone, phone_verified_at: "2026-11-25" };
    expect(await requireVerifiedPhone(phone, null, "u1")).toBe(phone);
    await expect(requireVerifiedPhone("+971500000000", null, "u1")).rejects.toThrow("Verify");
    await expect(requireVerifiedAccount("u1")).resolves.toBeUndefined();
    db.profile = { phone, phone_verified_at: null };
    await expect(requireVerifiedAccount("u1")).rejects.toThrow("Verify");
  });

  it("asks nothing while the admin switch is off", async () => {
    db.required = false;
    expect(await requireVerifiedPhone("", null, null)).toBeNull();
    await expect(requireVerifiedAccount("u1")).resolves.toBeUndefined();
  });

  it("sends a code without storing or returning it", async () => {
    const result = await requestCode(phone);
    expect(result).toMatchObject({ ok: true, resend_after: 30 });
    const message = (fetchMock.mock.calls[0]![1] as { body: FormData }).body.get("message") as string;
    const code = /code: (\d{6})/.exec(message)![1]!;
    expect(JSON.stringify([result, db.rpc, db.updates])).not.toContain(code);
    expect(String(db.rpc[0]!.args["_requester"])).not.toContain("203.0.113.9");
    expect(db.updates).toEqual([{ send_status: "accepted", provider_message_id: "fonnte:7" }]);
  });

  it("reports a failed send", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: false })));
    expect(await requestCode(phone)).toEqual({ ok: false, error: "send_failed" });
  });

  it("issues a proof after the right code and marks the signed-in account", async () => {
    const result = await confirmCode("id-1", "123456", "u1");
    expect(result).toMatchObject({ ok: true, phone });
    expect(await proofMatches(phone, (result as { proof: string }).proof)).toBe(true);
    expect(db.updates[0]).toMatchObject({ phone });
    db.checked = { ok: false, error: "wrong_code", tries_left: 3 };
    expect(await confirmCode("id-1", "000000", null)).toEqual({ ok: false, error: "wrong_code", tries_left: 3 });
  });
});
