import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Package, Pencil, Plus, Trash2, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ADDON_DURATIONS, ADDON_KINDS, EMPTY_ADDON, addonKindLabel, addonProblem, addonTotalAed, durationLabel, purchaseState, type AddonForm, type AddonKind } from "@/lib/addons";
import { downloadCsv, toCsv } from "@/lib/csv";
import { ListState, usePaged } from "./artists/parts";
import { PersonalAgentPrompts } from "./PersonalAgentPrompts";

const aed = (n: number | string) => `AED ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" }) : "—");
const TONE = { active: "approved", expired: "expired", refunded: "rejected" } as const;

/** Add-on types and prices, and every artist who bought one. */
export function AdminAddons() {
  const qc = useQueryClient();
  const addons = useQuery({
    queryKey: ["admin-addons"],
    queryFn: async () => {
      const r = await supabase.from("addons").select("*").order("created_at");
      if (r.error) throw new Error("Unable to load add-ons");
      return r.data ?? [];
    },
  });
  const purchases = useQuery({
    queryKey: ["admin-addon-purchases"],
    queryFn: async () => {
      const r = await supabase.from("addon_purchases").select("*, artists(stage_name, slug), addons(name, kind)").order("paid_at", { ascending: false }).limit(1000);
      if (r.error) throw new Error("Unable to load add-on buyers");
      return r.data ?? [];
    },
  });
  const [editing, setEditing] = useState<{ id: string | null; form: AddonForm } | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const [addon, setAddon] = useState("all");
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin-addons"] }), qc.invalidateQueries({ queryKey: ["admin-addon-purchases"] })]);

  const list = addons.data ?? [];
  const bought = purchases.data ?? [];
  const delivery = (p: (typeof bought)[number]) => (p.addons?.kind !== "service" ? "Automatic" : p.fulfilled_at ? `Delivered ${day(p.fulfilled_at)}` : "Awaiting delivery");
  const filtered = bought.filter((p) => (state === "all" || purchaseState(p) === state) && (addon === "all" || p.addon_id === addon)
    && `${p.artists?.stage_name ?? ""} ${p.artists?.slug ?? ""} ${p.addons?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const paged = usePaged(filtered);
  const kept = bought.filter((p) => !p.refunded_at);
  const kpis = [
    { label: "Add-ons on sale", value: list.filter((a) => a.active).length, sub: `${list.length} created`, icon: Package },
    { label: "Artists with an active add-on", value: new Set(bought.filter((p) => purchaseState(p) === "active").map((p) => p.artist_id)).size, sub: `${bought.length} purchases`, icon: Users },
    { label: "Add-on revenue", value: aed(kept.reduce((n, p) => n + Number(p.price_aed), 0)), sub: "Excluding VAT and refunds", icon: Wallet },
    { label: "Awaiting delivery", value: kept.filter((p) => p.addons?.kind === "service" && !p.fulfilled_at).length, sub: "Team services to deliver", icon: CheckCircle2 },
  ];

  const problem = editing ? addonProblem(editing.form) : null;
  const set = (patch: Partial<AddonForm>) => setEditing((current) => current && { ...current, form: { ...current.form, ...patch } });
  const save = async () => {
    if (!editing || problem || busy) return;
    setBusy(true);
    const f = editing.form;
    const row = { name: f.name.trim(), kind: f.kind, description: f.description.trim(), price_aed: Number(f.price), duration_days: f.duration, active: f.active };
    const r = editing.id ? await supabase.from("addons").update(row).eq("id", editing.id).select("id") : await supabase.from("addons").insert(row).select("id");
    setBusy(false);
    // Row security turns a change without permission into no rows rather than an error.
    if (r.error || !r.data?.length) { toast.error(r.error?.message ?? "You do not have permission to change add-ons"); return; }
    setEditing(null);
    toast.success("Add-on saved");
    await refresh();
  };
  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const r = await supabase.from("addons").delete().eq("id", id).select("id");
    if (r.error || !r.data?.length) { toast.error(r.error?.code === "23503" ? "Artists have bought this add-on. Switch it off instead." : "Could not delete this add-on"); return; }
    toast.success("Add-on deleted");
    await refresh();
  };
  const deliver = async (id: string) => {
    const r = await supabase.from("addon_purchases").update({ fulfilled_at: new Date().toISOString() }).eq("id", id).select("id");
    if (r.error || !r.data?.length) { toast.error("Could not mark this as delivered"); return; }
    toast.success("Marked as delivered");
    await refresh();
  };

  const addonCard = (a: (typeof list)[number]) => (
          <article className="adm-panel" key={a.id}>
            <div className="flex flex-wrap gap-2"><span className="adm-pill is-badge">{addonKindLabel(a.kind)}</span><span className={`adm-pill is-${a.active ? "approved" : "expired"}`}>{a.active ? "on sale" : "off"}</span></div>
            <h2 className="break-words" dir="auto">{a.name}</h2>
            <p className="adm-meta break-words" dir="auto">{a.description}</p>
            <p><b className="admin-money text-2xl">{aed(a.price_aed)}</b> <span className="adm-meta">· {durationLabel(a.duration_days)}</span><br /><span className="adm-meta">Artist pays {aed(addonTotalAed(Number(a.price_aed)))} with 5% VAT · {bought.filter((p) => p.addon_id === a.id && !p.refunded_at).length} sold</span></p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" aria-label={`Edit ${a.name}`} onClick={() => setEditing({ id: a.id, form: { name: a.name, kind: a.kind as AddonKind, description: a.description, price: String(a.price_aed), duration: a.duration_days, active: a.active } })}><Pencil />Edit</Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => void remove(a.id, a.name)}><Trash2 />Delete</Button>
            </div>
          </article>
  );

  return (
    <div className="admin-overview">
      <div className="admin-overview-kpis">{kpis.map(({ label, value, sub, icon: Icon }) => <article className="admin-overview-kpi" key={label}><Icon aria-hidden="true" /><small>{label}</small><strong>{purchases.isPending || addons.isPending ? "…" : value}</strong><p>{sub}</p></article>)}</div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl">Add-on types</h2>
        <Button size="sm" onClick={() => setEditing({ id: null, form: EMPTY_ADDON })}><Plus />New add-on</Button>
      </div>
      {addons.error || addons.isPending ? <ListState pending={addons.isPending} error={addons.error} empty={null}>{null}</ListState> : (
        <>
          {!list.length && <p className="adm-empty">No add-on yet. Create one to put it on sale in the artist dashboard.</p>}
          {/* The agent's prompts sit right of the Personal AI Agent add-on. */}
          <div className="adm-grid">
            {list.filter((a) => a.kind === "ai_page").map(addonCard)}
            <PersonalAgentPrompts />
            {list.filter((a) => a.kind !== "ai_page").map(addonCard)}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl">Buyers</h2>
        <Button size="sm" variant="outline" disabled={!filtered.length} onClick={() => downloadCsv("dealmaker-addon-buyers.csv", toCsv(filtered, [["Artist", (p) => p.artists?.stage_name], ["Add-on", (p) => p.addons?.name], ["Type", (p) => addonKindLabel(p.addons?.kind ?? "")], ["Price AED", (p) => p.price_aed], ["Paid", (p) => p.paid_at], ["Expires", (p) => p.expires_at], ["Status", (p) => purchaseState(p)], ["Delivery", delivery]]))}>Export CSV</Button>
      </div>
      <div className="admin-toolbar">
        <Input type="search" aria-label="Search buyers" placeholder="Search artist or add-on" value={search} onChange={(e) => { setSearch(e.target.value); paged.first(); }} />
        <Select value={addon} onValueChange={(v) => { setAddon(v); paged.first(); }}><SelectTrigger aria-label="Filter by add-on"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All add-ons</SelectItem>{list.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
        <Select value={state} onValueChange={(v) => { setState(v); paged.first(); }}><SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.keys(TONE).map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select>
      </div>
      <ListState pending={purchases.isPending} error={purchases.error} empty={filtered.length ? null : bought.length ? "No purchase matches these filters." : "No artist has bought an add-on yet."}>
        <div className="admin-table-wrap"><table><thead><tr><th>Artist</th><th>Add-on</th><th className="text-end">Price</th><th>Paid</th><th>Expires</th><th>Status</th><th>Delivery</th></tr></thead><tbody>
          {paged.slice.map((p) => (
            <tr key={p.id}>
              <td><b>{p.artists?.stage_name ?? "—"}</b>{p.artists?.slug && <div className="admin-row-detail" dir="ltr">/{p.artists.slug}</div>}</td>
              <td>{p.addons?.name}<div className="admin-row-detail">{addonKindLabel(p.addons?.kind ?? "")}</div></td>
              <td className="admin-money text-end">{aed(p.price_aed)}</td><td className="whitespace-nowrap">{day(p.paid_at)}</td><td className="whitespace-nowrap">{p.expires_at ? day(p.expires_at) : "No expiry"}</td>
              <td><span className={`adm-pill is-${TONE[purchaseState(p)]}`}>{purchaseState(p)}</span></td>
              <td>{p.addons?.kind === "service" && !p.fulfilled_at && !p.refunded_at ? <Button size="sm" variant="outline" onClick={() => void deliver(p.id)}>Mark delivered</Button> : <span className="adm-meta">{p.refunded_at ? "—" : delivery(p)}</span>}</td>
            </tr>
          ))}
        </tbody></table></div>
        {paged.pager}
      </ListState>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit add-on" : "New add-on"}</DialogTitle><DialogDescription>A new price applies to new purchases only.</DialogDescription></DialogHeader>
          {editing && (
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
              <div className="space-y-1"><Label htmlFor="addon-name">Name</Label><Input id="addon-name" maxLength={80} value={editing.form.name} onChange={(e) => set({ name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Type</Label>
                <Select value={editing.form.kind} disabled={!!editing.id} onValueChange={(v) => set({ kind: v as AddonKind })}><SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ADDON_KINDS).map(([key, k]) => <SelectItem key={key} value={key}>{k.label}</SelectItem>)}</SelectContent></Select>
                <p className="adm-meta">{ADDON_KINDS[editing.form.kind].note}</p>
              </div>
              <div className="space-y-1"><Label htmlFor="addon-description">Description</Label><Textarea id="addon-description" rows={4} maxLength={600} value={editing.form.description} onChange={(e) => set({ description: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="addon-price">Price (AED, before VAT)</Label><Input id="addon-price" type="number" min="0.01" step="0.01" value={editing.form.price} onChange={(e) => set({ price: e.target.value })} /></div>
                <div className="space-y-1"><Label>Valid for</Label>
                  <Select value={String(editing.form.duration ?? "none")} disabled={!!editing.id} onValueChange={(v) => set({ duration: v === "none" ? null : Number(v) })}><SelectTrigger aria-label="Valid for"><SelectValue /></SelectTrigger><SelectContent>{ADDON_DURATIONS.map((d) => <SelectItem key={d} value={String(d)}>{durationLabel(d)}</SelectItem>)}<SelectItem value="none">{durationLabel(null)}</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="flex items-center gap-2"><Switch id="addon-active" checked={editing.form.active} onCheckedChange={(active) => set({ active })} /><Label htmlFor="addon-active">On sale in the artist dashboard</Label></div>
              {problem && (editing.form.name || editing.form.description || editing.form.price) && <p role="status" className="adm-meta">{problem}</p>}
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={!!problem || busy}>Save add-on</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
