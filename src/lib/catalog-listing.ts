/** Which categories and specialities the menus and searches offer: only those that have talent. */
export type TalentIndex = { categories: string[]; subcategories: string[] };
type Profile = { category_id: string | null; category_ids: string[] | null; subcategory_id: string | null; specialty_ids: string[] | null };

export function talentIndex(profiles: Profile[]): TalentIndex {
  const unique = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((id): id is string => !!id))];
  return {
    categories: unique(profiles.flatMap((p) => [p.category_id, ...(p.category_ids ?? [])])),
    subcategories: unique(profiles.flatMap((p) => [p.subcategory_id, ...(p.specialty_ids ?? [])])),
  };
}

type Listed = { id: string; slug: string };
/**
 * The categories and specialities to show. `keep` is the page's own category, so a search never shows a
 * blank choice. When it is unknown who has talent, everything is shown rather than nothing.
 */
export function withTalent<C extends Listed, S extends Listed & { category_id: string }>(catalog: { categories: C[]; subcategories: S[]; talent?: TalentIndex | null | undefined }, keep?: string) {
  const { talent } = catalog;
  if (!talent) return { categories: catalog.categories, subcategories: catalog.subcategories };
  const categories = new Set(talent.categories), subcategories = new Set(talent.subcategories);
  return {
    categories: catalog.categories.filter((c) => categories.has(c.id) || c.slug === keep),
    subcategories: catalog.subcategories.filter((s) => subcategories.has(s.id)),
  };
}
