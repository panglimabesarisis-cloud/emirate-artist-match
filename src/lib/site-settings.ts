/** Admin → Settings (General, Menu, Invoice) as the website reads them. Anything unsafe or empty falls back. */
export type MenuItem = { label: string; href: string };
export type SiteSettings = {
  general: { siteTitle: string; tagline: string; supportEmail: string; supportPhone: string };
  menu: MenuItem[];
  invoice: { legalName: string; trn: string; address: string; accent: string | null; logoUrl: string | null; footer: string };
};

/** These two addresses open a drop-down instead of a page. */
export const TALENT_MENU = "/search";
export const ARTIST_MENU = "/for-artists";
export const DEFAULT_MENU: MenuItem[] = [
  { label: "Find talent", href: TALENT_MENU },
  { label: "For artists", href: ARTIST_MENU },
  { label: "For clients", href: "/for-clients" },
  { label: "Features", href: "/features" },
  { label: "How it works", href: "/how-it-works" },
];

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const object = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
/** A page on this site, or a secure address elsewhere. */
export const safeHref = (value: string) => /^\/(?![/\\])[^\s\\]*$/.test(value) || /^https:\/\/[^\s]+$/i.test(value);

export function parseSiteSettings(rows: { key: string; value: unknown }[] = []): SiteSettings {
  const saved = (key: string) => object(rows.find(row => row.key === key)?.value);
  const general = saved("general"), invoice = saved("invoice");
  const items = saved("menu")["items"];
  const menu = (Array.isArray(items) ? items : []).map(item => ({ label: text(object(item)["label"], 40), href: text(object(item)["href"], 200) }))
    .filter(item => item.label && safeHref(item.href)).slice(0, 10);
  const accent = text(invoice["accent"], 7), logo = text(invoice["logo_url"], 500);
  return {
    general: { siteTitle: text(general["site_title"], 60) || "Dealmaker", tagline: text(general["tagline"], 200), supportEmail: text(general["support_email"], 255), supportPhone: text(general["support_phone"], 30) },
    menu: menu.length ? menu : DEFAULT_MENU,
    invoice: {
      legalName: text(invoice["legal_name"], 120), trn: text(invoice["trn"], 30), address: text(invoice["address"], 300), footer: text(invoice["footer"], 300),
      accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : null, logoUrl: /^https:\/\/[^\s]+$/i.test(logo) ? logo : null,
    },
  };
}

/** Who issues the invoices, printed under the brand. */
export const issuerLines = (invoice: SiteSettings["invoice"]) =>
  [invoice.legalName, invoice.address.replace(/\s*\n\s*/g, ", "), invoice.trn ? `Platform TRN ${invoice.trn}` : ""].filter(Boolean);

export const supportWhatsApp = (phone: string) => {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
};
