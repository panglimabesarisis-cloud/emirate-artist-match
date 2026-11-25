import { BulkBar, RowCheckbox, useSelection } from "./BulkSelect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Ban, CalendarDays, Check, Copy, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { accessRoleName, OWNER_ONLY_PAGES, sameAccess, TEAM_PAGES, teamMenus } from "@/lib/team-access";
import { StudioHeading, StudioSection, StudioSoon, StudioEmpty } from "./StudioPage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CalendarSync({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["artist-calendar", artistId];
  const { data: token } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await supabase.from("artist_calendar").select("token").eq("artist_id", artistId).maybeSingle();
      if (data) return data.token;
      const { data: made, error } = await supabase.from("artist_calendar").insert({ artist_id: artistId }).select("token").single();
      if (error) throw error;
      return made.token;
    },
  });
  if (!token) return null;
  const https = `${window.location.origin}/api/public/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const rotate = async () => {
    if (!confirm(t("Create a new link? Calendars using the old link will stop updating."))) return;
    const { error } = await supabase.from("artist_calendar").update({ token: crypto.randomUUID() }).eq("artist_id", artistId);
    if (error) toast.error(error.message); else { toast.success(t("New calendar link created")); qc.invalidateQueries({ queryKey: key }); }
  };
  return (
    <div className="dmr-panel mt-6 p-5">
      <div className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-gold" />{t("Sync with Google Calendar")}</div>
      <p className="mt-1 text-sm text-muted-foreground">{t("Bookings, offers and blocked dates appear in your calendar automatically. Google refreshes it every few hours. Keep this link private.")}</p>
      <div className="mt-3 flex gap-2"><Input readOnly value={https} onFocus={(e) => e.currentTarget.select()} /><Button variant="outline" size="icon" aria-label={t("Copy link")} onClick={() => { navigator.clipboard.writeText(https); toast.success(t("Link copied")); }}><Copy className="h-4 w-4" /></Button></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild className="bg-gradient-gold text-gold-foreground"><a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer">{t("Add to Google Calendar")}</a></Button>
        <Button asChild variant="outline"><a href={webcal}>{t("Apple / Outlook")}</a></Button>
        <Button variant="ghost" onClick={rotate}><RefreshCw className="mr-2 h-4 w-4" />{t("New link")}</Button>
      </div>
    </div>
  );
}

const ago = (iso: string | null) => {
  if (!iso) return "Never signed in";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 2 ? "Just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const initials = (email: string) => email.split("@")[0]!.split(/[._-]/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const MENU_LABEL: Record<string, string> = Object.fromEntries(TEAM_PAGES.map((page) => [page.id, page.label]));

/** Checklist of the pages a member may open. Inbox is always on. */
function PageAccessList({ value, onChange }: { value: string[]; onChange: (menus: string[]) => void }) {
  const { t } = useI18n();
  const all = TEAM_PAGES.every((page) => value.includes(page.id));
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="sr-only">{t("Pages this member can open")}</legend>
      <div className="flex items-center justify-between gap-3">
        <span aria-hidden className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Pages this member can open")}</span>
        <button type="button" className="text-xs font-bold text-gold hover:underline" onClick={() => onChange(all ? ["inbox"] : TEAM_PAGES.map((page) => page.id))}>{t(all ? "Clear" : "Select all")}</button>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {TEAM_PAGES.map((page) => {
          const fixed = page.id === "inbox";
          const on = fixed || value.includes(page.id);
          return (
            <li key={page.id}>
              <label className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${on ? "border-gold/50 bg-gold/10" : "border-border"} ${fixed ? "cursor-default" : "cursor-pointer"}`}>
                <input type="checkbox" className="size-4 shrink-0 accent-gold" checked={on} disabled={fixed} onChange={() => onChange(on ? value.filter((id) => id !== page.id) : [...value, page.id])} />
                <span className="min-w-0 flex-1">{t(page.label)}</span>
                {fixed && <small className="text-[11px] text-muted-foreground">{t("Always on")}</small>}
              </label>
            </li>
          );
        })}
        {OWNER_ONLY_PAGES.map((label) => (
          <li key={label}>
            <label className="flex cursor-not-allowed items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
              <input type="checkbox" className="size-4 shrink-0" checked={false} disabled readOnly />
              <span className="min-w-0 flex-1">{t(label)}</span>
              <small className="text-[11px]">{t("Owner only")}</small>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("Pages not ticked stay hidden from this member. Pages marked Owner only, and Account settings, are always yours only.")}</p>
    </fieldset>
  );
}

