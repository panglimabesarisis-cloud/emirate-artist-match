import { bookingStage, STAGE_LABEL } from "./booking-stage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  buildAgentReport,
  calendarAllowed,
  calendarDraftSchema,
  inheritedFeatures,
  reportRequestSchema,
  templateAllowed,
  type AgentReport,
  type CalendarDraft,
  type ReportRecord,
} from "./my-agent-rules";
export type AgentDb = SupabaseClient<Database>;
export async function agentPlan(db: AgentDb, artistId: string) {
  const { data: code, error } = await db.rpc("effective_artist_plan", { _artist: artistId });
  if (error || !code) throw new Error("Could not verify your subscription");
  const tiers = await db
    .from("plan_tiers")
    .select(
      "code,name,sort,features,allowed_models,max_own_prompts,max_active_prompts,max_flow_blocks,max_form_questions",
    )
    .order("sort");
  if (tiers.error) throw tiers.error;
  const plan = tiers.data?.find((t) => t.code === code);
  if (!plan) throw new Error("Subscription tier unavailable");
  return {
    ...plan,
    inheritedFeatures: inheritedFeatures(tiers.data ?? [], plan.sort),
    tiers: tiers.data ?? [],
  };
}
export async function eligibleContracts(
  db: AgentDb,
  artistId: string,
  plan: Awaited<ReturnType<typeof agentPlan>>,
) {
  const { data, error } = await db
    .from("contract_templates")
    .select("id,artist_id,name,category,description,tier,is_active")
    .or(`artist_id.eq.${artistId},artist_id.is.null`);
  if (error) throw error;
  return (data ?? []).filter(
    (t) =>
      (t.artist_id === artistId || t.is_active) &&
      templateAllowed(plan.tiers.find((p) => p.code === t.tier)?.sort ?? Infinity, plan.sort),
  );
}
const idSchema = z.object({ id: z.string().uuid() }).strict();
export const invoiceDocumentSchema = z.object({
  no: z.string(),
  items: z.array(z.object({ title: z.string(), qty: z.number(), price: z.number() })),
  subtotal: z.number(),
  vat: z.number(),
  total: z.number(),
  due: z.string().nullable(),
  notes: z.string().nullable(),
});
export type PrivateInvoice = z.infer<typeof invoiceDocumentSchema> & { id: string; status: string };
export type PrivateContract = {
  id: string;
  name: string;
  clauses: { title: string; body: string }[];
  rider: string | null;
};
export function privateInvoice(record: {
  id: string;
  number: string;
  status: string;
  document: unknown;
  total: number;
}): PrivateInvoice {
  const doc = invoiceDocumentSchema.parse(record.document);
  // Preserve stored authoritative identity/totals; never rebuild or create an invoice.
  return { ...doc, id: record.id, no: record.number, total: record.total, status: record.status };
}
export const AGENT_TOOLS = [
  {
    name: "prepare_calendar_event",
    description:
      "Prepare an event for owner confirmation, never create it immediately. Ask title, date, start/end UAE time, optional description and invitation emails first; use null/[] only when the artist says none.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        description: { type: ["string", "null"] },
        attendees: { type: "array", items: { type: "string" } },
      },
      required: ["title", "date", "startTime", "endTime", "description", "attendees"],
      additionalProperties: false,
    },
  },
  {
    name: "show_invoice",
    description:
      "Display an existing saved invoice ONLY in the private artist-AI chat. Use its stored id; ask which invoice if ambiguous. NEVER send to a client, rebuild it or change payment status.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_contract_template",
    description:
      "Display a contract template inside this private artist chat only if its subscription tier is permitted. Use an id from eligible_contracts.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "build_report",
    description:
      "Build a factual report table and requested bar/line/pie chart from ALL stored artist bookings or invoices. Use null date filters for all dates; no chart unless requested. records gives a detailed table, other groups aggregate.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["bookings", "invoices"] },
        metric: { type: "string", enum: ["count", "total", "paid", "outstanding"] },
        groupBy: { type: "string", enum: ["month", "status", "client", "records"] },
        from: { type: ["string", "null"] },
        to: { type: ["string", "null"] },
        chart: { type: "string", enum: ["none", "bar", "line", "pie"] },
      },
      required: ["source", "metric", "groupBy", "from", "to", "chart"],
      additionalProperties: false,
    },
  },
].map((tool) => ({ type: "function" as const, strict: true, ...tool }));
export type AgentToolContext = {
  db: AgentDb;
  artistId: string;
  plan: Awaited<ReturnType<typeof agentPlan>>;
  reports: AgentReport[];
  invoices: PrivateInvoice[];
  contracts: PrivateContract[];
  proposals: CalendarDraft[];
};
export async function executeAgentTool(
  name: string,
  input: unknown,
  ctx: AgentToolContext,
): Promise<unknown> {
  if (name === "prepare_calendar_event") {
    const payload = calendarDraftSchema.parse(input);
    if (!calendarAllowed(ctx.plan.inheritedFeatures))
      throw new Error("Calendar sync is not included in your current subscription.");
    ctx.proposals.push(payload);
    return {
      prepared: true,
      event: payload,
      confirmationRequired: true,
      instruction: "Event NOT created. Owner must press Confirm in the proposed event card.",
    };
  }
  if (name === "show_invoice") {
    const { id } = idSchema.parse(input);
    const { data, error } = await ctx.db
      .from("service_invoices")
      .select("id,number,status,document,total")
      .eq("id", id)
      .eq("artist_id", ctx.artistId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) throw new Error("Saved invoice not found in your account.");
    const invoice = privateInvoice(data);
    ctx.invoices.push(invoice);
    return {
      displayedPrivately: true,
      number: invoice.no,
      status: invoice.status,
      total: invoice.total,
      instruction:
        "No invoice was created or sent to a client. Existing invoice is displayed in this private chat.",
    };
  }
  if (name === "get_contract_template") {
    const { id } = idSchema.parse(input);
    const eligible = await eligibleContracts(ctx.db, ctx.artistId, ctx.plan);
    if (!eligible.some((t) => t.id === id))
      throw new Error("Contract template is not included in your current subscription.");
    const { data, error } = await ctx.db
      .from("contract_templates")
      .select("id,name,clauses,rider")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) throw new Error("Contract template unavailable.");
    const clauses = z.array(z.object({ title: z.string(), body: z.string() })).parse(data.clauses);
    ctx.contracts.push({ ...data, clauses });
    return {
      displayedPrivately: true,
      name: data.name,
      instruction:
        "Template displayed only to the artist. This does not accept or issue a booking contract.",
    };
  }
  if (name === "build_report") {
    const request = reportRequestSchema.parse(input);
    const records: ReportRecord[] = [];
    // Pagination avoids presenting a latest-60 snapshot as an all-time report.
    for (let offset = 0; ; offset += 1000) {
      if (request.source === "bookings") {
        const result = await ctx.db
          .from("bookings")
          .select("id,client_name,event_date,status,total,paid_amount,escrow_status")
          .eq("artist_id", ctx.artistId)
          .is("deleted_at", null)
          .order("id")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        const page = result.data ?? [];
        records.push(
          ...page.map((b) => ({
            client: b.client_name,
            date: b.event_date,
            status: STAGE_LABEL[bookingStage(b)],
            total: Number(b.total),
            paid: Number(b.paid_amount),
          })),
        );
        if (page.length < 1000) break;
      } else {
        const result = await ctx.db
          .from("service_invoices")
          .select(
            "id,created_at,status,total,booking_id,conversations(client_name),bookings(paid_amount,total)",
          )
          .eq("artist_id", ctx.artistId)
          .is("deleted_at", null)
          .order("id")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        const page = result.data ?? [];
        records.push(
          ...page.map((i) => ({
            client: i.conversations?.client_name ?? "Client",
            date: i.created_at.slice(0, 10),
            status: i.status,
            total: Number(i.total),
            paid:
              i.status === "paid"
                ? Number(i.total)
                : Math.min(Number(i.total), Number(i.bookings?.paid_amount ?? 0)),
          })),
        );
        if (page.length < 1000) break;
      }
    }
    const report = buildAgentReport(request, records);
    ctx.reports.push(report);
    return {
      displayed: true,
      title: report.title,
      recordCount: report.count,
      table: report.rows,
      instruction:
        "Report table/chart are displayed. Explain briefly; never invent amounts or repeat the whole table.",
    };
  }
  throw new Error("Unsupported tool");
}
