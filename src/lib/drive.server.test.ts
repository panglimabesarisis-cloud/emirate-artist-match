import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureChildFolder, uploadPdf } from "./drive.server";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
const respond = (queue: unknown[]) => vi.fn(async (url: string, init: RequestInit = {}) => {
  calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body });
  const next = queue.shift();
  return new Response(JSON.stringify(next ?? {}), { status: 200 });
});

beforeEach(() => { calls = []; process.env["LOVABLE_API_KEY"] = "lk"; process.env["GOOGLE_DRIVE_API_KEY"] = "dk"; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env["LOVABLE_API_KEY"]; delete process.env["GOOGLE_DRIVE_API_KEY"]; });

describe("Drive client", () => {
  it("reuses an existing folder and sends both connector credentials", async () => {
    vi.stubGlobal("fetch", respond([{ files: [{ id: "F1", name: "2026" }] }]));
    expect(await ensureChildFolder("ROOT", "2026")).toBe("F1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers["Authorization"]).toBe("Bearer lk");
    expect(calls[0]!.headers["X-Connection-Api-Key"]).toBe("dk");
    expect(new URL(calls[0]!.url).searchParams.get("q")).toContain("'ROOT' in parents and name = '2026'");
  });
  it("creates the folder once when it is missing, then settles on the oldest match", async () => {
    vi.stubGlobal("fetch", respond([{ files: [] }, { id: "NEW", name: "Dede FK" }, { files: [{ id: "OLDEST" }, { id: "NEW" }] }]));
    expect(await ensureChildFolder("ROOT", "Dede FK")).toBe("OLDEST");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "GET"]);
  });
  it("escapes quotes in names", async () => {
    vi.stubGlobal("fetch", respond([{ files: [{ id: "X" }] }]));
    await ensureChildFolder("ROOT", "O'Neil");
    expect(new URL(calls[0]!.url).searchParams.get("q")).toContain("name = 'O\\'Neil'");
  });
  it("does not upload twice when the file is already there", async () => {
    vi.stubGlobal("fetch", respond([{ files: [{ id: "FILE", name: "a.pdf" }] }]));
    expect(await uploadPdf("P", "a.pdf", new Uint8Array([1, 2]))).toEqual({ id: "FILE", name: "a.pdf", existed: true });
    expect(calls).toHaveLength(1);
  });
  it("uploads multipart/related with metadata first and the PDF second", async () => {
    vi.stubGlobal("fetch", respond([{ files: [] }, { id: "NEWFILE", name: "a.pdf" }]));
    const out = await uploadPdf("P", "a.pdf", new Uint8Array([37, 80, 68, 70]));
    expect(out).toEqual({ id: "NEWFILE", name: "a.pdf", existed: false });
    const up = calls[1]!;
    expect(up.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    const text = new TextDecoder().decode(up.body as Uint8Array);
    expect(text.indexOf('"parents":["P"]')).toBeLessThan(text.indexOf("application/pdf\r\n\r\n%PDF"));
  });
  it("fails clearly when Drive is not connected", async () => {
    delete process.env["GOOGLE_DRIVE_API_KEY"];
    await expect(ensureChildFolder("ROOT", "x")).rejects.toThrow("Google Drive is not connected");
  });
});
