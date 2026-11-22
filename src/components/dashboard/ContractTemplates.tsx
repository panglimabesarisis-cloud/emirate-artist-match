import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, DollarSign, FileSignature, Lock, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { libraryRefresh } from "@/lib/library-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { CONTRACT_PLACEHOLDERS, type Clause } from "@/lib/contract-terms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioEmpty } from "./StudioPage";
import { useArtistPlan } from "./PromptLibrary";
import { ContractPreviewDialog, type ContractDoc } from "./ContractPreview";

export type Template = { id: string; artist_id: string | null; name: string; category: string | null; role: string | null; description: string | null; clauses: Clause[]; rider: string | null; tier: string; is_active: boolean; price_aed?: number; version?: number; unlocked?: boolean };

const asClauses = (v: unknown): Clause[] => (Array.isArray(v) ? (v as Array<Record<string, unknown>>).filter((c) => c && typeof c["title"] === "string" && typeof c["body"] === "string").map((c) => ({ title: String(c["title"]), body: String(c["body"]) })) : []);

/** Library templates the artist may read (active ones) plus the artist's own templates, with the plan limits that decide which can be used. */
export function useContractTemplates(artistId: string) {
  const plan = useArtistPlan(artistId);
  const list = useQuery({
    queryKey: ["contract-templates", artistId], ...libraryRefresh,
    queryFn: async () => {
      const res = await supabase.rpc("list_contract_templates", { _artist: artistId });
      if (res.error) throw res.error;
      return (res.data ?? []).map((r) => ({ ...r, clauses: asClauses(r.clauses) })) as Template[];
    },
  });
  const rank = useMemo(() => new Map((plan.data?.tiers ?? []).map((x) => [x.code, x.sort])), [plan.data]);
  const myRank = rank.get(plan.data?.code ?? "free") ?? 1;
  const usable = (tpl: Template) => tpl.unlocked === true;
  return { templates: list.data ?? [], isPending: list.isPending, error: list.error, plan, rank, myRank, usable };
}

