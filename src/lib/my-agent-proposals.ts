import { z } from "zod";
import { calendarDraftSchema, type CalendarDraft } from "./my-agent-rules";
import { youtubeId } from "./media";

/**
 * Things the private AI agent may ask to do on the artist's behalf. The agent only PROPOSES: every proposal is saved as an
 * agent_actions row and runs only when the artist presses Confirm, so text read from a client chat can never trigger it.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "Invalid date");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** "Add schedule": title, date, start, end and a description are all required, as in the Calendar form. */
export const scheduleItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  date: day,
  startTime: clock,
  endTime: clock,
  notes: z.string().trim().min(1).max(500),
}).strict();
export type ScheduleItemDraft = z.infer<typeof scheduleItemSchema>;

/** Rate card: Job type, Price (AED), Minutes, and Detail job ("What's included"). */
export const rateCardSchema = z.object({
  title: z.string().trim().min(1).max(80),
  price: z.number().finite().positive().max(1_000_000),
  minutes: z.number().int().min(1).max(1440),
  description: z.string().trim().min(1).max(500),
}).strict();
export type RateCardDraft = z.infer<typeof rateCardSchema>;

/** One photo (a file the artist attached to this chat) or one YouTube link. */
export const mediaPhotoSchema = z.object({ fileId: z.string().uuid(), name: z.string().max(120) }).strict();
export const mediaYoutubeSchema = z.object({ url: z.string().trim().max(300).refine((u) => youtubeId(u) !== null, "Not a YouTube link") }).strict();
export type MediaPhotoDraft = z.infer<typeof mediaPhotoSchema>;
export type MediaYoutubeDraft = z.infer<typeof mediaYoutubeSchema>;

export const sendInvoiceSchema = z.object({
  conversationId: z.string().uuid(),
  clientName: z.string().max(80),
  items: z.array(z.object({ title: z.string().trim().min(1).max(120), qty: z.number().int().min(1).max(99), price: z.number().finite().min(0).max(1_000_000) }).strict()).min(1).max(20),
  due: day.nullable(),
  notes: z.string().max(500).nullable(),
}).strict();
export type SendInvoiceDraft = z.infer<typeof sendInvoiceSchema>;

export type AgentProposal =
  | { kind: "calendar_event"; payload: CalendarDraft }
  | { kind: "schedule_item"; payload: ScheduleItemDraft }
  | { kind: "rate_card"; payload: RateCardDraft }
  | { kind: "media_photo"; payload: MediaPhotoDraft }
  | { kind: "media_youtube"; payload: MediaYoutubeDraft }
  | { kind: "send_invoice"; payload: SendInvoiceDraft };

export type ProposalKind = AgentProposal["kind"];
export const PROPOSAL_KINDS: ProposalKind[] = ["calendar_event", "schedule_item", "rate_card", "media_photo", "media_youtube", "send_invoice"];

/** Parses a stored proposal payload by kind (null when it does not fit). */
export function parseProposal(kind: string, payload: unknown): AgentProposal | null {
  const schemas = { calendar_event: calendarDraftSchema, schedule_item: scheduleItemSchema, rate_card: rateCardSchema, media_photo: mediaPhotoSchema, media_youtube: mediaYoutubeSchema, send_invoice: sendInvoiceSchema } as const;
  if (!(kind in schemas)) return null;
  const parsed = schemas[kind as ProposalKind].safeParse(payload);
  return parsed.success ? ({ kind, payload: parsed.data } as AgentProposal) : null;
}

/** Plain-language summary lines for the confirmation card. */
export function proposalLines(p: AgentProposal): { title: string; lines: string[] } {
  switch (p.kind) {
    case "calendar_event": return { title: p.payload.title, lines: [`${p.payload.date} · ${p.payload.startTime}–${p.payload.endTime} · Asia/Dubai`, ...(p.payload.description ? [p.payload.description] : [])] };
    case "schedule_item": return { title: p.payload.title, lines: [`${p.payload.date} · ${p.payload.startTime}–${p.payload.endTime}`, p.payload.notes] };
    case "rate_card": return { title: p.payload.title, lines: [`AED ${p.payload.price.toLocaleString("en-US")} · ${p.payload.minutes} min`, p.payload.description] };
    case "media_photo": return { title: p.payload.name, lines: [] };
    case "media_youtube": return { title: p.payload.url, lines: [] };
    case "send_invoice": {
      const subtotal = p.payload.items.reduce((n, i) => n + i.qty * i.price, 0);
      return { title: p.payload.clientName || "Client", lines: [...p.payload.items.map((i) => `${i.qty} × ${i.title} · AED ${i.price.toLocaleString("en-US")}`), `Subtotal AED ${subtotal.toLocaleString("en-US")} + 5% VAT`, ...(p.payload.due ? [`Due ${p.payload.due}`] : []), ...(p.payload.notes ? [p.payload.notes] : [])] };
    }
  }
}
