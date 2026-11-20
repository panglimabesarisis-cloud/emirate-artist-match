import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import { specialityPath } from "@/lib/catalog-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Specialty = { id?: string; category_id: string; name: string; slug: string };
export function SpecialitiesManager({ categories }: { categories: { id: string; name: string; slug: string }[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Specialty | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ["admin-specialities"], queryFn: async () => {
    const { data, error } = await supabase.from("subcategories").select("id,category_id,name,slug").order("name");
    if (error) throw error;
    return data;
  } });
  const refresh = () => Promise.all(["admin-specialities", "join-catalog", "catalog-client"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
  const save = async () => {
    if (!draft?.category_id || !draft.name.trim() || !slugify(draft.name) || saving) return;
    setSaving(true);
    const row = { category_id: draft.category_id, name: draft.name.trim(), slug: slugify(draft.name) };
    try {
      const { error } = draft.id ? await supabase.from("subcategories").update(row).eq("id", draft.id) : await supabase.from("subcategories").insert(row);
      if (error) throw error;
      toast.success("Speciality saved"); setDraft(null); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save speciality"); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    const { count, error: checkError } = await supabase.from("artists").select("id", { count: "exact", head: true }).or(`subcategory_id.eq.${id},specialty_ids.cs.{${id}}`);
    if (checkError) { toast.error("Unable to check artist specialities"); return; }
    if (count) { toast.error("This speciality is assigned to artists and cannot be deleted."); return; }
    if (!confirm("Delete this speciality?")) return;
    const { error } = await supabase.from("subcategories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refresh();
  };
  const category = categories.find((c) => c.id === draft?.category_id);
  return <section className="space-y-4 border-t pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Specialities</h2><Button disabled={!categories.length} onClick={() => setDraft({ category_id: "", name: "", slug: "" })}><Plus className="size-4" />Add speciality</Button></div>
    <div className="overflow-x-auto rounded-md border">
      <Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Speciality</TableHead><TableHead>Slug</TableHead><TableHead className="text-end">Actions</TableHead></TableRow></TableHeader><TableBody>
        {query.data?.map((s) => { const c = categories.find((c) => c.id === s.category_id); return <TableRow key={s.id}><TableCell>{c?.name ?? "—"}</TableCell><TableCell className="font-medium">{s.name}</TableCell><TableCell className="text-muted-foreground">/{c?.slug}/{s.slug}</TableCell><TableCell className="text-end whitespace-nowrap"><Button size="icon" variant="ghost" aria-label={`Edit ${s.name}`} title="Edit" onClick={() => setDraft(s)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => remove(s.id)}><Trash2 className="size-4" /></Button></TableCell></TableRow>; })}
        {!query.data?.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{query.isPending ? "Loading…" : query.isError ? "Unable to load specialities" : "No specialities"}</TableCell></TableRow>}
      </TableBody></Table>
    </div>
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open && !saving) setDraft(null); }}><DialogContent><DialogHeader><DialogTitle>{draft?.id ? "Edit speciality" : "New speciality"}</DialogTitle></DialogHeader>
      {draft && <div className="grid gap-4">
        <div><Label htmlFor="speciality-category">Categories</Label><Select value={draft.category_id} onValueChange={(category_id) => setDraft({ ...draft, category_id })}><SelectTrigger id="speciality-category"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="speciality-name">Speciality</Label><Input id="speciality-name" maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: slugify(e.target.value) })} /></div>
        <div><Label htmlFor="speciality-slug">Slug</Label><Input id="speciality-slug" readOnly value={category ? specialityPath(category.slug, draft.name) : ""} /></div>
      </div>}
      <DialogFooter><Button disabled={saving || !category || !draft?.name.trim() || !slugify(draft?.name ?? "")} onClick={save}>{saving && <Loader2 className="size-4 animate-spin" />}Save</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}