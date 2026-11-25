import { useQuery } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { browserName } from "@/lib/admin-documents";
import { downloadCsv, toCsv } from "@/lib/csv";
import { AdminRecords } from "./AdminRecords";
import { ListState } from "./artists/parts";

const SIZE = 50;
const LEVELS = ["info", "low", "medium", "high"] as const;
const TONE: Record<string, string> = { info: "expired", low: "approved", medium: "pending", high: "rejected" };
const when = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "medium" });
/** Characters with a meaning in the filter syntax are dropped from the search text. */
const clean = (value: string) => value.replace(/[,()%\\*"]/g, " ").trim().slice(0, 80);

function logQuery(search: string, level: string) {
  let query = supabase.from("admin_audit_log").select("*", { count: "exact" }).order("id", { ascending: false });
  if (level !== "all") query = query.eq("security", level);
  const text = clean(search);
  if (text) query = query.or(`email.ilike.%${text}%,action.ilike.%${text}%,url.ilike.%${text}%,ip.ilike.%${text}%`);
  return query;
}

export function AdminAudit() {
  return (
    <Tabs defaultValue="system">
      <TabsList><TabsTrigger value="system">System activity</TabsTrigger><TabsTrigger value="library">Library changes</TabsTrigger></TabsList>
      <TabsContent value="system" className="mt-4"><SystemLog /></TabsContent>
      <TabsContent value="library" className="mt-4"><AdminRecords kind="audit" /></TabsContent>
    </Tabs>
  );
}

function SystemLog() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["admin-audit", page, search, level],
    queryFn: async () => {
      const r = await logQuery(search, level).range(page * SIZE, page * SIZE + SIZE - 1);
      if (r.error) throw new Error("Unable to load the audit log");
      return { rows: r.data ?? [], total: r.count ?? 0 };
    },
  });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const open = rows.find((r) => r.id === openId);
  const exportCsv = async () => {
    const r = await logQuery(search, level).range(0, 999);
    if (r.error) { toast.error("Unable to export the audit log"); return; }
    downloadCsv("dealmaker-audit-log.csv", toCsv(r.data ?? [], [["Timestamp (UTC)", (x) => x.at], ["User", (x) => x.email ?? "System"], ["IP", (x) => x.ip], ["Browser", (x) => x.browser], ["URL access", (x) => x.url], ["Action", (x) => x.action], ["Module", (x) => x.module], ["Target", (x) => x.target], ["Security", (x) => x.security]]));
    if (total > 1000) toast.message("The newest 1,000 matching entries were exported.");
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Pages administrators open and changes they make. Entries cannot be edited or deleted. Saved values are never copied into the log.</p>
      <div className="admin-toolbar">
        <Input type="search" aria-label="Search the audit log" placeholder="Search user, action, address or IP…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <Select value={level} onValueChange={(v) => { setLevel(v); setPage(0); }}><SelectTrigger className="w-44" aria-label="Security level"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All security levels</SelectItem>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" disabled={!rows.length} onClick={() => void exportCsv()}><Download />Export CSV</Button>
      </div>
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No activity has been recorded for this filter."}>
        <div className="admin-table-wrap"><table><thead><tr><th>Timestamp</th><th>User</th><th>IP</th><th>Browser</th><th>URL access</th><th>Action</th><th>Security</th><th>Action</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{when(r.at)}</td><td>{r.email ?? "System"}</td><td dir="ltr">{r.ip ?? "—"}</td><td>{browserName(r.browser)}</td>
              <td className="max-w-[240px] break-all" dir="ltr">{r.url ?? "—"}</td><td>{r.action}</td>
              <td><span className={`adm-pill is-${TONE[r.security] ?? "expired"}`}>{r.security}</span></td>
              <td><Button size="icon" variant="ghost" aria-label={`View log entry ${r.id}`} onClick={() => setOpenId(r.id)}><Eye /></Button></td>
            </tr>
          ))}
        </tbody></table></div>
        <div className="admin-page-foot"><span>{total.toLocaleString("en-US")} entries · page {page + 1} · Dubai time</span><div className="admin-foot-actions"><Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * SIZE >= total || query.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div></div>
      </ListState>
      <Dialog open={!!open} onOpenChange={(value) => { if (!value) setOpenId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Log entry {open?.id}</DialogTitle><DialogDescription>{open?.action}</DialogDescription></DialogHeader>
          {open && <dl className="admin-detail-grid">{[["Timestamp", when(open.at)], ["User", open.email ?? "System"], ["User ID", open.user_id], ["IP", open.ip], ["Browser", browserName(open.browser)], ["Full browser text", open.browser], ["URL access", open.url], ["Module", open.module], ["Record", open.target], ["Security", open.security]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="break-all">{value || "—"}</dd></div>)}</dl>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
