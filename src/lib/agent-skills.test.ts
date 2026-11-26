import { describe, expect, it } from "vitest";
import { calculate } from "./calculate";
import { mapLinks } from "./map-links";
import { personalModels } from "./ai-provider.server";

describe("agent skills", () => {
  it("calculates exactly and refuses anything that is not arithmetic", () => {
    expect(calculate("0.1 + 0.2")).toBe(0.3);
    expect(calculate("2000 + 2000 * 5%")).toBe(2100);
    expect(calculate("(1.5 + 2) ^ 2 / 7")).toBe(1.75);
    expect(calculate("round(10 / 3, 2) + max(1, 4) - -2 + 7 mod 3")).toBe(10.33);
    for (const bad of ["process.exit()", "1 +", "1/0", "constructor", "2 3", "(".repeat(100)]) expect(() => calculate(bad), bad).toThrow();
  });
  it("builds map addresses from the place name only", () => {
    expect(mapLinks("Sunter, Jakarta Utara").embed).toBe("https://maps.google.com/maps?q=Sunter%2C%20Jakarta%20Utara&z=14&output=embed");
    expect(mapLinks("a&output=x#y").open).toContain("query=a%26output%3Dx%23y");
  });
  it("asks the agent's own Gemini model first, then the admin's", () => {
    expect(personalModels("gemini-3.6-flash")).toEqual(["gemini-3.8-flash", "gemini-3.6-flash"]);
    expect(personalModels("gemini-3.8-flash")).toEqual(["gemini-3.8-flash"]);
  });
});
