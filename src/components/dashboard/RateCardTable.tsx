import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [view, setView] = useState<Rate | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; f: typeof empty } | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = data.filter((r) => !s || r.title.toLowerCase().includes(s) || (r.description ?? "").toLowerCase().includes(s) || (r.artists?.stage_name ?? "").toLowerCase().includes(s));
    list.sort((a, b) => sort === "az" ? a.title.localeCompare(b.title) : sort === "za" ? b.title.localeCompare(a.title) : sort === "price_asc" ? a.price - b.price : b.price - a.price);
    return list;
  }, [data, q, sort]);
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
    <div className="mt-6 min-w-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <Input className="max-w-xs" aria-label={t("Search ratecards")} placeholder={t("Search ratecards")} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="az">Name A → Z</SelectItem><SelectItem value="za">Name Z → A</SelectItem>
            <SelectItem value="price_asc">Price low → high</SelectItem><SelectItem value="price_desc">Price high → low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(size)} onValueChange={(v) => { setSize(Number(v)); setPage(0); }}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
        </Select>
        <div className="ms-auto flex gap-2">
          {sel.length > 0 && <Button variant="destructive" size="sm" onClick={() => remove(sel)}>Delete ({sel.length})</Button>}
          {artistId && <Button size="sm" onClick={() => setEdit({ id: null, f: empty })}>+ {t("Add ratecard")}</Button>}
        </div>
      </div>
      {error && <p role="alert" className="py-4 text-destructive">{t("Could not load ratecards.")}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 p-3"><input type="checkbox" aria-label="Select all" className="accent-gold" checked={allOn} onChange={(e) => setSel(e.target.checked ? [...new Set([...sel, ...shown.map((r) => r.id)])] : sel.filter((x) => !shown.some((r) => r.id === x)))} /></th>
              {adminMode && <th className="p-3 text-start">{t("Artist")}</th>}<th className="p-3 text-start">{t("Job type")}</th><th className="p-3 text-start">Price</th><th className="p-3 text-start">Duration</th><th className="p-3 text-start">Included</th><th className="p-3 text-end">Actions</th>
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
                  <Button size="icon" variant="ghost" aria-label="View" onClick={() => setView(r)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEdit({ id: r.id, f: { title: r.title, price: String(r.price), duration: String(r.duration_minutes ?? ""), description: r.description ?? "" } })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => remove([r.id])}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
        <span>{rows.length === 0 ? "0" : `${cur * size + 1}–${Math.min(rows.length, cur * size + size)}`} of {rows.length}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Prev</Button>
          <Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{view?.title}</DialogTitle></DialogHeader>
          {view && <div className="space-y-2 text-sm"><div><b>Price:</b> {aed(Number(view.price))}</div><div><b>Duration:</b> {view.duration_minutes ?? "—"} min</div><div><b>Included:</b> {view.description || "—"}</div></div>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t(edit?.id ? "Edit ratecard" : "Add ratecard")}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label htmlFor="ratecard-job">{t("Job type")}</Label><Input id="ratecard-job" value={edit.f.title} maxLength={120} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, title: e.target.value } })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label htmlFor="ratecard-price">{t("Price (AED)")}</Label><Input id="ratecard-price" type="number" min={1} value={edit.f.price} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, price: e.target.value } })} /></div>
                <div><Label>Minutes</Label><Input type="number" min={1} value={edit.f.duration} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, duration: e.target.value } })} /></div>
              </div>
              <div><Label>What's included</Label><Textarea value={edit.f.description} maxLength={500} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, description: e.target.value } })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
