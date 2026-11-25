import { describe, expect, it } from "vitest";
import { ALL_CATEGORY, findCategory, matchesSearch, searchTarget, searchText } from "./artist-search";

const artist = {
  stage_name: "Layla Noor",
  category: { name: "Musicians", name_ar: "موسيقيون" },
  subcategory: { name: "Wedding Singer" },
  specialty_names: ["Arabic Band"],
  emirate: { name: "Abu Dhabi", name_ar: "أبوظبي" },
  area: { name: "Yas Island" },
};

describe("artist search", () => {
  it("finds an artist by part of their name, whatever the case", () => {
    expect(matchesSearch(artist, "layla")).toBe(true);
    expect(matchesSearch(artist, "NOOR")).toBe(true);
    expect(matchesSearch(artist, "falcon")).toBe(false);
  });
  it("finds an artist by talent: category, specialty or extra specialty", () => {
    for (const query of ["musician", "sing", "arabic band", "موسيقيون"]) expect(matchesSearch(artist, query)).toBe(true);
  });
  it("finds an artist by city or area", () => {
    for (const query of ["abu dhabi", "yas", "أبوظبي"]) expect(matchesSearch(artist, query)).toBe(true);
    expect(matchesSearch(artist, "sharjah")).toBe(false);
  });
  it("needs every word to match something", () => {
    expect(matchesSearch(artist, "layla singer dhabi")).toBe(true);
    expect(matchesSearch(artist, "layla comedian")).toBe(false);
  });
  it("matches everyone when nothing is typed and tolerates missing details", () => {
    expect(matchesSearch(artist, "  ")).toBe(true);
    expect(matchesSearch({ stage_name: "Solo", category: null }, undefined)).toBe(true);
    expect(matchesSearch({ stage_name: "Zoë" }, "zoe")).toBe(true);
  });
  it("sends All talent and All cities to the open listing", () => {
    expect(searchTarget(" noor ", "all", "all")).toEqual({ category: "all", search: { q: "noor" } });
    expect(searchTarget("", "djs", "dubai")).toEqual({ category: "djs", emirate: "dubai", search: {} });
  });
  it("offers a pseudo-category for All talent only", () => {
    expect(findCategory([{ slug: "djs" }], "all")).toBe(ALL_CATEGORY);
    expect(findCategory([{ slug: "djs" }], "djs")).toEqual({ slug: "djs" });
    expect(findCategory([{ slug: "djs" }], "nope")).toBeUndefined();
  });
  it("keeps numeric searches from the URL and drops empty ones", () => {
    expect(searchText(360)).toBe("360");
    expect(searchText("   ")).toBeUndefined();
    expect(searchText(true)).toBeUndefined();
    expect(searchText("x".repeat(200))).toHaveLength(80);
  });
});
