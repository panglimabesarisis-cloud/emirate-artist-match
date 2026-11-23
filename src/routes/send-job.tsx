import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, LoaderCircle, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { getCatalog } from "@/lib/public.functions";
import { postOpenJob, uploadJobDocument } from "@/lib/open-jobs.functions";
import { JOB_DOC_MAX_BYTES, JOB_DOC_TYPES, validateJobDocument } from "@/lib/open-job-rules";
import { clearJobDraft, emptyJobFields, jobDraftInput, readJobDraft, saveJobDraft, type JobDraft, type JobFields } from "@/lib/send-job-draft";
import { useAuth } from "@/hooks/use-auth";
import { localName, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PublicLayout } from "@/components/site/PublicLayout";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";

const catalogQuery = queryOptions({ queryKey: ["send-job-catalog"], queryFn: () => getCatalog(), staleTime: 60_000 });
const steps = ["Talent", "Date & venue", "Brief & documents", "Budget & review"];
export const Route = createFileRoute("/send-job")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  head: () => ({ meta: [
    { title: "Send Job | Dealmaker" },
    { name: "description", content: "Post your UAE event brief, date, venue and AED budget to receive applications from Dealmaker artists." },
    { property: "og:title", content: "Send Job | Dealmaker" },
    { property: "og:description", content: "Find talent for your event with a broadcast inquiry on Dealmaker." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: SendJobPage,
});

function SendJobPage() {
  const { data: catalog } = useSuspenseQuery(catalogQuery);
  const { user, loading } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const post = useServerFn(postOpenJob), upload = useServerFn(uploadJobDocument);
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [busy, setBusy] = useState(false), [authOpen, setAuthOpen] = useState(false), [error, setError] = useState("");
  const processing = useRef(false), resumed = useRef<string | null>(null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  useEffect(() => {
    readJobDraft().then(saved => setDraft(saved ?? { id: crypto.randomUUID(), fields: { ...emptyJobFields }, documents: [], pending: false, ownerId: null, step: 0 }))
      .catch(() => { setError(t("Could not restore your draft")); setDraft({ id: crypto.randomUUID(), fields: { ...emptyJobFields }, documents: [], pending: false, ownerId: null, step: 0 }); });
  }, []);

  async function publish(current: JobDraft) {
    if (!user || processing.current) return;
    if (current.ownerId && current.ownerId !== user.id) { setError(t("Sign in with the account that started this inquiry")); return; }
    processing.current = true; setBusy(true); setError("");
    try {
      const owned = { ...current, ownerId: user.id, pending: true };
      await saveJobDraft(owned); setDraft(owned);
      const job = await post({ data: jobDraftInput(owned) });
      for (const file of owned.documents) {
        if (file.uploaded) continue;
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader(); reader.onerror = () => reject(new Error(t("Could not read document")));
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.readAsDataURL(file.blob);
        });
        await upload({ data: { documentId: file.id, jobId: job.id, name: file.name, mime: file.mime, base64 } });
        file.uploaded = true;
        await saveJobDraft(owned);
      }
      await clearJobDraft();
      await qc.invalidateQueries({ queryKey: ["client-open-jobs"] });
      toast.success(t("Inquiry posted"));
      await navigate({ to: "/client/dashboard", search: { section: "inquiries" } });
    } catch (e) { setError(e instanceof Error ? e.message : t("Could not post inquiry")); }
    finally { setBusy(false); processing.current = false; }
  }
  useEffect(() => {
    if (!loading && user && draft?.pending && resumed.current !== draft.id) {
      resumed.current = draft.id;
      void publish(draft);
    }
  }, [loading, user?.id, draft?.id, draft?.pending]);

  const field = (name: keyof JobFields, value: string) => setDraft(current => current ? { ...current, fields: { ...current.fields, [name]: value }, pending: false } : current);
  async function move(step: number) {
    if (!draft) return;
    const next = { ...draft, step, pending: false };
    try { await saveJobDraft(next); setDraft(next); setError(""); } catch (e) { setError(e instanceof Error ? e.message : t("Could not save draft")); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft || busy) return;
    if (draft.step < 3) { await move(draft.step + 1); return; }
    try {
      jobDraftInput(draft);
      const pending = { ...draft, pending: true };
      await saveJobDraft(pending); setDraft(pending);
      if (user) { resumed.current = pending.id; await publish(pending); }
      else setAuthOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : t("Complete all required fields")); }
  }
  async function addFiles(files: FileList | null) {
    if (!files || !draft) return;
    setBusy(true); setError("");
    try {
      const added = [];
      for (const file of Array.from(files)) {
        const mime = JOB_DOC_TYPES.find(type => type === file.type);
        if (!mime || file.size > JOB_DOC_MAX_BYTES) throw new Error(t("Upload a valid PDF, JPG or PNG document"));
        validateJobDocument(new Uint8Array(await file.arrayBuffer()), mime);
        added.push({ id: crypto.randomUUID(), name: file.name.slice(0, 120), mime, blob: file, uploaded: false });
      }
      const next = { ...draft, documents: [...draft.documents, ...added], pending: false };
      await saveJobDraft(next); setDraft(next);
    } catch (e) { setError(e instanceof Error ? e.message : t("Upload failed")); }
    finally { setBusy(false); }
  }
  const f = draft?.fields ?? emptyJobFields;
  const category = catalog.categories.find(c => c.id === f.categoryId);
  const step = draft?.step ?? 0;
  return <ReferenceTheme><PublicLayout>
    <section className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-9 text-center">
        <p className="mb-3 text-sm text-gold">{t("For clients")} · Dealmaker</p>
        <h1 className="font-display text-5xl sm:text-6xl">{t("Send Job")}</h1>
      </header>
      <ol className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={t("Inquiry steps")}>
        {steps.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined} className={`flex min-h-12 items-center gap-3 border-b-2 pb-3 text-sm ${i <= step ? "border-gold text-foreground" : "border-border text-muted-foreground"}`}>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-current">{i < step ? <Check size={14} /> : i + 1}</span><span>{t(label)}</span>
        </li>)}
      </ol>
      {!draft || loading ? <div className="flex justify-center py-16"><LoaderCircle className="animate-spin" aria-label={t("Loading…")} /></div> : <form onSubmit={submit} className="space-y-7" aria-busy={busy}>
        <h2 className="font-display text-3xl">{t(steps[step] ?? "Budget & review")}</h2>
        <fieldset disabled={busy} className="space-y-6">
          {step === 0 && <>
            <div className="space-y-2"><Label htmlFor="job-category">{t("Category")} *</Label><Select value={f.categoryId} onValueChange={v => field("categoryId", v)} required><SelectTrigger id="job-category" className="w-full"><SelectValue placeholder={t("Choose a category")} /></SelectTrigger><SelectContent>{catalog.categories.map(c => <SelectItem key={c.id} value={c.id}>{localName(lang, c)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="job-title">{t("Job title")} *</Label><Input id="job-title" value={f.title} onChange={e => field("title", e.target.value)} required maxLength={120} placeholder={t("Male MC for a gala dinner")} /></div>
            <div className="space-y-2"><Label htmlFor="job-preferences">{t("Specific preferences")} <span className="text-muted-foreground">({t("Optional")})</span></Label><Textarea id="job-preferences" value={f.preferences} onChange={e => field("preferences", e.target.value)} maxLength={500} placeholder={t("Languages, dress code, performance style")} /></div>
          </>}
          {step === 1 && <>
            <div className="space-y-2"><Label htmlFor="job-date">{t("Event date")} *</Label><Input id="job-date" type="date" min={today} required value={f.eventDate} onChange={e => field("eventDate", e.target.value)} /></div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="job-start">{t("Start time")} *</Label><Input id="job-start" type="time" required value={f.startTime} onChange={e => field("startTime", e.target.value)} /></div><div className="space-y-2"><Label htmlFor="job-end">{t("End time")} *</Label><Input id="job-end" type="time" required value={f.endTime} onChange={e => field("endTime", e.target.value)} /></div></div>
            <p className="text-sm text-muted-foreground">{t("Event times are in UAE time. An earlier end time means the event ends the following day.")}</p>
            <div className="space-y-2"><Label htmlFor="job-venue">{t("Venue / location")} *</Label><Input id="job-venue" required maxLength={500} value={f.venue} onChange={e => field("venue", e.target.value)} placeholder={t("Venue name, area and emirate")} /></div>
            <div className="space-y-2"><Label htmlFor="job-event-type">{t("Event type")} ({t("Optional")})</Label><Select value={f.eventType || "none"} onValueChange={v => field("eventType", v === "none" ? "" : v)}><SelectTrigger id="job-event-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("Not specified")}</SelectItem>{catalog.eventTypes.map(c => <SelectItem key={c.id} value={c.name}>{t(c.name)}</SelectItem>)}</SelectContent></Select></div>
          </>}
          {step === 2 && <>
            <div className="space-y-2"><Label htmlFor="job-brief">{t("Event brief")} *</Label><Textarea id="job-brief" required maxLength={f.eventType ? 4000 - f.eventType.length - 14 : 4000} className="min-h-44" value={f.brief} onChange={e => field("brief", e.target.value)} placeholder={t("Describe the event, performance duration, rundown and what you need from the artist.")} /></div>
            <div className="space-y-3 border-y border-border py-5"><Label htmlFor="job-files" className="flex items-center gap-2"><Upload size={16} />{t("Event documents")} ({t("Optional")})</Label><Input id="job-files" type="file" accept={JOB_DOC_TYPES.join(",")} multiple onChange={e => { void addFiles(e.target.files); e.target.value = ""; }} /><p className="text-sm text-muted-foreground">{t("PDF, JPG or PNG, up to 5 MB. Shared only with artists you approve.")}</p>
              {draft.documents.map(file => <div key={file.id} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2 text-sm"><FileText size={16} className="shrink-0" /><span className="break-all">{file.name}</span></span><Button type="button" size="icon" variant="ghost" aria-label={`${t("Remove document")}: ${file.name}`} onClick={async () => { const next = { ...draft, documents: draft.documents.filter(d => d.id !== file.id) }; try { await saveJobDraft(next); setDraft(next); } catch { setError(t("Could not save draft")); } }}><Trash2 size={16} /></Button></div>)}
            </div>
          </>}
          {step === 3 && <>
            <div className="space-y-2"><Label htmlFor="job-budget">{t("Budget (AED)")} *</Label><Input id="job-budget" type="number" min="0.01" step="0.01" max="10000000" required value={f.budget} onChange={e => field("budget", e.target.value)} placeholder="3000" /><p className="text-sm text-muted-foreground">{t("Your budget is an estimate, not a booking or payment commitment.")}</p></div>
            <div className="space-y-5 border-y border-border py-6"><h3 className="font-display text-2xl">{t("Review your inquiry")}</h3><dl className="grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">{[["Job title", f.title], ["Category", category ? localName(lang, category) : ""], ["Event date", f.eventDate], ["Time", `${f.startTime} / ${f.endTime}`], ["Venue / location", f.venue], ["Event type", f.eventType || t("Not specified")]].map(([label, value]) => <div key={label}><dt className="mb-1 text-muted-foreground">{t(label ?? "")}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl><p className="whitespace-pre-wrap break-words text-sm">{f.brief}</p>{f.preferences && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{f.preferences}</p>}{draft.documents.length > 0 && <ul className="space-y-2">{draft.documents.map(file => <li key={file.id} className="flex items-center gap-2 break-all text-sm"><FileText size={16} className="shrink-0" />{file.name}</li>)}</ul>}</div>
          </>}
        </fieldset>
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
          <Button type="button" variant="outline" disabled={busy || step === 0} onClick={() => void move(step - 1)}><ArrowLeft size={16} />{t("Back")}</Button>
          <Button type="submit" disabled={busy} className="min-h-11 bg-gradient-gold text-gold-foreground">{busy ? <LoaderCircle size={16} className="animate-spin" /> : step === 3 ? <Send size={16} /> : null}{t(busy ? "Please wait…" : step === 3 ? "Submit & post job" : "Continue")}{step < 3 && <ArrowRight size={16} />}</Button>
        </div>
      </form>}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}><DialogContent><DialogTitle>{t("Create your client account")}</DialogTitle><DialogDescription>{t("Your inquiry is saved on this device. It will be posted after you sign in with a verified account.")}</DialogDescription><Button asChild className="bg-gradient-gold text-gold-foreground"><Link to="/auth" search={{ mode: "signup", redirect: "/send-job" }}>{t("Sign up & post job")}</Link></Button><Button asChild variant="outline"><Link to="/auth" search={{ redirect: "/send-job" }}>{t("Already have an account? Sign in")}</Link></Button></DialogContent></Dialog>
    </section>
  </PublicLayout></ReferenceTheme>;
}