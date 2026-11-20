import { describe, expect, it } from "vitest";
import { collectFlowVariables, normalizeFlowVariable, validFlowVariable } from "./flow-variables";

describe("custom flow variables", () => {
  it("formats new names as safe snake_case", () => {
    expect(normalizeFlowVariable(" Dress Code! ")).toBe("dress_code");
    expect(normalizeFlowVariable("stage--size")).toBe("stage_size");
  });
  it("rejects empty, numeric-leading and reserved names", () => {
    expect(validFlowVariable("")).toBe(false);
    expect(validFlowVariable("123_event")).toBe(false);
    expect(validFlowVariable("none")).toBe(false);
    expect(validFlowVariable("dress_code")).toBe(true);
  });
  it("restores custom question and form names after serialization without duplicates", () => {
    const nodes = [{ data: { text: "Details", saveAs: "dress_code", fields: [{ label: "Stage", type: "text" as const, saveAs: "stage_size" }, { label: "Dress", type: "text" as const, saveAs: "dress_code" }] } }];
    const restored: typeof nodes = JSON.parse(JSON.stringify(nodes));
    const variables = collectFlowVariables(restored);
    expect(variables.filter(v => v === "dress_code")).toHaveLength(1);
    expect(variables).toContain("stage_size");
    expect(variables).toContain("Perform_duration");
  });
});