import { describe, expect, it } from "vitest";
import { parseStoredTerms, resolveContractText, resolveTerms, venueFromNotes } from "./contract-terms";

const values = { artist: "Dede FK", client: "Salma", service: "Emcee", date: "2026-12-02", time: "19:00 - 21:00", venue: "Dubai Marina", total: "AED 5,250.00", vat: "AED 250.00" };

describe("contract placeholders", () => {
  it("replaces every known placeholder, including repeats", () => {
    expect(resolveContractText("{artist} performs for {client}. {artist} arrives on {date}.", values)).toBe("Dede FK performs for Salma. Dede FK arrives on 2026-12-02.");
  });
  it("leaves unknown braces untouched and blanks missing values", () => {
    expect(resolveContractText("Keep {unknown} and {venue}", { artist: "A" })).toBe("Keep {unknown} and ");
  });
  it("returns an empty string for empty input", () => {
    expect(resolveContractText(null, values)).toBe("");
  });
  it("resolves clauses and the rider, skipping malformed clauses", () => {
    const t = resolveTerms({ clauses: [{ title: "Fee for {service}", body: "Total {total} incl. VAT {vat}" }, { nope: true }, "x"], rider: "Water for {artist}" }, values);
    expect(t.clauses).toEqual([{ title: "Fee for Emcee", body: "Total AED 5,250.00 incl. VAT AED 250.00" }]);
    expect(t.rider).toBe("Water for Dede FK");
  });
  it("reads the venue from the booking notes", () => {
    expect(venueFromNotes("Dress code: formal\nVenue / emirate: Dubai Marina\nOther")).toBe("Dubai Marina");
    expect(venueFromNotes(null)).toBe("");
  });
  it("accepts only well formed frozen terms", () => {
    expect(parseStoredTerms({ clauses: [{ title: "A", body: "B" }], rider: "R" })).toEqual({ clauses: [{ title: "A", body: "B" }], rider: "R" });
    expect(parseStoredTerms({ clauses: "bad" })).toBeNull();
    expect(parseStoredTerms(null)).toBeNull();
  });
});
