import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import { hasSpeciality, inCategory, newSpecialityNames } from "@/lib/admin-artists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CategoryEditor, type CategoryDraft } from "./CategoryEditor";
import { CatalogRequestQueue } from "./CatalogRequestQueue";
import { ArtistProfileDialog } from "./artists/ArtistProfileDialog";
import { useArtists, useCategories, useSpecialities, type AdminArtist } from "./artists/data";
import { ListState, StatusPill } from "./artists/parts";

const NEW = "new";
const blankCategory = (): CategoryDraft => ({ name: "", name_ar: "", slug: "", icon: "", description: "", sort: 100 });
type Speciality = { id: string; category_id: string; name: string; slug: string };

/** Left: choose or add a category, then add its specialities. Right: the tree with artist counts. */
export function CategoryManager() {
  const qc = useQueryClient();
  const query = useCategories();
  const cats = query.data ?? [];
  const specialities = useSpecialities().data ?? [];
  const artists = useArtists().data ?? [];
  const [chosen, setChosen] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const [editing, setEditing] = useState<CategoryDraft | null>(null);
  const [renaming, setRenaming] = useState<Speciality | null>(null);
  const [listing, setListing] = useState<{ title: string; artists: AdminArtist[] } | null>(null);
  const refresh = () => Promise.all(["admin-categories", "admin-specialities", "join-catalog", "catalog-client", "admin-artists"].map((key) => qc.invalidateQueries({ queryKey: [key] })));

  const removeCategory = async (id: string, count: number) => {
    if (count > 0) { toast.error(`Move the ${count} artist(s) to another category first.`); return; }
    if (!confirm("Delete this category and its specialities?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (chosen === id) setChosen("");
    await refresh();
  };
  const removeSpeciality = async (s: Speciality) => {
    const { count, error: checkError } = await supabase.from("artists").select("id", { count: "exact", head: true }).or(`subcategory_id.eq.${s.id},specialty_ids.cs.{${s.id}}`);
    if (checkError) { toast.error("Unable to check artist specialities"); return; }
    if (count) { toast.error(`${s.name} is assigned to ${count} artist(s) and cannot be deleted.`); return; }
    if (!confirm(`Delete ${s.name}?`)) return;
    const { error } = await supabase.from("subcategories").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    await refresh();
  };

  return (
    <div className="grid gap-4">
    <CatalogRequestQueue categories={cats} onDecided={refresh} />
    <div className="adm-split">
      <section className="adm-panel" aria-labelledby="cat-form-title">
        <h2 id="cat-form-title" className="font-display">Add to the catalogue</h2>
        <div>
          <Label htmlFor="cat-choose">1. Choose a category</Label>
          <Select value={chosen} onValueChange={setChosen}>
            <SelectTrigger id="cat-choose"><SelectValue placeholder="Choose or add a category" /></SelectTrigger>
            <SelectContent><SelectItem value={NEW}>+ Add a new category</SelectItem>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {chosen === NEW && <div className="grid gap-3 border-t pt-4">
          <CategoryEditor key={NEW} initial={blankCategory()} onSaved={async () => {
            const before = new Set(cats.map((c) => c.id));
            await refresh();
            const { data } = await supabase.from("categories").select("id");
            setChosen(data?.find((c) => !before.has(c.id))?.id ?? "");
          }} />
        </div>}
        {chosen && chosen !== NEW && <SpecialityAdder key={chosen} category={cats.find((c) => c.id === chosen)} existing={specialities.filter((s) => s.category_id === chosen)} onSaved={refresh} onRename={setRenaming} onRemove={removeSpeciality} />}
        {!chosen && <p className="adm-meta">Child specialities appear after you choose a category.</p>}
      </section>

      <section className="adm-panel" aria-labelledby="cat-tree-title">
        <div className="adm-title">
          <h2 id="cat-tree-title" className="font-display">Category and speciality</h2>
          <Button size="sm" variant="outline" onClick={() => setOpen(open.length ? [] : cats.map((c) => c.id))}>{open.length ? "Close all" : "Open all"}</Button>
        </div>
        <ListState pending={query.isPending} error={query.error} empty={cats.length ? null : "No category yet."}>
          <div className="grid gap-2">
            {cats.map((c) => {
              const list = artists.filter((a) => inCategory(a, c.id));
              const children = specialities.filter((s) => s.category_id === c.id);
              const isOpen = open.includes(c.id);
              return (
                <div key={c.id} className="adm-cat">
                  <div className="adm-cat-head">
                    <Button size="icon" variant="ghost" aria-expanded={isOpen} aria-controls={`cat-${c.id}`} aria-label={`${isOpen ? "Hide" : "Show"} specialities of ${c.name}`} onClick={() => setOpen(isOpen ? open.filter((id) => id !== c.id) : [...open, c.id])}>{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4 rtl:rotate-180" />}</Button>
                    <button type="button" className="adm-link" onClick={() => setListing({ title: c.name, artists: list })}>{c.icon ? `${c.icon} ` : ""}{c.name}</button>
                    <span className="adm-meta whitespace-nowrap">{children.length} specialities · <b>{list.length}</b> artists</span>
                    <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => void removeCategory(c.id, list.length)}><Trash2 className="size-4" /></Button>
                  </div>
                  {isOpen && <div id={`cat-${c.id}`} className="border-t">
                    <Table>
                      <TableHeader><TableRow><TableHead>Speciality</TableHead><TableHead className="w-24 text-end">Artists</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {children.map((s) => { const members = artists.filter((a) => hasSpeciality(a, s.id)); return (
                          <TableRow key={s.id}>
                            <TableCell><button type="button" className="adm-link" onClick={() => setListing({ title: `${c.name} · ${s.name}`, artists: members })}>{s.name}</button></TableCell>
                            <TableCell className="adm-money text-end">{members.length}</TableCell>
                          </TableRow>
                        ); })}
                        {!children.length && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No speciality yet.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>}
                </div>
              );
            })}
          </div>
        </ListState>
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit category</DialogTitle></DialogHeader>
          {editing && <CategoryEditor initial={editing} onSaved={() => { setEditing(null); void refresh(); }} />}
        </DialogContent>
      </Dialog>
      {renaming && <RenameSpeciality speciality={renaming} onClose={() => setRenaming(null)} onSaved={refresh} />}
      {listing && <ArtistList title={listing.title} artists={listing.artists} onClose={() => setListing(null)} />}
    </div>
    </div>
  );
}

function SpecialityAdder({ category, existing, onSaved, onRename, onRemove }: { category: { id: string; name: string } | undefined; existing: Speciality[]; onSaved: () => Promise<unknown>; onRename: (s: Speciality) => void; onRemove: (s: Speciality) => void }) {
  const [draft, setDraft] = useState("");
  const [queued, setQueued] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  if (!category) return null;
  const taken = [...existing.map((s) => s.name), ...queued];
  const queue = () => { const names = newSpecialityNames(draft, taken); if (names.length) setQueued([...queued, ...names]); else if (draft.trim()) toast.error("Already in the list"); setDraft(""); };
  const save = async () => {
    const names = [...queued, ...newSpecialityNames(draft, taken)];
    const rows = names.map((name) => ({ category_id: category.id, name, slug: slugify(name) }));
    if (rows.some((row) => !row.slug)) { toast.error("Use Latin letters or numbers in speciality names"); return; }
    if (!rows.length) return;
    setSaving(true);
    const { error } = await supabase.from("subcategories").insert(rows);
    setSaving(false);
    if (error) { toast.error(error.code === "23505" ? "One of these specialities already exists in this category" : error.message); return; }
    toast.success(`${rows.length} speciality${rows.length > 1 ? " entries" : ""} saved`);
    setQueued([]); setDraft("");
    await onSaved();
  };
  return (
    <div className="grid gap-3 border-t pt-4">
      <div>
        <Label htmlFor="cat-children">2. Child specialities of {category.name}</Label>
        <div className="flex gap-2">
          <Input id="cat-children" maxLength={500} value={draft} placeholder="Type a name, then comma or Enter" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); queue(); } }} />
          <Button type="button" variant="outline" onClick={queue} disabled={!draft.trim()}><Plus className="size-4" />Add</Button>
        </div>
        <p className="adm-meta mt-1">You can add several at once, separated by commas.</p>
      </div>
      {queued.length > 0 && <div><p className="adm-heading mb-2">New, not saved yet</p><div className="adm-chips">{queued.map((name) => <span key={name} className="adm-chip">{name}<button type="button" aria-label={`Remove ${name}`} onClick={() => setQueued(queued.filter((q) => q !== name))}><X className="size-3" /></button></span>)}</div></div>}
      <Button disabled={saving || (!queued.length && !draft.trim())} onClick={() => void save()}>{saving && <Loader2 className="size-4 animate-spin" />}Save specialities</Button>
      <div>
        <p className="adm-heading mb-2">Saved ({existing.length})</p>
        {existing.length ? <div className="adm-chips">{existing.map((s) => <span key={s.id} className="adm-chip">{s.name}<button type="button" aria-label={`Rename ${s.name}`} onClick={() => onRename(s)}><Pencil className="size-3" /></button><button type="button" aria-label={`Delete ${s.name}`} onClick={() => onRemove(s)}><X className="size-3" /></button></span>)}</div> : <p className="adm-meta">None yet.</p>}
      </div>
    </div>
  );
}

