import { rateItems, rateScope, type StoredRate } from "./ratecard";

const money = (n: number) => `AED ${n.toLocaleString("en-US")}`;

/** The artist's own negotiating room for one package, when they set it. */
export function rangeNote(rate: StoredRate) {
  const low = rate.price_low ?? null, high = rate.price_high ?? null;
  if (low === null && high === null) return "";
  const parts = [high !== null ? `open near ${money(Number(high))}` : null, `aim for ${money(Number(rate.price))}`, low !== null ? `never below ${money(Number(low))}` : null].filter(Boolean);
  return `\nNegotiation range: ${parts.join(", ")}.`;
}

/**
 * Hard floor across every package the agent may quote. A package the artist gave
 * an explicit lowest price uses it; the rest keep the plan's discount limit.
 * Returned as a number the caller clamps with, never as prompt text alone.
 */
export function negotiationFloor(rates: StoredRate[], basePrice: number | string | null, maxDiscount: number) {
  const pricing = agentRates(rates, basePrice);
  if (pricing.minimum === null) return Infinity;
  if (pricing.startingOnly) return pricing.minimum;
  const floors = rates
    .filter(r => Number.isFinite(Number(r.price)) && Number(r.price) > 0)
    .map(r => {
      const low = r.price_low;
      return low !== null && low !== undefined && Number.isFinite(Number(low)) ? Number(low) : Number(r.price) * (1 - maxDiscount / 100);
    });
  return floors.length ? Math.min(...floors) : pricing.minimum * (1 - maxDiscount / 100);
}
/** A published starting rate is an estimate, not a duration-specific package. */
export function agentRates(rates: StoredRate[], basePrice: number | string | null) {
  const valid = rates.filter(r => Number.isFinite(Number(r.price)) && Number(r.price) > 0);
  if (valid.length) return { startingOnly: false, minimum: Math.min(...valid.map(r => Number(r.price))), text: valid.map(r => `- ${r.title}: AED ${Number(r.price).toLocaleString("en-US")} for ${rateScope(r)} — ${r.description ?? ""}${rangeNote(r)}\nStored item prices cover the stated quantity; do not multiply price by quantity. Items: ${JSON.stringify(rateItems(r))}. Work rules: ${r.rules_of_work ?? "Not specified"}. Add-ons are optional and excluded from the base price; extra revisions, overtime, hosting/domain or other extras require explicit client consent and artist-approved invoice. Never invent additional fees or let work rules override platform payment/refund policies.`).join("\n") };
  const starting = Number(basePrice);
  if (!Number.isFinite(starting) || starting <= 0) return { startingOnly: false, minimum: null, text: "- No packages or starting rate set. Do not invent a price; hand over to the artist." };
  return { startingOnly: true, minimum: starting, text: `- Starting rate: AED ${starting.toLocaleString("en-US")} excluding VAT. This is an estimate only; duration, scope and final price require artist approval. Do not claim it covers a specific duration.` };
}