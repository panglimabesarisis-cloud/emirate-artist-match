import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Check, PencilLine, X } from "lucide-react";
import { getApproval, approveBooking, declineBooking } from "@/lib/bookings.functions";
import { priceBreakdown } from "@/lib/booking-rules";
import { aed } from "@/lib/format";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/approve/$id")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ k: typeof s["k"] === "string" ? s["k"] : "" }),
  head: () => ({ meta: [{ title: "Approve booking | Dealmaker" }, { name: "description", content: "Review the event details your AI assistant collected and approve or edit the booking." }, { name: "robots", content: "noindex" }] }),
  component: ApprovePage,
});

function ApprovePage() {
  const { id } = Route.useParams();
  const { k } = Route.useSearch();
  const qc = useQueryClient();
  const get$ = useServerFn(getApproval);
  const approve$ = useServerFn(approveBooking);
  const decline$ = useServerFn(declineBooking);
  const { data: b, error } = useQuery({ queryKey: ["approval", id], queryFn: () => get$({ data: { id, key: k } }), retry: false });
  const [mode, setMode] = useState<"view" | "edit" | "decline">("view");
  const [f, setF] = useState({ title: "", amount: "", eventDate: "", notes: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (b) setF({ title: b.package_title ?? "", amount: String(b.amount), eventDate: b.event_date, notes: b.notes ?? "" }); }, [b]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); setMode("view"); await qc.invalidateQueries({ queryKey: ["approval", id] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  if (error) return <PublicLayout><div className="p-16 text-center">This approval link is invalid.</div></PublicLayout>;
  if (!b) return <PublicLayout><div className="p-16 text-center text-muted-foreground">Loading…</div></PublicLayout>;
  const q = b.conversations?.quote_requests;
  const p = priceBreakdown(Number(f.amount) || 0);
  const pending = b.status === "inquiry";

  const rows: [string, string][] = [
    ["Client", b.client_name],
    ["Event", b.event_types?.name ?? "—"],
    ["Date", b.event_date],
    ["Area", q?.areas?.name ?? "—"],
    ["Guests", b.guests ? String(b.guests) : "—"],
    ["Client budget", q?.budget ? aed(Number(q.budget)) : "—"],
    ["Package", b.package_title ?? "—"],
    ["Price excl. VAT", aed(Number(b.amount))],
    ["VAT 5%", aed(Number(b.vat_amount))],
    ["Client pays", aed(Number(b.total))],
  ];

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Bot className="h-3 w-3" />{b.drafted_by === "ai" ? "Drafted by your AI assistant" : "Booking"} for {b.artists?.stage_name}</div>
            <h1 className="text-3xl font-semibold">Approve this booking?</h1>
          </div>
          <Badge variant={pending ? "default" : "secondary"}>{pending ? "Awaiting your approval" : b.status === "quoted" ? "Approved · waiting for client payment" : b.status}</Badge>
        </div>

        <section className="rounded-2xl bg-card p-6 shadow-card">
          <h2 className="font-semibold">Event details</h2>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {rows.map(([k2, v]) => <div key={k2} className="flex justify-between gap-3 border-b border-border/60 py-1.5"><dt className="text-muted-foreground">{k2}</dt><dd className="text-right font-medium">{v}</dd></div>)}
          </dl>
          {b.notes && <p className="mt-4 text-sm" dir="auto"><span className="text-muted-foreground">Notes: </span>{b.notes}</p>}
          {q?.message && <p className="mt-2 text-sm text-muted-foreground" dir="auto">Original request: {q.message}</p>}
        </section>

        {b.recent.length > 0 && (
          <section className="rounded-2xl bg-card p-6 shadow-card">
            <h2 className="font-semibold">Latest messages</h2>
            <div className="mt-3 space-y-2 text-sm">
              {b.recent.map((m, i) => <p key={i} dir="auto"><span className="text-xs uppercase tracking-wide text-muted-foreground">{m.sender === "client" ? "Client" : m.sender === "ai" ? "AI" : "You"}: </span>{m.body}</p>)}
            </div>
          </section>
        )}

        {pending && mode === "view" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Button disabled={busy} className="bg-gradient-gold text-gold-foreground" onClick={() => run(() => approve$({ data: { id, key: k, ...f, amount: Number(f.amount) } }), "Approved — payment link sent to the client")}><Check className="mr-2 h-4 w-4" />Approve</Button>
            <Button variant="outline" onClick={() => setMode("edit")}><PencilLine className="mr-2 h-4 w-4" />Edit details</Button>
            <Button variant="ghost" onClick={() => setMode("decline")}><X className="mr-2 h-4 w-4" />Ask client to change</Button>
          </div>
        )}

        {pending && mode === "edit" && (
          <section className="rounded-2xl bg-card p-6 shadow-card space-y-3">
            <h2 className="font-semibold">Edit before approving</h2>
            <div><Label>Package / title</Label><Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Price excl. VAT</Label><Input type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
              <div><Label>Event date</Label><Input type="date" value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} /></div>
            </div>
            <div><Label>Notes for the client</Label><Textarea rows={3} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">VAT 5%: {aed(p.vat)} · Client pays {aed(p.total)}</p>
            <div className="flex gap-2">
              <Button disabled={busy || !(Number(f.amount) > 0) || !f.eventDate} className="bg-gradient-gold text-gold-foreground" onClick={() => run(() => approve$({ data: { id, key: k, ...f, amount: Number(f.amount) } }), "Approved with your changes — payment link sent")}>Save & approve</Button>
              <Button variant="ghost" onClick={() => setMode("view")}>Back</Button>
            </div>
          </section>
        )}

        {pending && mode === "decline" && (
          <section className="rounded-2xl bg-card p-6 shadow-card space-y-3">
            <h2 className="font-semibold">What should the client change?</h2>
            <Textarea rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'm only free until 10pm that night — could we start at 7pm?" />
            <p className="text-xs text-muted-foreground">Your message is posted in the chat and you take over the conversation personally.</p>
            <div className="flex gap-2">
              <Button disabled={busy || note.trim().length < 5} onClick={() => run(() => decline$({ data: { id, key: k, note } }), "Message sent to the client")}>Send to client</Button>
              <Button variant="ghost" onClick={() => setMode("view")}>Back</Button>
            </div>
          </section>
        )}
      </div>
    </PublicLayout>
  );
}
