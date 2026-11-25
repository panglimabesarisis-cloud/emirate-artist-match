/** Pure rules behind the master admin artist pages. */

type Listed = { category_id: string | null; category_ids?: string[] | null; subcategory_id: string | null; specialty_ids?: string[] | null };
export const inCategory = (artist: Listed, categoryId: string) => artist.category_id === categoryId || !!artist.category_ids?.includes(categoryId);
export const hasSpeciality = (artist: Listed, specialityId: string) => artist.subcategory_id === specialityId || !!artist.specialty_ids?.includes(specialityId);
export const categoryIdsOf = (artist: Listed) => [...new Set([artist.category_id, ...(artist.category_ids ?? [])].filter((id): id is string => !!id))];
export const specialityIdsOf = (artist: Listed) => [...new Set([artist.subcategory_id, ...(artist.specialty_ids ?? [])].filter((id): id is string => !!id))];

/** Names typed as a list, one speciality each; repeats and ones already saved are skipped. */
export function newSpecialityNames(input: string, existing: string[]) {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  return input.split(/[,\n]/).map((name) => name.trim().replace(/\s+/g, " ").slice(0, 120)).filter((name) => {
    const key = name.toLowerCase();
    if (!name || taken.has(key)) return false;
    taken.add(key);
    return true;
  });
}

export function topByRevenue<T extends { revenue: number | string }>(rows: T[], count = 10) {
  return rows.filter((row) => Number(row.revenue) > 0).sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, count);
}

export type IdentityDetails = {
  residency: string; full_name: string | null; doc_number: string | null; doc_expiry: string | null;
  dob: string | null; nationality: string | null; address: unknown; phone: string | null; phone_confirmed_at: string | null; redacted_at?: string | null;
};
export type Requirement = { label: string; ok: boolean };

const FILE_LABELS: Record<string, string> = {
  id_front: "Emirates ID front", id_back: "Emirates ID back", passport: "Passport", national_id: "National ID",
  selfie_center: "Selfie, facing forward", selfie_left: "Selfie, facing left", selfie_right: "Selfie, facing right",
};
export const fileLabel = (kind: string) => FILE_LABELS[kind] ?? kind.replace(/_/g, " ");

/**
 * What `submit_verification` requires, by residency. Without a submission the UAE list is shown.
 * Files stay ticked once received, even after the 30-day privacy rule has deleted them.
 */
export function identityRequirements(details: IdentityDetails | null, fileKinds: string[]): Requirement[] {
  const foreign = details?.residency === "foreign";
  const files = foreign ? ["passport", "selfie_center", "selfie_left", "selfie_right"] : ["id_front", "id_back", "selfie_center", "selfie_left", "selfie_right"];
  const redacted = !!details?.redacted_at;
  const given = (value: unknown) => redacted || !!value;
  return [
    { label: "Full legal name", ok: given(details?.full_name) },
    { label: foreign ? "Passport number" : "Emirates ID number", ok: given(details?.doc_number) },
    { label: "Document expiry date", ok: given(details?.doc_expiry) },
    ...(foreign ? [{ label: "Date of birth, 18 or older", ok: given(details?.dob) }, { label: "Nationality", ok: given(details?.nationality) }, { label: "Home address", ok: given(details?.address) }] : []),
    { label: "Phone confirmed by code", ok: !!details?.phone_confirmed_at },
    ...files.map((kind) => ({ label: fileLabel(kind), ok: fileKinds.includes(kind) })),
  ];
}

export type ExpiryState = "expired" | "soon" | "valid" | "unknown";
/** "soon" is the last 60 days before the document expires. */
export function expiryState(date: string | null | undefined, today = new Date()): ExpiryState {
  if (!date) return "unknown";
  const days = Math.floor((Date.parse(`${date}T23:59:59+04:00`) - today.getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "unknown";
  return days < 0 ? "expired" : days <= 60 ? "soon" : "valid";
}

/** Lists show only the end of an identity number; the review dialog shows it in full. */
export const maskNumber = (value: string | null | undefined) => (value ? `•••• ${value.slice(-4)}` : "—");

/** Documents can be opened until 30 days after a decision. */
export const documentsPurged = (application: { privacy_purged_at: string | null; decided_at: string | null }, now = Date.now()) =>
  !!application.privacy_purged_at || (!!application.decided_at && Date.parse(application.decided_at) <= now - 30 * 86_400_000);

/** The plan limits an admin can edit; every one of them is enforced by the database or the server. */
export const PLAN_LIMITS = [
  { key: "ai_credits", label: "AI credits per month", group: "AI", min: 0 },
  { key: "max_active_prompts", label: "Active AI prompts", group: "AI", min: 0 },
  { key: "max_own_prompts", label: "Own AI prompts", group: "AI", min: 0 },
  { key: "max_flow_blocks", label: "AI flow blocks", group: "AI", min: 1 },
  { key: "max_form_questions", label: "Booking form questions", group: "AI", min: 1 },
  { key: "max_categories", label: "Job categories", group: "Profile", min: 1 },
  { key: "max_specialties", label: "Specialities", group: "Profile", min: 1 },
  { key: "max_photos", label: "Photos", group: "Profile", min: 0 },
  { key: "max_videos", label: "Videos", group: "Profile", min: 0 },
  { key: "max_portfolio", label: "Portfolio works", group: "Profile", min: 0 },
  { key: "max_clients", label: "Past clients", group: "Profile", min: 0 },
  { key: "max_team_members", label: "Team members (-1 unlimited)", group: "Team and fee", min: -1 },
  { key: "commission_pct", label: "Platform commission %", group: "Team and fee", min: 0 },
] as const;
export const AI_MODELS = ["fast", "balanced", "advanced"] as const;

type PlanValues = { name: string; price_monthly: number; price_yearly: number; allowed_models: string[] } & Record<(typeof PLAN_LIMITS)[number]["key"], number>;
/** The first reason a plan cannot be saved, or null. */
export function planProblem(plan: PlanValues): string | null {
  if (!plan.name.trim()) return "Enter the package name";
  for (const price of [plan.price_monthly, plan.price_yearly]) if (!Number.isFinite(price) || price < 0) return "Prices must be 0 or more";
  for (const limit of PLAN_LIMITS) {
    const value = plan[limit.key];
    if (!Number.isInteger(value) && limit.key !== "commission_pct") return `${limit.label}: use a whole number`;
    if (!Number.isFinite(value) || value < limit.min) return `${limit.label}: the lowest value is ${limit.min}`;
  }
  if (plan.commission_pct > 100) return "Platform commission cannot be above 100%";
  if (!plan.allowed_models.length) return "Allow at least one AI model";
  return null;
}
