import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PublicLayout } from "@/components/site/PublicLayout";
import { BADGE_LABELS, slugify } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdminEscrow } from "@/components/dashboard/AdminEscrow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin | Dealmaker" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

function Admin() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <PublicLayout><div className="p-16 text-center text-muted-foreground">Loading…</div></PublicLayout>;
  if (!isAdmin) return <PublicLayout><div className="p-16 text-center">You don't have access to the admin area.</div></PublicLayout>;
  return (
    <PublicLayout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <Tabs defaultValue="artists" className="mt-6">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="artists">Artist approvals</TabsTrigger>
            <TabsTrigger value="verify">Verification Center</TabsTrigger>
            <TabsTrigger value="reviews">Review moderation</TabsTrigger>
            <TabsTrigger value="escrow">Escrow & disputes</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
          </TabsList>
          <TabsContent value="artists"><Artists /></TabsContent>
          <TabsContent value="verify"><VerifyQueue /></TabsContent>
          <TabsContent value="reviews"><ReviewQueue /></TabsContent>
          <TabsContent value="escrow"><AdminEscrow /></TabsContent>
          <TabsContent value="catalog"><Catalog /></TabsContent>
        </Tabs>
      </div>
    </PublicLayout>
  );
}

function Artists() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-artists"],
    queryFn: async () => (await supabase.from("artists").select("id, stage_name, status, plan, featured, created_at, categories(name)").order("status").order("created_at", { ascending: false })).data ?? [],
  });
  const set = async (id: string, patch: { status?: string; featured?: boolean }) => {
    const { error } = await supabase.from("artists").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin-artists"] });
  };
  return (
    <div className="mt-6 space-y-2">
      {data?.map((a) => (
        <div key={a.id} className="rounded-xl bg-card p-3 shadow-card flex items-center justify-between gap-3">
          <div><span className="font-semibold">{a.stage_name}</span> <span className="text-sm text-muted-foreground">· {a.categories?.name} · {a.plan}</span></div>
          <div className="flex items-center gap-2">
            <Badge variant={a.status === "approved" ? "default" : "secondary"}>{a.status}</Badge>
            {a.status !== "approved" && <Button size="sm" onClick={() => set(a.id, { status: "approved" })}>Approve</Button>}
            {a.status === "pending" && <Button size="sm" variant="ghost" onClick={() => set(a.id, { status: "rejected" })}>Reject</Button>}
            <Button size="sm" variant="outline" onClick={() => set(a.id, { featured: !a.featured })}>{a.featured ? "Unfeature" : "Feature"}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function VerifyQueue() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-verif"],
    queryFn: async () => (await supabase.from("verification_applications").select("*, artists(stage_name)").order("created_at", { ascending: false })).data ?? [],
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = async (id: string, status: string) => {
    const { error } = await supabase.from("verification_applications").update({ status, admin_note: notes[id] || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${status.replace(/_/g, " ")}`);
    qc.invalidateQueries({ queryKey: ["admin-verif"] });
  };
  const view = async (path: string) => {
    const { data, error } = await supabase.storage.from("verification-docs").createSignedUrl(path, 120);
    if (error || !data) { toast.error("Could not open document"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };
  return (
    <div className="mt-6 space-y-3">
      {data?.length === 0 && <p className="text-muted-foreground">No applications yet.</p>}
      {data?.map((a) => (
        <div key={a.id} className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex justify-between"><span className="font-semibold">{a.artists?.stage_name} — {BADGE_LABELS[a.badge_type]}</span><Badge variant="secondary">{a.status.replace(/_/g, " ")}</Badge></div>
          {a.note && <p className="text-sm text-muted-foreground mt-1">{a.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {a.doc_path && <Button size="sm" variant="outline" onClick={() => view(a.doc_path!)}>View document</Button>}
            <Input className="max-w-xs" placeholder="Note to artist" value={notes[a.id] ?? ""} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
            <Button size="sm" onClick={() => decide(a.id, "approved")}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => decide(a.id, "needs_more_info")}>Need more info</Button>
            <Button size="sm" variant="ghost" onClick={() => decide(a.id, "rejected")}>Reject</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewQueue() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => (await supabase.from("reviews").select("*, artists(stage_name)").in("status", ["reported", "hidden"]).order("created_at", { ascending: false })).data ?? [],
  });
  const set = async (id: string, status: string) => {
    await supabase.from("reviews").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
  };
  return (
    <div className="mt-6 space-y-3">
      {data?.length === 0 && <p className="text-muted-foreground">No reported reviews.</p>}
      {data?.map((r) => (
        <div key={r.id} className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex justify-between"><span className="font-semibold">{r.artists?.stage_name} · {r.client_name} · {"★".repeat(r.rating)}</span><Badge variant="secondary">{r.status}</Badge></div>
          <p className="text-sm mt-2">{r.body}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => set(r.id, "published")}>Keep published</Button>
            <Button size="sm" variant="outline" onClick={() => set(r.id, "hidden")}>Hide</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Catalog() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: async () => {
      const [c, e] = await Promise.all([supabase.from("categories").select("id,name,slug").order("sort"), supabase.from("event_types").select("id,name,slug").order("sort")]);
      return { categories: c.data ?? [], events: e.data ?? [] };
    },
  });
  const [ev, setEv] = useState("");
  const addEvent = async () => {
    if (!ev.trim()) return;
    const { error } = await supabase.from("event_types").insert({ name: ev.trim(), slug: slugify(ev), sort: 100 });
    if (error) { toast.error(error.message); return; }
    setEv(""); qc.invalidateQueries({ queryKey: ["admin-catalog"] });
  };
  return (
    <div className="mt-6 grid gap-8 md:grid-cols-2">
      <div><h3 className="font-semibold text-lg">Categories</h3><ul className="mt-2 text-sm space-y-1">{data?.categories.map((c) => <li key={c.id}>{c.name} <span className="text-muted-foreground">/{c.slug}</span></li>)}</ul></div>
      <div>
        <h3 className="font-semibold text-lg">Event types</h3>
        <div className="mt-2 flex gap-2"><Input value={ev} onChange={(e) => setEv(e.target.value)} placeholder="New event type" /><Button onClick={addEvent}>Add</Button></div>
        <div className="mt-3 flex flex-wrap gap-1.5">{data?.events.map((e) => <Badge key={e.id} variant="secondary">{e.name}</Badge>)}</div>
      </div>
    </div>
  );
}
