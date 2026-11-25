import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { slugify, aed } from "@/lib/format";
import { categoryIdsOf, inCategory, specialityIdsOf } from "@/lib/admin-artists";
import { missingProfileItems, profileChecks, profilePercent } from "@/lib/profile-completeness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArtistProfileDialog } from "./artists/ArtistProfileDialog";
import { dateLabel, useArtistPhotos, useArtists, useArtistStats, useBadges, useCategories, usePlans, useSpecialities, useUpdateArtist, type AdminArtist } from "./artists/data";
import { Badges, Cover, ListState, StatusPill, usePaged } from "./artists/parts";

const STATUSES = ["approved", "pending", "rejected", "suspended"];

export function ArtistDirectory() {
  const query = useArtists();
  const artists = query.data ?? [];
  const cats = useCategories().data ?? [];
  const specialities = useSpecialities().data ?? [];
  const badges = useBadges().data ?? [];
  const stats = useArtistStats().data;
  const update = useUpdateArtist();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [cat, setCat] = useState("all");
  const [badge, setBadge] = useState("all");
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = artists.filter((a) =>
    (status === "all" || a.status === status) && (cat === "all" || inCategory(a, cat)) && (badge === "all" || badges.some((b) => b.artist_id === a.id && b.badge === badge)) &&
    [a.stage_name, a.emirates?.name, a.areas?.name, ...specialityIdsOf(a).map((id) => specialities.find((s) => s.id === id)?.name)].join(" ").toLowerCase().includes(needle));
  const { slice, pager, first } = usePaged(rows);
  const photos = useArtistPhotos(slice);
  const viewed = artists.find((a) => a.id === viewing);
  const edited = artists.find((a) => a.id === editing);
  const filter = (set: (value: string) => void) => (value: string) => { set(value); first(); };
  const setStatusOf = (a: AdminArtist, next: "approved" | "suspended") => {
    if (next === "suspended" && !confirm(`Suspend ${a.stage_name}? The profile leaves search and cannot be booked.`)) return;
    void update(a.id, { status: next }, next === "approved" ? `${a.stage_name} is active` : `${a.stage_name} is suspended`);
  };

  return (
    <div className="space-y-4">
      <div className="admin-toolbar">
        <Input aria-label="Search artists" placeholder="Search name, speciality or city…" value={q} onChange={(e) => { setQ(e.target.value); first(); }} />
        <Select value={status} onValueChange={filter(setStatus)}><SelectTrigger className="w-40" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>{["all", ...STATUSES].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All status" : s}</SelectItem>)}</SelectContent></Select>
        <Select value={cat} onValueChange={filter(setCat)}><SelectTrigger className="w-48" aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories ({cats.length})</SelectItem>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        <Select value={badge} onValueChange={filter(setBadge)}><SelectTrigger className="w-48" aria-label="Verification badge"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All badges</SelectItem>{[...new Set(badges.map((b) => b.badge))].map((b) => <SelectItem key={b} value={b}><span className="capitalize">{b.replace(/_/g, " ")}</span></SelectItem>)}</SelectContent></Select>
        <span className="ms-auto text-sm text-muted-foreground">Showing {slice.length} of {rows.length} artists</span>
      </div>
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No artist matches these filters."}>
        <div className="adm-grid">
          {slice.map((a) => {
            const s = stats?.get(a.id);
            const names = categoryIdsOf(a).flatMap((id) => cats.find((c) => c.id === id)?.name ?? []);
            return (
              <article key={a.id} className="adm-card">
                <Cover artist={a} photo={photos.get(a.id)}>
                  <Badges badges={badges.filter((b) => b.artist_id === a.id).map((b) => b.badge)} />
                  {a.featured && <span className="adm-pill is-badge">Featured</span>}
                </Cover>
                <div className="adm-body">
                  <div className="adm-title"><h2>{a.stage_name}</h2><StatusPill status={a.status} /></div>
                  <p className="adm-meta">{[names.join(", ") || "No category", a.emirates?.name ?? "No emirate"].join(" · ")}</p>
                  <p className="adm-meta"><b>{s?.job_done ?? 0}</b> jobs done · Plan: <b className="capitalize">{s?.plan_code ?? a.plan}</b> · Joined {dateLabel(a.created_at)}</p>
                  <div className="adm-foot">
                    <span className="adm-money text-sm font-bold">{a.base_price ? aed(Number(a.base_price)) : "No price"}</span>
                    <div className="adm-actions">
                      <Button size="sm" onClick={() => setViewing(a.id)} aria-label={`Profile of ${a.stage_name}`}>Profile</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(a.id)} aria-label={`Edit ${a.stage_name}`}>Edit</Button>
                      {a.status === "approved"
                        ? <Button size="sm" variant="ghost" onClick={() => setStatusOf(a, "suspended")}>Suspend</Button>
                        : <Button size="sm" variant="ghost" onClick={() => setStatusOf(a, "approved")}>{a.status === "suspended" ? "Activate" : "Approve"}</Button>}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </ListState>
      {pager}
      {viewed && <ArtistProfileDialog artist={viewed} onClose={() => setViewing(null)} />}
      {edited && <EditArtist artist={edited} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditArtist({ artist, onClose }: { artist: AdminArtist; onClose: () => void }) {
  const cats = useCategories().data ?? [];
  const plans = usePlans().data ?? [];
  const update = useUpdateArtist();
  const [draft, setDraft] = useState({ category_id: artist.category_id ?? "", plan: artist.plan, featured: artist.featured });
  const save = async () => {
    const patch = { ...(draft.category_id && draft.category_id !== artist.category_id ? { category_id: draft.category_id } : {}), plan: draft.plan, featured: draft.featured };
    if (await update(artist.id, patch)) onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {artist.stage_name}</DialogTitle><DialogDescription>Category, profile plan and homepage feature.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div><Label>Main category</Label><Select value={draft.category_id} onValueChange={(category_id) => setDraft({ ...draft, category_id })}><SelectTrigger aria-label="Main category"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Profile plan</Label><Select value={draft.plan} onValueChange={(plan) => setDraft({ ...draft, plan })}><SelectTrigger aria-label="Profile plan"><SelectValue /></SelectTrigger><SelectContent>{plans.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Limits and commission follow the paid subscription.</p></div>
          <label className="flex items-center justify-between gap-3 text-sm">Featured on the homepage<Switch checked={draft.featured} onCheckedChange={(featured) => setDraft({ ...draft, featured })} /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={() => void save()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ArtistRequests() {
  const query = useArtists();
  const cats = useCategories().data ?? [];
  const specialities = useSpecialities().data ?? [];
  const update = useUpdateArtist();
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (query.data ?? []).filter((a) => a.status === "pending");
  const photos = useArtistPhotos(rows);
  const ids = rows.map((a) => a.id);
  // The two profile-strength items kept in their own tables.
  const counts = useQuery({
    queryKey: ["admin-request-counts", ids], enabled: ids.length > 0,
    queryFn: async () => {
      const [works, clients] = await Promise.all([supabase.from("artist_portfolio").select("artist_id").in("artist_id", ids), supabase.from("artist_clients").select("artist_id").in("artist_id", ids)]);
      if (works.error || clients.error) throw new Error("Unable to load profile details");
      return { works: works.data, clients: clients.data };
    },
  }).data;
  const decide = async (a: AdminArtist, status: "approved" | "rejected") => {
    if (status === "rejected" && !confirm(`Reject ${a.stage_name}'s request?`)) return;
    setBusy(a.id);
    // An approved or rejected request leaves this list as soon as the artists reload.
    if (await update(a.id, { status }, status === "approved" ? `${a.stage_name} approved` : `${a.stage_name} rejected`)) setViewing(null);
    setBusy(null);
  };
  const decisions = (a: AdminArtist) => <>
    <Button size="sm" disabled={busy === a.id} onClick={() => void decide(a, "approved")}>Approve</Button>
    <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => void decide(a, "rejected")}>Reject</Button>
  </>;
  const viewed = rows.find((a) => a.id === viewing);

  return (
    <div className="space-y-4">
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No pending artist requests."}>
        <div className="adm-grid">
          {rows.map((a) => {
            const categoryNames = categoryIdsOf(a).flatMap((id) => cats.find((c) => c.id === id)?.name ?? []);
            const specialityNames = specialityIdsOf(a).flatMap((id) => specialities.find((s) => s.id === id)?.name ?? []);
            const checks = counts ? profileChecks({
              stageName: a.stage_name, tagline: a.tagline, bio: a.bio, basePrice: a.base_price, languages: a.languages, skills: a.skills, body: a.body, photoPath: a.photo_path,
              categories: categoryNames, specialities: specialityNames, area: a.areas?.name ?? "", portfolio: counts.works.filter((w) => w.artist_id === a.id).length, clients: counts.clients.filter((c) => c.artist_id === a.id).length,
            }) : null;
            return (
              <article key={a.id} className="adm-card">
                <Cover artist={a} photo={photos.get(a.id)} />
                <div className="adm-body">
                  <div className="adm-title"><h2>{a.stage_name}</h2><StatusPill status={a.status} /></div>
                  <p className="adm-meta">Requested {dateLabel(a.created_at)}</p>
                  <p className="adm-meta">Category: <b>{categoryNames.join(", ") || "Not chosen"}</b></p>
                  <p className="adm-meta">Speciality: <b>{specialityNames.join(", ") || "Not chosen"}</b></p>
                  <p className="adm-meta">{[a.areas?.name, a.emirates?.name].filter(Boolean).join(", ") || "No location"} · {a.base_price ? `From ${aed(Number(a.base_price))}` : "No price"} · Plan <b className="capitalize">{a.intended_plan ?? a.plan}</b></p>
                  <p className="adm-meta">Form {a.onboarding_complete ? "finished" : "not finished"} · Deposit {a.registration_paid_at ? "paid" : "not paid"}</p>
                  {checks && <div className="grid gap-1.5"><p className="adm-meta">Profile {profilePercent(checks)}% complete · {missingProfileItems(checks).length} missing</p><div className="adm-bar" aria-hidden="true"><i style={{ width: `${profilePercent(checks)}%` }} /></div></div>}
                  <div className="adm-foot">
                    <Button size="sm" variant="secondary" onClick={() => setViewing(a.id)} aria-label={`View profile of ${a.stage_name}`}>View profile</Button>
                    <div className="adm-actions">{decisions(a)}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </ListState>
      {viewed && <ArtistProfileDialog artist={viewed} onClose={() => setViewing(null)} actions={decisions(viewed)} />}
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
