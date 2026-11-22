import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Coins, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { testAgent } from "@/lib/chat.functions";
import { BillingPanel } from './BillingPanel';
import { artistCheckout } from "@/lib/payments.functions";
import { SandboxCheckout, PaymentTestModeBanner, type CheckoutSession } from "@/components/site/SandboxCheckout";
import { TOPUP_PACKAGES } from "@/lib/masking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { PromptLibrary, useArtistPlan } from "./PromptLibrary";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioHeading, StudioSection, StudioSoon, StudioEmpty } from "./StudioPage";

export { Inbox } from "./InboxPage";

const MODEL_LABEL: Record<string, string> = { fast: "Fast", balanced: "Balanced", advanced: "Advanced" };

export function AgentSettings({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const test$ = useServerFn(testAgent);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["agent", artistId], queryFn: async () => (await supabase.from("agent_settings").select("*").eq("artist_id", artistId).maybeSingle()).data });
  const plan = useArtistPlan(artistId);
  const [v, setV] = useState({ enabled: true, tone: "warm and professional", max_discount_pct: 10, extra_instructions: "", knowledge: "", model: "", reply_length: "medium", languages: "", handoff: { negotiation: true, complaints: true, unclear: true } });
  useEffect(() => {
    if (!data) return;
    const h = (data.handoff && typeof data.handoff === "object" && !Array.isArray(data.handoff) ? data.handoff : {}) as Record<string, unknown>;
    setV({ enabled: data.enabled, tone: data.tone, max_discount_pct: data.max_discount_pct, extra_instructions: data.extra_instructions ?? "", knowledge: data.knowledge ?? "", model: data.model ?? "", reply_length: data.reply_length ?? "medium", languages: (data.languages ?? []).join(", "), handoff: { negotiation: h["negotiation"] !== false, complaints: h["complaints"] !== false, unclear: h["unclear"] !== false } });
  }, [data]);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ id: string; sender: string; body: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const { languages, model, ...rest } = v;
    const { error } = await supabase.from("agent_settings").upsert({ artist_id: artistId, ...rest, model: model || null, languages: languages.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10), extra_instructions: v.extra_instructions || null, knowledge: v.knowledge || null, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success(t("AI agent settings saved"));
  };
  const test = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    try { const r = await test$({ data: { text: msg } }); setChat(r.messages); setMsg(""); qc.invalidateQueries({ queryKey: ["wallet", artistId] }); }
    catch { toast.error(t("Test failed")); } finally { setBusy(false); }
  };
  return (
    <div className="dmr-wrap dmr-agpage">
      <StudioHeading title="AI" accent="agent"><label className="flex items-center gap-3"><Switch checked={v.enabled} onCheckedChange={c=>setV({...v,enabled:c})} />{t(v.enabled ? "Agent is on" : "Agent is off")}</label></StudioHeading>
      <section className="dmr-panel studio-agent-settings">
        <div className="dmr-qe-f"><Label>{t("Model")}</Label>
          <Select value={v.model || "default"} onValueChange={(x) => setV({ ...v, model: x === "default" ? "" : x })}>
            <SelectTrigger aria-label={t("Model")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("Default")}</SelectItem>
              {(plan.data?.mine?.allowed_models ?? []).map((m) => <SelectItem key={m} value={m}>{t(MODEL_LABEL[m] ?? m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("Models available depend on your plan.")}</p></div>
        <div className="dmr-qe-f"><Label>{t("Tone of voice")}</Label><Input value={v.tone} maxLength={80} onChange={e=>setV({...v,tone:e.target.value})} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="dmr-qe-f"><Label>{t("Reply length")}</Label>
            <Select value={v.reply_length} onValueChange={(x) => setV({ ...v, reply_length: x })}>
              <SelectTrigger aria-label={t("Reply length")}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="short">{t("Short")}</SelectItem><SelectItem value="medium">{t("Medium")}</SelectItem><SelectItem value="detailed">{t("Detailed")}</SelectItem></SelectContent>
            </Select></div>
          <div className="dmr-qe-f"><Label htmlFor="agent-langs">{t("Languages it replies in")}</Label><Input id="agent-langs" value={v.languages} placeholder="English, Arabic" maxLength={100} onChange={(e) => setV({ ...v, languages: e.target.value })} /></div>
        </div>
        <div className="dmr-qe-f"><Label>{t("Maximum discount the AI may offer (%)")}</Label><Input type="number" min={0} max={30} value={v.max_discount_pct} onChange={e=>setV({...v,max_discount_pct:Math.min(30,Math.max(0,Number(e.target.value)))})} /></div>
        <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">{t("Hand over to me when")}</legend>
          {([["negotiation", "The client keeps negotiating the price"], ["complaints", "The client complains or is upset"], ["unclear", "The agent cannot answer the request"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm">{t(label)}<Switch checked={v.handoff[k]} onCheckedChange={(c) => setV({ ...v, handoff: { ...v.handoff, [k]: c } })} /></label>
          ))}</fieldset>
        <div className="studio-save-bar"><span className="text-xs text-muted-foreground">{t("AI replies on")}</span><Button onClick={save}>{t("Save settings")}</Button></div>
      </section>
      <section className="dmr-panel studio-agent-test">
        <header className="studio-agent-header"><span className="studio-empty-icon"><Bot /></span><div><h2>{t("Test your")} <span className="it">{t("assistant")}</span></h2><p className="text-xs text-muted-foreground">{t("Each reply uses 1 credit, like a real chat.")}</p></div></header>
        <div className="studio-agent-chat space-y-3" role="log" aria-live="polite">{chat.map(m=>m.sender === "system" ? <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div> : <div key={m.id} className={`flex ${m.sender === "client" ? "justify-end" : ""}`}><div className={`dmr-m ${m.sender === "client" ? "studio-message-client" : "studio-message-ai"}`} dir="auto">{m.body}</div></div>)}{busy && <p className="text-xs text-muted-foreground">{t("Thinking…")}</p>}</div>
        <div className="flex gap-2"><Input value={msg} onChange={e=>setMsg(e.target.value)} placeholder={t("Pretend to be a client…")} onKeyDown={e=>e.key === "Enter" && test()} /><Button onClick={test} disabled={busy} aria-label={t("Send test message")}><Send className="size-4" /></Button></div>
      </section>
      <PromptLibrary artistId={artistId} />
      <section className="dmr-panel dmr-c-12"><h2>{t("Your")} <span className="it">{t("rules and facts")}</span></h2><div className="grid gap-6 md:grid-cols-2 mt-5"><div className="dmr-qe-f"><Label>{t("Reply instructions")}</Label><Textarea rows={6} maxLength={1500} value={v.extra_instructions} onChange={e=>setV({...v,extra_instructions:e.target.value})} placeholder={t("e.g. I need a 30-min sound check. No performances after 1am.")} /></div><div className="dmr-qe-f"><Label>{t("AI knowledge")}</Label><Textarea rows={8} maxLength={8000} value={v.knowledge} onChange={e=>setV({...v,knowledge:e.target.value})} placeholder={t("Facts the assistant can use: FAQ, equipment, set list, travel, rider, cancellation terms.")} /><div className="text-end text-xs text-muted-foreground">{v.knowledge.length}/8000</div></div></div><Button onClick={save}>{t("Save settings")}</Button></section>
    </div>
  );
}

export function Credits({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const top$ = useServerFn(artistCheckout);
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const { data } = useQuery({
    queryKey: ["wallet", artistId],
    queryFn: async () => {
      const [w, l] = await Promise.all([
        supabase.from("credit_wallets").select("balance").eq("artist_id", artistId).maybeSingle(),
        supabase.from("credit_ledger").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(30),
      ]);
      return { balance: w.data?.balance ?? 0, ledger: l.data ?? [] };
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (id: string) => {
    setBusy(id);
    try { const r = await top$({ data: { kind: "credits", packageId: id } }); if ("error" in r) throw new Error(r.error); setCheckout(r); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Top-up failed"); } finally { setBusy(null); }
  };
  const labels: Record<string, string> = { plan_allocation: "Plan credits", ai_reply: "AI reply", topup_demo: "Top-up (demo)", topup_stripe_sandbox: "Stripe sandbox top-up" };
  return (
    <div className="dmr-wrap dmr-cpage">
      <StudioHeading title="AI" accent="credits" />
      <div className="dmr-c-12"><PaymentTestModeBanner />{checkout && <SandboxCheckout session={checkout} onPaid={()=>{setCheckout(null);toast.success(t("Payment verified — credits added"));qc.invalidateQueries({queryKey:["wallet",artistId]});}} />}</div>
      <section className="dmr-panel studio-credit-hero"><div><p className="text-xs uppercase text-muted-foreground">{t("AI credit balance")}</p><div className="font-display text-6xl mt-3">{data?.balance ?? "—"}</div><p className="text-xs text-muted-foreground mt-4">{t("1 credit = 1 AI reply. Clients never pay for AI.")}</p><Button asChild className="mt-6"><a href="#studio-credit-packs"><Coins className="size-4" />{t("Buy credits")}</a></Button></div><div className="studio-credit-chart"><h2>{t("Usage")} <span className="it">{t("per day")}</span></h2><div className="studio-credit-bars">{Array.from({length:7},(_,i)=>{const date=new Date();date.setDate(date.getDate()-6+i);const key=date.toISOString().slice(0,10);const usage=(data?.ledger ?? []).filter(l=>l.created_at.slice(0,10) === key && l.delta < 0).reduce((sum,l)=>sum-l.delta,0);return <div key={key}><span>{usage}</span><i style={{height:Math.min(100,usage*5)+"%"}} /><span>{date.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span></div>;})}</div><p className="text-xs text-muted-foreground mt-3">{t("Latest 30 credit entries")}</p></div></section>
      {data && data.balance < 20 && <div className="dmr-c-12 dmr-w-banner">{t("Your credits are running low. When they run out, new chats wait for your personal reply.")}</div>}
      <div className="dmr-w-left">
        <StudioSection title="Usage by" accent="model"><div className="grid grid-cols-2 gap-3"><StudioSoon label="Model" /><StudioSoon label="Input / output tokens" /><StudioSoon label="Cost" /><StudioSoon label="Share" /></div></StudioSection>
        <section className="dmr-panel dmr-q-panel"><div className="dmr-q-tools"><h2>{t("Usage")} <span className="it">{t("history")}</span></h2></div><div className="dmr-tbl-wrap"><table><thead><tr>{["Date and time","Activity","Credits"].map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{data?.ledger.map(l=><tr key={l.id}><td>{new Date(l.created_at).toLocaleString("en-GB")}</td><td>{t(labels[l.reason] ?? l.reason)}</td><td className={l.delta < 0 ? "text-destructive" : "text-success"}>{l.delta > 0 ? "+" : ""}{l.delta}</td></tr>)}</tbody></table></div>{data?.ledger.length === 0 && <StudioEmpty title={t("No usage found")} />}</section>
        <StudioSection title="Your" accent="plan"><BillingPanel artistId={artistId} /></StudioSection>
        <StudioSection title="Top up" accent="credits"><div id="studio-credit-packs" className="studio-credit-packs">{TOPUP_PACKAGES.map(p=><div key={p.id} className="studio-credit-pack"><div className="font-display">{p.credits}</div><span className="text-xs text-muted-foreground">{t("credits")}</span><p className="mt-3 text-sm font-semibold">{t("AED")} {(p.priceAed * 1.05).toFixed(2)}</p><p className="text-xs text-muted-foreground">{t("incl. VAT 5%")}</p><Button disabled={busy !== null} onClick={()=>buy(p.id)}>{t(busy === p.id ? "Processing…" : "Buy · Stripe sandbox")}</Button></div>)}</div></StudioSection>
      </div>
      <div className="dmr-w-side"><StudioSection title="Token" accent="rates"><StudioSoon label="Provider rates" /></StudioSection><StudioSection title="How credits" accent="work"><div className="space-y-4 text-sm text-muted-foreground"><p>{t("1 credit = 1 AI reply. Clients never pay for AI.")}</p><p>{t("When credits run out, new chats wait for your personal reply.")}</p></div></StudioSection></div>
    </div>
  );
}

