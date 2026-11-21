import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Copy, RefreshCw, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { StudioHeading, StudioSection, StudioSoon, StudioEmpty } from "./StudioPage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

/** Menus a team member can be given. Wallet, export, verification, account and team are never available (database check). */
export const TEAM_MENUS = ["inbox", "quotes", "bookings", "calendar", "media"] as const;
const MENU_LABEL: Record<string, string> = { inbox: "Inbox", quotes: "Quote requests", bookings: "Bookings", calendar: "Calendar", media: "Photos & videos" };

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
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [draft, setDraft] = useState<{ name: string; description: string; menus: string[] }>({ name: "", description: "", menus: ["inbox"] });
  const used = members?.length ?? 0;
  const max = limit?.max ?? 0;
  const full = max >= 0 && used >= max;
  const roleName = (id: string | null) => roles?.find((r) => r.id === id)?.name;

  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error(t("Enter a valid email")); return; }
    const chosen = roleId || roles?.find((r) => r.is_system)?.id || null;
    const { error } = await supabase.from("artist_members").insert({ artist_id: artistId, email: e, role: "assistant", ...(chosen ? { role_id: chosen } : {}) });
    if (error) { toast.error(error.code === "23505" ? t("Already invited") : error.message); return; }
    setEmail(""); toast.success(t("Invitation saved — they get access when they sign in with this email"));
    qc.invalidateQueries({ queryKey: key });
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
    const { error } = await supabase.from("team_roles").insert({ artist_id: artistId, name: name.slice(0, 60), description: draft.description.trim() || null, menus: Array.from(new Set(["inbox", ...draft.menus])) });
    if (error) { toast.error(error.code === "23505" ? t("A role with this name exists") : error.message); return; }
    setDraft({ name: "", description: "", menus: ["inbox"] });
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
  const toggleMenu = (m: string) => setDraft((d) => ({ ...d, menus: d.menus.includes(m) ? d.menus.filter((x) => x !== m) : [...d.menus, m] }));

  return (
    <div className="dmr-wrap dmr-tmpage">
      <StudioHeading title="Invite" accent="team">
        <div className="dmr-q-stats"><div className="dmr-qs"><small>{t("Members")}</small><b>{used}{max >= 0 ? ` / ${max}` : ""}</b></div></div>
      </StudioHeading>
      <section className="dmr-panel dmr-q-panel studio-team-table">
        <div className="dmr-q-tools"><h2>{t("Team")} <span className="it">{t("members")}</span></h2></div>
        <div className="dmr-tbl-wrap">
          <table data-studio-table="true">
            <thead><tr>{["Member", "Role", "Status", "Last active", "Actions"].map((h) => <th key={h}>{t(h)}</th>)}</tr></thead>
            <tbody>
              {members?.map((m) => (
                <tr key={m.id}>
                  <td data-label={t("Member")}>{m.email}</td>
                  <td data-label={t("Role")}>
                    {roles && roles.length > 0 ? (
                      <Select value={m.role_id ?? ""} onValueChange={(v) => void changeRole(m.id, v)}>
                        <SelectTrigger className="h-8 w-44" aria-label={`${t("Role")} ${m.email}`}><SelectValue placeholder={roleName(m.role_id) ?? t(m.role)} /></SelectTrigger>
                        <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : t(m.role)}
                  </td>
                  <td data-label={t("Status")}><Badge variant={m.status === "suspended" ? "destructive" : "default"}>{t(m.status)}</Badge></td>
                  <td data-label={t("Last active")}>{m.last_active_at ? new Date(m.last_active_at).toLocaleDateString("en-GB") : "—"}</td>
                  <td data-label={t("Actions")}>
                    {m.status === "suspended"
                      ? <Button variant="outline" size="sm" onClick={() => void setStatus(m.id, "active")}>{t("Reactivate")}</Button>
                      : m.status === "active" && <Button variant="outline" size="sm" onClick={() => void setStatus(m.id, "suspended")}>{t("Suspend")}</Button>}
                    <Button variant="ghost" size="icon" aria-label={`${t("Remove")} ${m.email}`} onClick={() => void remove(m.id)}><Trash2 className="size-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {members?.length === 0 && <StudioEmpty title={t("No team members yet.")} />}
      </section>

      <StudioSection title="Roles" accent="and access" className="dmr-c-12">
        <div className="studio-team-role-grid">
          {roles?.map((r) => (
            <div key={r.id} className="studio-team-role">
              <span className="studio-team-role-icon"><Users className="size-5" aria-hidden="true" /></span>
              <h3>{r.name}{r.is_system ? ` · ${t("built in")}` : ""}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{r.description ?? t("Can open only the menus listed below. They never see your wallet, export, verification, account or team.")}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{r.menus.map((m) => <span key={m} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{t(MENU_LABEL[m] ?? m)}</span>)}</div>
              {!r.is_system && <Button variant="ghost" size="sm" className="mt-3" onClick={() => void deleteRole(r.id)}><Trash2 className="me-1 size-4" />{t("Delete role")}</Button>}
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-3 border-t border-border pt-5">
          <h3 className="font-semibold">{t("Create a custom role")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="role-name" className="text-sm">{t("Role name")}</label><Input id="role-name" maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><label htmlFor="role-desc" className="text-sm">{t("Description")}</label><Input id="role-desc" maxLength={160} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          </div>
          <fieldset className="flex flex-wrap gap-4"><legend className="mb-1 text-sm">{t("Menus this role can open")}</legend>
            {TEAM_MENUS.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-gold" checked={draft.menus.includes(m)} disabled={m === "inbox"} onChange={() => toggleMenu(m)} />{t(MENU_LABEL[m] ?? m)}
              </label>
            ))}
          </fieldset>
          <Button variant="outline" onClick={() => void saveRole()}>{t("Save role")}</Button>
        </div>
      </StudioSection>

      <StudioSection title="Invite a" accent="teammate" className="studio-team-invite">
        <div className="space-y-3">
          <label htmlFor="studio-team-email">{t("Email")}</label>
          <Input id="studio-team-email" type="email" placeholder={t("name@example.com")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="studio-team-role">{t("Role")}</label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger id="studio-team-role"><SelectValue placeholder={t("Inbox responder")} /></SelectTrigger>
            <SelectContent>{roles?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
          {full && <p className="text-xs text-gold">{max === 0 ? t("Your plan has no team seats. Upgrade to invite teammates.") : `${t("Seat limit reached for your plan")} (${used}/${max}).`}</p>}
          <Button onClick={() => void invite()} disabled={full}>{t("Send invite")}</Button>
          <p className="text-xs text-muted-foreground">{t("Invitations go by email. Nobody gets a password from us; they sign in with their own account.")}</p>
        </div>
      </StudioSection>
    </div>
  );
}
