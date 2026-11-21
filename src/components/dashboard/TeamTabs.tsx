import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Copy, RefreshCw, Trash2 } from "lucide-react";
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

export function TeamTab({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["artist-team", artistId];
  const { data: members } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("artist_members").select("id, email, role, status, created_at").eq("artist_id", artistId).order("created_at")).data ?? [] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error(t("Enter a valid email")); return; }
    const { error } = await supabase.from("artist_members").insert({ artist_id: artistId, email: e, role });
    if (error) { toast.error(error.code === "23505" ? "Already invited" : error.message); return; }
    setEmail(""); toast.success(t("Invitation saved — they get access when they sign in with this email"));
    qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (id: string) => {
    if (!confirm(t("Remove this team member?"))) return;
    await supabase.from("artist_members").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: key });
  };
  return <div className="dmr-wrap dmr-tmpage"><StudioHeading title="Invite" accent="team"><div className="dmr-q-stats"><div className="dmr-qs"><small>{t("Members")}</small><b>{members?.length ?? 0}</b></div></div></StudioHeading><section className="dmr-panel dmr-q-panel studio-team-table"><div className="dmr-q-tools"><h2>{t("Team")} <span className="it">{t("members")}</span></h2></div><div className="dmr-tbl-wrap"><table data-studio-table="true"><thead><tr>{["Member","Role","Status","Last active","Actions"].map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{members?.map(m=><tr key={m.id}><td data-label={t("Member")}>{m.email}</td><td data-label={t("Role")}>{t(m.role)}</td><td data-label={t("Status")}><Badge>{t(m.status === "active" ? "active" : "invited")}</Badge></td><td data-label={t("Last active")}><span className="studio-soon">{t("segera")}</span></td><td data-label={t("Actions")}><Button variant="ghost" size="icon" aria-label={`${t("Remove")} ${m.email}`} onClick={()=>remove(m.id)}><Trash2 className="size-4" /></Button></td></tr>)}</tbody></table></div>{members?.length === 0 && <StudioEmpty title={t("No team members yet.")} />}</section><StudioSection title="Roles" accent="and access" className="dmr-c-12"><div className="grid gap-4 sm:grid-cols-2">{["Manager","Assistant"].map(label=><div key={label} className="rounded-xl border p-5"><h3 className="text-2xl">{t(label)}</h3><p className="text-sm text-muted-foreground mt-3">{t("They can reply in your inbox, handle quotes and bookings, and block dates. They can't change your profile, AI settings, credits or team.")}</p></div>)}</div><StudioSoon label="Custom roles and permissions" /></StudioSection><StudioSection title="Invite a" accent="teammate" className="studio-team-invite"><div className="space-y-3"><Input type="email" placeholder={t("name@example.com")} value={email} onChange={e=>setEmail(e.target.value)} /><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manager">{t("Manager")}</SelectItem><SelectItem value="assistant">{t("Assistant")}</SelectItem></SelectContent></Select><Button onClick={invite}>{t("Send invite")}</Button></div></StudioSection></div>;

}
