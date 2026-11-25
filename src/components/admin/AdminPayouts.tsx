import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { invoiceMoney } from "@/lib/invoice";
import { issuerLines } from "@/lib/site-settings";
import { A4Dialog, A4Statement } from "./documents/A4Dialog";
import { ListState, StatusPill } from "./artists/parts";

const when = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }) : "—");
const lastFour = (details: string | null) => { const iban = details?.match(/IBAN:\s*([A-Z0-9 ]+)/i)?.[1]?.replace(/\s/g, ""); return iban ? `•••• ${iban.slice(-4)}` : "—"; };

export function AdminPayouts() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payout_requests").select("*, artists(stage_name)").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [viewing, setViewing] = useState<string | null>(null);
  const issuer = useSiteSettings().invoice;
  const rows = (query.data ?? []).filter((r) => (status === "all" || r.status === status) && `${r.artists?.stage_name ?? ""} ${r.id}`.toLowerCase().includes(q.trim().toLowerCase()));
  const sum = (state: string) => (query.data ?? []).filter((r) => r.status === state).reduce((n, r) => n + Number(r.amount), 0);
  const decide = async (id: string, next: "paid" | "rejected") => {
    const note = next === "rejected" ? (prompt("Reason for rejecting?") ?? "").trim() : "";
    if (next === "rejected" && !note) return;
    if (next === "paid" && !confirm("Mark this payout as paid after the transfer has been made?")) return;
    const { data, error } = await supabase.from("payout_requests").update({ status: next, admin_note: note || null }).eq("id", id).select("id");
    if (error || !data?.length) { toast.error(error?.message ?? "You do not have permission for this"); return; }
    toast.success(next === "paid" ? "Marked as paid" : "Rejected");
    await qc.invalidateQueries({ queryKey: ["admin-payouts"] });
  };
  const viewed = query.data?.find((r) => r.id === viewing);

  return (
    <div className="space-y-5">
      <div className="adm-grid">{([["Waiting for payment", "pending"], ["Paid", "paid"], ["Rejected", "rejected"]] as const).map(([label, state]) => <section key={state} className="adm-panel !gap-1"><span className="adm-meta">{label}</span><b className="font-display text-4xl font-normal">{invoiceMoney(sum(state))}</b><span className="adm-meta">{(query.data ?? []).filter((r) => r.status === state).length} requests</span></section>)}</div>
      <div className="admin-toolbar">
        <Input aria-label="Search payouts" placeholder="Search artist or payout ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44" aria-label="Payout status"><SelectValue /></SelectTrigger><SelectContent>{["all", "pending", "paid", "rejected"].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All status" : s}</SelectItem>)}</SelectContent></Select>
      </div>
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No withdrawal request matches."}>
        <div className="admin-table-wrap"><table><thead><tr><th>Payout ID</th><th>Artist</th><th>Beneficiary IBAN</th><th className="text-end">Amount</th><th>Requested</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>PO-{r.id.slice(0, 8).toUpperCase()}</b></td>
              <td><b>{r.artists?.stage_name}</b></td>
              <td dir="ltr">{lastFour(r.bank_details)}</td>
              <td className="admin-money text-end"><b>{invoiceMoney(Number(r.amount))}</b></td>
              <td>{when(r.created_at)}</td>
              <td><StatusPill status={r.status} />{r.admin_note && <div className="admin-row-detail">{r.admin_note}</div>}</td>
              <td><div className="adm-actions">{r.status === "pending" && <><Button size="sm" onClick={() => void decide(r.id, "paid")}>Mark paid</Button><Button size="sm" variant="outline" onClick={() => void decide(r.id, "rejected")}>Reject</Button></>}<Button size="sm" variant="outline" onClick={() => setViewing(r.id)} aria-label={`Detail of payout for ${r.artists?.stage_name}`}>Detail</Button></div></td>
            </tr>
          ))}
        </tbody></table></div>
      </ListState>
      {viewed && <A4Dialog title="Payout" onClose={() => setViewing(null)}>
        <A4Statement heading="PAYOUT" number={`PO-${viewed.id.slice(0, 8).toUpperCase()}`} status={viewed.status === "pending" ? "Waiting" : viewed.status} tone={viewed.status === "paid" ? "paid" : viewed.status === "pending" ? "partial" : "unpaid"}
          parties={[["From", issuerLines(issuer).length ? issuerLines(issuer) : ["Dealmaker"]], ["Paid to", [viewed.artists?.stage_name, ...(viewed.bank_details ?? "").split("\n")]]]}
          rows={[{ label: "Artist earnings withdrawal", detail: `Requested ${when(viewed.created_at)}${viewed.decided_at ? ` · decided ${when(viewed.decided_at)}` : ""}`, amount: invoiceMoney(Number(viewed.amount)) }]}
          totals={[[viewed.status === "paid" ? "Total paid" : "Amount requested", invoiceMoney(Number(viewed.amount))]]}
          note={viewed.admin_note ?? undefined} />
      </A4Dialog>}
    </div>
  );
}
