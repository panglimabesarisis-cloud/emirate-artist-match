import { z } from "zod";

export const RATE_UNITS = ["Minutes Perform", "Hours", "Days", "Project", "Pages", "Screens", "Photos", "Videos", "Concepts", "Rooms", "m²", "Revisions", "Years"];
export const rateItemSchema = z.object({
  desc: z.string().trim().min(1, "Enter an item description.").max(300),
  qty: z.coerce.number().positive().max(1_000_000),
  price: z.coerce.number().min(0).max(1_000_000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001, "Use at most two decimal places."),
  type: z.enum(["base", "addon"]),
  unit: z.string().trim().min(1).max(40),
});
export const ratecardSchema = z.object({
  title: z.string().trim().min(2, "Enter a service title.").max(100),
  unit_label: z.string().trim().min(1).max(40),
  description: z.string().trim().max(1000),
  rules_of_work: z.string().trim().max(600),
  items: z.array(rateItemSchema).min(1).max(20),
}).refine(v => v.items.some(i => i.type === "base" && i.price > 0), "Add at least one priced base item.");
export type RateItem = z.infer<typeof rateItemSchema>;
export type RateDraft = { title: string; unit_label: string; description: string; rules_of_work: string; items: { desc: string; qty: string; price: string; type: "base" | "addon"; unit: string }[] };
export type StoredRate = { title: string; price: number | string; duration_minutes: number | null; description: string | null; unit_label?: string; rules_of_work?: string | null; items?: unknown };
export const emptyRate = (): RateDraft => ({ title: "", unit_label: "Project", description: "", rules_of_work: "", items: [{ desc: "", qty: "1", price: "", type: "base", unit: "Project" }] });
export function rateItems(rate: StoredRate): RateItem[] {
  const parsed = z.array(rateItemSchema).safeParse(rate.items);
  if (parsed.success && parsed.data.length) return parsed.data;
  return [{ desc: rate.description || rate.title, qty: rate.duration_minutes || 1, price: Number(rate.price), type: "base", unit: rate.duration_minutes ? "Minutes Perform" : rate.unit_label || "Project" }];
}
export function rateDraft(rate: StoredRate): RateDraft {
  return { title: rate.title, unit_label: rate.unit_label || (rate.duration_minutes ? "Minutes Perform" : "Project"), description: rate.description || "", rules_of_work: rate.rules_of_work || "", items: rateItems(rate).map(i => ({ ...i, qty: String(i.qty), price: String(i.price) })) };
}
export function restoreRateDraft(value: unknown): RateDraft {
  if (!value || typeof value !== "object") return emptyRate();
  const v = value as Record<string, unknown>;
  if (Array.isArray(v['items'])) {
    const draft = { title: String(v['title'] ?? ""), unit_label: String(v['unit_label'] ?? "Project"), description: String(v['description'] ?? ""), rules_of_work: String(v['rules_of_work'] ?? ""), items: v['items'].slice(0, 20).filter((i): i is Record<string, unknown> => !!i && typeof i === "object").map(i => ({ desc: String(i['desc'] ?? ""), qty: String(i['qty'] ?? "1"), price: String(i['price'] ?? ""), type: i['type'] === "addon" ? "addon" as const : "base" as const, unit: String(i['unit'] ?? v['unit_label'] ?? "Project") })) };
    return draft.items.length ? draft : { ...draft, items: emptyRate().items };
  }
  return rateDraft({ title: String(v['title'] ?? ""), description: String(v['description'] ?? ""), price: String(v['price'] ?? ""), duration_minutes: Number(v['duration']) || 60 });
}
export function rateTotals(items: { price: string | number; type: string }[]) {
  const sum = (type: string) => items.filter(i => i.type === type).reduce((n, i) => n + Math.round((Number(i.price) || 0) * 100), 0) / 100;
  return { base: sum("base"), addons: sum("addon") };
}
export function ratePayload(draft: RateDraft) {
  const parsed = ratecardSchema.parse(draft);
  const base = parsed.items.filter(i => i.type === "base");
  const minutes = base.every(i => i.unit === "Minutes Perform" || i.unit === "Hours") ? base.reduce((n, i) => n + i.qty * (i.unit === "Hours" ? 60 : 1), 0) : null;
  if (minutes !== null && (!Number.isInteger(minutes) || minutes > 525600)) throw new Error("Enter a whole number of minutes, up to one year.");
  return { ...parsed, price: rateTotals(parsed.items).base, duration_minutes: minutes, description: parsed.description || null, rules_of_work: parsed.rules_of_work || null };
}
export function rateScope(rate: StoredRate) {
  return rateItems(rate).filter(i => i.type === "base").map(i => `${i.qty} ${i.unit}`).join(" + ");
}
/** Work-rule snippets offered as one-tap chips under the rules field. */
export const RULE_SNIPPETS: { label: string; text: string }[] = [
  { label: "Revision limit", text: "Includes up to 3 minor revisions. Extra rounds are charged per request." },
  { label: "Extra revision fee", text: "Any revision beyond the agreed limit is billed as an add-on." },
  { label: "Travel not included", text: "Price excludes travel and accommodation outside the listed emirate." },
  { label: "50% deposit", text: "A 50% deposit confirms the date. The balance is due on delivery." },
  { label: "Overtime rate", text: "Time beyond the booked duration is billed hourly once you approve it." },
];

/** Append a snippet as its own bullet line, ignoring one that is already there. */
export function appendRule(current: string, text: string, limit = 600) {
  const body = current.trim();
  if (body.toLowerCase().includes(text.toLowerCase())) return current;
  const next = body ? `${body}\n• ${text}` : `• ${text}`;
  return next.length > limit ? current : next;
}

/** Starter packages so a new talent does not face an empty builder. */
export const RATE_PRESETS: { label: string; draft: RateDraft }[] = [
  {
    label: "Event host / MC",
    draft: {
      title: "Event hosting & MC",
      unit_label: "Minutes Perform",
      description: "Hosting the run of show, crowd engagement and script alignment with your team.",
      rules_of_work: "• Includes one technical soundcheck before the event.\n• Time beyond the booked duration is billed hourly once you approve it.",
      items: [
        { desc: "Main hosting slot", qty: "90", price: "4000", type: "base", unit: "Minutes Perform" },
        { desc: "Overtime, per extra 30 minutes", qty: "30", price: "900", type: "addon", unit: "Minutes Perform" },
      ],
    },
  },
  {
    label: "DJ set",
    draft: {
      title: "DJ set",
      unit_label: "Hours",
      description: "A prepared set, your own controller and headphones, and a curated playlist agreed in advance.",
      rules_of_work: "• Venue provides the sound system, speakers and power.\n• A 50% deposit confirms the date. The balance is due on delivery.",
      items: [
        { desc: "Live DJ set", qty: "3", price: "3500", type: "base", unit: "Hours" },
        { desc: "Extra hour", qty: "1", price: "900", type: "addon", unit: "Hours" },
      ],
    },
  },
  {
    label: "Photo / video",
    draft: {
      title: "Event photography",
      unit_label: "Hours",
      description: "On-site coverage plus a gallery of edited, colour-graded images delivered online.",
      rules_of_work: "• Edited gallery is delivered within 10 working days.\n• Raw files stay with the photographer unless agreed in writing.",
      items: [
        { desc: "Event coverage with edited gallery", qty: "4", price: "2800", type: "base", unit: "Hours" },
        { desc: "Same-day highlight reel", qty: "1", price: "1200", type: "addon", unit: "Project" },
      ],
    },
  },
];
