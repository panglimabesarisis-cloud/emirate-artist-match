import { PAGE_URL, PHOTO_URL } from "./person-photo";
import { z } from "zod";
import { calendarWindow } from "./calendar-rules";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      return calendarWindow({ date: v }).date === v;
    } catch {
      return false;
    }
  }, "Invalid calendar date");
export const calendarDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    date,
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    description: z.string().max(4000).nullable(),
    attendees: z.array(z.string().email()).max(30),
  })
  .strict()
  .refine((v) => v.startTime !== v.endTime, "Start and end must differ");
export type CalendarDraft = z.infer<typeof calendarDraftSchema>;
export const invoiceDraftSchema = z.object({ invoiceId: z.string().uuid() }).strict();
export const reportRequestSchema = z
  .object({
    source: z.enum(["bookings", "invoices", "chats", "forms", "credits", "payments"]),
    metric: z.enum(["count", "total", "paid", "outstanding"]),
    groupBy: z.enum(["month", "status", "client", "records"]),
    from: date.nullable(),
    to: date.nullable(),
    chart: z.enum(["none", "bar", "line", "pie", "doughnut", "area", "hbar"]),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, "Invalid report date range");
export type ReportRequest = z.infer<typeof reportRequestSchema>;
export type ReportRecord = {
  client: string;
  date: string;
  status: string;
  total: number;
  paid: number;
};
export const reportSchema = z.object({
  title: z.string(),
  columns: z.array(z.string()).max(8),
  rows: z.array(z.array(z.union([z.string(), z.number().finite()]))),
  chart: z
    .object({
      type: z.enum(["bar", "line", "pie", "doughnut", "area", "hbar"]),
      metric: z.string(),
      points: z.array(z.object({ label: z.string(), value: z.number().finite() })),
    })
    .nullable(),
  count: z.number().int().nonnegative(),
});
export type AgentReport = z.infer<typeof reportSchema>;
export const privateInvoiceSchema = z.object({
  id: z.string().uuid(),
  no: z.string(),
  status: z.string(),
  items: z.array(z.object({ title: z.string(), qty: z.number(), price: z.number() })),
  subtotal: z.number(),
  vat: z.number(),
  total: z.number(),
  due: z.string().nullable(),
  notes: z.string().nullable(),
});
export const privateContractSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  clauses: z.array(z.object({ title: z.string(), body: z.string() })),
  rider: z.string().nullable(),
});
export const agentBodySchema = z.object({
  text: z.string(),
  reports: z.array(reportSchema),
  invoices: z.array(privateInvoiceSchema),
  contracts: z.array(privateContractSchema),
  actionIds: z.array(z.string().uuid()),
  tools: z.array(z.object({ name: z.string(), error: z.string().nullable() })),
  /** A public figure's Wikipedia photo, shown beside the answer. */
  photo: z.object({ name: z.string(), photo: z.string().regex(PHOTO_URL), page: z.string().regex(PAGE_URL) }).nullable().optional(),
  /** Places shown as maps; the addresses are built from these names. */
  maps: z.array(z.string().max(200)).max(4).optional(),
  /** Pictures and videos the agent made: a stored file, or a video still being made. */
  media: z.array(z.object({ kind: z.enum(["image", "video"]), path: z.string().max(300).optional(), job: z.string().max(200).optional(), failed: z.boolean().optional() })).max(4).optional(),
});
export type AgentBody = z.infer<typeof agentBodySchema>;
const MARK = "[[DM_AGENT_V1]]";
export const encodeAgentBody = (v: AgentBody) => MARK + JSON.stringify(v);
export function decodeAgentBody(body: string): AgentBody {
  if (body.startsWith(MARK)) {
    try {
      const parsed = agentBodySchema.safeParse(JSON.parse(body.slice(MARK.length)));
      if (parsed.success) return parsed.data;
    } catch {
      /* Legacy text stays readable. */
    }
  }
  return { text: body, reports: [], invoices: [], contracts: [], actionIds: [], tools: [] };
}
export function templateAllowed(templateRank: number, planRank: number) {
  return Number.isFinite(templateRank) && Number.isFinite(planRank) && templateRank <= planRank;
}
export function inheritedFeatures(tiers: { sort: number; features: unknown }[], rank: number) {
  return [
    ...new Set(
      tiers
        .filter((t) => t.sort <= rank)
        .flatMap((t) =>
          Array.isArray(t.features)
            ? t.features.filter((f): f is string => typeof f === "string")
            : [],
        ),
    ),
  ];
}
export const calendarAllowed = (features: string[]) =>
  features.some((f) => /calendar sync/i.test(f));
export function googleEventPayload(draft: CalendarDraft, actionId: string) {
  const valid = calendarDraftSchema.parse(draft);
  const window = calendarWindow(valid);
  return {
    id: "dm" + actionId.replaceAll("-", ""),
    summary: valid.title,
    description: valid.description ?? "",
    start: { dateTime: window.timeMin, timeZone: "Asia/Dubai" },
    end: { dateTime: window.timeMax, timeZone: "Asia/Dubai" },
    attendees: [...new Set(valid.attendees.map((e) => e.toLowerCase()))].map((email) => ({
      email,
    })),
  };
}
export function buildAgentReport(request: ReportRequest, records: ReportRecord[]): AgentReport {
  const r = reportRequestSchema.parse(request);
  const filtered = records.filter(
    (v) => (!r.from || v.date.slice(0, 10) >= r.from) && (!r.to || v.date.slice(0, 10) <= r.to),
  );
  const metric = (v: ReportRecord) =>
    r.metric === "count"
      ? 1
      : r.metric === "paid"
        ? v.paid
        : r.metric === "outstanding"
          ? Math.max(0, v.total - v.paid)
          : v.total;
  const groups = new Map<string, number>();
  for (const v of filtered) {
    const label =
      r.groupBy === "month" ? v.date.slice(0, 7) : r.groupBy === "status" ? v.status : v.client;
    groups.set(label, (groups.get(label) ?? 0) + metric(v));
  }
  const points = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
  const money = r.source === "bookings" || r.source === "invoices" || r.source === "payments";
  const metricLabel = r.metric === "count" ? "Count" : money ? `${r.metric} (AED)` : r.source === "credits" ? "Credits" : r.metric;
  // Records of the other sources have no paid or outstanding amount.
  const plain = r.source === "chats" || r.source === "forms" ? ["Client", "Date", "Status"] : r.source === "credits" ? ["Activity", "Date", "Type", "Credits"] : r.source === "payments" ? ["Item", "Date", "Status", "Amount (AED)"] : null;
  return {
    title: `${r.source} · ${r.metric}${r.from || r.to ? ` · ${r.from ?? "start"} – ${r.to ?? "today"}` : " · all dates"}`,
    count: filtered.length,
    columns:
      r.groupBy === "records"
        ? plain ?? ["Client", "Date", "Status", "Total (AED)", "Paid (AED)", "Outstanding (AED)"]
        : [r.groupBy, metricLabel],
    rows:
      r.groupBy === "records"
        ? filtered.map((v) => [
            v.client,
            v.date.slice(0, 10),
            v.status,
            v.total,
            v.paid,
            Math.round(Math.max(0, v.total - v.paid) * 100) / 100,
          ].slice(0, plain?.length ?? 6))
        : points.map((p) => [p.label, p.value]),
    chart: r.chart === "none" ? null : { type: r.chart, metric: metricLabel, points },
  };
}
