/** Incoming / done / waiting jobs per category and speciality, for the public profile bars.
 * Bookings carry no speciality, so a booking counts for the speciality named in its title or
 * details, otherwise for the artist's main speciality. Cancelled bookings are not jobs. */
export type JobBooking = { status: string; completed_at: string | null; text: string };
export type JobScore = { name: string; incoming: number; done: number; waiting: number; pct: number };

const isDone = (b: JobBooking) => b.status === "completed" || !!b.completed_at;

export function jobScores(
  bookings: JobBooking[],
  categories: { id?: string; name: string }[],
  specialties: { id?: string; name: string; category_id?: string | null }[],
): { categories: JobScore[]; specialties: JobScore[] } {
  const spec = new Map(specialties.map((s) => [s.name, { incoming: 0, done: 0 }]));
  const cat = new Map(categories.map((c) => [c.name, { incoming: 0, done: 0 }]));
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const text = b.text.toLowerCase();
    const s = specialties.find((x) => text.includes(x.name.toLowerCase())) ?? specialties[0];
    const c = (s && categories.find((x) => x.id && x.id === s.category_id)) ?? categories[0];
    for (const [map, key] of [[spec, s?.name], [cat, c?.name]] as const) {
      const row = key ? map.get(key) : undefined;
      if (!row) continue;
      row.incoming += 1;
      if (isDone(b)) row.done += 1;
    }
  }
  const out = (m: Map<string, { incoming: number; done: number }>) => [...m].map(([name, r]) => ({
    name, incoming: r.incoming, done: r.done, waiting: r.incoming - r.done,
    pct: r.incoming ? Math.round((r.done / r.incoming) * 100) : 0,
  }));
  return { categories: out(cat), specialties: out(spec) };
}

/** Registration date as ddmmyyyy (Dubai time), the unique part of an artist's profile address. */
export function registrationCode(date: Date = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}${g("month")}${g("year")}`;
}
