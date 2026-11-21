import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, MoreHorizontal, Pencil, SlidersHorizontal, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { StudioHeading, StudioSection } from "./StudioPage";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Rate = { id: string; title: string; price: number; duration_minutes: number | null; description: string | null; sort: number | null; artists?: { stage_name: string } | null };
type Sort = "az" | "za" | "price_asc" | "price_desc";
const empty = { title: "", price: "", duration: "60", description: "" };

export function RateCardTable({ artistId, adminMode = false }: { artistId?: string | undefined; adminMode?: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["rates", artistId];
  const { data = [], isPending, error } = useQuery({ queryKey: key, queryFn: async () => {
    let query = supabase.from("rate_cards").select("*, artists(stage_name)").order("sort");
    if (artistId) query = query.eq("artist_id", artistId);
    const result = await query; if (result.error) throw result.error; return (result.data ?? []) as Rate[];
  } });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("az");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [maxMin, setMaxMin] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [view, setView] = useState<Rate | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; f: typeof empty } | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = data.filter((r) => (!maxMin || (r.duration_minutes ?? 0) <= Number(maxMin)) && (!maxPrice || r.price <= Number(maxPrice)) && (!s || r.title.toLowerCase().includes(s) || (r.description ?? "").toLowerCase().includes(s) || (r.artists?.stage_name ?? "").toLowerCase().includes(s)));
    list.sort((a, b) => sort === "az" ? a.title.localeCompare(b.title) : sort === "za" ? b.title.localeCompare(a.title) : sort === "price_asc" ? a.price - b.price : b.price - a.price);
    return list;
  }, [data, q, sort, maxMin, maxPrice]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * size, cur * size + size);
  const allOn = shown.length > 0 && shown.every((r) => sel.includes(r.id));

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const remove = async (ids: string[]) => {
    if (!ids.length || !confirm(`Delete ${ids.length} ratecard(s)?`)) return;
    const { error } = await supabase.from("rate_cards").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    setSel((s) => s.filter((x) => !ids.includes(x))); toast.success("Deleted"); refresh();
  };
  const save = async () => {
    if (!edit || (!edit.id && !artistId)) return;
    const { f } = edit;
    if (!f.title.trim() || !(Number(f.price) > 0)) { toast.error("Name and price required"); return; }
    const row = { title: f.title.trim(), price: Number(f.price), duration_minutes: Number(f.duration) || null, description: f.description.trim() || null };
    const { error } = edit.id
      ? await supabase.from("rate_cards").update(row).eq("id", edit.id)
      : await supabase.from("rate_cards").insert({ ...row, artist_id: artistId ?? "", sort: data.length + 1 });
    if (error) { toast.error(error.message); return; }
    setEdit(null); toast.success("Saved"); refresh();
  };

  return (
    <div className="dmr-wrap dmr-rcpage"><StudioHeading title="Rate" accent="card">{artistId && <Button onClick={()=>setEdit({id:null,f:empty})}>{t("Add ratecard")}</Button>}</StudioHeading><div className="dmr-w-left">
      <div className="dmr-panel dmr-q-panel">
      <div className="dmr-q-tools">
        <Input className="max-w-xs" aria-label={t("Search ratecards")} placeholder={t("Search ratecards")} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="az">{t("Name A → Z")}</SelectItem><SelectItem value="za">{t("Name Z → A")}</SelectItem>
            <SelectItem value="price_asc">{t("Price low → high")}</SelectItem><SelectItem value="price_desc">{t("Price high → low")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(size)} onValueChange={(v) => { setSize(Number(v)); setPage(0); }}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} {t("/ page")}</SelectItem>)}</SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" size="sm" aria-label={t("Filter")}><SlidersHorizontal className="me-1 h-4 w-4" />{t("Filter")}{(maxMin || maxPrice) ? " •" : ""}</Button></PopoverTrigger>
          <PopoverContent className="w-64 space-y-3">
            <div><Label htmlFor="rc-max-min">{t("Max duration (min)")}</Label><Input id="rc-max-min" type="number" min={1} value={maxMin} onChange={(e) => { setMaxMin(e.target.value); setPage(0); }} /></div>
            <div><Label htmlFor="rc-max-price">{t("Max price (AED)")}</Label><Input id="rc-max-price" type="number" min={1} value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); setPage(0); }} /></div>
            <Button variant="ghost" size="sm" onClick={() => { setMaxMin(""); setMaxPrice(""); }}>{t("Clear filters")}</Button>
          </PopoverContent>
        </Popover>
        <div className="ms-auto flex gap-2">
          {sel.length > 0 && <Button variant="destructive" size="sm" onClick={() => remove(sel)}>{t("Delete (")}{sel.length})</Button>}
          {artistId && <Button size="sm" onClick={() => setEdit({ id: null, f: empty })}>+ {t("Add ratecard")}</Button>}
        </div>
      </div>
      {error && <p role="alert" className="py-4 text-destructive">{t("Could not load ratecards.")}</p>}
      <div className="dmr-tbl-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 p-3"><input type="checkbox" aria-label={t("Select all")} className="accent-gold" checked={allOn} onChange={(e) => setSel(e.target.checked ? [...new Set([...sel, ...shown.map((r) => r.id)])] : sel.filter((x) => !shown.some((r) => r.id === x)))} /></th>
              {adminMode && <th className="p-3 text-start">{t("Artist")}</th>}<th className="p-3 text-start">{t("Job type")}</th><th className="p-3 text-start">{t("Price")}</th><th className="p-3 text-start">{t("Duration")}</th><th className="p-3 text-start">{t("Included")}</th><th className="p-3 text-end">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={adminMode ? 7 : 6} className="p-6 text-center text-muted-foreground">{t(isPending ? "Loading…" : "No ratecards yet.")}</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3"><input type="checkbox" aria-label={`Select ${r.title}`} className="accent-gold" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></td>
                {adminMode && <td className="p-3">{r.artists?.stage_name}</td>}<td className="p-3 font-medium">{r.title}</td>
                <td className="p-3" dir="ltr">{aed(Number(r.price))}</td>
                <td className="p-3">{r.duration_minutes ? `${r.duration_minutes} min` : "—"}</td>
                <td className="p-3 max-w-xs truncate text-muted-foreground">{r.description || "—"}</td>
                <td className="p-3 text-end whitespace-nowrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t("Actions")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setView(r)}><Eye className="me-2 h-4 w-4" />{t("View")}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEdit({ id: r.id, f: { title: r.title, price: String(r.price), duration: String(r.duration_minutes ?? ""), description: r.description ?? "" } })}><Pencil className="me-2 h-4 w-4" />{t("Edit")}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onSelect={() => remove([r.id])}><Trash2 className="me-2 h-4 w-4" />{t("Delete")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
        <span>{rows.length === 0 ? "0" : `${cur * size + 1}–${Math.min(rows.length, cur * size + size)}`} {t("of")} {rows.length}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>{t("Prev")}</Button>
          <Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>{t("Next")}</Button>
        </div>
      </div>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{view?.title}</DialogTitle></DialogHeader>
          {view && <div className="space-y-2 text-sm"><div><b>{t("Price:")}</b> {aed(Number(view.price))}</div><div><b>{t("Duration:")}</b> {view.duration_minutes ?? "—"} {t("min")}</div><div><b>{t("Included:")}</b> {view.description || "—"}</div></div>}
        </DialogContent>
      </Dialog>
      </div>
      </div><div className="dmr-w-side">{!edit && artistId && <StudioSection title="Add" accent="ratecard"><div className="space-y-3"><Label>{t("Job type")}</Label><Input disabled placeholder={t("Choose Add ratecard")} /><div className="grid grid-cols-2 gap-3"><div><Label>{t("Price (AED)")}</Label><Input disabled /></div><div><Label>{t("Minutes")}</Label><Input disabled /></div></div><Label>{t("What is included")}</Label><Textarea disabled rows={4} /><Button onClick={()=>setEdit({id:null,f:empty})}>{t("Add ratecard")}</Button></div></StudioSection>}
      {edit && (
        <aside className="dmr-panel h-fit lg:sticky lg:top-24" aria-label={t(edit.id ? "Edit ratecard" : "Add ratecard")}>
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{t(edit.id ? "Edit ratecard" : "Add ratecard")}</h3><Button size="icon" variant="ghost" aria-label={t("Cancel")} onClick={() => setEdit(null)}><X className="h-4 w-4" /></Button></div>
          <div className="space-y-3">
            <div><Label htmlFor="ratecard-job">{t("Job type")}</Label><Input id="ratecard-job" value={edit.f.title} maxLength={120} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, title: e.target.value } })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="ratecard-price">{t("Price (AED)")}</Label><Input id="ratecard-price" type="number" min={1} value={edit.f.price} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, price: e.target.value } })} /></div>
              <div><Label htmlFor="ratecard-min">{t("Minutes")}</Label><Input id="ratecard-min" type="number" min={1} value={edit.f.duration} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, duration: e.target.value } })} /></div>
            </div>
            <div><Label htmlFor="ratecard-desc">{t("What's included")}</Label><Textarea id="ratecard-desc" rows={4} value={edit.f.description} maxLength={500} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, description: e.target.value } })} /></div>
          </div>
          <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setEdit(null)}>{t("Cancel")}</Button><Button className="flex-1 bg-gradient-gold text-gold-foreground" onClick={save}>{t("Save")}</Button></div>
        </aside>
      )}</div>
    </div>
  );
}