export function TeamTab({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["artist-team", artistId];
  const { data: members } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("artist_members").select("id, email, role, role_id, status, last_active_at, created_at").eq("artist_id", artistId).order("created_at")).data ?? [],
  });
  const rolesKey = ["team-roles", artistId];
  const { data: roles } = useQuery({ queryKey: rolesKey, queryFn: async () => (await supabase.from("team_roles").select("id, name, description, menus, is_system").eq("artist_id", artistId).order("created_at")).data ?? [] });
  const { data: limit } = useQuery({
    queryKey: ["team-limit", artistId],
    queryFn: async () => {
      const plan = (await supabase.rpc("effective_artist_plan", { _artist: artistId })).data;
      const tier = plan ? (await supabase.from("plan_tiers").select("max_team_members, name").eq("code", plan).maybeSingle()).data : null;
      return { max: tier?.max_team_members ?? 0, plan: tier?.name ?? String(plan ?? "") };
    },
  });
  const selection = useSelection();
  const removeMany = async () => {
    if (!selection.sel.length || !confirm(`${t("Remove")} ${selection.sel.length} ${t("team members?")}`)) return;
    const { error } = await supabase.from("artist_members").delete().in("id", selection.sel);
    if (error) { toast.error(error.message); return; }
    selection.clear(); toast.success(t("Removed")); qc.invalidateQueries({ queryKey: key });
  };
  const [email, setEmail] = useState("");
  const [pages, setPages] = useState<string[]>(["inbox"]);
  const [inviting, setInviting] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [draft, setDraft] = useState<{ name: string; description: string; menus: string[] }>({ name: "", description: "", menus: ["inbox"] });
  const used = members?.length ?? 0;
  const max = limit?.max ?? 0;
  const full = max >= 0 && used >= max;
  const roleName = (id: string | null) => roles?.find((r) => r.id === id)?.name;

  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error(t("Enter a valid email")); return; }
    // Without the saved roles an invite could silently fall back to different pages.
    if (!roles || inviting) return;
    setInviting(true);
    try {
      const menus = teamMenus(pages);
      let roleId = roles.find((r) => sameAccess(r.menus, menus))?.id;
      let createdRole: string | undefined;
      if (!roleId) {
        const made = await supabase.from("team_roles").insert({ artist_id: artistId, name: accessRoleName(menus, roles.map((r) => r.name)), menus }).select("id").single();
        if (made.error) { toast.error(made.error.message); return; }
        roleId = createdRole = made.data.id;
      }
      const { error } = await supabase.from("artist_members").insert({ artist_id: artistId, email: e, role: "assistant", role_id: roleId });
      if (error) {
        if (createdRole) await supabase.from("team_roles").delete().eq("id", createdRole);
        toast.error(error.code === "23505" ? t("Already invited") : error.message);
        return;
      }
      setEmail(""); setPages(["inbox"]); setAddOpen(false); toast.success(t("Invitation saved — they get access when they sign in with this email"));
    } finally {
      setInviting(false);
      void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: rolesKey });
    }
  };
  const setStatus = async (id: string, status: "active" | "suspended") => {
    const { error } = await supabase.from("artist_members").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "suspended" ? t("Member suspended") : t("Member reactivated"));
    qc.invalidateQueries({ queryKey: key });
  };
  const changeRole = async (id: string, role_id: string) => {
    const { error } = await supabase.from("artist_members").update({ role_id }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (id: string) => {
    if (!confirm(t("Remove this team member?"))) return;
    await supabase.from("artist_members").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: key });
  };
  const saveRole = async () => {
    const name = draft.name.trim();
    if (!name) { toast.error(t("Name the role")); return; }
    const { error } = await supabase.from("team_roles").insert({ artist_id: artistId, name: name.slice(0, 60), description: draft.description.trim() || null, menus: teamMenus(draft.menus) });
    if (error) { toast.error(error.code === "23505" ? t("A role with this name exists") : error.message); return; }
    setDraft({ name: "", description: "", menus: ["inbox"] }); setRoleOpen(false);
    qc.invalidateQueries({ queryKey: rolesKey });
  };
  const deleteRole = async (id: string) => {
    if (!confirm(t("Delete this role? Members using it return to Inbox responder."))) return;
    const fallback = roles?.find((r) => r.is_system)?.id;
    if (fallback) await supabase.from("artist_members").update({ role_id: fallback }).eq("role_id", id);
    const { error } = await supabase.from("team_roles").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: rolesKey }); qc.invalidateQueries({ queryKey: key });
  };

  const needle = search.trim().toLowerCase();
  const shown = (members ?? []).filter((m) => !needle || `${m.email} ${roleName(m.role_id) ?? m.role}`.toLowerCase().includes(needle));
  const active = (members ?? []).filter((m) => m.status === "active").length;
  const chips = (menus: string[]) => {
    const labels = menus.map((k) => MENU_LABEL[k]).filter(Boolean) as string[];
    return <div className="flex flex-wrap gap-1.5">{labels.slice(0, 3).map((l) => <span key={l} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${l === "Inbox" ? "border-gold/40 bg-gold/10 text-gold" : "border-border text-muted-foreground"}`}>{t(l)}</span>)}{labels.length > 3 && <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground" title={labels.slice(3).join(", ")}>+{labels.length - 3}</span>}</div>;
  };
  const addButton = <Button className="rounded-full bg-gradient-gold px-5 font-bold text-gold-foreground" onClick={() => setAddOpen(true)}><Plus className="me-1.5 h-4 w-4" />{t("Add team member")}</Button>;
  const th = "whitespace-nowrap border-b border-border bg-[#0d1222] px-3 py-3 text-start text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";
  const td = "border-b border-border px-3 py-3.5 align-middle";

  return (
    <div className="dmr-wrap dmr-tmpage">
      <StudioHeading title="Invite" accent="team">
        <div className="flex flex-wrap items-center gap-3">
          <div className="dmr-q-stats">
            <div className="dmr-qs"><small>{t("Members")}</small><b className="text-gold">{used}{max >= 0 ? ` / ${max}` : ""}</b></div>
            <div className="dmr-qs"><small>{t("Active")}</small><b>{active}</b></div>
            <div className="dmr-qs"><small>{t("Roles")}</small><b>{roles?.length ?? 0}</b></div>
          </div>
          {addButton}
        </div>
      </StudioHeading>
      <p className="dmr-c-12 -mt-2 text-sm text-muted-foreground">{t("Give a teammate their own login to answer inbox chats for you. They see only the menus you allow in their role, and nothing else.")}</p>

      <section className="dmr-panel dmr-q-panel dmr-c-12 !p-0" aria-label={t("Team members")}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <div className="me-auto"><h2 className="font-display text-[28px] leading-none">{t("Team")} <span className="it">{t("members")}</span></h2><small className="text-xs text-muted-foreground">{t("People who can sign in to your workspace")}</small></div>
          <label className="relative flex h-[42px] max-w-sm flex-1 basis-60 items-center">
            <Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-gold" aria-hidden />
            <span className="sr-only">{t("Search team")}</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search name, email or role")} autoComplete="off" className="h-full w-full rounded-[14px] border border-border bg-foreground/[.03] pe-3 ps-10 text-sm outline-none focus-visible:border-gold" />
          </label>
        </div>
        <BulkBar count={selection.sel.length} onClear={selection.clear} onDelete={() => void removeMany()} />
        {shown.length > 0 && (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[13.5px]">
              <thead><tr>
                <th scope="col" className={`${th} w-10`}><RowCheckbox label={t("Select all")} checked={shown.length > 0 && shown.every((m) => selection.has(m.id))} onChange={(on) => selection.toggleAll(shown.map((m) => m.id), on)} /></th>
                {["Member", "Role", "Can open", "Status", "Last active"].map((h) => <th key={h} scope="col" className={th}>{t(h)}</th>)}<th scope="col" className={th}><span className="sr-only">{t("Actions")}</span></th>
              </tr></thead>
              <tbody>
                {shown.map((m) => {
                  const role = roles?.find((r) => r.id === m.role_id);
                  return (
                    <tr key={m.id} className="transition-colors hover:bg-foreground/[.03]">
                      <td className={td}><RowCheckbox label={`${t("Select")} ${m.email}`} checked={selection.has(m.id)} onChange={(on) => selection.toggle(m.id, on)} /></td>
                      <td className={td}><div className="flex items-center gap-3"><span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-gradient-to-br from-[#2b3460] to-[#151a30] font-display text-sm ${m.status === "suspended" ? "opacity-50" : ""}`}>{initials(m.email)}</span><div className="min-w-0"><b className="block truncate font-bold">{m.email}</b></div></div></td>
                      <td className={td}>
                        {roles && roles.length > 0 ? (
                          <Select value={m.role_id ?? ""} onValueChange={(v) => void changeRole(m.id, v)}>
                            <SelectTrigger className="h-8 w-44" aria-label={`${t("Role")} ${m.email}`}><SelectValue placeholder={roleName(m.role_id) ?? t(m.role)} /></SelectTrigger>
                            <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : t(m.role)}
                      </td>
                      <td className={td}>{chips(role?.menus ?? ["inbox"])}</td>
                      <td className={td}><span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-[11px] text-[10.5px] font-extrabold tracking-[.03em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-[''] ${m.status === "active" ? "border-emerald-300/35 bg-emerald-300/[.08] text-emerald-300" : "border-border text-muted-foreground"}`}>{t(m.status === "active" ? "Active" : m.status === "suspended" ? "Suspended" : m.status)}</span></td>
                      <td className={`${td} text-muted-foreground`}>{t(ago(m.last_active_at))}</td>
                      <td className={`${td} text-end`}>
                        <div className="inline-flex gap-1.5">
                          {(m.status === "active" || m.status === "suspended") && <Button type="button" variant="outline" size="icon" className="h-[34px] w-[34px] rounded-[10px]" title={t(m.status === "active" ? "Suspend" : "Reactivate")} aria-label={`${t(m.status === "active" ? "Suspend" : "Reactivate")} ${m.email}`} onClick={() => void setStatus(m.id, m.status === "active" ? "suspended" : "active")}>{m.status === "active" ? <Ban className="h-[15px] w-[15px]" /> : <Check className="h-[15px] w-[15px]" />}</Button>}
                          <Button type="button" variant="outline" size="icon" className="h-[34px] w-[34px] rounded-[10px] hover:border-red-400 hover:text-red-300" title={t("Remove")} aria-label={`${t("Remove")} ${m.email}`} onClick={() => void remove(m.id)}><Trash2 className="h-[15px] w-[15px]" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <span className="grid h-[60px] w-[60px] place-items-center rounded-full border border-gold/25 bg-[radial-gradient(circle,rgba(232,176,74,.22),rgba(232,176,74,.04)_70%)] text-gold"><Users className="h-[22px] w-[22px]" /></span>
            <b className="font-display text-2xl font-normal">{t(needle ? "No matches" : "No team members")}</b>
            <p className="text-[13px] text-muted-foreground">{t(needle ? "Try another name, email or role." : "Add someone to share the inbox workload.")}</p>
            {!needle && <div className="mt-2">{addButton}</div>}
          </div>
        )}
      </section>

      <section className="dmr-panel dmr-c-12" aria-labelledby="r-h">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div><h2 id="r-h" className="font-display text-[28px] leading-none">{t("Roles")} <span className="it">{t("and access")}</span></h2><p className="mt-1.5 text-[13px] text-muted-foreground">{t("A role decides which menus a member can open. Every role can answer the Inbox. You choose the rest.")}</p></div>
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setRoleOpen(true)}><Plus className="me-1.5 h-4 w-4" />{t("New role")}</Button>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {roles?.map((r) => {
            const n = (members ?? []).filter((m) => m.role_id === r.id).length;
            return (
              <article key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-foreground/[.02] p-[18px]">
                <h3 className="text-base font-bold">{r.name}{r.is_system ? ` · ${t("built in")}` : ""}</h3>
                <p className="text-[13px] text-muted-foreground">{r.description ?? t("No description")}</p>
                {chips(r.menus)}
                <div className="mt-auto flex items-center justify-between pt-1 text-xs text-muted-foreground"><span>{n} {t(n === 1 ? "member" : "members")}</span>{!r.is_system && <Button type="button" variant="ghost" size="sm" aria-label={`${t("Delete role")} ${r.name}`} onClick={() => void deleteRole(r.id)}><Trash2 className="me-1 size-4" />{t("Delete role")}</Button>}</div>
              </article>
            );
          })}
        </div>
        <p className="mt-5 flex items-start gap-2.5 text-xs text-muted-foreground"><span aria-hidden>🔒</span><span>{t("Only you can open Wallet, Export data, Verification, Account settings and Team. These cannot be given to a role.")}</span></p>
      </section>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120]">
          <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl font-normal">{t("Add team")} <span className="it">{t("member")}</span></DialogTitle><DialogDescription>{t("Invitations go by email. Nobody gets a password from us; they sign in with their own account.")}</DialogDescription></DialogHeader>
          <form className="grid gap-3.5" onSubmit={(e) => { e.preventDefault(); void invite(); }}>
            <div className="space-y-2"><label htmlFor="studio-team-email" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Email")}</label><Input id="studio-team-email" type="email" placeholder={t("name@example.com")} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></div>
            <PageAccessList value={pages} onChange={setPages} />
            {full && <p className="text-xs text-gold">{max === 0 ? t("Your plan has no team seats. Upgrade to invite teammates.") : `${t("Seat limit reached for your plan")} (${used}/${max}).`}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="rounded-full" onClick={() => setAddOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={full || inviting || !roles} className="rounded-full bg-gradient-gold font-bold text-gold-foreground">{t("Send invite")}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120]">
          <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl font-normal">{t("New")} <span className="it">{t("role")}</span></DialogTitle><DialogDescription>{t("Every role can answer the Inbox. Choose the other menus this role can open.")}</DialogDescription></DialogHeader>
          <form className="grid gap-3.5" onSubmit={(e) => { e.preventDefault(); void saveRole(); }}>
            <div className="space-y-2"><label htmlFor="role-name" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Role name")}</label><Input id="role-name" maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></div>
            <div className="space-y-2"><label htmlFor="role-desc" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Description")}</label><Input id="role-desc" maxLength={160} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <PageAccessList value={draft.menus} onChange={(menus) => setDraft((d) => ({ ...d, menus }))} />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="rounded-full" onClick={() => setRoleOpen(false)}>{t("Cancel")}</Button><Button type="submit" className="rounded-full bg-gradient-gold font-bold text-gold-foreground">{t("Save role")}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
