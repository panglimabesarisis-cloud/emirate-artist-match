/** Value used by every search bar and route for "no category" or "no city" chosen. */
export const ALL = "all";
/** Pseudo-category behind the /all listing: every approved artist, whatever their category. */
export const ALL_CATEGORY = {
  id: ALL,
  slug: ALL,
  name: "All talent",
  name_ar: "كل المواهب",
  description: "Every verified artist across the UAE, in every category.",
};

export function findCategory<T extends { slug: string }>(categories: T[], slug: string): T | typeof ALL_CATEGORY | undefined {
  return slug === ALL ? ALL_CATEGORY : categories.find((category) => category.slug === slug);
}

/** The search text kept in the URL. Digits arrive as numbers from the router, so accept both. */
export function searchText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  return String(value).trim().slice(0, 80) || undefined;
}

type Named = { name: string; name_ar?: string | null } | null | undefined;
export type Searchable = {
  stage_name: string;
  category?: Named;
  subcategory?: Named;
  specialty_names?: string[];
  emirate?: Named;
  area?: Named;
};
const fold = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();

/** Free-text search over three things: the artist's name, their talent and their city. Every word must match one of them. */
export function matchesSearch(artist: Searchable, query: string | undefined) {
  const words = fold(query ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const places = [artist.category, artist.subcategory, artist.emirate, artist.area].flatMap((item) => (item ? [item.name, item.name_ar ?? ""] : []));
  const haystack = fold([artist.stage_name, ...places, ...(artist.specialty_names ?? [])].join(" | "));
  return words.every((word) => haystack.includes(word));
}

/** Where a search bar sends the visitor: the listing for the chosen talent and city, with the typed text as a filter. */
export function searchTarget(text: string, category: string, emirate: string) {
  const q = searchText(text);
  return { category, ...(emirate === ALL ? {} : { emirate }), search: q ? { q } : {} };
}
