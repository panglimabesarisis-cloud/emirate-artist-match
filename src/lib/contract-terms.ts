/** Contract template text helpers. Placeholders are replaced with the booking's real values. */
export type Clause = { title: string; body: string };
export type ContractTerms = { clauses: Clause[]; rider: string | null };

export const CONTRACT_PLACEHOLDERS = ["artist", "client", "service", "date", "time", "venue", "total", "vat"] as const;
export type PlaceholderValues = Partial<Record<(typeof CONTRACT_PLACEHOLDERS)[number], string>>;

const PLACEHOLDER = new RegExp(`\\{(${CONTRACT_PLACEHOLDERS.join("|")})\\}`, "g");

/** Replaces {artist}, {client}, ... with the given values. Unknown braces are left untouched; missing values become empty. */
export function resolveContractText(text: string | null | undefined, values: PlaceholderValues): string {
  if (!text) return "";
  return text.replace(PLACEHOLDER, (_m, key: (typeof CONTRACT_PLACEHOLDERS)[number]) => values[key] ?? "");
}

export function resolveTerms(template: { clauses: unknown; rider: string | null }, values: PlaceholderValues): ContractTerms {
  const raw = Array.isArray(template.clauses) ? template.clauses : [];
  const clauses: Clause[] = [];
  for (const c of raw as Array<Record<string, unknown>>) {
    if (c && typeof c["title"] === "string" && typeof c["body"] === "string") clauses.push({ title: resolveContractText(c["title"], values), body: resolveContractText(c["body"], values) });
  }
  return { clauses, rider: template.rider ? resolveContractText(template.rider, values) : null };
}

/** Frozen terms stored on an accepted booking, or null when malformed. */
export function parseStoredTerms(v: unknown): ContractTerms | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o["clauses"])) return null;
  const clauses = (o["clauses"] as Array<Record<string, unknown>>)
    .filter((c) => c && typeof c["title"] === "string" && typeof c["body"] === "string")
    .map((c) => ({ title: String(c["title"]), body: String(c["body"]) }));
  return { clauses, rider: typeof o["rider"] === "string" ? o["rider"] : null };
}

/** Venue is kept on the booking notes as a "Venue / emirate: ..." line. */
export function venueFromNotes(notes: string | null | undefined): string {
  return /^Venue \/ emirate:[ \t]*(.*)$/im.exec(notes ?? "")?.[1]?.trim() ?? "";
}
