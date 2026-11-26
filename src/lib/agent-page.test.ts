import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiHostRedirect, creditUsage, type CreditRow } from "./agent-page";

const row = (id: string, reason: string, delta: number, at: string, final: number | null = null): CreditRow => ({ id, reason, delta, delta_fraction: 0, final_charge_credits: final, created_at: at });

describe("AI agent page", () => {
  it("counts settled tasks once and keeps top ups apart", () => {
    const usage = creditUsage([
      row("1", "topup_stripe_sandbox", 100, "2026-11-20T08:00:00Z"),
      row("2", "ai_task_reserve", -5, "2026-11-25T08:00:00Z"),
      row("3", "ai_task_settlement", 3, "2026-11-25T08:00:01Z", 2),
      row("4", "ai_reply", -1, "2026-11-25T21:00:00Z"),
      row("5", "topup_test_refund", -100, "2026-11-26T08:00:00Z"),
    ], new Date("2026-11-26T10:00:00Z"));
    expect(usage).toMatchObject({ replies: 2, used: 3, bought: 0 });
    expect(usage.days.map((d) => d.used)).toEqual([0, 0, 0, 0, 0, 2, 1]);
    expect(usage.recent.map((r) => r.id)).toEqual(["5", "4", "3", "1"]);
  });
  it("maps the ai. address to the artist's page", () => {
    expect(aiHostRedirect("https://ai.dealmakertalent.com/Dede-Fajar")).toBe("/ai/dede-fajar");
    expect(aiHostRedirect("https://ai.dealmakertalent.com/")).toBe("/ai");
    for (const path of ["/auth?redirect=%2Fai", "/dashboard", "/ai/dede", "/checkout-return", "/favicon.ico", "/a/b"]) expect(aiHostRedirect(`https://ai.dealmakertalent.com${path}`)).toBeNull();
    expect(aiHostRedirect("https://dealmakertalent.com/dede-fajar")).toBeNull();
  });
  it("never treats a page of the site as an artist name", () => {
    const names = readdirSync("src/routes").filter((file) => /.tsx?$/.test(file)).flatMap((file) => /^([a-z0-9-]+)_?[.]/i.exec(file.replace(/_\./, "."))?.[1] ?? []);
    for (const name of names.filter((n) => n !== "index")) expect(aiHostRedirect(`https://ai.dealmakertalent.com/${name}`), name).toBeNull();
  });
});
