import { describe, expect, it } from "vitest";
import { resolveHomeSearch } from "./search";
import type { HomeCatalog } from "./types";

const catalog: HomeCatalog = {
  categories: [{ id: "music", slug: "musicians", name: "Musicians", name_ar: null, description: null, icon: null, sort: 0 }, { id: "dj", slug: "djs", name: "DJs", name_ar: null, description: null, icon: null, sort: 1 }],
  subcategories: [{ id: "singer", slug: "wedding-singer", name: "Wedding Singer", category_id: "music" }],
  emirates: [{ id: "dubai", slug: "dubai", name: "Dubai", name_ar: null, sort: 0 }],
  areas: [{ id: "palm", slug: "palm-jumeirah", name: "Palm Jumeirah", emirate_id: "dubai" }],
  eventTypes: [],
};
describe("homepage navigation uses only existing listing filters", () => {
  it("preserves selected talent and city when submitting without text", () => {
    expect(resolveHomeSearch(catalog, "", "djs", "dubai")).toEqual({ category: "djs", emirate: "dubai" });
  });
  it("maps a specialty to its category and supported sub parameter", () => {
    expect(resolveHomeSearch(catalog, "Wedding Singer", "djs", "dubai")).toEqual({ category: "musicians", emirate: "dubai", sub: "wedding-singer" });
  });
  it("maps an area to the existing area listing route parameters", () => {
    expect(resolveHomeSearch(catalog, "Palm Jumeirah", "musicians", "dubai")).toEqual({ category: "musicians", emirate: "dubai", area: "palm-jumeirah" });
  });
  it("does not pretend an unsupported free-text parameter filters the listing", () => {
    expect(resolveHomeSearch(catalog, "unknown name", "musicians", "dubai")).toBeNull();
  });
});