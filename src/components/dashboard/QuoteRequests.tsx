import { BulkBar, useHideRows } from "./BulkSelect";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpDown, Check, FileText, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";

type Status = "new" | "replied" | "closed";
type Quote = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  message: string | null;
  event_date: string | null;
  guests: number | null;
  budget: number | null;
  created_at: string;
  event_types: { name: string } | null;
  areas: { name: string } | null;
};
type SortKey = "name" | "email" | "event" | "event_date" | "area" | "guests" | "budget" | "status";
const TABS: Array<["all" | Status, string]> = [
  ["all", "All"],
  ["new", "New"],
  ["replied", "Replied"],
  ["closed", "Closed"],
];

const badge: Record<string, string> = {
  new: "border-gold/40 bg-gold/10 text-gold",
  replied: "border-success/40 bg-success/10 text-success",
  closed: "border-border bg-foreground/5 text-muted-foreground",
};
const value = (q: Quote, k: SortKey): string | number => {
  switch (k) {
    case "event":
      return q.event_types?.name ?? "";
    case "area":
      return q.areas?.name ?? "";
    case "guests":
      return q.guests ?? 0;
    case "budget":
      return q.budget ?? 0;
    case "event_date":
      return q.event_date ?? "";
    case "email":
      return q.email ?? "";
    case "status":
      return q.status;
    default:
      return q.name;
  }
};
const cell = "border-b border-border px-3.5 py-3.5";
const headCell = "border-b border-border bg-card px-3.5 py-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";

