import { describe, expect, it } from "vitest";
import { pickCategories, pickSpecialities, selectedIds } from "./profile-categories";

const categories = [{ id: "host", name: "Host" }, { id: "dj", name: "DJs" }];
const specialities = [{ id: "ba", name: "Brand Ambassador", category_id: "host" }, { id: "mc", name: "MC", category_id: "host" }, { id: "house", name: "House", category_id: "dj" }];
const saved = { category_id: "host", category_ids: [], subcategory_id: "ba", specialty_ids: ["ba"] };

describe("profile categories and specialities", () => {
  it("lists the first choice once, ahead of the others", () => {
    expect(selectedIds("b", ["a", "b"])).toEqual(["b", "a"]);
    expect(selectedIds(null, null)).toEqual([]);
  });

  it("adds a second category and keeps the first one leading", () => {
    expect(pickCategories(["Host", "DJs"], categories, specialities, saved)).toEqual({ category_id: "host", category_ids: ["host", "dj"], subcategory_id: "ba", specialty_ids: ["ba"] });
  });

  it("takes specialities from every selected category", () => {
    const two = { ...saved, category_ids: ["host", "dj"] };
    expect(pickSpecialities(["Brand Ambassador", "MC", "House"], specialities, two)).toEqual({ category_id: "host", category_ids: ["host", "dj"], subcategory_id: "ba", specialty_ids: ["ba", "mc", "house"] });
  });

  it("drops the specialities of a removed category and moves the lead", () => {
    const full = { category_id: "host", category_ids: ["host", "dj"], subcategory_id: "ba", specialty_ids: ["ba", "house"] };
    expect(pickCategories(["DJs"], categories, specialities, full)).toEqual({ category_id: "dj", category_ids: ["dj"], subcategory_id: "house", specialty_ids: ["house"] });
    expect(pickCategories([], categories, specialities, full)).toEqual({ category_id: null, category_ids: [], subcategory_id: null, specialty_ids: [] });
  });

  it("brings the category along when a speciality is picked first", () => {
    expect(pickSpecialities(["House"], specialities, {})).toEqual({ category_id: "dj", category_ids: ["dj"], subcategory_id: "house", specialty_ids: ["house"] });
  });
});
