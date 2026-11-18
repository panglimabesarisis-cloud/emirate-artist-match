import { describe, it, expect } from "vitest";
import { translate, localName } from "./i18n";

describe("i18n", () => {
  it("translates to Arabic and falls back to English", () => {
    expect(translate("ar", "Search")).toBe("بحث");
    expect(translate("ar", "Untranslated thing")).toBe("Untranslated thing");
    expect(translate("en", "Search")).toBe("Search");
  });
  it("uses Arabic catalog names only in Arabic", () => {
    expect(localName("ar", { name: "Dubai", name_ar: "دبي" })).toBe("دبي");
    expect(localName("en", { name: "Dubai", name_ar: "دبي" })).toBe("Dubai");
    expect(localName("ar", { name: "Dubai", name_ar: null })).toBe("Dubai");
  });
});
