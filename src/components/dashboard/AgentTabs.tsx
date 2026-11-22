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

export { CreditsPage as Credits } from "./CreditsPage";
