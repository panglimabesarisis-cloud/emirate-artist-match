import { describe, expect, it } from "vitest";
import type { OrderField } from "@/components/dashboard/OrderFormBuilder";
import { finishesItself, formComplete, mayContinue, visibleQuestions } from "./form-steps";

const q = (id: string, type: OrderField["type"], required: boolean): OrderField => ({ id, type, label: id, required, options: [] });
const fields = [q("a", "short", true), q("b", "dropdown", false), q("c", "paragraph", true)];

describe("one question at a time", () => {
  it("starts with the first question and keeps answered ones visible", () => {
    expect(visibleQuestions(fields, 1, {})).toBe(1);
    expect(visibleQuestions(fields, 1, { a: "typing" })).toBe(1);
    expect(visibleQuestions(fields, 2, { a: "done" })).toBe(2);
    expect(visibleQuestions(fields, 1, { c: "kept through sign-in" })).toBe(3);
    expect(visibleQuestions(fields, 9, {})).toBe(3);
  });
  it("waits for required answers and lets optional ones pass", () => {
    expect(mayContinue(fields[0]!, {})).toBe(false);
    expect(mayContinue(fields[0]!, { a: "  " })).toBe(false);
    expect(mayContinue(fields[1]!, {})).toBe(true);
  });
  it("moves on by itself after a choice or a full date only", () => {
    expect(finishesItself(fields[1]!, "Yes")).toBe(true);
    expect(finishesItself(fields[0]!, "Yes")).toBe(false);
    expect(finishesItself(q("d", "date", true), "2026-12-01")).toBe(true);
    expect(finishesItself(q("d", "date", true), "0002-12-01")).toBe(false);
  });
  it("offers booking once every question has been reached", () => {
    expect(formComplete(fields, 2, { a: "x" })).toBe(false);
    expect(formComplete(fields, 3, { a: "x" })).toBe(false);
    expect(formComplete(fields, 3, { a: "x", c: "y" })).toBe(true);
    expect(formComplete([], 1, {})).toBe(false);
  });
});
