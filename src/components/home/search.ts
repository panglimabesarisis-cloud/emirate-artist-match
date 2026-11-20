import type { HomeCatalog } from "./types";

// Translate text only to filters the existing listing already understands.
export function resolveHomeSearch(catalog: HomeCatalog, text: string, category: string, emirate: string) {
  const query = text.trim().toLocaleLowerCase();
  if (!query) return { category, emirate };
  const matches = (name: string, slug: string) => name.toLocaleLowerCase() === query || slug === query;
  const cat = catalog.categories.find((c) => matches(c.name, c.slug) || c.name_ar === text.trim());
  if (cat) return { category: cat.slug, emirate };
  const sub = catalog.subcategories.find((s) => matches(s.name, s.slug));
  const parent = sub && catalog.categories.find((c) => c.id === sub.category_id);
  if (sub && parent) return { category: parent.slug, emirate, sub: sub.slug };
  const area = catalog.areas.find((a) => matches(a.name, a.slug));
  const city = area && catalog.emirates.find((e) => e.id === area.emirate_id);
  if (area && city) return { category, emirate: city.slug, area: area.slug };
  return null;
}