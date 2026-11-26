import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEmailSettings, getIntegrationStatus, getSecurityLimits, saveEmailSettings, saveSecurityLimits, sendTestEmail } from "@/lib/admin-system.functions";
import { LIMIT_FIELDS, limitProblem, type SecurityLimits } from "@/lib/security-limits";
import { SECURITY_HEADERS } from "@/lib/security-headers";

const problem = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong");
const stamp = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "—");
const Card = ({ title, description, wide, children }: { title: string; description?: string; wide?: boolean; children: React.ReactNode }) => (
  <section className={`adm-set-card${wide ? " is-wide" : ""}`}><header><h2>{title}</h2>{description && <p>{description}</p>}</header>{children}</section>
);
const Pill = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => <span className={`adm-pill is-${ok ? "paid" : "pending"}`}>{ok ? yes : no}</span>;

export function EmailSettings() {
  const load = useServerFn(getEmailSettings), save = useServerFn(saveEmailSettings), test = useServerFn(sendTestEmail);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["email-settings"], queryFn: () => load() });
  const [from, setFrom] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  useEffect(() => { if (query.data) setFrom(query.data.from); }, [query.data]);
  const ready = !!query.data?.keySaved && !!query.data.from;
  const run = async (work: () => Promise<void>) => { setBusy(true); try { await work(); } catch (error) { toast.error(problem(error)); } finally { setBusy(false); } };
  return (
    <div className="adm-set-grid">
      <Card title="Email provider" description="Booking links, offers and reminders are emailed through Resend once a key and sender are saved.">
        <Pill ok={ready} yes="Ready" no="Not set up" />
        <div className="space-y-1"><Label htmlFor="mail-from">Sender</Label><Input id="mail-from" placeholder="Dealmaker <bookings@yourdomain.com>" value={from} onChange={(e) => setFrom(e.target.value)} /><p className="text-xs text-muted-foreground">The domain must be verified in your Resend account.</p></div>
        <div className="space-y-1"><Label htmlFor="mail-key">Resend API key</Label><Input id="mail-key" type="password" autoComplete="new-password" placeholder={query.data?.keySaved ? "Saved. Enter a new key to replace it" : "re_…"} value={key} onChange={(e) => setKey(e.target.value)} /></div>
        {query.error && <p role="alert" className="text-sm text-destructive">{problem(query.error)}</p>}
        <div className="adm-set-actions"><Button disabled={busy || !from.trim()} onClick={() => void run(async () => { await save({ data: { from: from.trim(), apiKey: key.trim() || undefined } }); setKey(""); await qc.invalidateQueries({ queryKey: ["email-settings"] }); toast.success("Email settings saved"); })}>Save email settings</Button></div>
      </Card>
      <Card title="Test email" description="Sends one message to your own account address.">
        <Button variant="outline" disabled={busy || !ready} onClick={() => void run(async () => { const r = await test({}); setResult(r.status === "sent" ? `Accepted for ${r.to}. Check that inbox.` : r.error ?? "Email is not set up yet."); })}>Send test email to me</Button>
        {result && <p role="status" className="break-words text-sm">{result}</p>}
      </Card>
    </div>
  );
}

const ENDPOINTS: [string, string, string][] = [
  ["Stripe payment webhook", "POST", "/api/public/payments/webhook"],
  ["WhatsApp (Meta) webhook", "GET / POST", "/api/public/whatsapp/webhook"],
  ["WhatsApp (Fonnte) replies", "POST", "/api/public/whatsapp/fonnte-webhook"],
  ["Artist calendar feed", "GET", "/api/public/calendar/<private token>.ics"],
  ["Scheduled: payment recovery", "POST", "/api/public/jobs/payments"],
  ["Scheduled: booking reminders", "POST", "/api/public/jobs/booking-reminders"],
];

