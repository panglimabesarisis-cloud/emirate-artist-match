import { ClientTierSettings } from "@/components/admin/ClientTierSettings";
import { ClientCommissionTransactions, TopClientsChart } from "@/components/admin/ClientFinance";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupportWorkspace } from "@/components/support/SupportWorkspace";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, LifeBuoy, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const list = useQuery({
    queryKey: ["admin-client-withdrawals"],
    queryFn: async () => {
      const r = await supabase.from("client_payout_requests").select("id, reference, user_id, amount, status, account_snapshot, admin_note, created_at, decided_at, paid_at").order("created_at", { ascending: false }).limit(300);
      if (r.error) throw new Error("Unable to load withdrawals");
      return r.data ?? [];
    },
  });
  const decide = async (id: string, status: "approved" | "paid" | "rejected") => {
    const note = status === "rejected" ? (prompt("Reason for rejecting?") ?? "").trim() : null;
    if (status === "rejected" && !note) return;
    const { error } = await supabase.from("client_payout_requests").update({ status, ...(note ? { admin_note: note.slice(0, 500) } : {}) }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "paid" ? "Marked as paid" : status === "approved" ? "Approved" : "Rejected");
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-client-withdrawals"] }), qc.invalidateQueries({ queryKey: ["admin-client-accounts"] })]);
  };
  const clients = useQuery({
    queryKey: ["admin-client-accounts"],
    queryFn: async () => {
      const r = await supabase.rpc("admin_client_accounts");
      if (r.error) throw new Error("Unable to load client accounts");
      return r.data ?? [];
    },
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const clientOf = (userId: string) => clients.data?.find((c) => c.user_id === userId);
  const snapshot = (value: unknown) => { const s = (value ?? {}) as Record<string, unknown>; return (key: string) => String(s[key] ?? ""); };
  const open = list.data?.find((r) => r.id === openId);
  const actions = (r: { id: string; status: string }) => <>
    {r.status === "submitted" && <Button size="sm" onClick={() => decide(r.id, "approved")}>Approve</Button>}
    {r.status === "approved" && <Button size="sm" onClick={() => decide(r.id, "paid")}>Mark paid</Button>}
    {(r.status === "submitted" || r.status === "approved") && <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")}>Reject</Button>}
  </>;
  const badge = (status: string) => <Badge variant={status === "paid" ? "default" : status === "rejected" ? "destructive" : "secondary"}>{status}</Badge>;
  return (
    <div className="space-y-6">
      <TopClientsChart />
      <ClientTierSettings />
      <StudioSection title="Client" accent="withdrawals" subtitle="Select a request ID for its details. Approve, then mark paid after the transfer. Demo mode: no real money moves.">
        {list.error ? <p className="p-4 text-sm text-destructive">Unable to load withdrawals.</p> : (list.data ?? []).length === 0 ? <StudioEmpty title="No withdrawal requests yet" icon={Banknote} /> : (
          <div className="admin-table-wrap"><table><thead><tr><th>Request ID</th><th>Client</th><th>Payout bank</th><th className="text-end">Amount</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {(list.data ?? []).map((r) => {
              const s = snapshot(r.account_snapshot);
              return (
                <tr key={r.id}>
                  <td><button type="button" className="adm-link font-bold" aria-label={`Open request ${r.reference}`} onClick={() => setOpenId(r.id)}>{r.reference}</button></td>
                  <td>{clientOf(r.user_id)?.display_name || s("holder_name") || "Client"}</td>
                  <td dir="ltr">{s("bank_name")} · •••• {s("iban").slice(-4)}</td>
                  <td className="admin-money text-end"><b>{aed(r.amount)}</b></td>
                  <td>{when(r.created_at)}</td>
                  <td>{badge(r.status)}</td>
                  <td><div className="adm-actions">{actions(r)}{r.status !== "submitted" && r.status !== "approved" && <span className="adm-meta">Closed</span>}</div></td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
      </StudioSection>
      <ClientCommissionTransactions />
      <Dialog open={!!open} onOpenChange={(value) => { if (!value) setOpenId(null); }}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.reference ?? "Withdrawal request"}</DialogTitle><DialogDescription>Client commission withdrawal request</DialogDescription></DialogHeader>
          {open && (() => { const s = snapshot(open.account_snapshot); const c = clientOf(open.user_id); return <>
            <div className="flex flex-wrap items-center justify-between gap-3"><b className="font-display text-4xl font-normal">{aed(open.amount)}</b>{badge(open.status)}</div>
            <dl className="admin-detail-grid">
              {[["Client", c?.display_name || "Client"], ["Email", c?.email], ["Phone", c?.phone], ["Account holder", s("holder_name")], ["Bank", s("bank_name")], ["IBAN", s("iban")], ["SWIFT", s("swift")], ["Country", s("country")], ["Requested", when(open.created_at)], ["Decided", when(open.decided_at)], ["Paid", when(open.paid_at)], ["Admin note", open.admin_note], ["Commission available now", c ? aed(c.commission_available) : null], ["Withdrawn to date", c ? aed(c.withdrawn) : null]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="break-words">{value || "—"}</dd></div>)}
            </dl>
            <div className="flex flex-wrap justify-end gap-2">{actions(open)}</div>
          </>; })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SupportInbox() { return <SupportWorkspace admin />; }
