import { describe, expect, it } from "vitest";
import { maskContacts, MASK, TOPUP_PACKAGES } from "./masking";

describe("contact masking", () => {
  it("hides emails", () => expect(maskContacts("mail me at sara@gmail.com")).toBe(`mail me at ${MASK}`));
  it("hides UAE phone numbers", () => expect(maskContacts("call +971 50 123 4567 now")).not.toContain("123"));
  it("hides whatsapp mentions", () => expect(maskContacts("ping me on WhatsApp")).toContain(MASK));
  it("keeps ISO dates", () => expect(maskContacts("Event date: 2026-12-19.")).toBe("Event date: 2026-12-19."));
  it("keeps dates and prices", () => expect(maskContacts("12 Dec, AED 4,500, 150 guests")).toBe("12 Dec, AED 4,500, 150 guests"));
});

describe("credit packages", () => {
  it("are priced in AED", () => expect(TOPUP_PACKAGES.map((p) => p.priceAed)).toEqual([49, 129, 379]));
});
