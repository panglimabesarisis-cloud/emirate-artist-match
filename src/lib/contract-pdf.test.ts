import { describe, expect, it } from "vitest";
import { contractLines, jpegPagesToPdf, wrapText } from "./contract-pdf";

describe("contract PDF", () => {
  it("keeps every part of the contract in order", () => {
    const lines = contractLines({ number: "DM-C-1", templateName: "Standard", stamp: { word: "AWAITING", sub: "HIRER", tone: "awaiting" }, parties: [["Artist", "A"]], clauses: [{ title: "Fee", body: "One.\n\nTwo." }], rider: "Water", footer: "End" }, (s) => s).map((l) => l.text);
    for (const part of ["Contract number: DM-C-1", "Artist: A", "Article 1  Fee", "One.", "Two.", "Water", "End"]) expect(lines).toContain(part);
    expect(lines.indexOf("Artist: A")).toBeLessThan(lines.indexOf("Article 1  Fee"));
  });
  it("wraps words and splits one that cannot fit", () => {
    const measure = (s: string) => s.length;
    expect(wrapText("aa bb cc", 5, measure)).toEqual(["aa bb", "cc"]);
    expect(wrapText("abcdefghij", 4, measure)).toEqual(["abcd", "efgh", "ij"]);
  });
  it("writes one PDF page per image", () => {
    const pdf = new TextDecoder("latin1").decode(jpegPagesToPdf([new Uint8Array([1]), new Uint8Array([2])], 10, 10));
    expect(pdf).toContain("/Count 2");
    expect(pdf.match(/\/Type \/Page /g)).toHaveLength(2);
    expect(pdf).toContain("%%EOF");
  });
});
