import { describe, expect, it } from "vitest";
import { DEFAULT_MENU, issuerLines, parseSiteSettings, safeHref, supportWhatsApp } from "./site-settings";
import { buildInvoicePdf, type ArchiveInvoice } from "./invoice-pdf";

describe("parseSiteSettings", () => {
  it("falls back to the built-in values when nothing is saved", () => {
    const settings = parseSiteSettings();
    expect(settings.general.siteTitle).toBe("Dealmaker");
    expect(settings.menu).toEqual(DEFAULT_MENU);
    expect(settings.invoice).toMatchObject({ legalName: "", accent: null, logoUrl: null });
  });

  it("reads the saved general, menu and invoice settings", () => {
    const settings = parseSiteSettings([
      { key: "general", value: { site_title: " Deal ", tagline: "Book talent", support_email: "help@example.com", support_phone: "+971 50 000 0000" } },
      { key: "menu", value: { items: [{ label: "Talent", href: "/search" }, { label: "Blog", href: "https://example.com/blog" }] } },
      { key: "invoice", value: { legal_name: "Deal LLC", trn: "100", address: "Dubai\nUAE", accent: "#102030", logo_url: "https://example.com/logo.png", footer: "Thanks" } },
    ]);
    expect(settings.general).toEqual({ siteTitle: "Deal", tagline: "Book talent", supportEmail: "help@example.com", supportPhone: "+971 50 000 0000" });
    expect(settings.menu.map((item) => item.label)).toEqual(["Talent", "Blog"]);
    expect(issuerLines(settings.invoice)).toEqual(["Deal LLC", "Dubai, UAE", "Platform TRN 100"]);
    expect(settings.invoice).toMatchObject({ accent: "#102030", logoUrl: "https://example.com/logo.png" });
  });

  it("drops unsafe links, colours and logos", () => {
    const settings = parseSiteSettings([
      { key: "menu", value: { items: [{ label: "Bad", href: "javascript:alert(1)" }, { label: "", href: "/features" }] } },
      { key: "invoice", value: { accent: "red;}", logo_url: "http://example.com/logo.png" } },
    ]);
    expect(settings.menu).toEqual(DEFAULT_MENU);
    expect(settings.invoice).toMatchObject({ accent: null, logoUrl: null });
    expect(["//evil.example", "/\\evil.example", "data:text/html,x", "features"].filter(safeHref)).toEqual([]);
  });

  it("builds a WhatsApp link only from a real number", () => {
    expect(supportWhatsApp("00971 50 123 4567")).toBe("https://wa.me/971501234567");
    expect(supportWhatsApp("123")).toBeNull();
  });
});

describe("invoice PDF issuer", () => {
  const invoice: ArchiveInvoice = {
    number: "DM-20261126-ABCDE", artistName: "Artist", client: "Client", issued: "2026-11-26", due: null,
    items: [{ title: "Show", qty: 1, price: 100 }], subtotal: 100, vat: 0, total: 100, paid: 0, status: "unpaid",
  };
  const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

  it("prints the saved company, TRN and footer", () => {
    const settings = parseSiteSettings([{ key: "invoice", value: { legal_name: "Deal LLC", trn: "100200", footer: "Thank you" } }]);
    const pdf = text(buildInvoicePdf(invoice, settings.invoice));
    expect(pdf).toContain("Deal LLC");
    expect(pdf).toContain("Platform TRN 100200");
    expect(pdf).toContain("Thank you");
    expect(text(buildInvoicePdf(invoice))).not.toContain("Deal LLC");
  });
});