export function ApiSettings() {
  const load = useServerFn(getIntegrationStatus);
  const query = useQuery({ queryKey: ["integration-status"], queryFn: () => load() });
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const data = query.data;
  return (
    <div className="adm-set-grid">
      <Card wide title="API & webhook addresses" description="Give these addresses to the services that call Dealmaker. Each one checks a signature or secret.">
        <div className="admin-table-wrap"><table><thead><tr><th>Use</th><th>Method</th><th>Address</th><th><span className="sr-only">Copy</span></th></tr></thead><tbody>
          {ENDPOINTS.map(([use, method, path]) => <tr key={path}><td><b>{use}</b></td><td>{method}</td><td className="break-all" dir="ltr">{origin}{path}</td><td>{!path.includes("<") && <Button size="sm" variant="outline" aria-label={`Copy the ${use} address`} onClick={() => void navigator.clipboard.writeText(origin + path).then(() => toast.success("Address copied"), () => toast.error("Could not copy"))}>Copy</Button>}</td></tr>)}
        </tbody></table></div>
      </Card>
      <Card title="Keys and secrets" description="Only whether each one is set. Values are never shown.">
        {query.error && <p role="alert" className="text-sm text-destructive">{problem(query.error)}</p>}
        <div className="divide-y">{data?.keys.map((k) => <div key={k.name} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{k.name}<span className="block text-xs text-muted-foreground">{k.where}</span></span><Pill ok={k.set} yes="Set" no="Not set" /></div>)}{query.isPending && <p role="status" className="text-sm">Loading…</p>}</div>
      </Card>
      <Card title="Incoming events" description="What the webhooks have delivered.">
        <dl className="admin-detail-grid"><div><dt>Recent payment events</dt><dd>{data?.payments.total ?? "…"}</dd></div><div><dt>Failed payment events</dt><dd>{data?.payments.failed ?? "…"}</dd></div><div><dt>Last payment event</dt><dd>{stamp(data?.payments.last ?? null)}</dd></div><div><dt>WhatsApp events stored</dt><dd>{data?.whatsappEvents ?? "…"}</dd></div></dl>
      </Card>
      <Card wide title="Scheduled jobs" description="Tasks the database runs on its own.">
        <div className="admin-table-wrap"><table><thead><tr><th>Job</th><th>Schedule (UTC)</th><th>State</th><th>Last run</th><th>Result</th></tr></thead><tbody>
          {data?.jobs.map((j) => <tr key={j.name}><td><b>{j.name}</b></td><td>{j.schedule}</td><td><Pill ok={j.active} yes="Active" no="Paused" /></td><td>{stamp(j.last_run)}</td><td>{j.last_status ?? "—"}</td></tr>)}
          {!data?.jobs.length && <tr><td colSpan={5}>{query.isPending ? "Loading…" : "No scheduled job is visible."}</td></tr>}
        </tbody></table></div>
      </Card>
    </div>
  );
}

export function SecuritySettings() {
  const load = useServerFn(getSecurityLimits), save = useServerFn(saveSecurityLimits);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["security-limits"], queryFn: () => load() });
  const status = useQuery({
    queryKey: ["security-overview"],
    queryFn: async () => {
      const r = await supabase.rpc("admin_security_overview");
      if (r.error) throw new Error("Your account may not view the security status");
      return r.data as unknown as { admins: number; owners: number; admins_without_phone: number; high_events_7d: number; tables_without_row_security: string[]; limited_actions_hour: number };
    },
  });
  const [draft, setDraft] = useState<SecurityLimits | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);
  const issue = draft ? limitProblem(draft) : null;
  const s = status.data;
  const submit = async () => {
    if (!draft || issue) return;
    setBusy(true);
    try { await save({ data: draft }); await qc.invalidateQueries({ queryKey: ["security-limits"] }); toast.success("Limits saved. They apply from the next request."); }
    catch (error) { toast.error(problem(error)); }
    finally { setBusy(false); }
  };
  const checks: [string, boolean, string][] = s ? [
    ["Row security on every table", s.tables_without_row_security.length === 0, s.tables_without_row_security.join(", ") || "All protected"],
    ["Administrators verified their phone", s.admins_without_phone === 0, s.admins_without_phone ? `${s.admins_without_phone} of ${s.admins} not verified` : "All verified"],
    ["High-risk admin actions (7 days)", true, `${s.high_events_7d} recorded in the audit log`],
    ["Protected owner accounts", s.owners > 0, `${s.owners} owner(s) of ${s.admins} admin(s)`],
  ] : [];
  return (
    <div className="adm-set-grid">
      <Card title="Abuse limits" description="Limits on actions that cost money or reach other people.">
        {query.error && <p role="alert" className="text-sm text-destructive">{problem(query.error)}</p>}
        <div className="adm-set-fields">{draft && LIMIT_FIELDS.map((f) => <div key={f.key} className="space-y-1"><Label htmlFor={`limit-${f.key}`}>{f.label}</Label><Input id={`limit-${f.key}`} type="number" min={f.min} max={f.max} value={Number.isNaN(draft[f.key]) ? "" : draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value === "" ? NaN : Number(e.target.value) })} /></div>)}</div>
        {issue && <p role="alert" className="text-sm text-destructive">{issue}</p>}
        <div className="adm-set-actions"><Button disabled={busy || !draft || !!issue} onClick={() => void submit()}>Save limits</Button></div>
      </Card>
      <Card title="Security status" description="Read from the database now.">
        {status.error && <p role="alert" className="text-sm text-destructive">{problem(status.error)}</p>}
        <div className="divide-y">{checks.map(([label, ok, detail]) => <div key={label} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{label}<span className="block text-xs text-muted-foreground">{detail}</span></span><Pill ok={ok} yes="OK" no="Check" /></div>)}{status.isPending && <p role="status" className="text-sm">Loading…</p>}</div>
        <p className="text-xs text-muted-foreground">Who may do what is set in Users, roles & permissions. Requiring a WhatsApp code is set in the WhatsApp tab.</p>
      </Card>
      <Card wide title="Browser protections" description="Sent with every page of the website.">
        <div className="admin-table-wrap"><table><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>{Object.entries(SECURITY_HEADERS).map(([name, value]) => <tr key={name}><td><b>{name}</b></td><td className="break-all">{value}</td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}
