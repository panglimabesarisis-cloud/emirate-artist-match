import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarCheck, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { confirmMyAgentAction } from "@/lib/my-agent-actions.functions";
import { calendarDraftSchema, decodeAgentBody, type AgentReport } from "@/lib/my-agent-rules";
import { invoiceMoney } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

function Report({ report }: { report: AgentReport }) {
  const { t } = useI18n();
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(report.rows.length / 20));
  const chart = report.chart;
  return (
    <section className="my-4 min-w-0 space-y-3" aria-label={report.title}>
      <h3 className="font-semibold">{report.title}</h3>
      {chart && chart.points.length > 0 && (
        <div
          className="h-64 w-full min-w-0"
          role="img"
          aria-label={`${chart.type} ${chart.metric}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === "pie" ? (
              <PieChart>
                <Pie
                  data={chart.points}
                  nameKey="label"
                  dataKey="value"
                  fill="var(--chart-1)"
                  label
                />
                <Tooltip />
              </PieChart>
            ) : chart.type === "line" ? (
              <LineChart data={chart.points}>
                <CartesianGrid stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip />
                <Line
                  dataKey="value"
                  name={chart.metric}
                  stroke="var(--chart-1)"
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <BarChart data={chart.points}>
                <CartesianGrid stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar
                  dataKey="value"
                  name={chart.metric}
                  fill="var(--chart-1)"
                  isAnimationActive={false}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <div className="max-w-full overflow-x-auto rounded-md border border-border">
        <table className="w-full text-start text-xs">
          <thead className="bg-muted">
            <tr>
              {report.columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 text-start font-semibold">
                  {t(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.slice(page * 20, page * 20 + 20).map((row, index) => (
              <tr key={index} className="border-t border-border">
                {row.map((value, col) => (
                  <td key={col} className="max-w-60 px-3 py-2 [overflow-wrap:anywhere]">
                    {typeof value === "number"
                      ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
                      : value}
                  </td>
                ))}
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={report.columns.length}>
                  {t("No records found")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {report.count} {t("records")}
        </span>
        {pageCount > 1 && (
          <span className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              title={t("Previous page")}
              aria-label={t("Previous page")}
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            {page + 1} / {pageCount}
            <Button
              variant="ghost"
              size="icon"
              title={t("Next page")}
              aria-label={t("Next page")}
              disabled={page >= pageCount - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </span>
        )}
      </div>
    </section>
  );
}

function EventProposal({ id, onOpen }: { id: string; onOpen: (section: string) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const confirm$ = useServerFn(confirmMyAgentAction);
  const [busy, setBusy] = useState(false);
  const { data: action } = useQuery({
    queryKey: ["agent-action", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_actions")
        .select("id,payload,status,result")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });
  const draft = calendarDraftSchema.safeParse(action?.payload);
  if (!action || !draft.success) return null;
  const act = async (cancel: boolean) => {
    setBusy(true);
    try {
      const result = await confirm$({ data: { id, cancel } });
      if ("error" in result && result.error) toast.error(result.error);
      else toast.success(t(cancel ? "Cancelled" : "Event created"));
      await qc.invalidateQueries({ queryKey: ["agent-action", id] });
      await qc.invalidateQueries({ queryKey: ["calendar-events"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Action failed"));
    } finally {
      setBusy(false);
    }
  };
  const error =
    action.result &&
    typeof action.result === "object" &&
    !Array.isArray(action.result) &&
    typeof action.result["error"] === "string"
      ? action.result["error"]
      : null;
  return (
    <div className="my-4 rounded-md border border-border p-4">
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-1 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 className="font-semibold [overflow-wrap:anywhere]">{draft.data.title}</h3>
          <p className="text-sm text-muted-foreground">
            {draft.data.date} · {draft.data.startTime}–{draft.data.endTime} · Asia/Dubai
          </p>
        </div>
      </div>
      {draft.data.description && (
        <p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
          {draft.data.description}
        </p>
      )}
      {draft.data.attendees.length > 0 && (
        <p className="mt-2 text-xs [overflow-wrap:anywhere]">
          {t("Invitations")}: {draft.data.attendees.join(", ")}
        </p>
      )}
      {action.status === "pending" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void act(false)}>
            <Check />
            {t("Confirm event & invitations")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void act(true)}>
            <X />
            {t("Cancel")}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm font-medium">
          {t(
            action.status === "completed"
              ? "Event created"
              : action.status === "running"
                ? "Creating event…"
                : action.status === "cancelled"
                  ? "Cancelled"
                  : "Check Calendar before retrying",
          )}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {action.status === "failed" ||
      action.status === "unknown" ||
      action.status === "completed" ? (
        <Button className="mt-2" variant="outline" onClick={() => onOpen("calendar")}>
          {t("Open Calendar")}
        </Button>
      ) : null}
    </div>
  );
}

export function AgentResponse({
  body,
  onOpen,
}: {
  body: string;
  onOpen: (section: string) => void;
}) {
  const data = decodeAgentBody(body);
  const { t } = useI18n();
  return (
    <div className="min-w-0 max-w-full space-y-2">
      <MessageResponse>{data.text}</MessageResponse>
      {data.tools.map((tool, index) => (
        <Tool key={index} defaultOpen={false}>
          <ToolHeader
            type="dynamic-tool"
            toolName={tool.name}
            title={t(
              tool.name === "build_report"
                ? "Report"
                : tool.name === "show_invoice"
                  ? "Invoice"
                  : tool.name === "get_contract_template"
                    ? "Contract template"
                    : "Calendar event",
            )}
            state={tool.error ? "output-error" : "output-available"}
          />
          <ToolContent>
            <ToolOutput
              output={tool.error ? null : t("Completed")}
              errorText={tool.error ?? undefined}
            />
          </ToolContent>
        </Tool>
      ))}
      {data.invoices.map((invoice) => (
        <section
          key={invoice.id}
          className="my-4 rounded-md border border-border p-4"
          aria-label={`${t("Invoice")} ${invoice.no}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{invoice.no}</h3>
            <span className="text-xs font-medium text-muted-foreground">{t(invoice.status)}</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {["Service", "Qty", "Price", "Amount"].map((v) => (
                    <th key={v} className="px-2 py-2 text-start">
                      {t(v)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-2">{item.title}</td>
                    <td className="px-2 py-2">{item.qty}</td>
                    <td className="whitespace-nowrap px-2 py-2">{invoiceMoney(item.price)}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {invoiceMoney(item.qty * item.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ms-auto mt-3 grid max-w-64 grid-cols-2 gap-2 text-sm">
            <dt>{t("Subtotal")}</dt>
            <dd className="text-end">{invoiceMoney(invoice.subtotal)}</dd>
            <dt>{t("VAT 5%")}</dt>
            <dd className="text-end">{invoiceMoney(invoice.vat)}</dd>
            <dt className="font-bold">{t("Total")}</dt>
            <dd className="text-end font-bold">{invoiceMoney(invoice.total)}</dd>
          </dl>
          {invoice.due && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("Due")}: {invoice.due}
            </p>
          )}
          {invoice.notes && <p className="mt-2 whitespace-pre-wrap text-xs">{invoice.notes}</p>}
        </section>
      ))}
      {data.contracts.map((contract) => (
        <section key={contract.id} className="my-4 space-y-3 border-t border-border pt-4">
          <h3 className="font-semibold">{contract.name}</h3>
          {contract.clauses.map((clause, i) => (
            <div key={i}>
              <h4 className="font-semibold">{clause.title}</h4>
              <p className="whitespace-pre-wrap text-sm">{clause.body}</p>
            </div>
          ))}
          {contract.rider && <p className="whitespace-pre-wrap text-sm">{contract.rider}</p>}
        </section>
      ))}
      {data.reports.map((report, i) => (
        <Report key={i} report={report} />
      ))}
      {data.actionIds.map((id) => (
        <EventProposal key={id} id={id} onOpen={onOpen} />
      ))}
    </div>
  );
}
