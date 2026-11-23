export type TravelSettings = {
  travel_surcharge_enabled?: boolean;
  travel_radius_km?: number | null;
  travel_step_km?: number;
  travel_fee_per_step?: number | string;
};

/** Full intervals, rounded up; calculate in fils, never through model arithmetic. */
export function travelEstimate(distanceKm: number, settings: TravelSettings) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error("Invalid distance");
  const radius = settings.travel_radius_km ?? 30;
  const step = settings.travel_step_km ?? 10;
  const fee = Number(settings.travel_fee_per_step ?? 0);
  if (!Number.isFinite(radius) || radius < 0 || ![5, 10].includes(step) || !Number.isFinite(fee) || fee < 0) throw new Error("Invalid travel settings");
  const extraKm = Math.max(0, distanceKm - radius);
  const intervals = settings.travel_surcharge_enabled ? Math.ceil(extraKm / step) : 0;
  const feeMinor = intervals * Math.round(fee * 100);
  return { distanceKm, radiusKm: radius, extraKm, stepKm: step, intervals, feeMinor, feeAED: feeMinor / 100 };
}

/** Use only a client's explicit distance statement, not an AI-guessed city-to-city distance. */
export function clientTravelDistance(messages: string[]) {
  for (const text of [...messages].reverse()) {
    const match = /(?:travel distance|distance|jarak)(?:\s+(?:perjalanan|tempuh|venue))?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*km\b/i.exec(text);
    if (match?.[1]) return Number(match[1].replace(",", "."));
  }
  return null;
}

export function travelPrompt(settings: TravelSettings, distanceKm: number | null) {
  const radius = settings.travel_radius_km ?? 30;
  if (!settings.travel_surcharge_enabled) return `Travel radius ${radius} km. Automatic travel surcharge is disabled. Do not invent a travel charge; outside the radius the artist confirms travel arrangements.`;
  const rule = `Travel tariff: radius ${radius} km included; AED ${Number(settings.travel_fee_per_step ?? 0).toFixed(2)} for each started ${settings.travel_step_km ?? 10} km beyond the radius. No discount on travel fees. Prices exclude 5% VAT.`;
  return `${rule}\n${distanceKm === null ? "No measured or client-supplied travel distance is available. Never infer kilometers from a city/area name. Ask for the travel distance when relevant, or leave it for artist review." : `SERVER-CALCULATED ESTIMATE from the client's stated distance (not verified routing): ${JSON.stringify(travelEstimate(distanceKm, settings))}. Disclose it as an estimate and separately from the package.`}\nTravel estimates are not payable totals. Never silently add them to BOOKING_READY.amount. Include the disclosed estimate in notes for artist review; the artist must approve an invoice line and the client must accept the resulting offer. Changing venue requires a new estimate.`;
}