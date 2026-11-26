/** Maps in agent answers. Only the place text is stored; every address is built here. */
export const MAP_TOOL = {
  type: "function" as const,
  strict: true,
  name: "show_map",
  description: "Show a Google map of a place, address or business inside the answer, with links to open it and get directions. Use it whenever the user asks for a map, a location or an address. Call once per place.",
  parameters: { type: "object", properties: { place: { type: "string", description: "Name or address with city and country" } }, required: ["place"], additionalProperties: false },
};

export function mapLinks(place: string) {
  const q = encodeURIComponent(place.replace(/\s+/g, " ").trim().slice(0, 200));
  return {
    embed: `https://maps.google.com/maps?q=${q}&z=14&output=embed`,
    open: `https://www.google.com/maps/search/?api=1&query=${q}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}
