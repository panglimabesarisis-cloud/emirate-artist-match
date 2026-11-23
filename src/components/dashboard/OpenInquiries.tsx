import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Send, FileText, Upload, Check, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { aed } from "@/lib/format";
import { applyOpenJob, decideJobApplication, openJobDocument, postOpenJob, uploadJobDocument, withdrawJobApplication } from "@/lib/open-jobs.functions";
import { JOB_DOC_MAX_BYTES } from "@/lib/open-job-rules";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";

type Job = Database["public"]["Tables"]["open_jobs"]["Row"];

function JobDetails({ job }: { job: Job }) {
  return <div className="space-y-3">
    <h2 className="font-display text-2xl">{job.title}</h2>
    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><CalendarDays size={16} />{job.event_date} · {job.start_time.slice(0,5)} / {job.end_time.slice(0,5)}</span><span className="inline-flex items-center gap-2"><MapPin size={16} />{job.venue}</span><strong className="text-gold">{aed(job.budget_aed)}</strong></div>
    <p className="whitespace-pre-wrap break-words text-sm">{job.brief}</p>
    {job.preferences && <p className="text-sm text-muted-foreground">{job.preferences}</p>}
  </div>;
}

function Documents({ jobId, owner = false }: { jobId: string; owner?: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const open = useServerFn(openJobDocument);
  const upload = useServerFn(uploadJobDocument);
  const [busy, setBusy] = useState(false);
  const files = useQuery({ queryKey: ["job-documents", jobId], queryFn: async () => {
    const { data, error } = await supabase.from("job_documents").select("id,name,size_bytes").eq("job_id", jobId);
    if (error) throw error;
    return data;
  } });
  const addFiles = async (selected: FileList | null) => {
    if (!selected) return;
    setBusy(true);
    try {
      for (const file of Array.from(selected)) {
        if (file.size > JOB_DOC_MAX_BYTES) throw new Error(t("Maximum document size is 5 MB"));
        const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read document")); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.readAsDataURL(file); });
        await upload({ data: { jobId, name: file.name.slice(0,120), mime: file.type as "application/pdf" | "image/jpeg" | "image/png", base64 } });
        await qc.invalidateQueries({ queryKey: ["job-documents", jobId] });
      }
      toast.success(t("Documents uploaded"));
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Upload failed")); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2 border-t border-border pt-3">
    {files.error && <p role="alert" className="text-sm text-destructive">{t("Could not load documents")}</p>}
    {files.data?.map(file => <Button key={file.id} variant="ghost" size="sm" onClick={async () => { try { const { url } = await open({ data: { id: file.id } }); window.open(url, "_blank", "noopener,noreferrer"); } catch (e) { toast.error(e instanceof Error ? e.message : t("Could not open document")); } }}><FileText size={16} />{file.name}</Button>)}
    {owner && <div className="space-y-2"><Label htmlFor={`docs-${jobId}`} className="inline-flex items-center gap-2"><Upload size={16} />{t("Event documents")}</Label><Input id={`docs-${jobId}`} type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={busy} onChange={e => { void addFiles(e.target.files); e.target.value = ""; }} /><p className="text-xs text-muted-foreground">{t("PDF, JPG or PNG, up to 5 MB. Shared only with artists you approve.")}</p></div>}
  </div>;
}

export function ClientOpenInquiries({ uid }: { uid: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const post = useServerFn(postOpenJob), decide = useServerFn(decideJobApplication);
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", brief: "", preferences: "", categoryId: "all", eventDate: "", startTime: "", endTime: "", venue: "", budget: "" });
  const categories = useQuery({ queryKey: ["job-categories"], queryFn: async () => { const { data, error } = await supabase.from("categories").select("id,name").order("sort"); if (error) throw error; return data; } });
  const jobs = useQuery({ queryKey: ["client-open-jobs", uid], refetchInterval: 30000, queryFn: async () => { const { data, error } = await supabase.from("open_jobs").select("*").eq("client_user_id", uid).order("created_at", { ascending: false }); if (error) throw error; return data; } });
  const applications = useQuery({ queryKey: ["client-job-applications", uid], refetchInterval: 30000, queryFn: async () => { const { data, error } = await supabase.from("job_applications").select("*, artists(stage_name,slug,base_price)").order("created_at", { ascending: false }); if (error) throw error; return data; } });
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["client-open-jobs"] }), qc.invalidateQueries({ queryKey: ["client-job-applications"] })]); };
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      await post({ data: { title: f.title, brief: f.brief, preferences: f.preferences, categoryId: f.categoryId === "all" ? null : f.categoryId, eventDate: f.eventDate, startTime: f.startTime, endTime: f.endTime, venue: f.venue, budgetAED: Number(f.budget) } });
      setEditing(false); setF({ title: "", brief: "", preferences: "", categoryId: "all", eventDate: "", startTime: "", endTime: "", venue: "", budget: "" }); await refresh(); toast.success(t("Inquiry posted"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("Could not post inquiry")); } finally { setBusy(false); }
  };
  const decision = async (applicationId: string, result: "approved" | "rejected") => {
    setBusy(true);
    try { const r = await decide({ data: { applicationId, decision: result } }); await refresh(); if (r.conversationId && r.key) await navigate({ to: "/chat/$id", params: { id: r.conversationId }, search: { k: r.key } }); else toast.success(t("Application updated")); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("Could not update application")); } finally { setBusy(false); }
  };
  return <section className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="font-display text-4xl">{t("Open inquiries")}</h1><Button className="bg-gradient-gold text-gold-foreground" onClick={() => setEditing(true)}><Send size={16} />{t("Post inquiry")}</Button></header>
    {(jobs.error || applications.error) && <p role="alert" className="text-destructive">{t("Could not load inquiries")}</p>}
    {jobs.isPending && <p>{t("Loading…")}</p>}
    {jobs.data?.length === 0 && <p className="text-muted-foreground">{t("No open inquiries yet")}</p>}
    {jobs.data?.map(job => <article key={job.id} className="space-y-4 border-b border-border py-6">
      <div className="flex items-start justify-between gap-4"><JobDetails job={job} /><Button size="sm" variant="outline" disabled={busy} onClick={async () => { const { error } = await supabase.from("open_jobs").update({ status: job.status === "open" ? "closed" : "open" }).eq("id", job.id); if (error) toast.error(t("Could not update inquiry")); else await refresh(); }}>{t(job.status === "open" ? "Close inquiry" : "Reopen inquiry")}</Button></div>
      <Documents jobId={job.id} owner />
      <h3 className="font-display text-xl">{t("Applications")} · {applications.data?.filter(a => a.job_id === job.id).length ?? 0}</h3>
      {applications.data?.filter(a => a.job_id === job.id).map(app => <div key={app.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-3">
        <div className="min-w-0 space-y-1"><strong>{app.artists?.stage_name ?? t("Artist")}</strong>{app.artists?.slug && <Link className="ms-3 text-sm text-gold underline" to="/artist/$slug" params={{ slug: app.artists.slug }}>{t("View profile")}</Link>}<p className="break-words text-sm">{app.message}</p><p className="text-sm text-muted-foreground">{t(app.status)}{app.proposed_aed != null ? ` · ${aed(app.proposed_aed)}` : ""}</p></div>
        <div className="flex gap-2">{app.status === "pending" && job.status === "open" && <><Button size="sm" disabled={busy} onClick={() => void decision(app.id, "approved")}><Check size={16} />{t("Approve & chat")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void decision(app.id, "rejected")}>{t("Decline")}</Button></>}{app.status === "approved" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void decision(app.id, "approved")}><MessageSquare size={16} />{t("Open AI chat")}</Button>}</div>
      </div>)}
    </article>)}
    <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogTitle className="font-display text-3xl">{t("Post inquiry")}</DialogTitle><form onSubmit={e => void create(e)} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="job-title">{t("Talent needed")}</Label><Input id="job-title" required maxLength={120} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder={t("Male MC for a gala dinner")} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="job-brief">{t("Event brief")}</Label><Textarea id="job-brief" required maxLength={4000} rows={4} value={f.brief} onChange={e => setF({ ...f, brief: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="job-category">{t("Category")}</Label><Select value={f.categoryId} onValueChange={categoryId => setF({ ...f, categoryId })}><SelectTrigger id="job-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All categories")}</SelectItem>{categories.data?.map(c => <SelectItem key={c.id} value={c.id}>{t(c.name)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="job-budget">{t("Budget (AED)")}</Label><Input id="job-budget" type="number" required min="0.01" step="0.01" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="job-preferences">{t("Preferences")}</Label><Input id="job-preferences" maxLength={500} value={f.preferences} onChange={e => setF({ ...f, preferences: e.target.value })} placeholder={t("Gender, languages, experience")} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="job-venue">{t("Venue / address")}</Label><Input id="job-venue" required maxLength={500} value={f.venue} onChange={e => setF({ ...f, venue: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="job-date">{t("Event date")}</Label><Input id="job-date" required type="date" value={f.eventDate} onChange={e => setF({ ...f, eventDate: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="job-start">{t("Start time")}</Label><Input id="job-start" required type="time" value={f.startTime} onChange={e => setF({ ...f, startTime: e.target.value })} /></div><div className="space-y-2"><Label htmlFor="job-end">{t("End time")}</Label><Input id="job-end" required type="time" value={f.endTime} onChange={e => setF({ ...f, endTime: e.target.value })} /></div></div>
      <Button className="sm:col-span-2 bg-gradient-gold text-gold-foreground" type="submit" disabled={busy}><Send size={16} />{t(busy ? "Posting…" : "Post inquiry")}</Button>
    </form></DialogContent></Dialog>
  </section>;
}

export function ArtistOpenInquiries({ artistId, onInbox }: { artistId: string; onInbox: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const apply = useServerFn(applyOpenJob), withdraw = useServerFn(withdrawJobApplication);
  const [selected, setSelected] = useState<Job | null>(null), [message, setMessage] = useState(""), [price, setPrice] = useState(""), [busy, setBusy] = useState(false), [search, setSearch] = useState("");
  const jobs = useQuery({ queryKey: ["artist-open-jobs", artistId], refetchInterval: 30000, queryFn: async () => { if (!user) return []; const { data, error } = await supabase.from("open_jobs").select("*").neq("client_user_id", user.id).order("created_at", { ascending: false }); if (error) throw error; return data; } });
  const apps = useQuery({ queryKey: ["artist-job-applications", artistId], refetchInterval: 30000, queryFn: async () => { const { data, error } = await supabase.from("job_applications").select("*").eq("artist_id", artistId); if (error) throw error; return data; } });
  const refresh = () => qc.invalidateQueries({ queryKey: ["artist-job-applications", artistId] });
  return <section className="space-y-6">
    <h1 className="font-display text-4xl">{t("Open inquiries")}</h1>
    <Input aria-label={t("Search inquiries")} placeholder={t("Search inquiries")} value={search} onChange={e => setSearch(e.target.value)} />
    {(jobs.error || apps.error) && <p role="alert" className="text-destructive">{t("Could not load inquiries")}</p>}
    {jobs.isPending && <p>{t("Loading…")}</p>}
    {jobs.data?.length === 0 && <p className="text-muted-foreground">{t("No open inquiries yet")}</p>}
    {jobs.data?.filter(j => `${j.title} ${j.brief} ${j.preferences} ${j.venue}`.toLowerCase().includes(search.toLowerCase())).map(job => {
      const app = apps.data?.find(a => a.job_id === job.id);
      return <article key={job.id} className="space-y-4 border-b border-border py-6"><JobDetails job={job} /><div className="flex flex-wrap items-center gap-3">
        {!app && job.status === "open" ? <Button className="bg-gradient-gold text-gold-foreground" onClick={() => { setSelected(job); setMessage(""); setPrice(""); }}><Send size={16} />{t("Apply Job")}</Button> : app ? <><span className="text-sm text-muted-foreground">{t(app.status)}</span>{app.status === "pending" && <Button variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await withdraw({ data: { applicationId: app.id } }); await refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : t("Could not withdraw")); } finally { setBusy(false); } }}>{t("Withdraw application")}</Button>}{app.status === "approved" && <Button variant="outline" size="sm" onClick={onInbox}><MessageSquare size={16} />{t("Open inbox")}</Button>}</> : <span className="text-sm text-muted-foreground">{t(job.status)}</span>}
      </div>{app?.status === "approved" && <Documents jobId={job.id} />}</article>;
    })}
    <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent><DialogTitle className="font-display text-3xl">{t("Apply Job")}</DialogTitle><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (!selected) return; setBusy(true); try { await apply({ data: { jobId: selected.id, artistId, message, proposedAED: price ? Number(price) : null } }); await refresh(); setSelected(null); toast.success(t("Application sent")); } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not apply")); } finally { setBusy(false); } }}>
      <div className="space-y-2"><Label htmlFor="application-message">{t("Message to client")}</Label><Textarea id="application-message" value={message} maxLength={1000} onChange={e => setMessage(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="application-price">{t("Proposed price (AED, optional)")}</Label><Input id="application-price" type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /></div>
      <Button disabled={busy} type="submit"><Send size={16} />{t(busy ? "Sending…" : "Apply Job")}</Button>
    </form></DialogContent></Dialog>
  </section>;
}