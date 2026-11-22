import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, FileSignature, History, ListChecks, RefreshCw, Sparkles, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateLibraries, libraryRefresh } from "@/lib/library-query";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlowBuilder } from "@/components/flow/FlowBuilder";
import { AdminContractTemplates, AdminFormTemplates, AdminModelRates, AdminPrompts } from "./AdminMarketplace";

const LIBRARIES = [
  { id: "contracts", kind: "contract_template", label: "Contract templates", icon: FileSignature },
  { id: "flows", kind: "flow_template", label: "Workflow templates", icon: Workflow },
  { id: "forms", kind: "form_template", label: "Form templates", icon: ListChecks },
  { id: "prompts", kind: "agent_prompt", label: "Agent prompts", icon: Sparkles },
] as const;
type Tab = typeof LIBRARIES[number]["id"] | "usage" | "audit" | "rates";

export function AdminLibrary() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("contracts");
  const bookingTemplates = useQuery({ queryKey: ["admin-library-contract-bookings"], ...libraryRefresh, enabled: tab === "contracts", queryFn: async () => {
    const { data, error } = await supabase.from("bookings").select("contract_template_id").in("status", ["quoted", "confirmed", "completed", "cancelled", "disputed"]);
    if (error) throw error;
    return (data ?? []).map((row) => row.contract_template_id);
  } });
  const catalog = useQuery({ queryKey: ["admin-library-counts"], ...libraryRefresh, queryFn: async () => {
    const [p, f, o, c] = await Promise.all([
      supabase.from("agent_prompts").select("id, title, is_active"),
      supabase.from("ai_flow_templates").select("id, name, published"),
      supabase.from("order_form_templates").select("id, name, is_active"),
      supabase.from("contract_templates").select("id, name, is_active").is("artist_id", null),
    ]);
    for (const result of [p, f, o, c]) if (result.error) throw result.error;
    return [
      ...(p.data ?? []).map((r) => ({ id: r.id, name: r.title, live: r.is_active, kind: "agent_prompt" })),
      ...(f.data ?? []).map((r) => ({ id: r.id, name: r.name, live: r.published, kind: "flow_template" })),
      ...(o.data ?? []).map((r) => ({ id: r.id, name: r.name, live: r.is_active, kind: "form_template" })),
      ...(c.data ?? []).map((r) => ({ id: r.id, name: r.name, live: r.is_active, kind: "contract_template" })),
    ];
  } });
  const usage = useQuery({ queryKey: ["admin-library-usage"], ...libraryRefresh, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_library_usage");
    if (error) throw error;
    return data ?? [];
  } });
  const audit = useQuery({ queryKey: ["admin-library-audit"], ...libraryRefresh, enabled: tab === "audit", queryFn: async () => {
    const { data, error } = await supabase.from("library_audit").select("id, kind, item_id, action, actor, changed_at, summary").order("changed_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data ?? [];
  } });
  const name = (kind: string, id: string) => catalog.data?.find((r) => r.kind === kind && r.id === id)?.name ?? id;
  const label = (kind: string) => t(LIBRARIES.find((r) => r.kind === kind)?.label ?? kind);
  return <div className="space-y-6 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-3xl">{t("Master Library")}</h2><Button variant="outline" size="icon" title={t("Refresh libraries")} aria-label={t("Refresh libraries")} disabled={catalog.isFetching || usage.isFetching} onClick={() => void invalidateLibraries(qc)}><RefreshCw className="size-4" /></Button></div>
    {catalog.error && <p role="alert" className="text-sm text-destructive">{catalog.error.message}</p>}
    <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("Master Library")}>
      {LIBRARIES.map((lib) => {
        const rows = catalog.data?.filter((row) => row.kind === lib.kind);
        const active = rows?.filter((r) => r.live).length;
        const adopted = usage.data?.filter((r) => r.kind === lib.kind).reduce((sum, r) => sum + r.artists_using, 0);
        const Icon = lib.icon;
        return <Button key={lib.id} variant="outline" aria-pressed={tab === lib.id} onClick={() => setTab(lib.id)} className={`h-auto min-h-36 w-full items-start justify-start whitespace-normal rounded-lg p-4 text-start ${tab === lib.id ? "border-gold bg-gold/10" : ""}`}><div className="w-full space-y-3"><div className="flex items-center gap-2"><Icon className="size-5 shrink-0 text-gold" /><span className="font-semibold">{t(lib.label)}</span></div><div className="font-display text-3xl">{active ?? "…"}<span className="ms-2 font-sans text-xs text-muted-foreground">{t("live")} / {rows?.length ?? "…"}</span></div><div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{rows ? rows.length - (active ?? 0) : "…"} {t("draft")}</span><span>{adopted ?? "…"} {t("artist uses")}</span></div></div></Button>;
      })}
    </nav>
    <div className="flex flex-wrap gap-2 border-b border-border pb-4" role="group" aria-label={t("Library reports")}>
      <Button variant={tab === "usage" ? "default" : "outline"} onClick={() => setTab("usage")}><BarChart3 className="size-4" />{t("Usage & sales")}</Button>
      <Button variant={tab === "audit" ? "default" : "outline"} onClick={() => setTab("audit")}><History className="size-4" />{t("Audit history")}</Button>
      <Button variant={tab === "rates" ? "default" : "outline"} onClick={() => setTab("rates")}>{t("AI model rates")}</Button>
    </div>
    {tab === "contracts" && <section className="dmr-wrap dmr-kpage" aria-label={t("Contract templates")}><div className="dmr-panel dmr-c-12"><h2 className="mb-5 font-display text-[28px]">{t("Contract")} <span className="it">{t("templates")}</span></h2><AdminContractTemplates cards bookingTemplates={bookingTemplates.data ?? []} /></div></section>}
    {tab === "flows" && <FlowBuilder artistId={null} libraryOnly />}
    {tab === "forms" && <AdminFormTemplates />}
    {tab === "prompts" && <AdminPrompts />}
    {tab === "rates" && <AdminModelRates />}
    {tab === "usage" && <section className="space-y-4"><h3 className="font-display text-2xl">{t("Usage & sales")}</h3>{usage.error ? <p role="alert" className="text-destructive">{usage.error.message}</p> : usage.isPending ? <p>{t("Loading…")}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Item", "Library", "Artists using", "Purchases", "Revenue (AED, excl. VAT)", "Refunds (AED, excl. VAT)", "Last used"].map((h) => <th key={h} className="p-3 text-start whitespace-nowrap">{t(h)}</th>)}</tr></thead><tbody>{usage.data?.map((r) => <tr key={`${r.kind}:${r.item_id}`} className="border-t border-border"><td className="p-3">{name(r.kind, r.item_id)}</td><td className="p-3">{label(r.kind)}</td><td className="p-3">{r.artists_using}</td><td className="p-3">{r.purchases}</td><td className="p-3">{Number(r.revenue_aed).toFixed(2)}</td><td className="p-3">{Number(r.refunded_aed).toFixed(2)}</td><td className="p-3 whitespace-nowrap">{r.last_used ? new Date(r.last_used).toLocaleString("en-GB") : ""}</td></tr>)}{!usage.data?.length && <tr><td colSpan={7} className="p-6 text-center">{t("No library activity yet")}</td></tr>}</tbody></table></div>}</section>}
    {tab === "audit" && <section className="space-y-4"><h3 className="font-display text-2xl">{t("Audit history")}</h3>{audit.error ? <p role="alert" className="text-destructive">{audit.error.message}</p> : audit.isPending ? <p>{t("Loading…")}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Item", "Library", "Action", "Actor", "Date"].map((h) => <th key={h} className="p-3 text-start">{t(h)}</th>)}</tr></thead><tbody>{audit.data?.map((r) => <tr key={r.id} className="border-t border-border"><td className="p-3">{name(r.kind, r.item_id)}</td><td className="p-3">{label(r.kind)}</td><td className="p-3"><Badge variant="outline">{t(r.action)}</Badge></td><td className="p-3 break-all">{r.actor ?? t("System")}</td><td className="p-3 whitespace-nowrap">{new Date(r.changed_at).toLocaleString("en-GB")}</td></tr>)}{!audit.data?.length && <tr><td colSpan={5} className="p-6 text-center">{t("No changes recorded")}</td></tr>}</tbody></table></div>}</section>}
  </div>;
}
