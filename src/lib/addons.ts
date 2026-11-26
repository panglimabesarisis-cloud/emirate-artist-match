/** Add-ons an artist buys on top of a package (0103). The database re-checks every price and entitlement. */
export const ADDON_KINDS = {
  ai_page: { label: "AI agent page", note: "Opens the artist's private page at dealmakertalent.com/ai/<name> once payment is confirmed." },
  service: { label: "Team service", note: "The Dealmaker team delivers it, then marks it delivered." },
} as const;
export type AddonKind = keyof typeof ADDON_KINDS;
export const addonKindLabel = (kind: string) => ADDON_KINDS[kind as AddonKind]?.label ?? kind;

export const ADDON_DURATIONS = [30, 90, 365] as const;
export const durationLabel = (days: number | null) => (days === null ? "One time, no expiry" : days === 365 ? "1 year" : `${days} days`);

/** What the artist pays: the listed price plus 5% VAT. */
export const addonTotalAed = (price: number) => Math.round(price * 105) / 100;

export type PurchaseDates = { expires_at: string | null; refunded_at: string | null };
export type PurchaseState = "active" | "expired" | "refunded";
export function purchaseState(p: PurchaseDates, now = Date.now()): PurchaseState {
  if (p.refunded_at) return "refunded";
  return p.expires_at && new Date(p.expires_at).getTime() <= now ? "expired" : "active";
}

/** The artist's current hold on one add-on: the active purchase that lasts longest, if any. */
export function activePurchase<T extends PurchaseDates & { addon_id: string }>(purchases: T[], addonId: string, now = Date.now()): T | null {
  const until = (p: T) => (p.expires_at ? new Date(p.expires_at).getTime() : Infinity);
  return purchases.filter((p) => p.addon_id === addonId && purchaseState(p, now) === "active").sort((a, b) => until(b) - until(a))[0] ?? null;
}

export type AddonForm = { name: string; kind: AddonKind; description: string; price: string; duration: number | null; active: boolean };
export const EMPTY_ADDON: AddonForm = { name: "", kind: "ai_page", description: "", price: "", duration: 30, active: true };

/** The first thing wrong with an add-on being saved, matching the database checks. */
export function addonProblem(form: AddonForm): string | null {
  const name = form.name.trim(), description = form.description.trim(), price = Number(form.price);
  if (name.length < 3 || name.length > 80) return "The name needs 3 to 80 characters.";
  if (description.length < 10 || description.length > 600) return "The description needs 10 to 600 characters.";
  if (!/^\d+(\.\d{1,2})?$/.test(form.price.trim()) || price <= 0 || price > 100000) return "Enter a price from AED 0.01 to AED 100,000.";
  return null;
}
