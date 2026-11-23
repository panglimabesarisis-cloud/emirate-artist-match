import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, LifeBuoy, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StudioEmpty, StudioSection } from "@/components/dashboard/StudioPage";

const aed = (n: number | string | null | undefined) => `AED ${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }) : "—");

/** Client accounts with booking totals, commission balances and payout account verification. */
export function ClientAccounts() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data, error, isLoading } = useQuery({
    queryKey: ["admin-client-accounts"],
    queryFn: async () => {
      const r = await supabase.rpc("admin_client_accounts");
      if (r.error) throw new Error("Unable to load client accounts");
      return r.data ?? [];
    },
  });
  const accounts = useQuery({
    queryKey: ["admin-client-payout-accounts"],
    queryFn: async () => {
      const r = await supabase.from("client_payout_accounts").select("user_id, holder_name, bank_name, iban, swift, country, verified_at, updated_at").order("updated_at", { ascending: false });
      if (r.error) throw new Error("Unable to load payout accounts");
      return r.data ?? [];
    },
  });
  const verify = async (userId: string, ok: boolean) => {
    const { error: e } = await supabase.from("client_payout_accounts").update({ verified_at: ok ? new Date().toISOString() : null }).eq("user_id", userId);
    if (e) { toast.error(e.message); return; }
    toast.success(ok ? "Payout account verified" : "Verification removed");
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-client-accounts"] }), qc.invalidateQueries({ queryKey: ["admin-client-payout-accounts"] })]);
  };
  const rows = (data ?? []).filter((r) => `${r.display_name ?? ""} ${r.email ?? ""} ${r.company_name ?? ""} ${r.phone ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const pendingAccounts = (accounts.data ?? []).filter((a) => !a.verified_at);
  return (
    <div className="space-y-6">
      <StudioSection title="Payout accounts" accent="to verify" subtitle="Clients can only withdraw commission to a verified bank account. Editing an account resets verification.">
        {accounts.error ? <p className="p-4 text-sm text-destructive">Unable to load payout accounts.</p> : pendingAccounts.length === 0 ? <StudioEmpty title="No accounts waiting" icon={ShieldCheck} /> : (
          <div className="divide-y rounded-xl border">
            {pendingAccounts.map((a) => {
              const owner = data?.find((r) => r.user_id === a.user_id);
              return (
                <div key={a.user_id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{a.holder_name} · {a.bank_name}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{a.iban}{a.swift ? ` · ${a.swift}` : ""} · {a.country}</div>
                    <div className="text-xs text-muted-foreground">{owner ? `${owner.display_name ?? "Client"} · ${owner.email ?? ""}` : "Client"} · updated {when(a.updated_at)}</div>
                  </div>
                  <Button size="sm" onClick={() => verify(a.user_id, true)}>Verify</Button>
                </div>
              );
            })}
          </div>
        )}
      </StudioSection>
      <StudioSection title="Client" accent="accounts" subtitle="Signed-in clients, their bookings and commission balances." aside={<Input className="w-56" type="search" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" />}>
        {error ? <p className="p-4 text-sm text-destructive">Unable to load client accounts.</p> : isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <StudioEmpty title="No clients yet" icon={Users} /> : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Client</th><th className="p-3">Bookings</th><th className="p-3">Paid</th><th className="p-3">Commission</th><th className="p-3">Withdrawals</th><th className="p-3">Payout account</th></tr></thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="p-3"><div className="font-medium">{r.display_name || "Client"}{r.company_name ? ` · ${r.company_name}` : ""}</div><div className="text-xs text-muted-foreground" dir="ltr">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div><div className="text-xs text-muted-foreground">Joined {when(r.joined_at)}</div></td>
                    <td className="p-3">{Number(r.booking_count)}</td>
                    <td className="p-3">{aed(r.paid_total)}</td>
                    <td className="p-3"><div>{aed(r.commission_available)} available</div><div className="text-xs text-muted-foreground">{aed(r.commission_pending)} pending</div></td>
                    <td className="p-3"><div>{aed(r.withdrawn)} paid</div><div className="text-xs text-muted-foreground">{aed(r.processing)} processing</div></td>
                    <td className="p-3">{r.payout_bank ? <><div>{r.payout_bank} · •••• {r.payout_iban_last4}</div>{r.payout_verified_at ? <button type="button" className="text-xs text-muted-foreground underline" onClick={() => verify(r.user_id, false)}>Verified · remove</button> : <Badge variant="secondary">Awaiting verification</Badge>}</> : <span className="text-xs text-muted-foreground">None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StudioSection>
    </div>
  );
}

/** Client commission programme settings and the withdrawal queue. */
export function ClientWithdrawals() {
  const qc = useQueryClient();
  const program = useQuery({
    queryKey: ["admin-client-program"],
    queryFn: async () => {
      const r = await supabase.from("client_program_settings").select("commission_pct, min_withdrawal, enabled, updated_at").maybeSingle();
      if (r.error) throw new Error("Unable to load programme settings");
      return r.data ?? { commission_pct: 2, min_withdrawal: 500, enabled: true, updated_at: null };
    },
  });
  const [v, setV] = useState({ pct: "2", min: "500", enabled: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (program.data) setV({ pct: String(Number(program.data.commission_pct)), min: String(Number(program.data.min_withdrawal)), enabled: program.data.enabled }); }, [program.data]);
  const list = useQuery({
    queryKey: ["admin-client-withdrawals"],
    queryFn: async () => {
      const r = await supabase.from("client_payout_requests").select("id, reference, user_id, amount, status, account_snapshot, admin_note, created_at, decided_at, paid_at").order("created_at", { ascending: false }).limit(300);
      if (r.error) throw new Error("Unable to load withdrawals");
      return r.data ?? [];
    },
  });
  const pct = Number(v.pct);
  const min = Number(v.min);
  const invalid = !(pct >= 0 && pct <= 20) || !(min >= 0 && min <= 100000) || !v.pct || !v.min;
  const save = async () => {
    if (invalid) return;
    setBusy(true);
    const { error } = await supabase.from("client_program_settings").upsert({ id: true, commission_pct: Math.round(pct * 100) / 100, min_withdrawal: Math.round(min * 100) / 100, enabled: v.enabled });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Programme settings saved. New rates apply from each booking's first payment.");
    await qc.invalidateQueries({ queryKey: ["admin-client-program"] });
  };
  const decide = async (id: string, status: "approved" | "paid" | "rejected") => {
    const note = status === "rejected" ? (prompt("Reason for rejecting?") ?? "").trim() : null;
    if (status === "rejected" && !note) return;
    const { error } = await supabase.from("client_payout_requests").update({ status, ...(note ? { admin_note: note.slice(0, 500) } : {}) }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "paid" ? "Marked as paid" : status === "approved" ? "Approved" : "Rejected");
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-client-withdrawals"] }), qc.invalidateQueries({ queryKey: ["admin-client-accounts"] })]);
  };
  return (
    <div className="space-y-6">
      <StudioSection title="Client commission" accent="programme" subtitle="Applies to the booking value before VAT. The rate is fixed on each booking at its first payment and becomes available after payment is released to the artist.">
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-1.5"><Label htmlFor="cpp-pct">Commission rate (%)</Label><Input id="cpp-pct" type="number" min={0} max={20} step="0.01" value={v.pct} onChange={(e) => setV({ ...v, pct: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="cpp-min">Minimum withdrawal (AED)</Label><Input id="cpp-min" type="number" min={0} max={100000} step="1" value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })} /></div>
          <div className="flex items-end gap-3 pb-2"><Switch id="cpp-on" checked={v.enabled} onCheckedChange={(c) => setV({ ...v, enabled: c })} /><Label htmlFor="cpp-on">{v.enabled ? "Programme active" : "Paused for new bookings"}</Label></div>
          <div className="sm:col-span-3 flex items-center gap-3"><Button type="submit" disabled={invalid || busy}>{busy ? "Saving…" : "Save programme"}</Button>{program.data?.updated_at && <span className="text-xs text-muted-foreground">Last changed {when(program.data.updated_at)}</span>}</div>
        </form>
      </StudioSection>
      <StudioSection title="Client" accent="withdrawals" subtitle="Approve, then mark paid after the transfer. Demo mode: no real money moves.">
        {list.error ? <p className="p-4 text-sm text-destructive">Unable to load withdrawals.</p> : (list.data ?? []).length === 0 ? <StudioEmpty title="No withdrawal requests yet" icon={Banknote} /> : (
          <div className="divide-y rounded-xl border">
            {(list.data ?? []).map((r) => {
              const s = (r.account_snapshot ?? {}) as Record<string, unknown>;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.reference} · {aed(r.amount)}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{String(s["holder_name"] ?? "")} · {String(s["bank_name"] ?? "")} · {String(s["iban"] ?? "")}{s["swift"] ? ` · ${String(s["swift"])}` : ""}</div>
                    <div className="text-xs text-muted-foreground">Requested {when(r.created_at)}{r.paid_at ? ` · paid ${when(r.paid_at)}` : r.decided_at ? ` · decided ${when(r.decided_at)}` : ""}{r.admin_note ? ` · ${r.admin_note}` : ""}</div>
                  </div>
                  <Badge variant={r.status === "paid" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
                  {r.status === "submitted" && <Button size="sm" onClick={() => decide(r.id, "approved")}>Approve</Button>}
                  {r.status === "approved" && <Button size="sm" onClick={() => decide(r.id, "paid")}>Mark paid</Button>}
                  {(r.status === "submitted" || r.status === "approved") && <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")}>Reject</Button>}
                </div>
              );
            })}
          </div>
        )}
      </StudioSection>
    </div>
  );
}

const TOPIC: Record<string, string> = { booking: "Booking assistance", payment: "Payment issue", commission: "Commission / withdrawal", account: "Account support", verification: "Verification", payout: "Payout / wallet", calendar: "Calendar", technical: "Technical issue" };

/** Support requests sent from the client portal; replies show in the client's Support Center and Notifications. */
export function SupportInbox() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { data, error } = useQuery({
    queryKey: ["admin-support", filter],
    queryFn: async () => {
      let q = supabase.from("support_requests").select("id, reference, user_id, artist_id, artists(stage_name), topic, booking_id, message, status, admin_reply, replied_at, created_at").order("created_at", { ascending: false }).limit(200);
      if (filter === "open") q = q.eq("status", "open");
      const r = await q;
      if (r.error) throw new Error("Unable to load support requests");
      return r.data ?? [];
    },
  });
  const save = async (id: string, patch: { admin_reply?: string; status?: "closed" | "open" }) => {
    const { error: e } = await supabase.from("support_requests").update(patch).eq("id", id);
    if (e) { toast.error(e.message); return; }
    toast.success(patch.status === "closed" ? "Request closed" : patch.status === "open" ? "Request reopened" : "Reply sent");
    setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    await qc.invalidateQueries({ queryKey: ["admin-support"] });
  };
  return (
    <StudioSection title="Support" accent="inbox" subtitle="Requests from clients and artists." aside={<div className="flex gap-2"><Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>Open</Button><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button></div>}>
      {error ? <p className="p-4 text-sm text-destructive">Unable to load support requests.</p> : (data ?? []).length === 0 ? <StudioEmpty title={filter === "open" ? "No open requests" : "No requests yet"} icon={LifeBuoy} /> : (
        <div className="divide-y rounded-xl border">
          {(data ?? []).map((r) => {
            const draft = drafts[r.id] ?? r.admin_reply ?? "";
            return (
              <div key={r.id} className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><b>{r.reference}</b><Badge variant="outline">{r.artist_id ? `Artist · ${r.artists?.stage_name ?? "—"}` : "Client"}</Badge><span className="text-muted-foreground">· {TOPIC[r.topic] ?? r.topic} · {when(r.created_at)}</span><Badge variant={r.status === "open" ? "secondary" : r.status === "answered" ? "default" : "outline"} className="ms-auto">{r.status}</Badge></div>
                <p className="whitespace-pre-wrap" dir="auto">{r.message}</p>
                {r.booking_id && <p className="text-xs text-muted-foreground">Booking {r.booking_id.slice(0, 8).toUpperCase()}</p>}
                <Textarea value={draft} maxLength={2000} placeholder="Write a reply the sender sees in their dashboard…" onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} aria-label={`Reply to ${r.reference}`} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!draft.trim() || draft === (r.admin_reply ?? "")} onClick={() => save(r.id, { admin_reply: draft.trim() })}>{r.admin_reply ? "Update reply" : "Send reply"}</Button>
                  {r.status !== "closed" ? <Button size="sm" variant="outline" onClick={() => save(r.id, { status: "closed" })}>Close</Button> : <Button size="sm" variant="outline" onClick={() => save(r.id, { status: "open" })}>Reopen</Button>}
                  {r.replied_at && <span className="self-center text-xs text-muted-foreground">Replied {when(r.replied_at)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StudioSection>
  );
}
