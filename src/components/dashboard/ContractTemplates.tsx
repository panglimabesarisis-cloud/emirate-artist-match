import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, FileSignature, Lock, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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

export type Template = { id: string; artist_id: string | null; name: string; category: string | null; role: string | null; description: string | null; clauses: Clause[]; rider: string | null; tier: string; is_active: boolean };

const asClauses = (v: unknown): Clause[] => (Array.isArray(v) ? (v as Array<Record<string, unknown>>).filter((c) => c && typeof c["title"] === "string" && typeof c["body"] === "string").map((c) => ({ title: String(c["title"]), body: String(c["body"]) })) : []);

/** Library templates the artist may read (active ones) plus the artist's own templates, with the plan limits that decide which can be used. */
export function useContractTemplates(artistId: string) {
  const plan = useArtistPlan(artistId);
  const list = useQuery({
    queryKey: ["contract-templates", artistId],
    queryFn: async () => {
      const res = await supabase.from("contract_templates").select("id, artist_id, name, category, role, description, clauses, rider, tier, is_active").order("name");
      if (res.error) throw res.error;
      return (res.data ?? []).map((r) => ({ ...r, clauses: asClauses(r.clauses) })) as Template[];
    },
  });
  const rank = useMemo(() => new Map((plan.data?.tiers ?? []).map((x) => [x.code, x.sort])), [plan.data]);
  const myRank = rank.get(plan.data?.code ?? "free") ?? 1;
  const usable = (tpl: Template) => tpl.artist_id !== null || (tpl.is_active && (rank.get(tpl.tier) ?? 99) <= myRank);
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

type Draft = { id?: string; name: string; category: string; role: string; description: string; clauses: Clause[]; rider: string };
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

  const save = async () => {
    if (!edit) return;
    const clauses = edit.clauses.map((c) => ({ title: c.title.trim(), body: c.body.trim() })).filter((c) => c.title || c.body);
    if (!edit.name.trim()) { toast.error(t("Name the template")); return; }
    if (clauses.length === 0 || clauses.some((c) => !c.title || !c.body)) { toast.error(t("Every clause needs a title and text")); return; }
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
            const locked = x.artist_id === null && (rank.get(x.tier) ?? 99) > myRank;
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
                      <Badge variant="outline">{x.clauses.length} {t("clauses")}</Badge>
                    </div>
                  </div>
                </div>
                {x.description && <p className="text-xs text-muted-foreground">{x.description}</p>}
                <div className="mt-auto flex items-center justify-end gap-1 pt-1">
                  {locked && <span className="me-auto inline-flex items-center gap-1 text-xs text-gold"><Lock className="h-3 w-3" aria-hidden />{t("Needs")} {tierName(x.tier)}</span>}
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => setView(x)}>{t("Preview")}</Button>
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

      <Dialog open={!!view} onOpenChange={(o) => { if (!o) setView(null); }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-[24px]">
          {view && <>
            <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl font-normal">{view.name}</DialogTitle><DialogDescription>{t("Placeholders such as {artist} and {client} are filled in for each booking.")}</DialogDescription></DialogHeader>
            <ol className="list-decimal space-y-3 ps-5 text-sm">{view.clauses.map((c, i) => <li key={i}><b>{c.title}</b><p className="whitespace-pre-wrap break-words text-muted-foreground">{c.body}</p></li>)}</ol>
            {view.rider && <div className="border-t border-border pt-3 text-sm"><h3 className="font-semibold">{t("Rider")}</h3><p className="whitespace-pre-wrap text-muted-foreground">{view.rider}</p></div>}
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => { if (!o && !saving) setEdit(null); }}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto rounded-[24px]">
          <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl font-normal">{edit?.id ? t("Edit template") : t("New template")}</DialogTitle>
            <DialogDescription>{t("Use placeholders")}: {CONTRACT_PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}</DialogDescription></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="tp-name">{t("Name")}</Label><Input id="tp-name" maxLength={100} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="tp-cat">{t("Category")}</Label><Input id="tp-cat" maxLength={40} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="tp-role">{t("Role")}</Label><Input id="tp-role" maxLength={40} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="tp-desc">{t("Description")}</Label><Input id="tp-desc" maxLength={200} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label>{t("Clauses")}</Label><Button type="button" size="sm" variant="outline" onClick={() => setEdit({ ...edit, clauses: [...edit.clauses, { title: "", body: "" }] })}><Plus className="me-1 h-3.5 w-3.5" />{t("Add clause")}</Button></div>
                {edit.clauses.map((c, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2"><Input aria-label={`${t("Clause title")} ${i + 1}`} placeholder={t("Clause title")} maxLength={120} value={c.title} onChange={(e) => setClause(i, { title: e.target.value })} />
                      <Button type="button" size="icon" variant="ghost" aria-label={`${t("Remove clause")} ${i + 1}`} disabled={edit.clauses.length === 1} onClick={() => setEdit({ ...edit, clauses: edit.clauses.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button></div>
                    <Textarea aria-label={`${t("Clause text")} ${i + 1}`} rows={3} maxLength={2000} placeholder={t("Clause text")} value={c.body} onChange={(e) => setClause(i, { body: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5"><Label htmlFor="tp-rider">{t("Rider (technical and hospitality needs)")}</Label><Textarea id="tp-rider" rows={3} maxLength={2000} value={edit.rider} onChange={(e) => setEdit({ ...edit, rider: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>{t("Cancel")}</Button><Button disabled={saving} className="bg-gradient-gold text-gold-foreground" onClick={() => void save()}>{saving ? t("Saving…") : t("Save template")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
