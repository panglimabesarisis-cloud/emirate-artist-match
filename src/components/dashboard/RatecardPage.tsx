import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Info, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { aed } from "@/lib/format";
import { RATE_PRESETS, emptyRate, rateDraft, rateItems, ratePayload, rateScope, type RateDraft, type StoredRate } from "@/lib/ratecard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RatecardFields } from "@/components/shared/RatecardFields";
import { RatecardDetails } from "@/components/shared/RatecardDetails";
import { StudioHeading } from "./StudioPage";
import "./ratecard.css";

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
    <StudioHeading title="Rate" accent="card" badge={<span className="dmr-rc-sync"><i aria-hidden="true" />{t("AI quote engine synced")}</span>}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="dmr-q-stats">{([["Ratecards", String(data.length)], ["Lowest", prices.length ? aed(Math.min(...prices)) : "—"], ["Highest", prices.length ? aed(Math.max(...prices)) : "—"], ["Average", prices.length ? aed(prices.reduce((a, b) => a + b, 0) / prices.length) : "—"]] as const).map(([label, value]) => <div className="dmr-qs" key={label}><small>{t(label)}</small><b className="text-gold" dir="ltr">{value}</b></div>)}</div>
        <Button type="button" variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? <ChevronUp className="me-2 h-4 w-4" /> : <Plus className="me-2 h-4 w-4" />}{t(open ? "Collapse form" : "Add ratecard")}</Button>
      </div>
    </StudioHeading>

    <section id="ratecard-builder" className="dmr-panel dmr-rc-builder dmr-c-12" hidden={!open} aria-label={t("Ratecard builder")}>
      <div className="dmr-rc-head">
        <div>
          <h2>{t(editing ? "Edit ratecard" : "Add ratecard")}{editing && <span className="dmr-rc-edit">{t("Editing")}</span>}</h2>
          <p>{editing ? editing.title : t("Set what the base price covers, add optional extras, and write the rules your AI agent follows when it quotes.")}</p>
        </div>
        {!editing && <div className="dmr-rc-chips">
          <small>{t("Start from")}</small>
          {RATE_PRESETS.map(preset => <Button key={preset.label} type="button" variant="ghost" className="dmr-rc-chip" disabled={busy} onClick={() => { setForm(preset.draft); setMessage(""); }}>{t(preset.label)}</Button>)}
        </div>}
      </div>
      <form noValidate onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-5">
        <RatecardFields value={form} onChange={v => { if (!busy) setForm(v); }} units={units} disabled={busy} />
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <div className="dmr-rc-foot">
          <span className="dmr-rc-note"><Info aria-hidden="true" />{t("Clients and your AI agent see these rates as soon as you save.")}</span>
          <div className="flex gap-3">
            <Button type="button" variant="outline" disabled={busy} onClick={reset}>{t(editing ? "Cancel" : "Reset / clear")}</Button>
            <Button type="submit" disabled={busy} className="bg-gradient-gold text-gold-foreground"><Check className="me-2 h-4 w-4" />{t(busy ? "Saving…" : "Save ratecard")}</Button>
          </div>
        </div>
      </form>
    </section>

    <section className="dmr-panel dmr-q-panel dmr-c-12" aria-label={t("Ratecard list")}>
      <div className="dmr-q-tools">
        <div className="dmr-q-srch relative"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input type="search" aria-label={t("Search ratecards")} placeholder={t("Search service, item or work rules")} className="ps-9" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
        <Select value={unit} onValueChange={v => { setUnit(v); setPage(1); }}><SelectTrigger className="w-40" aria-label={t("Filter by unit")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All units")}</SelectItem>{units.map(u => <SelectItem value={u} key={u}>{t(u)}</SelectItem>)}</SelectContent></Select>
        <Select value={sort} onValueChange={v => { setSort(v); setPage(1); }}><SelectTrigger className="w-44" aria-label={t("Sort ratecards")}><SelectValue /></SelectTrigger><SelectContent>{([["newest", "Newest first"], ["az", "Name A to Z"], ["low", "Price low to high"], ["high", "Price high to low"]] as const).map(([v, text]) => <SelectItem key={v} value={v}>{t(text)}</SelectItem>)}</SelectContent></Select>
        {selected.length > 0 && <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove(selected)}><Trash2 className="me-2 h-4 w-4" />{t("Delete selected")} ({selected.length})</Button>}
      </div>

      {error ? <p role="alert" className="p-5 text-destructive">{t("Could not load ratecards.")} <Button variant="outline" onClick={() => void refresh()}>{t("Retry")}</Button></p> : <div className="dmr-tbl-wrap"><table className="min-w-[720px]">
        <thead><tr>
          <th><input type="checkbox" className="accent-gold" aria-label={t("Select all on this page")} checked={shown.length > 0 && shown.every(r => selected.includes(r.id))} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...shown.map(r => r.id)])] : selected.filter(id => !shown.some(r => r.id === id)))} /></th>
          {["Job / service title", "Base price", "Unit & scope", "Rules of work", "Actions"].map(title => <th key={title}>{t(title)}</th>)}
        </tr></thead>
        <tbody>
          {shown.map(r => <Fragment key={r.id}>
            <tr>
              <td><input type="checkbox" className="accent-gold" aria-label={`${t("Select")} ${r.title}`} checked={selected.includes(r.id)} onChange={e => setSelected(e.target.checked ? [...selected, r.id] : selected.filter(id => id !== r.id))} /></td>
              <td>
                <b>{r.title}</b>
                <Button type="button" variant="ghost" size="sm" className="dmr-rc-more flex" aria-expanded={expanded.includes(r.id)} onClick={() => setExpanded(s => s.includes(r.id) ? s.filter(id => id !== r.id) : [...s, r.id])}>{rateItems(r).length} {t("items")}{expanded.includes(r.id) ? <ChevronUp className="ms-1 h-3 w-3" /> : <ChevronDown className="ms-1 h-3 w-3" />}</Button>
              </td>
              <td><span className="dmr-rc-price" dir="ltr">{aed(Number(r.price))}</span><small>{t("Starting base")}</small></td>
              <td>
                <span className="dmr-rc-scope"><i aria-hidden="true" />{rateScope(r)}</span>
                <small className="dmr-rc-addons">{rateItems(r).filter(i => i.type === "addon").length} {t("optional add-ons")}</small>
              </td>
              <td className="dmr-rc-rules-cell"><p className="dmr-rc-rules line-clamp-3">{r.rules_of_work || r.description || "—"}</p></td>
              <td><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`${t("Edit")} ${r.title}`} disabled={busy} onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`${t("Delete")} ${r.title}`} disabled={busy} onClick={() => void remove([r.id])}><Trash2 className="h-4 w-4" /></Button></div></td>
            </tr>
            {expanded.includes(r.id) && <tr><td colSpan={6}><div className="dmr-rc-exp"><p>{t("Detailed pricing items")}</p><RatecardDetails rate={r} /></div></td></tr>}
          </Fragment>)}
          {shown.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t(isPending ? "Loading…" : data.length ? "No matching ratecards." : "No ratecards yet.")}</td></tr>}
        </tbody>
      </table></div>}

      <div className="dmr-q-foot">
        <span>{rows.length} {t("ratecards")}</span>
        <div className="flex items-center gap-2">
          <Select value={String(size)} onValueChange={v => { setSize(Number(v)); setPage(1); }}><SelectTrigger className="w-28" aria-label={t("Rows per page")}><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50].map(n => <SelectItem key={n} value={String(n)}>{n} / {t("page")}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)}>{t("Prev")}</Button>
          <span>{current} / {pages}</span>
          <Button size="sm" variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)}>{t("Next")}</Button>
        </div>
      </div>
    </section>
  </div>;
}
