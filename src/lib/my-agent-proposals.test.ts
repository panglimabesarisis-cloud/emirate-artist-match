import { describe, expect, it } from "vitest";
import { parseProposal, proposalLines, rateCardSchema, scheduleItemSchema } from "./my-agent-proposals";
import { AGENT_REFUSAL, CAPABILITIES_RULE, RATE_CARD_TEMPLATE, VERIFICATION_GUIDE } from "./my-agent-knowledge";
import { MORE_TOOLS, executeMoreTool, type MoreToolContext } from "./my-agent-more-tools.server";

const ctx = (files: MoreToolContext["attachedFiles"] = []): MoreToolContext => ({ db: {} as never, artistId: "a", proposals: [], attachedFiles: files });
const good = { title: "Rehearsal", date: "2026-12-01", startTime: "10:00", endTime: "12:00", notes: "Band rehearsal at the studio" };

describe("schedule entry", () => {
  it("needs title, date, start, end and a description", () => {
    expect(scheduleItemSchema.safeParse(good).success).toBe(true);
    for (const key of Object.keys(good)) expect(scheduleItemSchema.safeParse({ ...good, [key]: "" }).success).toBe(false);
    expect(scheduleItemSchema.safeParse({ ...good, date: "2026-02-31" }).success).toBe(false);
    expect(scheduleItemSchema.safeParse({ ...good, startTime: "25:00" }).success).toBe(false);
    expect(scheduleItemSchema.safeParse({ ...good, extra: 1 }).success).toBe(false);
  });
});

describe("rate card", () => {
  it("needs job type, a positive price, whole minutes and a description", () => {
    const ok = { title: "Wedding DJ set", price: 2500, minutes: 120, description: "Sound system, lights, MC" };
    expect(rateCardSchema.safeParse(ok).success).toBe(true);
    expect(rateCardSchema.safeParse({ ...ok, price: 0 }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...ok, minutes: 90.5 }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...ok, description: " " }).success).toBe(false);
  });
});

describe("parseProposal", () => {
  it("parses by kind and rejects the wrong shape or an unknown kind", () => {
    expect(parseProposal("schedule_item", good)?.kind).toBe("schedule_item");
    expect(parseProposal("schedule_item", { title: "x" })).toBeNull();
    expect(parseProposal("media_youtube", { url: "https://youtu.be/dQw4w9WgXcQ" })?.kind).toBe("media_youtube");
    expect(parseProposal("media_youtube", { url: "https://example.com/video" })).toBeNull();
    expect(parseProposal("withdraw", { amount: 1 })).toBeNull();
  });
  it("summarizes an invoice with VAT", () => {
    const p = parseProposal("send_invoice", { conversationId: "11111111-1111-4111-8111-111111111111", clientName: "Sara", items: [{ title: "DJ set", qty: 2, price: 1000 }], due: "2026-12-10", notes: null });
    expect(p && proposalLines(p).lines.join(" ")).toContain("Subtotal AED 2,000 + 5% VAT");
  });
});

describe("agent tools", () => {
  it("are strict, unique and list every property as required", () => {
    const names = MORE_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of MORE_TOOLS) { expect(t.strict).toBe(true); expect(t.parameters.required.sort()).toEqual(Object.keys(t.parameters.properties).sort()); }
  });
  it("has no tool that moves money", () => {
    expect(MORE_TOOLS.map((t) => t.name).join(" ")).not.toMatch(/withdraw|payout_request|transfer/);
  });
  it("a schedule proposal is only saved as a proposal", async () => {
    const c = ctx();
    const out = (await executeMoreTool("prepare_schedule_item", good, c)) as { prepared: boolean };
    expect(out.prepared).toBe(true);
    expect(c.proposals).toEqual([{ kind: "schedule_item", payload: good }]);
  });
  it("refuses an incomplete schedule entry", async () => {
    await expect(executeMoreTool("prepare_schedule_item", { ...good, notes: "" }, ctx())).rejects.toThrow();
  });
  it("only accepts a photo that was attached in this message, and only images", async () => {
    await expect(executeMoreTool("prepare_media", { kind: "photo", fileId: "11111111-1111-4111-8111-111111111111", url: null }, ctx())).rejects.toThrow(/Attach an image/);
    const files = [{ id: "11111111-1111-4111-8111-111111111111", name: "rider.pdf", mime: "application/pdf" }];
    await expect(executeMoreTool("prepare_media", { kind: "photo", fileId: files[0]!.id, url: null }, ctx(files))).rejects.toThrow();
    const img = [{ id: "22222222-2222-4222-8222-222222222222", name: "me.jpg", mime: "image/jpeg" }];
    const c = ctx(img);
    await executeMoreTool("prepare_media", { kind: "photo", fileId: img[0]!.id, url: null }, c);
    expect(c.proposals[0]).toEqual({ kind: "media_photo", payload: { fileId: img[0]!.id, name: "me.jpg" } });
  });
  it("rejects a video link that is not YouTube", async () => {
    await expect(executeMoreTool("prepare_media", { kind: "youtube", fileId: null, url: "https://vimeo.com/123" }, ctx())).rejects.toThrow();
  });
});

describe("agent knowledge", () => {
  it("states the exact refusal sentence and the rate card format", () => {
    expect(AGENT_REFUSAL).toBe("Maaf, saya tidak bisa melakukan itu karena saya tidak memiliki akses");
    expect(CAPABILITIES_RULE).toContain(AGENT_REFUSAL);
    expect(RATE_CARD_TEMPLATE.split("\n").map((l) => l.split(":")[0])).toEqual(["Job Type", "Price (AED)", "Minutes", "Detail Job (What's Included)"]);
  });
  it("explains verification without claiming unbuilt steps are active", () => {
    expect(VERIFICATION_GUIDE).toContain("Verified");
    expect(VERIFICATION_GUIDE).toMatch(/Planned, not active yet/);
  });
});
