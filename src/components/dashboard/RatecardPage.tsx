import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { aed } from "@/lib/format";
import { emptyRate, rateDraft, rateItems, ratePayload, rateScope, type RateDraft, type StoredRate } from "@/lib/ratecard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RatecardFields } from "@/components/shared/RatecardFields";
import { RatecardDetails } from "@/components/shared/RatecardDetails";
import { StudioHeading } from "./StudioPage";

type Row = StoredRate & { id: string; sort: number | null; artist_id: string };
export function RatecardPage({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["rates", artistId];
  const { data = [], isPending, error } = useQuery({ queryKey: key, queryFn: async () => {
    const result = await supabase.from("rate_cards").select("*").eq("artist_id", artistId).order("sort");
    if (result.error) throw result.error;
    return result.data;
  }, refetchOnWindowFocus: true });
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<RateDraft>(emptyRate);
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const units = [...new Set(data.flatMap(r => [r.unit_label, ...rateItems(r).map(i => i.unit)]))];
  const rows = useMemo(() => data.filter(r => (unit === "all" || r.unit_label === unit || rateItems(r).some(i => i.unit === unit)) && (!q.trim() || `${r.title} ${r.description ?? ""} ${r.rules_of_work ?? ""} ${JSON.stringify(r.items)}`.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => sort === "az" ? a.title.localeCompare(b.title) : sort === "low" ? Number(a.price) - Number(b.price) : sort === "high" ? Number(b.price) - Number(a.price) : (b.sort ?? 0) - (a.sort ?? 0)), [data, q, unit, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * size, current * size);
  const prices = data.map(r => Number(r.price));
  const reset = () => { setEditing(null); setForm(emptyRate()); setMessage(""); };
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["rates"] }); await qc.invalidateQueries({ queryKey: ["offer-packages", artistId] }); await qc.invalidateQueries({ queryKey: ["invoice-compose", artistId] }); };
  const save = async () => {
    if (busy) return;
    try {
      const row = ratePayload(form);
      if (data.some(r => r.id !== editing?.id && r.title.toLowerCase() === row.title.toLowerCase())) throw new Error(t("This service title already exists. Edit the existing package."));
      setMessage(""); setBusy(true);
      const result = editing ? await supabase.from("rate_cards").update(row).eq("id", editing.id).eq("artist_id", artistId).select("id").single() : await supabase.from("rate_cards").insert({ ...row, artist_id: artistId, sort: Math.max(0, ...data.map(r => r.sort ?? 0)) + 1 }).select("id").single();
      if (result.error) throw result.error;
      setExpanded(s => [...s, result.data.id]);
      await refresh(); reset(); toast.success(t("Ratecard saved"));
    } catch (err) { setMessage(err instanceof Error ? err.message : t("Could not save ratecard. Please try again.")); }
    finally { setBusy(false); }
  };
  const remove = async (ids: string[]) => {
    if (busy || !ids.length || !window.confirm(t("Delete selected ratecards?"))) return;
    setBusy(true);
    try {
      const removed = data.filter(r => ids.includes(r.id));
      const result = await supabase.from("rate_cards").delete().eq("artist_id", artistId).in("id", ids).select("id");
      if (result.error) throw result.error;
      if (result.data.length !== removed.length) throw new Error(t("Some ratecards could not be deleted. Refresh and try again."));
      setSelected(s => s.filter(id => !ids.includes(id))); if (editing && ids.includes(editing.id)) reset();
      await refresh();
      toast.success(t("Ratecard deleted"), { action: { label: t("Undo"), onClick: () => { void (async () => { const result = await supabase.from("rate_cards").insert(removed); if (result.error) toast.error(result.error.message); await refresh(); })(); } } });
    } catch (err) { toast.error(err instanceof Error ? err.message : t("Could not delete ratecard.")); } finally { setBusy(false); }
  };
  const edit = (row: Row) => { setEditing(row); setForm(rateDraft(row)); setMessage(""); setOpen(true); document.getElementById("ratecard-builder")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); };
  return <div className="dmr-wrap dmr-rcpage">
    <StudioHeading title="Rate" accent="card"><div className="flex flex-wrap items-center gap-3"><div className="dmr-q-stats">{[["Ratecards", String(data.length)], ["Lowest", prices.length ? aed(Math.min(...prices)) : "—"], ["Highest", prices.length ? aed(Math.max(...prices)) : "—"], ["Average", prices.length ? aed(prices.reduce((a,b) => a+b,0)/prices.length) : "—"]].map(([label, value]) => <div className="dmr-qs" key={label}><small>{t(label ?? "")}</small><b className="text-gold" dir="ltr">{value}</b></div>)}</div><Button type="button" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronUp className="me-2 h-4 w-4" /> : <Plus className="me-2 h-4 w-4" />}{t(open ? "Collapse form" : "Add ratecard")}</Button></div></StudioHeading>
    <section id="ratecard-builder" className="dmr-c-12 scroll-mt-24 border-y border-border py-5" hidden={!open} aria-label={t("Ratecard builder")}>
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-display text-2xl">{t(editing ? "Edit ratecard" : "Add ratecard")}</h2>{editing && <span className="text-sm text-gold">{editing.title}</span>}</div>
      <form noValidate onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-5">
        <RatecardFields value={form} onChange={v => { if (!busy) setForm(v); }} units={units} disabled={busy} />
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={reset}>{t(editing ? "Cancel" : "Reset / clear")}</Button><Button type="submit" disabled={busy} className="bg-gradient-gold text-gold-foreground"><Check className="me-2 h-4 w-4" />{t(busy ? "Saving…" : "Save ratecard")}</Button></div>
      </form>
    </section>
    <section className="dmr-c-12 min-w-0" aria-label={t("Ratecard list")}>
      <div className="flex flex-wrap items-center gap-3 py-4"><div className="relative min-w-48 flex-1"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input type="search" aria-label={t("Search ratecards")} placeholder={t("Search service, item or work rules")} className="ps-9" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
        <Select value={unit} onValueChange={v => { setUnit(v); setPage(1); }}><SelectTrigger className="w-40" aria-label={t("Filter by unit")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All units")}</SelectItem>{units.map(u => <SelectItem value={u} key={u}>{t(u)}</SelectItem>)}</SelectContent></Select>
        <Select value={sort} onValueChange={v => { setSort(v); setPage(1); }}><SelectTrigger className="w-44" aria-label={t("Sort ratecards")}><SelectValue /></SelectTrigger><SelectContent>{[["newest", "Newest first"], ["az", "Name A to Z"], ["low", "Price low to high"], ["high", "Price high to low"]].map(([v, text]) => <SelectItem key={v} value={v ?? "newest"}>{t(text ?? "")}</SelectItem>)}</SelectContent></Select>
        {selected.length > 0 && <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove(selected)}><Trash2 className="me-2 h-4 w-4" />{t("Delete selected")} ({selected.length})</Button>}
      </div>
      {error ? <p role="alert" className="py-5 text-destructive">{t("Could not load ratecards.")} <Button variant="outline" onClick={() => void refresh()}>{t("Retry")}</Button></p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-start text-sm"><thead className="border-y border-border bg-muted/40 text-xs text-muted-foreground"><tr><th className="p-3"><input type="checkbox" className="accent-gold" aria-label={t("Select all on this page")} checked={shown.length > 0 && shown.every(r => selected.includes(r.id))} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...shown.map(r => r.id)])] : selected.filter(id => !shown.some(r => r.id === id)))} /></th>{["Job / service title", "Base price", "Unit & scope", "Rules of work", "Actions"].map(title => <th className="p-3 text-start" key={title}>{t(title)}</th>)}</tr></thead><tbody>
        {shown.map(r => <Fragment key={r.id}><tr className="border-b border-border"><td className="p-3"><input type="checkbox" className="accent-gold" aria-label={`${t("Select")} ${r.title}`} checked={selected.includes(r.id)} onChange={e => setSelected(e.target.checked ? [...selected, r.id] : selected.filter(id => id !== r.id))} /></td><td className="p-3"><b>{r.title}</b><Button type="button" variant="ghost" size="sm" className="mt-1 flex text-xs text-gold" aria-expanded={expanded.includes(r.id)} onClick={() => setExpanded(s => s.includes(r.id) ? s.filter(id => id !== r.id) : [...s, r.id])}>{rateItems(r).length} {t("items")}{expanded.includes(r.id) ? <ChevronUp className="ms-1 h-3 w-3" /> : <ChevronDown className="ms-1 h-3 w-3" />}</Button></td><td className="whitespace-nowrap p-3 font-semibold text-gold" dir="ltr">{aed(Number(r.price))}</td><td className="p-3">{rateScope(r)}<small className="block text-muted-foreground">{rateItems(r).filter(i => i.type === "addon").length} {t("optional add-ons")}</small></td><td className="max-w-64 p-3"><p className="line-clamp-2 text-muted-foreground">{r.rules_of_work || r.description || "—"}</p></td><td className="p-3"><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`${t("Edit")} ${r.title}`} disabled={busy} onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`${t("Delete")} ${r.title}`} disabled={busy} onClick={() => void remove([r.id])}><Trash2 className="h-4 w-4" /></Button></div></td></tr>{expanded.includes(r.id) && <tr className="border-b border-border"><td colSpan={6} className="p-4"><RatecardDetails rate={r} /></td></tr>}</Fragment>)}
        {shown.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t(isPending ? "Loading…" : data.length ? "No matching ratecards." : "No ratecards yet.")}</td></tr>}
      </tbody></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-muted-foreground"><span>{rows.length} {t("ratecards")}</span><div className="flex items-center gap-2"><Select value={String(size)} onValueChange={v => { setSize(Number(v)); setPage(1); }}><SelectTrigger className="w-28" aria-label={t("Rows per page")}><SelectValue /></SelectTrigger><SelectContent>{[10,25,50].map(n => <SelectItem key={n} value={String(n)}>{n} / {t("page")}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)}>{t("Prev")}</Button><span>{current} / {pages}</span><Button size="sm" variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)}>{t("Next")}</Button></div></div>
    </section>
  </div>;
}
