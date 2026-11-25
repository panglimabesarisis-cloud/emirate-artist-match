import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MODULES, permissionFor, togglePermission, type PermissionRow } from "@/lib/admin-documents";
import { downloadCsv, toCsv } from "@/lib/csv";
import { ListState } from "./artists/parts";

type Account = { user_id: string; email: string | null; name: string | null; roles: string[]; is_owner: boolean; joined_at: string };
const KEYS = [["can_read", "Read"], ["can_edit", "Edit"], ["can_delete", "Delete"]] as const;
const day = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });

export function AdminUsers() {
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const r = await supabase.rpc("admin_users");
      if (r.error) throw new Error("Unable to load accounts");
      return (r.data ?? []) as Account[];
    },
  });
  const limits = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: async () => {
      const r = await supabase.from("admin_permissions").select("user_id, module, can_read, can_edit, can_delete");
      if (r.error) throw new Error("Unable to load permissions");
      return r.data ?? [];
    },
  });
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const all = users.data ?? [];
  const roles = [...new Set(all.flatMap((u) => u.roles))].sort();
  const rows = all.filter((u) => (role === "all" || u.roles.includes(role)) && `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const access = (u: Account) => {
    if (!u.roles.includes("admin")) return { label: "No admin access", tone: "expired" };
    if (u.is_owner) return { label: "Owner · full access", tone: "paid" };
    const limited = (limits.data ?? []).some((p) => p.user_id === u.user_id && !(p.can_read && p.can_edit && p.can_delete));
    return limited ? { label: "Limited admin", tone: "pending" } : { label: "Full admin", tone: "approved" };
  };
  const open = all.find((u) => u.user_id === openId);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Select an account to see or change what it may read, edit and delete.</p>
      <div className="admin-toolbar">
        <Input aria-label="Search accounts" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={role} onValueChange={setRole}><SelectTrigger className="w-44" aria-label="Role"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv("dealmaker-users.csv", toCsv(rows, [["Name", (u) => u.name], ["Email", (u) => u.email], ["Roles", (u) => u.roles.join(" ")], ["Access", (u) => access(u).label], ["Joined", (u) => u.joined_at]]))}>Export CSV</Button>
      </div>
      <ListState pending={users.isPending} error={users.error} empty={rows.length ? null : "No account matches."}>
        <div className="admin-table-wrap"><table><thead><tr><th>Name and email</th><th>Roles</th><th>Admin access</th><th>Joined</th></tr></thead><tbody>
          {rows.map((u) => { const a = access(u); return (
            <tr key={u.user_id} className="cursor-pointer" onClick={() => setOpenId(u.user_id)}>
              <td><button type="button" className="adm-link text-start" aria-label={`Permissions of ${u.name || u.email}`}><b>{u.name || "Account"}</b></button><div className="admin-row-detail">{u.email}</div></td>
              <td>{u.roles.join(", ")}</td><td><span className={`adm-pill is-${a.tone}`}>{a.label}</span></td><td>{day(u.joined_at)}</td>
            </tr>
          ); })}
        </tbody></table></div>
      </ListState>
      <Sheet open={!!open} onOpenChange={(value) => { if (!value) setOpenId(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && <Permissions key={open.user_id} account={open} onSaved={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Permissions({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: ["admin-permissions", account.user_id],
    queryFn: async () => {
      const [rows, me] = await Promise.all([
        supabase.from("admin_permissions").select("module, can_read, can_edit, can_delete").eq("user_id", account.user_id),
        supabase.auth.getUser(),
      ]);
      if (rows.error) throw new Error("Unable to load permissions");
      const mine = me.data.user ? await supabase.rpc("admin_can", { _module: "administration", _action: "edit" }) : null;
      return { rows: (rows.data ?? []) as PermissionRow[], self: me.data.user?.id === account.user_id, mayEdit: mine?.data === true };
    },
  });
  const [draft, setDraft] = useState<PermissionRow[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state.data) setDraft(MODULES.map((m) => permissionFor(state.data.rows, m.id))); }, [state.data]);
  const admin = account.roles.includes("admin");
  const reason = account.is_owner ? "The owner always has full access and cannot be restricted." : state.data?.self ? "You cannot change your own permissions." : state.data && !state.data.mayEdit ? "You may view these permissions but not change them." : null;
  const locked = !!reason || !state.data || busy;
  const set = (module: string, key: (typeof KEYS)[number][0], value: boolean) => setDraft((rows) => rows.map((r) => (r.module === module ? togglePermission(r, key, value) : r)));
  const setAll = (value: boolean) => setDraft((rows) => rows.map((r) => ({ ...r, can_read: value, can_edit: value, can_delete: value })));
  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.from("admin_permissions").upsert(draft.map((r) => ({ user_id: account.user_id, module: r.module, can_read: r.can_read, can_edit: r.can_edit, can_delete: r.can_delete, updated_at: new Date().toISOString() })), { onConflict: "user_id,module" }).select("module");
    setBusy(false);
    if (error || !data?.length) { toast.error(error?.message ?? "The permissions were not saved"); return; }
    toast.success("Permissions saved. They apply immediately.");
    await qc.invalidateQueries({ queryKey: ["admin-permissions"] });
    onSaved();
  };
  return (
    <>
      <SheetHeader><SheetTitle className="font-display text-3xl font-normal">{account.name || "Account"}</SheetTitle><SheetDescription>{account.email} · {account.roles.join(", ")}</SheetDescription></SheetHeader>
      {!admin ? <p className="mt-6 text-sm text-muted-foreground">This account has no admin role, so it cannot open the admin pages. Read, edit and delete permissions apply to administrators only.</p>
        : <ListState pending={state.isPending} error={state.error} empty={null}>
          <div className="mt-5 space-y-4">
            {reason && <p role="status" className="rounded-xl border p-3 text-sm">{reason}</p>}
            <table className="adm-perm"><thead><tr><th scope="col">Module</th>{KEYS.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead><tbody>
              {MODULES.map((m) => { const row = draft.find((r) => r.module === m.id) ?? permissionFor([], m.id); return (
                <tr key={m.id}><th scope="row"><b>{m.label}</b><small>{m.detail}</small></th>
                  {KEYS.map(([key, label]) => <td key={key}><Checkbox checked={account.is_owner || row[key]} disabled={locked} onCheckedChange={(v) => set(m.id, key, v === true)} aria-label={`${label} ${m.label}`} /></td>)}
                </tr>
              ); })}
            </tbody></table>
            {!reason && <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2"><Button variant="ghost" size="sm" disabled={locked} onClick={() => setAll(true)}>Check all</Button><Button variant="ghost" size="sm" disabled={locked} onClick={() => setAll(false)}>Clear all</Button></div>
              <Button disabled={locked} onClick={() => void save()}>Save permissions</Button>
            </div>}
          </div>
        </ListState>}
    </>
  );
}
