import { describe, expect, it } from "vitest";
import { ALL_LANGUAGES, languageRule, repliesInAllLanguages } from "./agent-options";

describe("agent reply languages", () => {
  it("replies in every language when All Languages is chosen or nothing is chosen", () => {
    for (const choice of [[ALL_LANGUAGES], ["all languages"], ["English", ALL_LANGUAGES], [], [" "], null, undefined]) {
      expect(repliesInAllLanguages(choice)).toBe(true);
      expect(languageRule(choice)).toContain("all languages");
    }
  });
  it("keeps the artist's own list when specific languages are chosen", () => {
    expect(repliesInAllLanguages(["Arabic", "Hindi"])).toBe(false);
    expect(languageRule(["Arabic", "Hindi"])).toContain("one of: Arabic, Hindi; otherwise reply in Arabic.");
  });
  it("never lets translation change saved choices or tokens", () => {
    for (const choice of [[ALL_LANGUAGES], ["English"]]) expect(languageRule(choice)).toContain("every bracketed token exactly as written");
  });
});
