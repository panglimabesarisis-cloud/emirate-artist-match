import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Copy, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CalendarSync({ artistId }: { artistId: string }) {
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
    if (!confirm("Create a new link? Calendars using the old link will stop updating.")) return;
    const { error } = await supabase.from("artist_calendar").update({ token: crypto.randomUUID() }).eq("artist_id", artistId);
    if (error) toast.error(error.message); else { toast.success("New calendar link created"); qc.invalidateQueries({ queryKey: key }); }
  };
  return (
    <div className="mt-6 rounded-xl bg-card p-5 shadow-card">
      <div className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5 text-gold" />Sync with Google Calendar</div>
      <p className="mt-1 text-sm text-muted-foreground">Bookings, offers and blocked dates appear in your calendar automatically. Google refreshes it every few hours. Keep this link private.</p>
      <div className="mt-3 flex gap-2"><Input readOnly value={https} onFocus={(e) => e.currentTarget.select()} /><Button variant="outline" size="icon" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(https); toast.success("Link copied"); }}><Copy className="h-4 w-4" /></Button></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild className="bg-gradient-gold text-gold-foreground"><a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer">Add to Google Calendar</a></Button>
        <Button asChild variant="outline"><a href={webcal}>Apple / Outlook</a></Button>
        <Button variant="ghost" onClick={rotate}><RefreshCw className="mr-2 h-4 w-4" />New link</Button>
      </div>
    </div>
  );
}

export function TeamTab({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const key = ["artist-team", artistId];
  const { data: members } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("artist_members").select("id, email, role, status, created_at").eq("artist_id", artistId).order("created_at")).data ?? [] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const invite = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error("Enter a valid email"); return; }
    const { error } = await supabase.from("artist_members").insert({ artist_id: artistId, email: e, role });
    if (error) { toast.error(error.code === "23505" ? "Already invited" : error.message); return; }
    setEmail(""); toast.success("Invitation saved — they get access when they sign in with this email");
    qc.invalidateQueries({ queryKey: key });
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this team member?")) return;
    await supabase.from("artist_members").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: key });
  };
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {members?.length === 0 && <p className="text-muted-foreground">No team members yet.</p>}
        {members?.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-card p-4 shadow-card">
            <div className="min-w-0"><div className="truncate font-medium">{m.email}</div><div className="text-xs capitalize text-muted-foreground">{m.role}</div></div>
            <div className="flex items-center gap-2"><Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status === "active" ? "active" : "invited"}</Badge><Button variant="ghost" size="icon" aria-label={`Remove ${m.email}`} onClick={() => remove(m.id)}><Trash2 className="h-4 w-4" /></Button></div>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-card p-5 shadow-card">
        <div className="font-semibold">Invite a manager or assistant</div>
        <p className="mt-1 text-sm text-muted-foreground">They can reply in your inbox, handle quotes and bookings, and block dates. They can't change your profile, AI settings, credits or team.</p>
        <Input className="mt-3" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select value={role} onValueChange={setRole}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manager">Manager</SelectItem><SelectItem value="assistant">Assistant</SelectItem></SelectContent></Select>
        <Button className="mt-3 w-full" onClick={invite}>Send invite</Button>
      </div>
    </div>
  );
}
