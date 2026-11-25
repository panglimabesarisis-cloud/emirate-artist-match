/** An artist's categories and specialities: a first one of each plus the rest the plan allows. */
export type CategorySelection = { category_id?: string | null; category_ids?: string[] | null; subcategory_id?: string | null; specialty_ids?: string[] | null };
type Category = { id: string; name: string };
type Speciality = { id: string; name: string; category_id: string };

/** The first one leads, followed by the others, without repeats. */
export const selectedIds = (first: string | null | undefined, rest: string[] | null | undefined) =>
  [...new Set([first, ...(rest ?? [])].filter((id): id is string => !!id))];

/** The current first choice stays while it is still selected. */
const lead = (current: string | null | undefined, ids: string[]) => (current && ids.includes(current) ? current : ids[0] ?? null);

export function pickCategories(names: string[], categories: Category[], specialities: Speciality[], current: CategorySelection) {
  const ids = names.flatMap(name => categories.find(c => c.name === name)?.id ?? []);
  // Specialities of a removed category go with it.
  const kept = selectedIds(current.subcategory_id, current.specialty_ids).filter(id => ids.includes(specialities.find(s => s.id === id)?.category_id ?? ""));
  return { category_id: lead(current.category_id, ids), category_ids: ids, subcategory_id: lead(current.subcategory_id, kept), specialty_ids: kept };
}

export function pickSpecialities(names: string[], specialities: Speciality[], current: CategorySelection) {
  const chosen = selectedIds(current.subcategory_id, current.specialty_ids);
  const categories = selectedIds(current.category_id, current.category_ids);
  const found = names.flatMap(name => {
    const matches = specialities.filter(s => s.name === name);
    return matches.find(s => chosen.includes(s.id)) ?? matches.find(s => categories.includes(s.category_id)) ?? (categories.length ? [] : matches.slice(0, 1));
  });
  const ids = found.map(s => s.id);
  // Without a category yet, the speciality brings its own.
  const all = selectedIds(current.category_id, [...categories, ...found.map(s => s.category_id)]);
  return { category_id: lead(current.category_id, all), category_ids: all, subcategory_id: lead(current.subcategory_id, ids), specialty_ids: ids };
}