function RenameSpeciality({ speciality, onClose, onSaved }: { speciality: Speciality; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [name, setName] = useState(speciality.name);
  const save = async () => {
    if (!name.trim() || !slugify(name)) { toast.error("Enter a speciality name"); return; }
    const { error } = await supabase.from("subcategories").update({ name: name.trim(), slug: slugify(name) }).eq("id", speciality.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Speciality saved"); onClose(); await onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename speciality</DialogTitle><DialogDescription>Artists keep it under the new name.</DialogDescription></DialogHeader>
        <div><Label htmlFor="speciality-name">Speciality</Label><Input id="speciality-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} /></div>
        <DialogFooter><Button onClick={() => void save()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArtistList({ title, artists, onClose }: { title: string; artists: AdminArtist[]; onClose: () => void }) {
  const [viewing, setViewing] = useState<AdminArtist | null>(null);
  if (viewing) return <ArtistProfileDialog artist={viewing} onClose={() => setViewing(null)} />;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{artists.length} registered artist{artists.length === 1 ? "" : "s"}</DialogDescription></DialogHeader>
        <ul className="grid gap-1">
          {artists.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 border-b py-2"><button type="button" className="adm-link text-sm font-semibold" onClick={() => setViewing(a)}>{a.stage_name}<span className="adm-meta block font-normal">{a.emirates?.name ?? "No emirate"}</span></button><StatusPill status={a.status} /></li>)}
          {!artists.length && <li className="adm-empty">No artist yet.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
