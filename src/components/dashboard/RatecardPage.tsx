import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, MoreVertical, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StudioHeading } from "./StudioPage";

type Row = { id: string; title: string; price: number; duration_minutes: number | null; description: string | null; sort: number | null; artist_id: string };
type Sort = "az" | "za" | "pl" | "ph" | "ds";
type Filter = { pmin: string; pmax: string; dmin: string; dmax: string; inc: boolean };
const NO_FILTER: Filter = { pmin: "", pmax: "", dmin: "", dmax: "", inc: false };
const JOB_TYPES = ["Host Event", "Wedding MC", "Corporate gala host", "Conference MC", "Stand-up set", "Live performance", "Private party"];
const QUICK_MIN = [30, 60, 90, 120, 180, 240];
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const digits = (v: string) => v.replace(/\D/g, "");
const th = "whitespace-nowrap border-b border-border bg-[#0d1222] px-2.5 py-3 text-start text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";
const td = "border-b border-border px-2.5 py-3.5 align-middle";
const label = "text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground";
const field = "rounded-xl";

/** Ratecard page for artists, laid out as in the design reference: stats, search, sort, filter, list and the always-visible form. */
export function RatecardPage({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["rates", artistId];
  const { data = [], isPending, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await supabase.from("rate_cards").select("id, title, price, duration_minutes, description, sort, artist_id").eq("artist_id", artistId).order("sort");
      if (res.error) throw res.error;
      return (res.data ?? []) as Row[];
    },
  });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("az");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [draftFilter, setDraftFilter] = useState<Filter>(NO_FILTER);
  const [popOpen, setPopOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({ title: "", price: "", minutes: "60", included: "" });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const num = (v: string) => (v === "" ? null : Number(v));
  const cmp: Record<Sort, (a: Row, b: Row) => number> = {
    az: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    za: (a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }),
    pl: (a, b) => a.price - b.price || a.title.localeCompare(b.title),
    ph: (a, b) => b.price - a.price || a.title.localeCompare(b.title),
    ds: (a, b) => (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0) || a.title.localeCompare(b.title),
  };
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const { pmin, pmax, dmin, dmax } = { pmin: num(filter.pmin), pmax: num(filter.pmax), dmin: num(filter.dmin), dmax: num(filter.dmax) };
    return data
      .filter((r) => (!needle || `${r.title} ${r.description ?? ""}`.toLowerCase().includes(needle)) && (pmin == null || r.price >= pmin) && (pmax == null || r.price <= pmax)
        && (dmin == null || (r.duration_minutes ?? 0) >= dmin) && (dmax == null || (r.duration_minutes ?? 0) <= dmax) && (!filter.inc || !!r.description?.trim()))
      .sort(cmp[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, sort, filter]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * size, cur * size);
  const allOn = shown.length > 0 && shown.every((r) => sel.includes(r.id));
  const prices = data.map((r) => Number(r.price));
  const fcount = (filter.pmin !== "" || filter.pmax !== "" ? 1 : 0) + (filter.dmin !== "" || filter.dmax !== "" ? 1 : 0) + (filter.inc ? 1 : 0);

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const reset = () => { setEditing(null); setTried(false); setForm({ title: "", price: "", minutes: "60", included: "" }); };
  const startEdit = (r: Row) => { setEditing(r); setTried(false); setForm({ title: r.title, price: String(r.price), minutes: String(r.duration_minutes ?? ""), included: r.description ?? "" }); document.getElementById("rc-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); };

  const errors = useMemo(() => {
    const e: { title?: string; price?: string; minutes?: string } = {};
    const title = form.title.trim().replace(/\s+/g, " ");
    if (title.length < 2) e.title = t("Enter a job type of at least 2 characters.");
    else if (data.some((r) => r.id !== editing?.id && r.title.toLowerCase() === title.toLowerCase())) e.title = t("You already have this job type. Edit that row instead.");
    if (!/^\d+$/.test(form.price) || Number(form.price) < 1 || Number(form.price) > 1_000_000) e.price = t("Enter a whole price from 1 to 1,000,000.");
    if (!/^\d+$/.test(form.minutes) || Number(form.minutes) < 15 || Number(form.minutes) > 1440) e.minutes = t("Minutes must be from 15 to 1440.");
    return e;
  }, [form, data, editing, t]);

  const save = async () => {
    setTried(true);
    if (errors.title || errors.price || errors.minutes) return;
    setBusy(true);
    const row = { title: form.title.trim().replace(/\s+/g, " "), price: Number(form.price), duration_minutes: Number(form.minutes), description: form.included.trim() || null };
    const res = editing
      ? await supabase.from("rate_cards").update(row).eq("id", editing.id)
      : await supabase.from("rate_cards").insert({ ...row, artist_id: artistId, sort: data.length + 1 });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(editing ? `"${row.title}" ${t("updated")}` : `"${row.title}" ${t("added")}`);
    reset(); setQ(""); void refresh();
  };

  const remove = async (ids: string[]) => {
    const removed = data.filter((r) => ids.includes(r.id));
    if (removed.length === 0) return;
    const { error: err } = await supabase.from("rate_cards").delete().in("id", ids);
    if (err) { toast.error(err.message); return; }
    setSel((s) => s.filter((x) => !ids.includes(x)));
    if (editing && ids.includes(editing.id)) reset();
    void refresh();
    toast(removed.length === 1 ? `"${removed[0]!.title}" ${t("deleted")}` : `${removed.length} ${t("ratecards deleted")}`, {
      duration: 6000,
      action: { label: t("Undo"), onClick: () => { void supabase.from("rate_cards").insert(removed.map((r) => ({ id: r.id, artist_id: artistId, title: r.title, price: r.price, duration_minutes: r.duration_minutes, description: r.description, sort: r.sort }))).then(() => refresh()); } },
    });
  };

  const applyFilter = () => {
    const f = { ...draftFilter };
    if (f.pmin !== "" && f.pmax !== "" && Number(f.pmin) > Number(f.pmax)) [f.pmin, f.pmax] = [f.pmax, f.pmin];
    if (f.dmin !== "" && f.dmax !== "" && Number(f.dmin) > Number(f.dmax)) [f.dmin, f.dmax] = [f.dmax, f.dmin];
    setFilter(f); setPage(1); setPopOpen(false);
  };
  const chips: [string, string, () => void][] = [];
  if (filter.pmin !== "" || filter.pmax !== "") chips.push(["p", `${t("Price")} ${filter.pmin !== "" ? n0(Number(filter.pmin)) : "0"} ${t("to")} ${filter.pmax !== "" ? n0(Number(filter.pmax)) : t("any")}`, () => setFilter({ ...filter, pmin: "", pmax: "" })]);
  if (filter.dmin !== "" || filter.dmax !== "") chips.push(["d", `${t("Minutes")} ${filter.dmin !== "" ? filter.dmin : "0"} ${t("to")} ${filter.dmax !== "" ? filter.dmax : t("any")}`, () => setFilter({ ...filter, dmin: "", dmax: "" })]);
  if (filter.inc) chips.push(["i", t("With details"), () => setFilter({ ...filter, inc: false })]);

  const m = Number(form.minutes), p = Number(form.price);
  const hint = (msg: string | undefined, def: string) => <span className={`min-h-4 text-xs ${tried && msg ? "text-[#ff8a7a]" : "text-muted-foreground/70"}`}>{tried && msg ? msg : def}</span>;
  const stat = (name: string, value: string, gold = false) => <div className="dmr-qs" key={name}><small>{t(name)}</small><b dir="ltr" className={gold ? "text-gold" : ""} style={{ fontSize: 24 }}>{value}</b></div>;

  return (
    <div className="dmr-wrap dmr-rcpage">
      <StudioHeading title="Rate" accent="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="dmr-q-stats">
            {stat("Ratecards", String(data.length), true)}
            {stat("Lowest", prices.length ? `AED ${n0(Math.min(...prices))}` : "-")}
            {stat("Highest", prices.length ? `AED ${n0(Math.max(...prices))}` : "-")}
            {stat("Average", prices.length ? `AED ${n0(prices.reduce((a, b) => a + b, 0) / prices.length)}` : "-")}
          </div>
          <Button className="rounded-full bg-gradient-gold px-5 font-bold text-gold-foreground" onClick={() => { reset(); document.getElementById("rc-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); document.getElementById("rc-t")?.focus({ preventScroll: true }); }}><Plus className="me-1.5 h-4 w-4" />{t("Add ratecard")}</Button>
        </div>
      </StudioHeading>
      <p className="dmr-c-12 -mt-2 text-sm text-muted-foreground">{t("The jobs you offer, with a starting price and how long each one runs. Your AI agent quotes from this list.")}</p>

      <div className="dmr-w-left">
        <section className="dmr-panel dmr-q-panel !p-0" aria-label={t("Ratecard list")}>
          <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-5 py-4">
            <label className="relative flex h-[42px] min-w-40 flex-[1_1_200px] items-center">
              <Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-gold" aria-hidden />
              <span className="sr-only">{t("Search ratecards")}</span>
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Search job type or what is included")} autoComplete="off" className="h-full w-full rounded-[14px] border border-border bg-foreground/[.03] pe-3 ps-10 text-sm outline-none focus-visible:border-gold" />
            </label>
            <label><span className="sr-only">{t("Sort by")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-[42px] rounded-xl border border-border bg-foreground/[.05] px-3 pe-7 text-[13px] font-bold">
                {([["az", "Name A to Z"], ["za", "Name Z to A"], ["pl", "Price low to high"], ["ph", "Price high to low"], ["ds", "Duration short to long"]] as const).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
              </select>
            </label>
            <Popover open={popOpen} onOpenChange={(o) => { if (o) setDraftFilter(filter); setPopOpen(o); }}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="h-[42px] rounded-full px-4 text-[13px]"><SlidersHorizontal className="me-2 h-4 w-4" />{t("Filter")}{fcount > 0 && <span className="ms-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-gold px-1.5 text-[11px] font-extrabold text-gold-foreground">{fcount}</span>}</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(320px,86vw)] rounded-2xl border-border bg-[#0c1120] p-[18px]" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); applyFilter(); } }}>
                <h3 className="mb-3 font-display text-xl">{t("Filter")}</h3>
                <div className="mb-3 grid grid-cols-2 gap-2.5">
                  {([["pmin", "Price from", "AED"], ["pmax", "Price to", "AED"], ["dmin", "Minutes from", "min"], ["dmax", "Minutes to", "max"]] as const).map(([k, l, ph]) => (
                    <div key={k} className="space-y-1.5"><label className={label} htmlFor={`rc-${k}`}>{t(l)}</label><Input id={`rc-${k}`} inputMode="numeric" maxLength={k.startsWith("p") ? 7 : 4} placeholder={ph} value={draftFilter[k]} onChange={(e) => setDraftFilter({ ...draftFilter, [k]: digits(e.target.value) })} className={field} /></div>
                  ))}
                </div>
                <label className="mb-3.5 flex cursor-pointer items-center gap-2.5 text-[13px] text-muted-foreground"><input type="checkbox" className="h-4 w-4 accent-gold" checked={draftFilter.inc} onChange={(e) => setDraftFilter({ ...draftFilter, inc: e.target.checked })} />{t("Only with included details")}</label>
                <div className="flex justify-end gap-2.5"><Button type="button" variant="outline" className="rounded-full" onClick={() => { setDraftFilter(NO_FILTER); setFilter(NO_FILTER); setPage(1); }}>{t("Clear")}</Button><Button type="button" className="rounded-full bg-gradient-gold font-bold text-gold-foreground" onClick={applyFilter}>{t("Apply")}</Button></div>
              </PopoverContent>
            </Popover>
            <label><span className="sr-only">{t("Rows per page")}</span>
              <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} className="h-[42px] rounded-xl border border-border bg-foreground/[.05] px-3 pe-7 text-[13px] font-bold">{[10, 25, 50].map((n) => <option key={n} value={n}>{n} {t("/ page")}</option>)}</select>
            </label>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2 px-5 pt-2.5">
              {chips.map(([k, text, clear]) => <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/[.12] py-[5px] pe-1.5 ps-3 text-xs font-bold">{text}<button type="button" aria-label={`${t("Remove filter")} ${text}`} onClick={() => { clear(); setPage(1); }} className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-foreground/15 hover:text-foreground">×</button></span>)}
            </div>
          )}
          {sel.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gold/[.08] px-5 py-2.5 text-[13px]">
              <span><b>{sel.length}</b> {t("selected")}</span>
              <div className="flex gap-2"><Button size="sm" variant="outline" className="rounded-full" onClick={() => setSel([])}>{t("Clear")}</Button><Button size="sm" className="rounded-full bg-[#e2574c] text-white hover:bg-[#f06a5f]" onClick={() => void remove(sel)}>{t("Delete selected")}</Button></div>
            </div>
          )}
          {error ? <p role="alert" className="p-5 text-destructive">{t("Could not load ratecards.")}</p> : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[13.5px]">
                <thead><tr>
                  <th scope="col" className={`${th} w-10 ps-5`}><input type="checkbox" className="h-4 w-4 accent-gold" aria-label={t("Select all on this page")} checked={allOn} onChange={(e) => setSel(e.target.checked ? [...new Set([...sel, ...shown.map((r) => r.id)])] : sel.filter((x) => !shown.some((r) => r.id === x)))} /></th>
                  <th scope="col" className={th}>{t("Job type")}</th><th scope="col" className={`${th} text-end`}>{t("Price")}</th><th scope="col" className={`${th} text-end`}>{t("Duration")}</th><th scope="col" className={th}>{t("Included")}</th><th scope="col" className={`${th} w-14`}><span className="sr-only">{t("Actions")}</span></th>
                </tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={`transition-colors hover:bg-foreground/[.03] ${editing?.id === r.id ? "bg-gold/[.07]" : ""}`}>
                      <td className={`${td} ps-5`}><input type="checkbox" className="h-4 w-4 accent-gold" aria-label={`${t("Select")} ${r.title}`} checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></td>
                      <td className={td}><b className="block font-bold">{r.title}</b></td>
                      <td className={`${td} whitespace-nowrap text-end tabular-nums`} dir="ltr"><b>AED {n0(Number(r.price))}</b></td>
                      <td className={`${td} whitespace-nowrap text-end tabular-nums`}>{r.duration_minutes ? dur(r.duration_minutes) : "-"}</td>
                      <td className={td}><div className="max-w-60 truncate text-[13px] text-muted-foreground" title={r.description ?? ""}>{r.description || <span className="text-muted-foreground/50">-</span>}</div></td>
                      <td className={`${td} text-end`}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><button type="button" aria-label={`${t("Actions for")} ${r.title}`} className="inline-grid h-[34px] w-[34px] place-items-center rounded-[10px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground aria-expanded:bg-foreground/10"><MoreVertical className="h-[18px] w-[18px]" /></button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-40 rounded-[14px] border-border bg-[#0c1120] p-1.5">
                            <DropdownMenuItem className="rounded-[9px] px-3 py-2.5 font-semibold" onSelect={() => startEdit(r)}><Pencil className="me-2.5 h-4 w-4 text-gold" />{t("Edit")}</DropdownMenuItem>
                            <DropdownMenuItem className="rounded-[9px] px-3 py-2.5 font-semibold text-[#ff8a7a] focus:bg-[#ff8a7a]/10 focus:text-[#ff8a7a]" onSelect={() => void remove([r.id])}><Trash2 className="me-2.5 h-4 w-4" />{t("Delete")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!error && shown.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <span className="grid h-[60px] w-[60px] place-items-center rounded-full border border-gold/25 bg-[radial-gradient(circle,rgba(232,176,74,.22),rgba(232,176,74,.04)_70%)] text-gold"><Search className="h-[22px] w-[22px]" /></span>
              <b className="font-display text-2xl font-normal">{t(isPending ? "Loading…" : q || fcount ? "No matches" : "No ratecards yet")}</b>
              <p className="text-[13px] text-muted-foreground">{t(q || fcount ? "Try another search or clear the filters." : "Add your first job type with the form on the right.")}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span>{rows.length ? `${(cur - 1) * size + 1} ${t("to")} ${(cur - 1) * size + shown.length} ${t("of")} ${rows.length}` : t("0 results")}</span>
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" className="rounded-full" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>{t("Prev")}</Button><span>{t("Page")} {cur} {t("of")} {pages}</span><Button size="sm" variant="outline" className="rounded-full" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>{t("Next")}</Button></div>
          </div>
        </section>
      </div>

      <div className="dmr-w-side">
        <section id="rc-form" className={`dmr-panel sticky top-[84px] max-lg:static ${editing ? "!border-gold/50" : ""}`} aria-labelledby="rc-fh">
          <div className="mb-4">
            <h2 id="rc-fh" className="font-display text-[26px] leading-none">{editing ? t("Edit") : t("Add")} <span className="it">{t("ratecard")}</span></h2>
            <p className="mt-1 text-xs text-muted-foreground">{editing ? `${t("Changing")} "${editing.title}". ${t("Save to update the list.")}` : t("One row per kind of job you take.")}</p>
          </div>
          <form noValidate className="grid gap-3.5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="space-y-2"><label className={label} htmlFor="rc-t">{t("Job type")}</label>
              <Input id="rc-t" list="rc-tl" maxLength={60} autoComplete="off" placeholder={t("e.g. Host Event")} value={form.title} aria-invalid={tried && !!errors.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={field} />
              <datalist id="rc-tl">{JOB_TYPES.map((j) => <option key={j} value={j} />)}</datalist>
              {hint(errors.title, "")}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><label className={label} htmlFor="rc-p">{t("Price (AED)")}</label>
                <div className="relative"><span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-gold">AED</span><Input id="rc-p" inputMode="numeric" maxLength={7} autoComplete="off" value={form.price} aria-invalid={tried && !!errors.price} onChange={(e) => setForm({ ...form, price: digits(e.target.value) })} className={`${field} !ps-[50px]`} dir="ltr" /></div>
                {hint(errors.price, t("Excluding VAT."))}</div>
              <div className="space-y-2"><label className={label} htmlFor="rc-m">{t("Minutes")}</label>
                <Input id="rc-m" inputMode="numeric" maxLength={4} autoComplete="off" value={form.minutes} aria-invalid={tried && !!errors.minutes} onChange={(e) => setForm({ ...form, minutes: digits(e.target.value) })} className={field} />
                {hint(errors.minutes, t("15 to 1440."))}</div>
            </div>
            <div className="-mt-1 flex flex-wrap gap-1.5" role="group" aria-label={t("Common durations")}>
              {QUICK_MIN.map((v) => <button key={v} type="button" aria-pressed={m === v} onClick={() => setForm({ ...form, minutes: String(v) })} className={`rounded-full border px-2.5 py-[5px] text-xs font-bold transition-colors ${m === v ? "border-transparent bg-gradient-gold text-gold-foreground" : "border-border text-muted-foreground hover:bg-gradient-gold hover:text-gold-foreground"}`}>{dur(v)}</button>)}
            </div>
            <div className="space-y-2"><label className={`${label} flex justify-between`} htmlFor="rc-i"><span>{t("What is included")}</span><span className="normal-case tracking-normal">{form.included.length} / 300</span></label>
              <Textarea id="rc-i" rows={4} maxLength={300} placeholder={t("e.g. Sound check, bilingual hosting, 1 rehearsal")} value={form.included} onChange={(e) => setForm({ ...form, included: e.target.value })} className={field} />
              <span className="text-xs text-muted-foreground/70">{t("Optional. Clients and your AI agent see this.")}</span></div>
            <div className="min-h-5 rounded-xl bg-foreground/[.04] px-3.5 py-3 text-[12.5px] text-muted-foreground" aria-live="polite">
              {p > 0 && m > 0 ? <><b className="text-foreground">AED {n0(p)}</b> {t("for")} <b className="text-foreground">{dur(m)}</b>. {t("About")} <b className="text-foreground">AED {n0((p / m) * 60)}</b> {t("per hour.")}</> : t("Fill in the price and minutes to see the hourly rate.")}
            </div>
            <div className="flex gap-2.5">
              {editing && <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={reset}>{t("Cancel")}</Button>}
              <Button type="submit" disabled={busy} className="flex-1 rounded-full bg-gradient-gold font-bold text-gold-foreground"><Check className="me-1.5 h-4 w-4" />{editing ? t("Save changes") : t("Add ratecard")}</Button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
