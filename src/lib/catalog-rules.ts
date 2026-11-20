import { slugify } from "./format";

export function specialityPath(categorySlug: string, name: string) {
  return `/${categorySlug}/${slugify(name)}`;
}

export function requireCatalogAdmin(isAdmin: boolean | null) {
  if (isAdmin !== true) throw new Error("Admin access required");
}