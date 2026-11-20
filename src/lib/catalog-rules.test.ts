import { describe, expect, it } from "vitest";
import { specialityPath, requireCatalogAdmin } from "./catalog-rules";
import { slugify } from "./format";

describe("catalog rules", () => {
  it("fills the category slug from the English name", () => {
    expect(slugify("Wedding Musicians")).toBe("wedding-musicians");
  });
  it("builds the category/speciality path from both names", () => {
    expect(specialityPath("musicians", "Wedding Singer")).toBe("/musicians/wedding-singer");
  });
  it("allows only verified admins to request translation", () => {
    expect(() => requireCatalogAdmin(false)).toThrow("Admin access required");
    expect(() => requireCatalogAdmin(null)).toThrow("Admin access required");
    expect(() => requireCatalogAdmin(true)).not.toThrow();
  });
});