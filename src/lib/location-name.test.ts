import { describe, expect, it } from "vitest";
import { cleanLocationName, locationSlug, sameLocation } from "./location-name";

describe("places added by talents", () => {
  it("accepts ordinary place names in any script", () => {
    expect(cleanLocationName("  Al   Marjan Island ")).toBe("Al Marjan Island");
    for (const name of ["Jumeirah 1", "Ra's Al Khor", "جزيرة المرجان"]) expect(cleanLocationName(name)).toBe(name);
  });
  it("refuses contacts, links, markup and odd lengths", () => {
    for (const bad of ["a", "x".repeat(41), "me@mail.com", "www.site.com", "call 0501234567", "@handle", "<b>x</b>", "WhatsApp me", 5]) expect(() => cleanLocationName(bad)).toThrow();
  });
  it("finds duplicates and keeps slugs unique and never 'all'", () => {
    expect(sameLocation("Dubai Marina", " dubai marina ")).toBe(true);
    expect(locationSlug("Yas Island", ["yas-island"])).toBe("yas-island-2");
    expect(locationSlug("All", [])).toBe("all-2");
    expect(locationSlug("جزيرة", ["place"])).toBe("place-2");
  });
});
