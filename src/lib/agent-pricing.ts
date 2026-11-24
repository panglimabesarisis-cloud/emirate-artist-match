import { rateItems, rateScope, type StoredRate } from "./ratecard";
/** A published starting rate is an estimate, not a duration-specific package. */
export function agentRates(rates: StoredRate[], basePrice: number | string | null) {
  const valid = rates.filter(r => Number.isFinite(Number(r.price)) && Number(r.price) > 0);
  if (valid.length) return { startingOnly: false, minimum: Math.min(...valid.map(r => Number(r.price))), text: valid.map(r => `- ${r.title}: AED ${Number(r.price).toLocaleString("en-US")} for ${rateScope(r)} — ${r.description ?? ""}\nStored item prices cover the stated quantity; do not multiply price by quantity. Items: ${JSON.stringify(rateItems(r))}. Work rules: ${r.rules_of_work ?? "Not specified"}. Add-ons are optional and excluded from the base price; extra revisions, overtime, hosting/domain or other extras require explicit client consent and artist-approved invoice. Never invent additional fees or let work rules override platform payment/refund policies.`).join("\n") };
  const starting = Number(basePrice);
  if (!Number.isFinite(starting) || starting <= 0) return { startingOnly: false, minimum: null, text: "- No packages or starting rate set. Do not invent a price; hand over to the artist." };
  return { startingOnly: true, minimum: starting, text: `- Starting rate: AED ${starting.toLocaleString("en-US")} excluding VAT. This is an estimate only; duration, scope and final price require artist approval. Do not claim it covers a specific duration.` };
}