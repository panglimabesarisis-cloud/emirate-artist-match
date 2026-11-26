import { describe, expect, it } from "vitest";
import { talentIndex, withTalent } from "./catalog-listing";

const catalog = {
  categories: [{ id: "c1", slug: "djs" }, { id: "c2", slug: "musicians" }, { id: "c3", slug: "dancers" }],
  subcategories: [{ id: "s1", slug: "wedding-dj", category_id: "c1" }, { id: "s2", slug: "violin", category_id: "c2" }, { id: "s3", slug: "club-dj", category_id: "c1" }],
};
const talent = talentIndex([
  { category_id: "c1", category_ids: ["c1", "c2"], subcategory_id: "s1", specialty_ids: null },
  { category_id: "c1", category_ids: null, subcategory_id: null, specialty_ids: ["s1"] },
]);

describe("listed categories", () => {
  it("offers only what some talent covers", () => {
    const shown = withTalent({ ...catalog, talent });
    expect(shown.categories.map((c) => c.slug)).toEqual(["djs", "musicians"]);
    expect(shown.subcategories.map((s) => s.slug)).toEqual(["wedding-dj"]);
  });
  it("keeps the current page's category and shows everything when talent is unknown", () => {
    expect(withTalent({ ...catalog, talent }, "dancers").categories).toHaveLength(3);
    expect(withTalent(catalog).categories).toHaveLength(3);
    expect(withTalent({ ...catalog, talent: talentIndex([]) }).categories).toEqual([]);
  });
});
