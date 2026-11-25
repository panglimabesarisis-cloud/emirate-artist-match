import { describe, expect, it } from "vitest";
import { buildInvoice } from "./invoice";
import { buildInvoicePdf } from "./invoice-pdf";
import { archiveFromPaper, invoiceFileName, paperForBooking, paperForInvoice, savedInvoice } from "./chat-invoice";

const doc = { ...buildInvoice("INV-0042", [{ title: "Wedding set", qty: 2, price: 500 }], "2999-01-01", null), id: "i1" };
const row = { id: "i1", status: "unpaid", total: 1050, created_at: "2026-11-24T21:00:00Z", document: doc };
const parties = { artistName: "Sample Singer", trn: "100000000000003", client: "Chat client" };
const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe("chat invoice sheet", () => {
  it("shows what the linked booking has received", () => {
    const saved = savedInvoice(row, { paid_amount: 200, client_name: "Noor", client_email: "noor@example.test" });
    const paper = paperForInvoice(doc, saved, parties);
    expect(paper).toMatchObject({ status: "partial", paid: 200, client: "Noor", clientEmail: "noor@example.test", issued: "2026-11-25", trn: "100000000000003", total: 1050 });
  });

  it("marks paid and expired bills, and infers nothing without a saved row", () => {
    expect(paperForInvoice(doc, savedInvoice({ ...row, status: "paid", paid_at: "2026-11-25" }), parties)).toMatchObject({ status: "paid", paid: 1050, client: "Chat client" });
    expect(paperForInvoice(doc, savedInvoice({ ...row, deleted_at: "2026-11-25" }), parties).status).toBe("expired");
    expect(paperForInvoice({ ...doc, due: "2026-11-01" }, savedInvoice(row), parties, "2026-11-25").status).toBe("expired");
    expect(paperForInvoice(doc, undefined, parties)).toMatchObject({ status: "none", client: "Chat client" });
  });

  it("draws a booking offer from the saved amounts", () => {
    const offer = { title: "Gala", total: 1050, amount: 1000, vat: 50, items: [{ title: "Gala set", qty: 1, price: 1000 }], createdAt: "2026-11-01T08:00:00Z" };
    expect(paperForBooking(offer, parties)).toMatchObject({ number: "Pending", status: "unpaid", subtotal: 1000, vat: 50, items: offer.items });
    // Lines that disagree with the saved amount are replaced by one line of that amount.
    expect(paperForBooking({ ...offer, items: [{ title: "Old", qty: 1, price: 10 }], paidAmount: 1050 }, parties)).toMatchObject({ status: "paid", items: [{ title: "Gala", qty: 1, price: 1000 }] });
  });

  it.each([
    ["unpaid", savedInvoice(row), "(UNPAID)"],
    ["paid", savedInvoice({ ...row, status: "paid" }), "(PAID)"],
    ["expired", savedInvoice({ ...row, deleted_at: "2026-11-25" }), "(EXPIRED)"],
  ])("downloads an A4 PDF for a %s invoice", (_name, saved, stamp) => {
    const paper = paperForInvoice(doc, saved, parties);
    const pdf = text(buildInvoicePdf(archiveFromPaper(paper)));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 595 842]");
    expect(pdf).toContain("/Count 1");
    for (const part of [stamp, "(INV-0042)", "(AED 1,050.00)", "(TRN 100000000000003)", "(Wedding set)"]) expect(pdf).toContain(part);
    expect(invoiceFileName(paper)).toBe("invoice-INV-0042.pdf");
  });

  it("prints no payment state when none is known", () => {
    const pdf = text(buildInvoicePdf(archiveFromPaper(paperForInvoice(doc, undefined, parties))));
    expect(pdf).not.toContain("(UNPAID)");
    expect(pdf).not.toContain("(Balance due)");
  });
});
