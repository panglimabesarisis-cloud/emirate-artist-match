import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Patch = { status?: string; featured?: boolean; plan?: string; category_id?: string };

function useArtists() {
  return useQuery({
    queryKey: ["admin-artists"],
    queryFn: async () => (await supabase.from("artists").select("id, slug, stage_name, status, plan, featured, created_at, base_price, category_id, bio, tagline, categories(name), emirates(name)").order("created_at", { ascending: false })).data ?? [],
  });
}
function useUpdate() {
  const qc = useQueryClient();
  return async (id: string, patch: Patch) => {
    const { error } = await supabase.from("artists").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["admin-artists"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  };
}
export function useCategories() {
  return useQuery({ queryKey: ["admin-categories"], queryFn: async () => (await supabase.from("categories").select("*").order("sort")).data ?? [] });
}

const statusVariant = (s: string) => (s === "approved" ? "default" : s === "pending" ? "secondary" : "outline") as "default" | "secondary" | "outline";

export function ArtistDirectory() {
  const { data } = useArtists();
  const cats = useCategories().data ?? [];
  const update = useUpdate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [cat, setCat] = useState("all");
  const rows = (data ?? []).filter((a) =>
    (status === "all" || a.status === status) && (cat === "all" || a.category_id === cat) && a.stage_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search artist…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{["all", "approved", "pending", "rejected", "suspended"].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All status" : s}</SelectItem>)}</SelectContent></Select>
        <Select value={cat} onValueChange={setCat}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        <span className="ms-auto self-center text-sm text-muted-foreground">{rows.length} artists</span>
      </div>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Artist</TableHead><TableHead>Category</TableHead><TableHead>Emirate</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead className="text-end">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.stage_name}{a.featured && <Badge className="ms-2" variant="secondary">Featured</Badge>}</TableCell>
                <TableCell>
                  <Select value={a.category_id ?? ""} onValueChange={(v) => update(a.id, { category_id: v })}><SelectTrigger className="h-8 w-36"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
                </TableCell>
                <TableCell>{a.emirates?.name ?? "—"}</TableCell>
                <TableCell>
                  <Select value={a.plan} onValueChange={(v) => update(a.id, { plan: v })}><SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{["free", "medium", "pro"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
                </TableCell>
                <TableCell><Badge variant={statusVariant(a.status)}>{a.status}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-sm">{new Date(a.created_at).toLocaleDateString("en-GB")}</TableCell>
                <TableCell className="text-end whitespace-nowrap space-x-1">
                  {a.status === "approved" && <Button asChild size="sm" variant="ghost"><Link to="/artist/$slug" params={{ slug: a.slug }}>View</Link></Button>}
                  <Button size="sm" variant="outline" onClick={() => update(a.id, { featured: !a.featured })}>{a.featured ? "Unfeature" : "Feature"}</Button>
                  {a.status === "approved"
                    ? <Button size="sm" variant="ghost" onClick={() => update(a.id, { status: "suspended" })}>Suspend</Button>
                    : <Button size="sm" onClick={() => update(a.id, { status: "approved" })}>Approve</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ArtistRequests() {
  const { data } = useArtists();
  const update = useUpdate();
  const rows = (data ?? []).filter((a) => a.status === "pending");
  if (!rows.length) return <p className="text-muted-foreground">No pending artist requests.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((a) => (
        <div key={a.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div><div className="font-semibold">{a.stage_name}</div><div className="text-sm text-muted-foreground">{a.categories?.name ?? "No category"} · {a.emirates?.name ?? "—"} · {a.plan}</div></div>
            <Badge variant="secondary">pending</Badge>
          </div>
          {a.tagline && <p className="mt-2 text-sm">{a.tagline}</p>}
          {a.bio && <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{a.bio}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => update(a.id, { status: "approved" })}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => update(a.id, { status: "rejected" })}>Reject</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

type Cat = { id?: string; name: string; name_ar: string | null; slug: string; icon: string | null; description: string | null; sort: number | null };
export function CategoryManager() {
  const qc = useQueryClient();
  const cats = useCategories().data ?? [];
  const artists = useArtists().data ?? [];
  const [edit, setEdit] = useState<Cat | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-categories"] });
  const save = async () => {
    if (!edit?.name.trim()) return;
    const row = { name: edit.name.trim(), name_ar: edit.name_ar || null, slug: edit.slug || slugify(edit.name), icon: edit.icon || null, description: edit.description || null, sort: edit.sort ?? 100 };
    const { error } = edit.id ? await supabase.from("categories").update(row).eq("id", edit.id) : await supabase.from("categories").insert(row);
    if (error) { toast.error(error.message); return; }
    toast.success("Category saved"); setEdit(null); refresh();
  };
  const remove = async (id: string, count: number) => {
    if (count > 0) { toast.error(`Move the ${count} artist(s) to another category first.`); return; }
    if (!confirm("Delete this category?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEdit({ name: "", name_ar: "", slug: "", icon: "", description: "", sort: 100 })}>+ Add category</Button></div>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Arabic</TableHead><TableHead>Slug</TableHead><TableHead>Artists</TableHead><TableHead className="text-end">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {cats.map((c) => {
              const list = artists.filter((a) => a.category_id === c.id);
              return (
                <Fragment key={c.id}>
                  <TableRow>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell dir="rtl">{c.name_ar ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">/{c.slug}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>{list.length} {open === c.id ? "▲" : "▼"}</Button></TableCell>
                    <TableCell className="text-end space-x-1 whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => setEdit(c)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c.id, list.length)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                  {open === c.id && (
                    <TableRow><TableCell colSpan={5} className="bg-muted/40">
                      <div className="flex flex-wrap gap-1.5">{list.length ? list.map((a) => <Badge key={a.id} variant={statusVariant(a.status)}>{a.stage_name}</Badge>) : <span className="text-sm text-muted-foreground">No artists</span>}</div>
                    </TableCell></TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div><Label>Name (English)</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label>Name (Arabic)</Label><Input dir="rtl" value={edit.name_ar ?? ""} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Slug</Label><Input value={edit.slug} placeholder={slugify(edit.name)} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} /></div>
                <div><Label>Sort</Label><Input type="number" value={edit.sort ?? 100} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Icon (emoji)</Label><Input value={edit.icon ?? ""} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Ev = { id?: string; name: string; slug: string; sort: number | null };

export function EventTypeManager() {
  const qc = useQueryClient();
  const evs = useQuery({ queryKey: ["admin-event-types"], queryFn: async () => (await supabase.from("event_types").select("id,name,slug,sort").order("sort")).data ?? [] }).data ?? [];
  const [edit, setEdit] = useState<Ev | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-event-types"] });
  const save = async () => {
    if (!edit?.name.trim()) return;
    const row = { name: edit.name.trim(), slug: edit.slug || slugify(edit.name), sort: edit.sort ?? 100 };
    const { error } = edit.id ? await supabase.from("event_types").update(row).eq("id", edit.id) : await supabase.from("event_types").insert(row);
    if (error) { toast.error(error.message); return; }
    toast.success("Event type saved"); setEdit(null); refresh();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this event type?")) return;
    const { error } = await supabase.from("event_types").delete().eq("id", id);
    if (error) { toast.error(error.message.includes("foreign key") ? "This event type is used by quotes or bookings and can't be deleted." : error.message); return; }
    refresh();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEdit({ name: "", slug: "", sort: 100 })}>+ Add event type</Button></div>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Slug</TableHead><TableHead>Sort</TableHead><TableHead className="text-end">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {evs.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="text-muted-foreground">/{e.slug}</TableCell>
                <TableCell>{e.sort ?? "—"}</TableCell>
                <TableCell className="text-end space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => setEdit(e)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(e.id)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit event type" : "New event type"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Slug</Label><Input value={edit.slug} placeholder={slugify(edit.name)} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} /></div>
                <div><Label>Sort</Label><Input type="number" value={edit.sort ?? 100} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></div>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
