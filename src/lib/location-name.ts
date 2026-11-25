import { maskContacts } from "./masking";
import { slugify } from "./format";

/** A new emirate or area typed by a talent becomes public, so only plain place names are accepted. */
export function cleanLocationName(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter a place name.");
  const name = value.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 40) throw new Error("Place names need 2 to 40 characters.");
  if (!/^[\p{L}\p{M}][\p{L}\p{M}0-9 '’().&-]*$/u.test(name) || /\d{4,}/.test(name) || maskContacts(name) !== name) throw new Error("Use a place name only, without contacts or links.");
  return name;
}

export const sameLocation = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** URL slug, unused among `taken`. Names in non-Latin scripts get a neutral slug. */
export function locationSlug(name: string, taken: string[]) {
  const base = slugify(name.normalize("NFKD").replace(/\p{M}/gu, "")) || "place";
  const used = new Set(taken);
  // "all" is the listing pseudo-value and must never be a real place.
  used.add("all");
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}