export function QuoteRequests({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["artist-quotes", artistId];
  const {
    data = [],
    isPending,
    error,
  } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await supabase
        .from("quote_requests")
        .select("*, event_types(name), areas(name)")
        .eq("artist_id", artistId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as unknown as Quote[];
    },
  });
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | Status>("all");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "event_date", dir: -1 });
  const [sel, setSel] = useState<string[]>([]);
  const hide = useHideRows("soft_delete_quote_requests", [key], () => setSel([]));

  const counts = useMemo(
    () => ({
      all: data.length,
      new: data.filter((x) => x.status === "new").length,
      replied: data.filter((x) => x.status === "replied").length,
      closed: data.filter((x) => x.status === "closed").length,
    }),
    [data],
  );
  const totalBudget = data.reduce((s, x) => s + Number(x.budget ?? 0), 0);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = data.filter(
      (x) =>
        (tab === "all" || x.status === tab) &&
        (!s || [x.name, x.email, x.phone, x.event_types?.name, x.areas?.name, x.message].join(" ").toLowerCase().includes(s)),
    );
    return [...list].sort((a, b) => {
      const A = value(a, sort.k);
      const B = value(b, sort.k);
      return (typeof A === "number" && typeof B === "number" ? A - B : String(A).localeCompare(String(B))) * sort.dir;
    });
  }, [data, q, tab, sort]);
  const allOn = rows.length > 0 && rows.every((r) => sel.includes(r.id));

  const mark = async (ids: string[], status: Status) => {
    if (!ids.length) return;
    const { error: err } = await supabase.from("quote_requests").update({ status }).in("id", ids);
    if (err) {
      toast.error(err.message);
      return;
    }
    setSel([]);
    toast.success(status === "replied" ? t("Marked as replied") : t("Closed"));
    qc.invalidateQueries({ queryKey: key });
  };
  const th = (k: SortKey, label: string, num = false) => (
    <th
      scope="col"
      aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
      className={`whitespace-nowrap ${headCell} ${num ? "text-end" : "text-start"}`}
    >
      <Button variant="ghost"
        type="button"
        onClick={() => setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : 1 })}
        className={`inline-flex items-center gap-1.5 uppercase transition-colors hover:text-foreground ${sort.k === k ? "text-gold" : ""}`}
      >
        {t(label)}
        <ArrowUpDown className={`h-3 w-3 ${sort.k === k ? "opacity-100" : "opacity-40"}`} aria-hidden />
      </Button>
    </th>
  );
  const stats: Array<[string, string, boolean]> = [
    [t("New"), String(counts.new), true],
    [t("Replied"), String(counts.replied), false],
    [t("Total budget"), aed(totalBudget), false],
  ];

  return (
    <div className="dmr-wrap dmr-qpage">
      <section className="dmr-q-head dmr-c-12" aria-labelledby="q-h">
        <div>
          <h1 id="q-h" className="font-display text-5xl leading-none">
            {t("Quote")} <span className="it">{t("requests")}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {t("Every request sent from your public profile and order form. Reply, update the details, or close the ones that went nowhere.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {stats.map(([l, v, gold]) => (
            <div key={l} className={`min-w-[120px] rounded-2xl border bg-gradient-to-b from-card to-background px-4 py-3 ${gold ? "border-gold/40" : "border-border"}`}>
              <small className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{l}</small>
              <b className={`font-display text-2xl ${gold ? "text-gold" : ""}`}>{v}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="dmr-panel dmr-q-panel dmr-c-12" aria-label={t("Quote requests table")}>
        <div className="dmr-q-tools">
          <label className="relative flex max-w-md flex-1 basis-80 items-center">
            <Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t("Search quote requests")}</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Search name, email, event, venue, notes")}
              className="h-10 w-full rounded-full border border-border bg-foreground/[.04] pe-4 ps-10 text-sm outline-none focus-visible:border-gold"
            />
          </label>
          <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Filter by status")}>
            {TABS.map(([k, l]) => (
              <Button variant="ghost"
                key={k}
                type="button"
                aria-pressed={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-[10px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${tab === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t(l)} <span className="opacity-60">{counts[k]}</span>
              </Button>
            ))}
          </div>
        </div>
        <BulkBar count={sel.length} busy={hide.busy} onClear={() => setSel([])} onDelete={() => void hide.run(sel, "quote requests")}>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => mark(sel, "replied")}><Check className="me-1 h-3.5 w-3.5" />{t("Mark replied")}</Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => mark(sel, "closed")}><X className="me-1 h-3.5 w-3.5" />{t("Close")}</Button>
        </BulkBar>
        {error && (
          <p role="alert" className="p-5 text-destructive">
            {t("Could not load quote requests.")}
          </p>
        )}
        <div className="dmr-tbl-wrap">
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-[13.5px]" data-studio-table="true">
            <thead>
              <tr>
                <th scope="col" className={`w-10 ${headCell}`}>
                  <input
                    type="checkbox"
                    className="accent-gold"
                    aria-label={t("Select all")}
                    checked={allOn}
                    onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])}
                  />
                </th>
                {th("name", "Client")}
                {th("email", "Email")}
                <th scope="col" className={`text-start ${headCell}`}>
                  {t("Phone")}
                </th>
                {th("event", "Event")}
                {th("event_date", "Date")}
                {th("area", "Venue")}
                {th("guests", "Guests", true)}
                {th("budget", "Budget (AED)", true)}
                <th scope="col" className={`text-start ${headCell}`}>
                  {t("Notes")}
                </th>
                {th("status", "Status")}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-foreground/[.03]">
                  <td className={cell}>
                    <input
                      type="checkbox"
                      className="accent-gold"
                      aria-label={`${t("Select")} ${r.name}`}
                      checked={sel.includes(r.id)}
                      onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))}
                    />
                  </td>
                  <td className={`whitespace-nowrap ${cell}`} data-label={t("Client")}>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-gold text-sm font-bold text-gold-foreground" aria-hidden>
                        {r.name.slice(0, 1).toUpperCase()}
                      </span>
                      <b>{r.name}</b>
                    </div>
                  </td>
                  <td className={`whitespace-nowrap ${cell}`} data-label={t("Email")}>
                    {r.email ? (
                      <a className="hover:text-gold" href={`mailto:${r.email}`}>
                        {r.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`whitespace-nowrap text-muted-foreground ${cell}`} data-label={t("Phone")}>{r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : "—"}</td>
                  <td className={`whitespace-nowrap ${cell}`} data-label={t("Event")}>{r.event_types?.name ?? "—"}</td>
                  <td className={`whitespace-nowrap ${cell}`} data-label={t("Date")}>
                    {r.event_date
                      ? new Date(`${r.event_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : t("Not set")}
                  </td>
                  <td className={`whitespace-nowrap ${cell}`} data-label={t("Venue")}>{r.areas?.name ?? "—"}</td>
                  <td className={`text-end ${cell}`} data-label={t("Guests")}>{r.guests?.toLocaleString("en-US") ?? "—"}</td>
                  <td className={`text-end font-bold text-gold ${cell}`} dir="ltr" data-label={t("Budget (AED)")}>
                    {r.budget ? Number(r.budget).toLocaleString("en-US") : "—"}
                  </td>
                  <td className={`max-w-[220px] truncate text-muted-foreground ${cell}`} title={r.message ?? ""} data-label={t("Notes")}>
                    {r.message || t("None")}
                  </td>
                  <td className={cell} data-label={t("Status")}>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize ${badge[r.status] ?? badge["closed"]}`}>{t(r.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="grid place-items-center gap-2 px-6 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
              <FileText className="h-6 w-6" aria-hidden />
            </span>
            <b className="font-display text-2xl">{isPending ? t("Loading…") : t("No quote requests")}</b>
            {!isPending && <p className="text-sm text-muted-foreground">{t("Requests from your profile appear here.")}</p>}
          </div>
        )}
        <div className="flex justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span>
            {rows.length} / {data.length}
          </span>
          <span>{t("Prices in AED")}</span>
        </div>
      </section>
    </div>
  );
}
