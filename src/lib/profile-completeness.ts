/** "Profile strength": the one list the artist dashboard shows and the admin reminds the artist about. */
export type ProfileInput = {
  stageName?: string | null | undefined; tagline?: string | null | undefined; bio?: string | null | undefined; basePrice?: number | string | null | undefined;
  languages?: string[] | null | undefined; skills?: string[] | null | undefined; body?: unknown; photoPath?: string | null | undefined;
  categories: string[]; specialities: string[]; area: string; portfolio: number; clients: number;
};
/** label, done, the field on the artist's Profile page */
export type ProfileCheck = [label: string, ok: boolean, anchor: string];

export function profileChecks(p: ProfileInput): ProfileCheck[] {
  const body = (p.body && typeof p.body === "object" && !Array.isArray(p.body) ? p.body : {}) as Record<string, unknown>;
  const checks: ProfileCheck[] = [
    ["Profile photo", !!p.photoPath, "#pf-photo"],
    ["Tagline", (p.tagline ?? "").trim().length >= 5, "#pf-tagline"],
    ["Bio of 150 characters or more", (p.bio ?? "").trim().length >= 150, "#pf-bio"],
    ["A speciality", p.specialities.length > 0, "#pf-sp"],
    ["Three or more skills", (p.skills ?? []).length >= 3, "#pf-sk"],
    ["Starting price and location", !!p.basePrice && !!p.area, "#pf-price"],
    ["Languages", (p.languages ?? []).length > 0, "#pf-lg"],
    ["One work in your portfolio", p.portfolio > 0, "#pf-po-s"],
    ["One client", p.clients > 0, "#pf-cl-s"],
  ];
  // Casting details only matter when the talent lists a model category.
  if (p.categories.some((name) => /model/i.test(name))) checks.splice(6, 0, ["Height, weight and hair color", !!(body["height_cm"] && body["weight_kg"] && body["hair"]), "#body-height_cm"]);
  return checks;
}

export const missingProfileItems = (checks: ProfileCheck[]) => checks.filter((c) => !c[1]).map((c) => c[0]);
export const profilePercent = (checks: ProfileCheck[]) => Math.round((checks.filter((c) => c[1]).length / checks.length) * 100);

export const reminderMessage = (name: string, missing: string[]) =>
  `Hi ${name}, please complete your profile so clients can book you. Still missing: ${missing.join(", ")}.`.slice(0, 1000);
