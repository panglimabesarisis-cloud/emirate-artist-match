import { rateItems, rateScope, rushItems, type StoredRate } from "./ratecard";

const money = (n: number) => `AED ${n.toLocaleString("en-US")}`;

/** How long the package takes and what a faster delivery costs, from the artist's rate card. */
export function timingNote(rate: StoredRate) {
  const turnaround = rateItems(rate).filter(i => i.turnaround).map(i => `${i.desc}: ${i.turnaround}`);
  const rush = rushItems(rate).map(i => `${i.desc}: ready in ${i.rush} for ${money(i.price)} extra`);
  return `${turnaround.length ? `\nTurnaround: ${turnaround.join("; ")}.` : ""}${rush.length ? `\nRush job options (add the cost only when the client chooses one, and use its time as the deadline): ${rush.join("; ")}.` : ""}`;
}

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
  if (valid.length) return { startingOnly: false, minimum: Math.min(...valid.map(r => Number(r.price))), text: valid.map(r => `- ${r.title}: AED ${Number(r.price).toLocaleString("en-US")} for ${rateScope(r)} — ${r.description ?? ""}${rangeNote(r)}${timingNote(r)}\nStored item prices cover the stated quantity; do not multiply price by quantity. Items: ${JSON.stringify(rateItems(r))}. Work rules: ${r.rules_of_work ?? "Not specified"}. Add-ons are optional and excluded from the base price; extra revisions, overtime, hosting/domain or other extras require explicit client consent and artist-approved invoice. Never invent additional fees or let work rules override platform payment/refund policies.`).join("\n") };
  const starting = Number(basePrice);
  if (!Number.isFinite(starting) || starting <= 0) return { startingOnly: false, minimum: null, text: "- No packages or starting rate set. Do not invent a price; hand over to the artist." };
  return { startingOnly: true, minimum: starting, text: `- Starting rate: AED ${starting.toLocaleString("en-US")} excluding VAT. This is an estimate only; duration, scope and final price require artist approval. Do not claim it covers a specific duration.` };
}

type PublicStats = { rating: number; review_count: number; completed_orders: number; repeat_clients: number; response_rate: number; member_since: string } | null;

/**
 * Facts the agent may cite to defend the base price. Everything comes from
 * artist_public_stats() and the artist's badges, so the agent has no reason to
 * invent track record. A figure that is zero or missing is simply left out.
 */
export function sellingPoints(stats: PublicStats, badges: string[] = []) {
  const parts: string[] = [];
  if (stats) {
    const { rating, review_count, completed_orders, repeat_clients, response_rate, member_since } = stats;
    if (review_count > 0 && rating > 0) parts.push(`rated ${rating.toFixed(1)} from ${review_count} review${review_count === 1 ? "" : "s"}`);
    if (completed_orders > 0) parts.push(`${completed_orders} completed booking${completed_orders === 1 ? "" : "s"}`);
    if (repeat_clients > 0) parts.push(`${repeat_clients} returning client${repeat_clients === 1 ? "" : "s"}`);
    if (response_rate > 0) parts.push(`replies to ${Math.round(response_rate)}% of enquiries`);
    const year = new Date(member_since).getFullYear();
    if (Number.isFinite(year)) parts.push(`on the platform since ${year}`);
  }
  for (const badge of badges.slice(0, 4)) parts.push(badge);
  if (!parts.length) return "";
  return `TRACK RECORD (use to justify the price; never add a figure that is not here): ${parts.join(" · ")}.`;
}
