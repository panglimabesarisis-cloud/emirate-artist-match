/**
 * A talent may pick as many specialties as the chosen plan allows while registering, but the database only
 * accepts what the *paid* plan allows. The rest wait on the account and are added once the plan is paid.
 */
export type PendingSpecialties = { category_id: string; ids: string[] };

export function splitSpecialties(selected: string[], allowedNow: number) {
  const keep = Math.max(1, allowedNow);
  return { now: selected.slice(0, keep), later: selected.slice(keep) };
}

export function readPending(value: unknown): PendingSpecialties | null {
  if (!value || typeof value !== "object") return null;
  const { category_id, ids } = value as Record<string, unknown>;
  if (typeof category_id !== "string" || !Array.isArray(ids)) return null;
  const clean = ids.filter((id): id is string => typeof id === "string").slice(0, 20);
  return clean.length ? { category_id, ids: clean } : null;
}

/**
 * What to save now. `save` is null when nothing can be added yet; `pending` is what keeps waiting
 * (null once everything is saved, or when the artist has since moved to another category).
 */
export function applyPending(current: { category_id: string | null; ids: string[] }, pending: PendingSpecialties, limit: number) {
  if (current.category_id !== pending.category_id) return { save: null, pending: null };
  const waiting = pending.ids.filter((id) => !current.ids.includes(id));
  const room = Math.max(0, limit - current.ids.length);
  const added = waiting.slice(0, room);
  const rest = waiting.slice(room);
  return {
    save: added.length ? [...current.ids, ...added] : null,
    pending: rest.length ? { category_id: pending.category_id, ids: rest } : null,
  };
}
