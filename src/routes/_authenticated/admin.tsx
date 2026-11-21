import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PublicLayout } from "@/components/site/PublicLayout";
import { BADGE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdminEscrow } from "@/components/dashboard/AdminEscrow";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { ArtistDirectory, ArtistRequests, CategoryManager, EventTypeManager } from "@/components/admin/AdminArtists";
import { AdminPlans } from "@/components/admin/AdminPlans";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { AdminRatecards } from "@/components/admin/AdminRatecards";
import { InvoiceRecords } from "@/components/dashboard/InvoiceRecords";
import { ContractsTable } from "@/components/dashboard/ContractsTable";
import { FlowBuilder } from "@/components/flow/FlowBuilder";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin | Dealmaker" }, { name: "robots", content: "noindex" }, { name: "description", content: "Manage Dealmaker artists, bookings and the master AI conversation flow." }, { property: "og:title", content: "Admin | Dealmaker" }, { property: "og:description", content: "Dealmaker administration and master AI flow builder." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Admin,
});

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "artists", label: "Artist directory", group: "Artists" },
  { id: "requests", label: "Artist requests", group: "Artists" },
  { id: "categories", label: "Categories", group: "Artists" },
  { id: "verify", label: "Verification", group: "Artists" },
  { id: "ratecards", label: "Ratecard", group: "Business" },
  { id: "invoices", label: "Invoice", group: "Business" },
  { id: "contracts", label: "Contract", group: "Business" },
  { id: "plans", label: "Artist packages", group: "Business" },
  { id: "escrow", label: "Escrow & disputes", group: "Business" },
  { id: "payouts", label: "Artist payouts", group: "Business" },
  { id: "reviews", label: "Review moderation", group: "Business" },
  { id: "catalog", label: "Event types", group: "Business" },
  { id: "flow", label: "AI flow builder", group: "System" },
  { id: "settings", label: "Settings", group: "System" },
] as const;
type Section = (typeof NAV)[number]["id"];

function Admin() {
  const { isAdmin, loading, user } = useAuth();
  const [section, setSection] = useState<Section>("overview");
  const [menu, setMenu] = useState(false);
  const pending = useQuery({ queryKey: ["admin-pending-count"], enabled: isAdmin, queryFn: async () => (await supabase.from("artists").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0 }).data ?? 0;
  if (loading) return <div className="p-16 text-center text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <PublicLayout><div className="p-16 text-center">You don't have access to the admin area.</div></PublicLayout>;
  const current = NAV.find((n) => n.id === section)!;
  let lastGroup: string | undefined;
  return (
    <div className="min-h-screen bg-muted/40 md:flex">
      <aside className={`${menu ? "block" : "hidden"} admin-site-side md:block md:w-60 shrink-0 bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/" className="text-lg font-semibold">Dealmaker <span className="text-sidebar-primary">CRM</span></Link>
        </div>
        <nav className="px-3 pb-6 space-y-0.5">
          {NAV.map((n) => {
            const g = "group" in n ? n.group : undefined;
            const header = g && g !== lastGroup ? <div className="px-3 pt-4 pb-1 text-[11px] uppercase tracking-wider opacity-60">{g}</div> : null;
            lastGroup = g;
            return (
              <div key={n.id}>
                {header}
                <button onClick={() => { setSection(n.id); setMenu(false); }} className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-start transition-colors ${section === n.id ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium" : "hover:bg-sidebar-accent"}`}>
                  <span className="flex-1">{n.label}</span>
                  {n.id === "requests" && pending > 0 && <span className="rounded-full bg-sidebar-primary px-1.5 text-xs text-sidebar-primary-foreground">{pending}</span>}
                </button>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="admin-site-top sticky top-0 z-10 flex items-center gap-3 border-b bg-background/90 backdrop-blur px-4 md:px-8 py-3">
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => setMenu(!menu)}>☰</Button>
          <h1 className="text-lg font-semibold whitespace-nowrap">{current.label}</h1>
          <span className="ms-auto hidden sm:block text-sm text-muted-foreground truncate">{user?.email} · Super admin</span>
        </header>
        <main className="p-4 md:p-8">
          {section === "overview" && <AdminOverview />}
          {section === "artists" && <ArtistDirectory />}
          {section === "requests" && <ArtistRequests />}
          {section === "categories" && <CategoryManager />}
          {section === "verify" && <VerifyQueue />}
          {section === "ratecards" && <AdminRatecards />}
          {section === "invoices" && <InvoiceRecords />}
          {section === "contracts" && <ContractsTable />}
          {section === "plans" && <AdminPlans />}
          {section === "escrow" && <AdminEscrow />}
          {section === "payouts" && <PayoutQueue />}
          {section === "reviews" && <ReviewQueue />}
          {section === "catalog" && <EventTypeManager />}
          {section === "settings" && <AdminSettings />}
          {section === "flow" && <FlowBuilder artistId={null} />}
        </main>
      </div>
    </div>
  );
}

function PayoutQueue() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => (await supabase.from("payout_requests").select("*, artists(stage_name)").order("created_at", { ascending: false })).data ?? [],
  });
  const decide = async (id: string, status: "paid" | "rejected") => {
    const note = status === "rejected" ? prompt("Reason for rejecting?") ?? "" : "";
    const { error } = await supabase.from("payout_requests").update({ status, admin_note: note || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "paid" ? "Marked as paid" : "Rejected");
    qc.invalidateQueries({ queryKey: ["admin-payouts"] });
  };
  return (
    <div className="rounded-xl border bg-card divide-y">
      {data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No withdrawal requests yet.</p>}
      {data?.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.artists?.stage_name} · AED {Number(r.amount).toLocaleString("en-US")}</div>
            <div className="whitespace-pre-line text-xs text-muted-foreground">{r.bank_details}</div>
            <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-GB")}</div>
          </div>
          <Badge variant={r.status === "paid" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
          {r.status === "pending" && <><Button size="sm" onClick={() => decide(r.id, "paid")}>Mark paid</Button><Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")}>Reject</Button></>}
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
    <div className="space-y-3">
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
    <div className="space-y-3">
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
