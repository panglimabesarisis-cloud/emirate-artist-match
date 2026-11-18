export const aed = (n: number | null | undefined) =>
  `AED ${Math.round(Number(n ?? 0)).toLocaleString("en-US")}`;

export const BADGE_LABELS: Record<string, string> = {
  verified_identity: "ID Verified",
  verified_business: "Business Verified",
  verified_performer: "Verified Performer",
  top_performer: "Top Performer",
};

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
