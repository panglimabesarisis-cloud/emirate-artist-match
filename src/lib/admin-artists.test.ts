import { describe, expect, it } from "vitest";
import { documentsPurged, expiryState, identityRequirements, inCategory, maskNumber, newSpecialityNames, planProblem, PLAN_LIMITS, specialityIdsOf, topByRevenue } from "./admin-artists";
import { missingProfileItems, profileChecks, profilePercent, reminderMessage } from "./profile-completeness";

const empty = { categories: [], specialities: [], area: "", portfolio: 0, clients: 0 };

describe("profile completeness", () => {
  it("lists everything a new profile still misses", () => {
    const checks = profileChecks(empty);
    expect(missingProfileItems(checks)).toHaveLength(9);
    expect(profilePercent(checks)).toBe(0);
  });
  it("asks models for casting details only", () => {
    expect(profileChecks({ ...empty, categories: ["Models"] }).map((c) => c[0])).toContain("Height, weight and hair color");
    expect(profileChecks(empty).map((c) => c[0])).not.toContain("Height, weight and hair color");
  });
  it("reaches 100% and keeps the reminder within the database limit", () => {
    const full = profileChecks({ photoPath: "a/p.jpg", tagline: "Great sets", bio: "x".repeat(150), specialities: ["DJ"], categories: ["DJs"], skills: ["a", "b", "c"], basePrice: 100, area: "Marina", languages: ["English"], portfolio: 1, clients: 1 });
    expect(profilePercent(full)).toBe(100);
    expect(reminderMessage("A", Array(40).fill("A very long missing profile item name here")).length).toBeLessThanOrEqual(1000);
  });
});

describe("admin artist rules", () => {
  const artist = { category_id: "c1", category_ids: ["c2"], subcategory_id: "s1", specialty_ids: ["s1", "s2"] };
  it("counts an artist in every listed category and speciality once", () => {
    expect([inCategory(artist, "c1"), inCategory(artist, "c2"), inCategory(artist, "c3")]).toEqual([true, true, false]);
    expect(specialityIdsOf(artist)).toEqual(["s1", "s2"]);
  });
  it("adds several specialities and skips repeats", () => {
    expect(newSpecialityNames("Violin,  Oud\nviolin, , Cello", ["cello"])).toEqual(["Violin", "Oud"]);
  });
  it("ranks only artists with revenue", () => {
    expect(topByRevenue([{ id: 1, revenue: 0 }, { id: 2, revenue: "20" }, { id: 3, revenue: 100 }], 10).map((r) => r.id)).toEqual([3, 2]);
  });
  it("requires different documents for residents and visitors", () => {
    expect(identityRequirements(null, []).map((r) => r.label)).toContain("Emirates ID front");
    const foreign = identityRequirements({ residency: "foreign", full_name: "A B", doc_number: "P123456", doc_expiry: "2030-01-01", dob: "1990-01-01", nationality: "X", address: { city: "Y" }, phone: "+1", phone_confirmed_at: "2026-01-01" }, ["passport", "selfie_center", "selfie_left", "selfie_right"]);
    expect(foreign.every((r) => r.ok)).toBe(true);
    expect(foreign.map((r) => r.label)).not.toContain("Emirates ID front");
  });
  it("flags expiring documents, masks numbers and respects the 30-day rule", () => {
    const today = new Date("2026-11-26T00:00:00Z");
    expect([expiryState("2026-11-01", today), expiryState("2026-12-30", today), expiryState("2028-01-01", today), expiryState(null, today)]).toEqual(["expired", "soon", "valid", "unknown"]);
    expect(maskNumber("784-1990-1234567-1")).toBe("•••• 67-1");
    expect(documentsPurged({ privacy_purged_at: null, decided_at: "2026-10-01T00:00:00Z" }, today.getTime())).toBe(true);
    expect(documentsPurged({ privacy_purged_at: null, decided_at: null }, today.getTime())).toBe(false);
  });
  it("refuses plan values the system cannot enforce", () => {
    const plan = { name: "Basic", price_monthly: 99, price_yearly: 990, allowed_models: ["fast"], ...Object.fromEntries(PLAN_LIMITS.map((l) => [l.key, 5])) } as Parameters<typeof planProblem>[0];
    expect(planProblem(plan)).toBeNull();
    expect(planProblem({ ...plan, commission_pct: 101 })).toMatch(/commission/i);
    expect(planProblem({ ...plan, max_categories: 0 })).toMatch(/lowest value is 1/);
    expect(planProblem({ ...plan, ai_credits: 1.5 })).toMatch(/whole number/);
    expect(planProblem({ ...plan, allowed_models: [] })).toMatch(/model/);
    expect(planProblem({ ...plan, max_team_members: -1 })).toBeNull();
  });
});
