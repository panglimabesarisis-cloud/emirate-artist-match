import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { invalidateLibraries, libraryRefresh } from "@/lib/library-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import { type Clause } from "@/lib/contract-terms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContractTemplateCard } from "./ContractTemplateCard";
import { ContractTemplateEditor } from "./ContractTemplateEditor";
import { StudioEmpty } from "./StudioPage";
import { useArtistPlan } from "./PromptLibrary";
import { ContractPreviewDialog, type ContractDoc } from "./ContractPreview";

export type Template = { id: string; artist_id: string | null; name: string; category: string | null; role: string | null; description: string | null; clauses: Clause[]; rider: string | null; tier: string; is_active: boolean; price_aed?: number; version?: number; updated_at?: string; unlocked?: boolean };

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
    void qc.invalidateQueries({ queryKey: ["contract-terms"] });
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

function UseTemplateButton({ artistId, template }: { artistId: string; template: Template }) {
  const { t } = useI18n(); const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const bookings = useQuery({ queryKey: ["contracts", artistId, "template-targets"], enabled: open, ...libraryRefresh,
    queryFn: async () => {
      const result = await supabase.rpc("team_contract_bookings", { _artist: artistId });
      if (result.error) throw result.error;
      return (result.data ?? []).filter(row => !row.contract_accepted_at && ["quoted", "confirmed"].includes(row.status)).sort((a,b) => String(a.event_date).localeCompare(String(b.event_date)));
    } });
  const choose = async (bookingId: string) => {
    const result = await supabase.rpc("use_contract_template", { _booking: bookingId, _template: template.id });
    if (result.error) { toast.error(result.error.message); return; }
    toast.success(t("Contract template selected")); void qc.invalidateQueries({ queryKey: ["contracts", artistId] }); void qc.invalidateQueries({ queryKey: ["contract-terms"] }); setOpen(false);
  };
  return <DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger asChild><Button size="sm" className="w-full rounded-full bg-gradient-gold text-gold-foreground">{t("Use template")}<ChevronDown className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent className="max-h-80 w-72 overflow-y-auto"><DropdownMenuLabel>{t("Booking contracts")}</DropdownMenuLabel>{bookings.error ? <DropdownMenuItem disabled>{t("Could not load contracts.")}</DropdownMenuItem> : bookings.isPending ? <DropdownMenuItem disabled>{t("Loading…")}</DropdownMenuItem> : bookings.data?.length ? bookings.data.map((row) => <DropdownMenuItem key={row.id} onSelect={() => void choose(row.id)}><span>{row.package_title ?? row.client_name}<small className="block text-muted-foreground">{row.client_name} · {row.event_date}</small></span></DropdownMenuItem>) : <DropdownMenuItem disabled>{t("No contracts awaiting acceptance")}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>;
}

const blankTemplate: Template = { id: "", artist_id: null, name: "", category: null, role: null, description: null, clauses: [], rider: null, tier: "free", is_active: true };
/** A template as the sample sheet: placeholders stay visible. */
function templateDoc(tpl: Template, t: (s: string) => string): ContractDoc {
  return { number: "TEMPLATE", templateName: tpl.name || t("Untitled template"), stamp: { word: "TEMPLATE", sub: (tpl.role ?? "").toUpperCase(), tone: "template" }, intro: t("This agreement is made through the Dealmaker platform between the parties below. Placeholders such as {artist} and {client} are filled in for each booking."), clauses: tpl.clauses, rider: tpl.rider, footer: t("Sample sheet. The terms are filled in when you attach this template to a booking.") };
}

type Draft = { id?: string; name: string; category: string; role: string; description: string; clauses: Clause[]; rider: string };
const blank: Draft = { name: "", category: "", role: "", description: "", clauses: [{ title: "", body: "" }], rider: "" };

export function ContractTemplateLibrary({ artistId, bookingTemplates = [] }: { artistId: string; bookingTemplates?: (string | null)[] }) {
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
  const [previewing, setPreviewing] = useState(false);


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
    if (edit.clauses.length === 0) { setErr(t("Add at least one clause.")); return false; }
    if (Object.keys(flags).length) { setErr(t("Give the template a name and fill in every clause title and text.")); return false; }
    setErr("");
    return true;
  };
  const save = async () => {
    if (!edit || !valid()) return;
    const clauses = edit.clauses.map((c) => ({ title: c.title.trim(), body: c.body.trim() }));
    const row = { name: edit.name.trim().slice(0, 100), category: edit.category.trim() || null, role: edit.role.trim() || null, description: edit.description.trim() || null, clauses: clauses as unknown as Json, rider: edit.rider.trim() || null };
    setSaving(true);
    const { error: err } = edit.id ? await supabase.from("contract_templates").update(row).eq("id", edit.id) : await supabase.from("contract_templates").insert({ ...row, artist_id: artistId, tier: "free" });
    setSaving(false);
    if (err) { toast.error(err.message); return; }
    toast.success(t("Template saved")); setEdit(null); void invalidateLibraries(qc);
  };
  const remove = async (tpl: Template) => {
    if (!confirm(t("Delete this template? Contracts already accepted keep their terms."))) return;
    const { error: err } = await supabase.from("contract_templates").delete().eq("id", tpl.id);
    if (err) { toast.error(err.message); return; }
    void invalidateLibraries(qc);
  };


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
          {cats.map((c) => <Button variant="outline" size="sm" key={c} type="button" aria-pressed={cat === c} onClick={() => { setCat(c); setPage(0); }} className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${cat === c ? "border-transparent bg-gold text-gold-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{c === "All" ? t("All") : c} <b className="opacity-60">{catCount(c)}</b></Button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center"><Search className="pointer-events-none absolute start-3 h-4 w-4 text-muted-foreground" aria-hidden /><span className="sr-only">{t("Search templates")}</span>
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={`${t("Search")} ${visible.length} ${t("templates")}`} className="h-9 w-56 rounded-full border border-border bg-foreground/[.04] pe-3 ps-9 text-sm outline-none focus-visible:border-gold" /></label>
          <Select value={tier} onValueChange={(v) => { setTier(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-36 rounded-full" aria-label={t("Filter by plan")}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("All plans")}</SelectItem>{(plan.data?.tiers ?? []).map((x) => <SelectItem key={x.code} value={x.code}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {error ? <p role="alert" className="text-destructive">{t("Could not load templates.")}</p> : isPending ? <p className="text-sm text-muted-foreground">{t("Loading…")}</p> : shown.length === 0 ? <StudioEmpty title={visible.length === 0 ? t("No templates yet") : t("No template matches your search.")} /> : (
        <ul className="contract-template-grid">
          {shown.map((x) => {
            const locked = x.unlocked !== true;
            const tierLocked = (rank.get(x.tier) ?? 99) > myRank;
            return (
              <li key={x.id} className="min-w-0 flex">
                <ContractTemplateCard name={x.name} category={x.category} tier={x.tier} tierName={tierName(x.tier)}
                  {...(!locked ? { articles: x.clauses.length } : {})} {...(x.updated_at ? { updatedAt: x.updated_at } : {})}
                  usage={bookingTemplates.filter((id) => id === x.id).length} onPreview={() => setView(x)}
                  details={<div className="flex flex-wrap gap-1.5">{x.artist_id !== null && <Badge variant="outline">{t("Yours")}</Badge>}{x.version && <Badge variant="outline">v{x.version}</Badge>}{Number(x.price_aed) > 0 && <Badge variant="outline">AED {Number(x.price_aed).toFixed(2)} + {t("VAT 5%")}</Badge>}</div>}
                  actions={x.artist_id !== null && <><Button size="sm" variant="ghost" aria-label={`${t("Edit")} ${x.name}`} onClick={() => setEdit({ id: x.id, name: x.name, category: x.category ?? "", role: x.role ?? "", description: x.description ?? "", clauses: x.clauses.length ? x.clauses : [{ title: "", body: "" }], rider: x.rider ?? "" })}><Pencil />{t("Edit")}</Button><Button size="icon" variant="ghost" title={t("Delete template")} aria-label={`${t("Delete")} ${x.name}`} onClick={() => void remove(x)}><Trash2 /></Button></>}
                  primary={locked ? <Button variant="outline" className="w-full rounded-full" onClick={() => setView(x)}><Lock />{tierLocked ? `${t("Upgrade to")} ${tierName(x.tier)}` : t("Purchase required")}</Button> : <UseTemplateButton artistId={artistId} template={x} />} />
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

      <ContractPreviewDialog doc={view ? templateDoc(view, t) : null} title={view ? `${view.name} ${t("· template")}` : ""} locked={!!view && view.unlocked !== true} purchaseRequired={!!view && Number(view.price_aed) > 0 && (rank.get(view.tier) ?? 99) <= myRank} planName={view ? tierName(view.tier) : ""} artistId={artistId} {...(view ? { templateId: view.id, priceAed: Number(view.price_aed) } : {})} onPaid={() => { setView(null); void qc.invalidateQueries({ queryKey: ["contract-templates"] }); toast.success(t("Contract unlocked")); }} onClose={() => setView(null)} />
      <ContractPreviewDialog doc={previewing && edit ? templateDoc({ ...blankTemplate, name: edit.name.trim(), role: edit.role.trim() || null, clauses: edit.clauses, rider: edit.rider.trim() || null }, t) : null} title={`${edit?.name.trim() || t("Template")} ${t("· template")}`} artistId={artistId} onClose={() => setPreviewing(false)} />

      <ContractTemplateEditor draft={previewing ? null : edit} onChange={(draft) => { setEdit(draft); setErr(""); }} onClose={() => { setEdit(null); setErr(""); }} onSave={() => void save()} onPreview={() => { if (valid()) setPreviewing(true); }} saving={saving} error={err} />

    </section>
  );
}
