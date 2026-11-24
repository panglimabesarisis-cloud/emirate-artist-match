/** Never sign arbitrary paths from publicly readable artist metadata. */
export function artistOwnedMediaPath(artistId: string, path: string | null | undefined): string | null {
  if (!path || !path.startsWith(`${artistId}/`) || path.split("/").some(part => part === ".." || part === ".")) return null;
  return path;
}

/** Only artist-supplied professional measurements, never arbitrary JSON keys. */
export function publicPhysicalDetails(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const value = body as Record<string, unknown>;
  const fields = [
    ["height_cm", "Height", "cm"], ["weight_kg", "Weight", "kg"],
    ["hair", "Hair color", ""], ["eyes", "Eye color", ""],
    ["clothing", "Clothing size", ""], ["shoe_eu", "Shoe size (EU)", ""],
  ] as const;
  return fields.flatMap(([key, label, unit]) => {
    const raw = value[key];
    if (typeof raw !== "string" && typeof raw !== "number") return [];
    if (raw === "" || typeof raw === "number" && (!Number.isFinite(raw) || raw <= 0)) return [];
    return [{ label, value: `${raw}${unit ? ` ${unit}` : ""}` }];
  });
}