/** "Use contract" cell: pick the template for a booking until the client accepts; locked afterwards. */
export function TemplatePicker({ artistId, bookingId, templateId, locked }: { artistId: string; bookingId: string; templateId: string | null; locked: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { templates, usable } = useContractTemplates(artistId);
  const current = templates.find((x) => x.id === templateId);
  const choose = async (id: string | null) => {
    const { error } = await supabase.rpc("use_contract_template", { _booking: bookingId, _template: id as string });
    if (error) { toast.error(error.message); return; }
    toast.success(id ? t("Contract template selected") : t("Standard terms will be used"));
    void qc.invalidateQueries({ queryKey: ["contracts", artistId] });
  };
  if (locked) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={t("Accepted contracts are locked")}><Lock className="h-3.5 w-3.5" aria-hidden />{current?.name ?? t("Standard terms")}</span>;
  }
  const own = templates.filter((x) => x.artist_id !== null);
  const lib = templates.filter((x) => x.artist_id === null && usable(x));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[210px] rounded-full"><span className="truncate">{current?.name ?? t("Choose template")}</span><ChevronDown className="ms-1 h-3.5 w-3.5 shrink-0" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuItem onSelect={() => void choose(null)}>{t("Standard terms")}</DropdownMenuItem>
        {own.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel>{t("Your templates")}</DropdownMenuLabel>{own.map((x) => <DropdownMenuItem key={x.id} onSelect={() => void choose(x.id)}>{x.name}</DropdownMenuItem>)}</>}
        {lib.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel>Dealmaker</DropdownMenuLabel>{lib.map((x) => <DropdownMenuItem key={x.id} onSelect={() => void choose(x.id)}>{x.name}</DropdownMenuItem>)}</>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const blankTemplate: Template = { id: "", artist_id: null, name: "", category: null, role: null, description: null, clauses: [], rider: null, tier: "free", is_active: true };
/** A template as the sample sheet: placeholders stay visible. */
function templateDoc(tpl: Template, t: (s: string) => string): ContractDoc {
  return { number: "TEMPLATE", templateName: tpl.name || t("Untitled template"), stamp: { word: "TEMPLATE", sub: (tpl.role ?? "").toUpperCase(), tone: "template" }, intro: t("This agreement is made through the Dealmaker platform between the parties below. Placeholders such as {artist} and {client} are filled in for each booking."), clauses: tpl.clauses, rider: tpl.rider, footer: t("Sample sheet. The terms are filled in when you attach this template to a booking.") };
}

type Draft = { id?: string; name: string; category: string; role: string; description: string; clauses: Clause[]; rider: string };
const CATEGORIES = ["Performers", "Screen and broadcast", "Hosts and moderators", "Speakers", "Models", "Brand and digital"];
const FIELD = "w-full rounded-[10px] border bg-foreground/[.04] px-3 py-2.5 text-sm outline-none focus-visible:border-gold";
const blank: Draft = { name: "", category: "", role: "", description: "", clauses: [{ title: "", body: "" }], rider: "" };

export function ContractTemplateLibrary({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { templates, isPending, error, plan, rank, myRank } = useContractTemplates(artistId);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [size, setSize] = useState(20);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<Template | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [previewing, setPreviewing] = useState(false);
  const areas = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusIdx = useRef(0);

  const visible = templates.filter((x) => x.artist_id !== null || x.is_active);
  const cats = ["All", ...Array.from(new Set(visible.map((x) => x.category ?? "Other"))).sort()];
  const catCount = (c: string) => (c === "All" ? visible.length : visible.filter((x) => (x.category ?? "Other") === c).length);
  const needle = q.trim().toLowerCase();
  const filtered = visible.filter((x) => (cat === "All" || (x.category ?? "Other") === cat) && (tier === "all" || x.tier === tier) && (!needle || `${x.name} ${x.role ?? ""} ${x.description ?? ""}`.toLowerCase().includes(needle)));
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  const shown = filtered.slice(cur * size, cur * size + size);
  const tierName = (code: string) => plan.data?.tiers.find((x) => x.code === code)?.name ?? code;
  const ownCount = templates.filter((x) => x.artist_id !== null).length;

  /** Marks the fields that need attention and returns whether the draft can be saved or previewed. */
  const valid = () => {
    if (!edit) return false;
    const flags: Record<string, boolean> = {};
    if (!edit.name.trim()) flags["name"] = true;
    edit.clauses.forEach((c, k) => { if (!c.title.trim()) flags[`t${k}`] = true; if (!c.body.trim()) flags[`b${k}`] = true; });
    setBad(flags);
    if (edit.clauses.length === 0) { setErr(t("Add at least one clause.")); return false; }
    if (Object.keys(flags).length) { setErr(t("Give the template a name and fill in every clause title and text.")); document.getElementById(flags["name"] ? "tp-name" : `tc-${Object.keys(flags)[0]!.startsWith("t") ? "t" : "b"}${Object.keys(flags)[0]!.slice(1)}`)?.focus(); return false; }
    setErr("");
    return true;
  };
  const insertPlaceholder = (ph: string) => {
    if (!edit) return;
    const i = Math.min(focusIdx.current, edit.clauses.length - 1);
    const ta = areas.current[i];
    const at = ta?.selectionStart ?? edit.clauses[i]!.body.length, end = ta?.selectionEnd ?? at;
    const body = edit.clauses[i]!.body;
    setClause(i, { body: body.slice(0, at) + ph + body.slice(end) });
    window.setTimeout(() => { ta?.focus(); ta?.setSelectionRange(at + ph.length, at + ph.length); }, 0);
  };
  const moveClause = (k: number, d: number) => edit && setEdit((cur) => { if (!cur) return cur; const n = [...cur.clauses]; const j = k + d; if (j < 0 || j >= n.length) return cur; [n[k], n[j]] = [n[j]!, n[k]!]; return { ...cur, clauses: n }; });
  const save = async () => {
    if (!edit || !valid()) return;
    const clauses = edit.clauses.map((c) => ({ title: c.title.trim(), body: c.body.trim() }));
    const row = { name: edit.name.trim().slice(0, 100), category: edit.category.trim() || null, role: edit.role.trim() || null, description: edit.description.trim() || null, clauses: clauses as unknown as Json, rider: edit.rider.trim() || null };
    setSaving(true);
    const { error: err } = edit.id ? await supabase.from("contract_templates").update(row).eq("id", edit.id) : await supabase.from("contract_templates").insert({ ...row, artist_id: artistId, tier: "free" });
    setSaving(false);
    if (err) { toast.error(err.message); return; }
    toast.success(t("Template saved")); setEdit(null); void qc.invalidateQueries({ queryKey: ["contract-templates", artistId] });
  };
  const remove = async (tpl: Template) => {
    if (!confirm(t("Delete this template? Contracts already accepted keep their terms."))) return;
    const { error: err } = await supabase.from("contract_templates").delete().eq("id", tpl.id);
    if (err) { toast.error(err.message); return; }
    void qc.invalidateQueries({ queryKey: ["contract-templates", artistId] });
  };
  const setClause = (i: number, patch: Partial<Clause>) => edit && setEdit({ ...edit, clauses: edit.clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <section className="dmr-panel dmr-c-12" aria-labelledby="ct-lib-h">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ct-lib-h" className="font-display text-[28px] leading-none">{t("Contract")} <span className="it">{t("templates")}</span></h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("Formal templates you can attach to any booking")}</p>
        </div>
        <Button className="rounded-full bg-gradient-gold font-bold text-gold-foreground" disabled={ownCount >= 10} title={ownCount >= 10 ? t("You can keep up to 10 own templates") : ""} onClick={() => setEdit({ ...blank, clauses: [{ title: "", body: "" }] })}><Plus className="me-1 h-4 w-4" />{t("New template")}</Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Filter templates by category")}>
          {cats.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => { setCat(c); setPage(0); }} className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${cat === c ? "border-transparent bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>{c === "All" ? t("All") : c} <b className="opacity-60">{catCount(c)}</b></button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center"><Search className="pointer-events-none absolute start-3 h-4 w-4 text-muted-foreground" aria-hidden /><span className="sr-only">{t("Search templates")}</span>
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={`${t("Search")} ${visible.length} ${t("templates")}`} className="h-9 w-56 rounded-full border border-border bg-foreground/[.04] pe-3 ps-9 text-sm outline-none focus-visible:border-gold" /></label>
          <Select value={tier} onValueChange={(v) => { setTier(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-36" aria-label={t("Filter by plan")}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("All plans")}</SelectItem>{(plan.data?.tiers ?? []).map((x) => <SelectItem key={x.code} value={x.code}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {error ? <p role="alert" className="text-destructive">{t("Could not load templates.")}</p> : isPending ? <p className="text-sm text-muted-foreground">{t("Loading…")}</p> : shown.length === 0 ? <StudioEmpty title={visible.length === 0 ? t("No templates yet") : t("No template matches your search.")} /> : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((x) => {
            const locked = x.unlocked !== true;
            const tierLocked = (rank.get(x.tier) ?? 99) > myRank;
            return (
              <li key={x.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold/10 text-gold"><FileSignature className="h-4 w-4" aria-hidden /></span>
                  <div className="min-w-0">
                    <b className="block truncate">{x.name}</b>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {x.category && <Badge variant="outline">{x.category}</Badge>}
                      {x.artist_id === null ? <Badge variant="secondary">Dealmaker</Badge> : <Badge className="bg-gold/20 text-gold">{t("Yours")}</Badge>}
                      {x.tier !== "free" && <Badge variant="outline">{tierName(x.tier)}+</Badge>}
                      {!locked && <Badge variant="outline">{x.clauses.length} {t("clauses")}</Badge>}
                      {x.version && <Badge variant="outline">v{x.version}</Badge>}
                      {Number(x.price_aed) > 0 && <Badge variant="outline">AED {Number(x.price_aed).toFixed(2)} + {t("VAT 5%")}</Badge>}
                    </div>
                  </div>
                </div>
                {x.description && <p className="text-xs text-muted-foreground">{x.description}</p>}
                <div className="mt-auto flex items-center justify-end gap-1 pt-1">
                  {locked && <span className="me-auto inline-flex items-center gap-1 text-xs text-gold"><Lock className="h-3 w-3" aria-hidden />{tierLocked ? `${t("Needs")} ${tierName(x.tier)}` : t("Purchase required")}</span>}
                  {locked
                    ? <Button size="icon" variant="ghost" title={t("Locked: not part of your plan")} aria-label={`${t("Locked template")} ${x.name}`} onClick={() => setView(x)}><span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-gold text-gold-foreground"><DollarSign className="h-4 w-4" strokeWidth={3} /></span></Button>
                    : <Button size="sm" variant="outline" className="rounded-full" onClick={() => setView(x)}>{t("Preview")}</Button>}
                  {x.artist_id !== null && <>
                    <Button size="icon" variant="ghost" aria-label={`${t("Edit")} ${x.name}`} onClick={() => setEdit({ id: x.id, name: x.name, category: x.category ?? "", role: x.role ?? "", description: x.description ?? "", clauses: x.clauses.length ? x.clauses : [{ title: "", body: "" }], rider: x.rider ?? "" })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`${t("Delete")} ${x.name}`} onClick={() => void remove(x)}><Trash2 className="h-4 w-4" /></Button>
                  </>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">{t("Templates per page")}
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="h-8 rounded-md border border-border bg-transparent px-2 text-xs">{[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <span className="text-xs text-muted-foreground">{filtered.length === 0 ? "0" : `${cur * size + 1}–${Math.min(filtered.length, cur * size + size)}`} {t("of")} {filtered.length}</span>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>{t("Prev")}</Button><Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>{t("Next")}</Button></div>
      </div>

      <ContractPreviewDialog doc={view ? templateDoc(view, t) : null} title={view ? `${view.name} ${t("· template")}` : ""} locked={!!view && view.unlocked !== true} purchaseRequired={!!view && Number(view.price_aed) > 0 && (rank.get(view.tier) ?? 99) <= myRank} planName={view ? tierName(view.tier) : ""} artistId={artistId} onClose={() => setView(null)} />
      <ContractPreviewDialog doc={previewing && edit ? templateDoc({ ...blankTemplate, name: edit.name.trim(), role: edit.role.trim() || null, clauses: edit.clauses, rider: edit.rider.trim() || null }, t) : null} title={`${edit?.name.trim() || t("Template")} ${t("· template")}`} artistId={artistId} onClose={() => setPreviewing(false)} />

      <Dialog open={!!edit && !previewing} onOpenChange={(o) => { if (!o && !saving) { setEdit(null); setErr(""); setBad({}); } }}>
        <DialogContent className="max-h-[92dvh] w-[min(760px,calc(100vw-24px))] max-w-none overflow-y-auto rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120]">
          <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl font-normal">{edit?.id ? t("Edit template") : t("New template")}</DialogTitle>
            <DialogDescription className="sr-only">{t("Use placeholders")}</DialogDescription></DialogHeader>
          {edit && (
            <form noValidate className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-2"><Label htmlFor="tp-name" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Template name")}</Label><input id="tp-name" required maxLength={100} value={edit.name} aria-invalid={!!bad["name"]} onChange={(e) => { setEdit({ ...edit, name: e.target.value }); setBad({ ...bad, name: false }); setErr(""); }} className={`${FIELD} ${bad["name"] ? "border-[#e2574c]" : "border-border"}`} /></div>
                <div className="space-y-2"><Label htmlFor="tp-cat" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Category")}</Label>
                  <select id="tp-cat" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className={`${FIELD} border-border`}>
                    <option value="">{t("Choose")}</option>{[...CATEGORIES, ...(edit.category && !CATEGORIES.includes(edit.category) ? [edit.category] : [])].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor="tp-role" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Role label")}</Label><input id="tp-role" maxLength={40} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} className={`${FIELD} border-border`} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground"><span>{t("Insert into clause:")}</span>
                <div className="flex flex-wrap gap-1.5">{CONTRACT_PLACEHOLDERS.map((ph) => <button key={ph} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertPlaceholder(`{${ph}}`)} className="rounded-lg border border-dashed border-gold/40 px-2 py-1 font-mono text-[11.5px] text-gold hover:bg-gold/10">{`{${ph}}`}</button>)}</div></div>
              <p className="text-xs text-muted-foreground">{t("Each clause becomes an Article. Leave an empty line inside a clause to start a numbered sub-clause (1.1, 1.2).")}</p>
              <ol className="my-2 flex list-none flex-col gap-2.5">
                {edit.clauses.map((c, k) => (
                  <li key={k} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2.5 rounded-[14px] border border-border bg-foreground/[.02] p-3">
                    <span className="font-display text-[22px] leading-[1.6] text-gold" aria-hidden>{k + 1}</span>
                    <div className="flex min-w-0 flex-col gap-2">
                      <label className="sr-only" htmlFor={`tc-t${k}`}>{t("Clause")} {k + 1} {t("title")}</label>
                      <input id={`tc-t${k}`} value={c.title} maxLength={120} placeholder={t("Clause title")} aria-invalid={!!bad[`t${k}`]} onChange={(e) => { setClause(k, { title: e.target.value }); setBad({ ...bad, [`t${k}`]: false }); setErr(""); }} className={`${FIELD} font-bold ${bad[`t${k}`] ? "border-[#e2574c]" : "border-border"}`} />
                      <label className="sr-only" htmlFor={`tc-b${k}`}>{t("Clause")} {k + 1} {t("text")}</label>
                      <textarea id={`tc-b${k}`} ref={(el) => { areas.current[k] = el; }} value={c.body} maxLength={2000} placeholder={t("Clause text")} aria-invalid={!!bad[`b${k}`]} onFocus={() => { focusIdx.current = k; }} onChange={(e) => { setClause(k, { body: e.target.value }); setBad({ ...bad, [`b${k}`]: false }); setErr(""); }} className={`${FIELD} min-h-[130px] resize-y leading-normal ${bad[`b${k}`] ? "border-[#e2574c]" : "border-border"}`} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button type="button" size="icon" variant="ghost" className="h-[30px] w-[30px]" aria-label={`${t("Move clause")} ${k + 1} ${t("up")}`} disabled={k === 0} onClick={() => moveClause(k, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-[30px] w-[30px]" aria-label={`${t("Move clause")} ${k + 1} ${t("down")}`} disabled={k === edit.clauses.length - 1} onClick={() => moveClause(k, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button type="button" size="icon" variant="ghost" className="h-[30px] w-[30px] hover:text-red-300" aria-label={`${t("Remove clause")} ${k + 1}`} onClick={() => setEdit({ ...edit, clauses: edit.clauses.filter((_, j) => j !== k) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </li>
                ))}
              </ol>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => { setEdit({ ...edit, clauses: [...edit.clauses, { title: "", body: "" }] }); window.setTimeout(() => document.getElementById(`tc-t${edit.clauses.length}`)?.focus(), 30); }}><Plus className="me-1.5 h-3.5 w-3.5" />{t("Add clause")}</Button>
              <div className="space-y-2"><Label htmlFor="tp-rider" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Schedule C: technical and hospitality rider (one item per line)")}</Label><textarea id="tp-rider" rows={5} maxLength={2000} value={edit.rider} onChange={(e) => setEdit({ ...edit, rider: e.target.value })} className={`${FIELD} border-border`} /></div>
              <p role="alert" className="min-h-4 text-xs text-[#ff8a7a]">{err}</p>
              <DialogFooter className="gap-2 sm:space-x-0"><Button type="button" variant="outline" className="rounded-full" onClick={() => { if (valid()) setPreviewing(true); }}>{t("Preview")}</Button><Button type="button" variant="outline" className="rounded-full" onClick={() => { setEdit(null); setErr(""); setBad({}); }}>{t("Cancel")}</Button><Button type="submit" disabled={saving} className="rounded-full bg-gradient-gold font-bold text-gold-foreground">{saving ? t("Saving…") : t("Save template")}</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
