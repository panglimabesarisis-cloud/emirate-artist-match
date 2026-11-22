import { describe, expect, it } from "vitest";
import { archiveFileName, archiveFolders, dubaiDate, namePart } from "./invoice-archive-names";
import { buildInvoicePdf, wrap, type ArchiveInvoice } from "./invoice-pdf";

describe("archive names", () => {
  it("builds the file name from the agreed pattern", () => {
    expect(archiveFileName({ artistName: "Dede FK", number: "INV-20261120-0F00DE6425", client: "Sara Al Mansoori", issued: "2026-11-20", total: 5250 }))
      .toBe("DedeFK-INV-20261120-0F00DE6425-SaraAlMansoori-2026-11-20-5250.00.pdf");
    expect(archiveFileName({ artistName: "Dede FK", number: "INV-1", client: "Alex", issued: "2026-11-20", total: 5250.5, paid: true })).toBe("DedeFK-INV-1-Alex-2026-11-20-5250.50-PAID.pdf");
  });
  it("keeps letters of any language and drops symbols", () => {
    expect(namePart("محمد / Ali?")).toBe("محمدAli");
    expect(namePart("***")).toBe("Unknown");
  });
  it("makes Artist / Year / Month folders from the issue date", () => {
    expect(archiveFolders("Dede FK", "2026-11-20")).toEqual(["Dede FK", "2026", "11-November"]);
    expect(archiveFolders("A/B", "2027-01-01")).toEqual(["A B", "2027", "01-January"]);
  });
  it("uses the Dubai date, not UTC", () => {
    expect(dubaiDate("2026-11-20T21:30:00Z")).toBe("2026-11-21");
  });
});

const sample: ArchiveInvoice = {
  number: "INV-20261120-0F00DE6425", artistName: "Dede FK", client: "Dealmaker", clientEmail: null, issued: "2026-11-20", due: "2026-11-26",
  items: [{ title: "Starting Rate Estimate", qty: 1, price: 5000 }], subtotal: 5000, vat: 250, total: 5250, paid: 0, status: "unpaid", notes: "New Year's Eve, dub, 21:00-23:00, 2-hour performance, indoor", trn: null,
};

describe("buildInvoicePdf", () => {
  const text = (b: Uint8Array) => Array.from(b).map((c) => String.fromCharCode(c)).join("");
  it("produces a well-formed PDF whose xref points at the objects", () => {
    const s = text(buildInvoicePdf(sample));
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(s)?.[1]);
    expect(s.slice(start, start + 4)).toBe("xref");
    const offsets = [...s.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(s).toContain("UNPAID");
    expect(s).toContain("AED 5,250.00");
  });
  it("shows PAID and survives non-Latin text and many items", () => {
    const many = { ...sample, status: "paid" as const, paid: 5250, paidAt: "2026-11-21T10:00:00Z", client: "محمد", items: Array.from({ length: 40 }, (_, i) => ({ title: `Service ${i} with a fairly long description that has to wrap onto more than one line in the table`, qty: 1, price: 10 })) };
    const s = text(buildInvoicePdf(many));
    expect(s).toContain("PAID");
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThan(1);
  });
  it("wraps long words", () => {
    expect(wrap("x".repeat(200), 100, 10).length).toBeGreaterThan(1);
  });
});
