/** A published starting rate is an estimate, not a duration-specific package. */
export function agentRates(rates: { title: string; price: number | string; duration_minutes: number | null; description: string | null }[], basePrice: number | string | null) {
  const valid = rates.filter(r => Number.isFinite(Number(r.price)) && Number(r.price) > 0);
  if (valid.length) return { startingOnly: false, minimum: Math.min(...valid.map(r => Number(r.price))), text: valid.map(r => `- ${r.title}: AED ${Number(r.price).toLocaleString("en-US")} (${r.duration_minutes} min) — ${r.description ?? ""}`).join("\n") };
  const starting = Number(basePrice);
  if (!Number.isFinite(starting) || starting <= 0) return { startingOnly: false, minimum: null, text: "- No packages or starting rate set. Do not invent a price; hand over to the artist." };
  return { startingOnly: true, minimum: starting, text: `- Starting rate: AED ${starting.toLocaleString("en-US")} excluding VAT. This is an estimate only; duration, scope and final price require artist approval. Do not claim it covers a specific duration.` };
}