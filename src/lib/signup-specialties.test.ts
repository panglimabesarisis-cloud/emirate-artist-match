import { describe, expect, it } from "vitest";
import { applyPending, readPending, splitSpecialties } from "./signup-specialties";

describe("specialties chosen at registration", () => {
  const ten = Array.from({ length: 10 }, (_, i) => `s${i}`);
  it("saves what is allowed now and keeps the rest for after payment", () => {
    expect(splitSpecialties(ten, 1)).toEqual({ now: ["s0"], later: ten.slice(1) });
    expect(splitSpecialties(ten, 10)).toEqual({ now: ten, later: [] });
    expect(splitSpecialties(ten, 0).now).toEqual(["s0"]);
  });
  it("adds the waiting ones once the paid plan allows them", () => {
    const pending = { category_id: "c", ids: ten.slice(1) };
    expect(applyPending({ category_id: "c", ids: ["s0"] }, pending, 1)).toEqual({ save: null, pending });
    expect(applyPending({ category_id: "c", ids: ["s0"] }, pending, 10)).toEqual({ save: ten, pending: null });
    expect(applyPending({ category_id: "c", ids: ["s0"] }, pending, 3)).toEqual({ save: ["s0", "s1", "s2"], pending: { category_id: "c", ids: ten.slice(3) } });
  });
  it("drops them when the category changed and never duplicates", () => {
    expect(applyPending({ category_id: "other", ids: [] }, { category_id: "c", ids: ["s1"] }, 10)).toEqual({ save: null, pending: null });
    expect(applyPending({ category_id: "c", ids: ["s0", "s1"] }, { category_id: "c", ids: ["s1"] }, 10)).toEqual({ save: null, pending: null });
  });
  it("ignores malformed account data", () => {
    for (const bad of [null, "x", {}, { category_id: 1, ids: [] }, { category_id: "c", ids: [] }, { category_id: "c", ids: "s1" }]) expect(readPending(bad)).toBeNull();
    expect(readPending({ category_id: "c", ids: ["s1", 2] })).toEqual({ category_id: "c", ids: ["s1"] });
  });
});
