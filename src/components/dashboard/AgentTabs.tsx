import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Check, Lock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { testAgent } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { PromptLibrary, useArtistPlan } from "./PromptLibrary";
import { StudioHeading } from "./StudioPage";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHAT_MODEL_CATALOG, catalogModel } from "@/lib/chat-model-catalog";
import { AGENT_MODELS } from "@/lib/agent-options";
import "./agent-account.css";

export { Inbox } from "./InboxPage";

const MODEL_LABEL: Record<string, string> = { fast: "Fast", balanced: "Balanced", advanced: "Advanced" };

export function AgentSettings({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const test$ = useServerFn(testAgent);
  const qc = useQueryClient();
  const { data, error: settingsError, isPending } = useQuery({ queryKey: ["agent", artistId], queryFn: async () => { const result = await supabase.from("agent_settings").select("*").eq("artist_id", artistId).maybeSingle(); if (result.error) throw result.error; return result.data; } });
  const plan = useArtistPlan(artistId);
  const wallet = useQuery({ queryKey: ["agent-settings-wallet", artistId], queryFn: async () => { const { data, error } = await supabase.from("credit_wallets").select("balance,balance_fraction").eq("artist_id", artistId).maybeSingle(); if (error) throw error; return { balance: Number(data?.balance ?? 0) + Number(data?.balance_fraction ?? 0) }; }, refetchInterval: 15000 });
  const [v, setV] = useState({ enabled: true, tone: "warm and professional", max_discount_pct: 10, extra_instructions: "", knowledge: "", model: "", reply_length: "medium", languages: "", handoff: { negotiation: true, complaints: true, unclear: true } });
  const [saved, setSaved] = useState(v);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  useEffect(() => {
    if (!data) return;
    const h = (data.handoff && typeof data.handoff === "object" && !Array.isArray(data.handoff) ? data.handoff : {}) as Record<string, unknown>;
    const next = { enabled: data.enabled, tone: data.tone, max_discount_pct: data.max_discount_pct, extra_instructions: data.extra_instructions ?? "", knowledge: data.knowledge ?? "", model: data.model ?? "", reply_length: data.reply_length ?? "medium", languages: (data.languages ?? []).join(", "), handoff: { negotiation: h["negotiation"] !== false, complaints: h["complaints"] !== false, unclear: h["unclear"] !== false } };
    setV(next); setSaved(next);
  }, [data]);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ id: string; sender: string; body: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setSaving(true);
    const { languages, model, ...rest } = v;
    const { error } = await supabase.from("agent_settings").upsert({ artist_id: artistId, ...rest, model: model || null, languages: languages.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10), extra_instructions: v.extra_instructions || null, knowledge: v.knowledge || null, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSaved(v); void qc.invalidateQueries({ queryKey: ["agent", artistId] });
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
      <section className="dmr-panel studio-agent-settings" aria-label={t("Agent settings")}>
        {settingsError && <p role="alert" className="text-destructive">{settingsError.message}</p>}
        <fieldset className="agent-section"><legend>{t("Model")}</legend><div className="agent-models" role="radiogroup" aria-label={t("AI model")}>
          {(["fast", "balanced", "advanced"] as const).map((model) => { const allowed = plan.data?.mine?.allowed_models.includes(model) ?? false; return <Button key={model} variant="outline" role="radio" aria-checked={v.model === model || catalogModel(v.model)?.tier === model} disabled={!allowed || isPending} className="agent-model" onClick={() => setV({ ...v, model })}><b>{t(MODEL_LABEL[model] ?? model)}</b><small>{AGENT_MODELS[model].replace("openai/", "")}</small><span>{t({ fast: "Quick, direct replies", balanced: "A balance of speed and detail", advanced: "For more detailed requests" }[model])}</span><small>{t("Usage-based task credits")}</small>{!allowed && <span className="flex items-center gap-1 text-gold"><Lock className="size-3" />{t("Plan restricted")}</span>}</Button>; })}
        </div><div className="agent-model-picker"><Select value={v.model || "default"} onValueChange={model => setV({ ...v, model: model === "default" ? "" : model })}><SelectTrigger aria-label={t("Choose AI model")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="default">{t("Use plan default")}</SelectItem>{Object.entries(MODEL_LABEL).map(([key, label]) => <SelectItem key={key} value={key} disabled={!plan.data?.mine?.allowed_models.includes(key)}>{t(label)}</SelectItem>)}{CHAT_MODEL_CATALOG.map(model => <SelectItem key={model.id} value={model.id} disabled={!plan.data?.mine?.allowed_models.includes(model.tier)}>{model.name} · {t("Usage-based task credits")}</SelectItem>)}</SelectContent></Select></div></fieldset>
        <fieldset className="agent-section"><legend>{t("Tone")}</legend><div className="agent-pills" role="radiogroup" aria-label={t("Tone")}>
          {["warm and professional", "friendly", "formal", "concise"].map((tone) => <Button key={tone} size="sm" variant="outline" role="radio" aria-checked={v.tone === tone} onClick={() => setV({ ...v, tone })}>{t(tone)}</Button>)}
        </div><Input className="mt-3" aria-label={t("Custom tone")} value={v.tone} maxLength={80} onChange={e => setV({ ...v, tone: e.target.value })} /></fieldset>
        <fieldset className="agent-section"><legend>{t("Reply length")}</legend><div className="agent-pills" role="radiogroup" aria-label={t("Reply length")}>
          {["short", "medium", "detailed"].map((length) => <Button key={length} size="sm" variant="outline" role="radio" aria-checked={v.reply_length === length} onClick={() => setV({ ...v, reply_length: length })}>{t(length)}</Button>)}
        </div></fieldset>
        <fieldset className="agent-section"><legend>{t("Languages it replies in")}</legend><div className="agent-pills">{["English", "Arabic", "Hindi", "Urdu", "Tagalog", "French"].map((language) => { const values = v.languages.split(",").map(x => x.trim()).filter(Boolean); const active = values.includes(language); return <Button key={language} size="sm" variant="outline" aria-pressed={active} onClick={() => setV({ ...v, languages: (active ? values.filter(x => x !== language) : [...values, language]).join(", ") })}>{t(language)}</Button>; })}</div><Input id="agent-langs" className="mt-3" aria-label={t("Languages it replies in")} value={v.languages} placeholder="English, Arabic" maxLength={100} onChange={e => setV({ ...v, languages: e.target.value })} /></fieldset>
        <div className="agent-section"><Label htmlFor="agent-discount" className="agent-section-title">{t("Maximum discount (%)")}</Label><Input id="agent-discount" type="number" min={0} max={30} value={v.max_discount_pct} onChange={e => setV({ ...v, max_discount_pct: Math.min(30, Math.max(0, Number(e.target.value))) })} /></div>
        <fieldset className="agent-section"><legend>{t("Hand over to me")}</legend><div className="agent-handoff">{([["negotiation", "The client keeps negotiating the price"], ["complaints", "The client complains or is upset"], ["unclear", "The agent cannot answer the request"]] as const).map(([key, label]) => <label key={key}><Checkbox checked={v.handoff[key]} onCheckedChange={checked => setV({ ...v, handoff: { ...v.handoff, [key]: checked === true } })} />{t(label)}</label>)}</div></fieldset>
        <div className="agent-save"><span role="status">{t(dirty ? "Unsaved changes" : "Everything is saved.")}</span><div className="flex gap-2"><Button variant="outline" disabled={!dirty || saving} onClick={() => setV(saved)}>{t("Discard")}</Button><Button disabled={!dirty || saving || isPending || !!settingsError} onClick={save}><Check className="size-4" />{t(saving ? "Saving…" : "Save settings")}</Button></div></div>
      </section>
      <section className="dmr-panel studio-agent-test">
        <header className="studio-agent-header"><span className="studio-empty-icon"><Bot /></span><div className="min-w-0 flex-1"><h2>{t("Test your")} <span className="it">{t("assistant")}</span></h2><p className="text-xs text-muted-foreground">{t(v.enabled ? "Agent is on" : "Agent is off")}</p></div><span className="account-status">{t(MODEL_LABEL[v.model] ?? "Default")}</span></header>
        <div className="studio-agent-chat" role="log" aria-live="polite" aria-label={t("Test conversation")}>{!chat.length && !busy && <div className="agent-chat-empty"><Bot className="size-8 text-gold" /><b>{t("Test your assistant")}</b></div>}{chat.map(m => m.sender === "system" ? <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div> : <div key={m.id} className={`flex ${m.sender === "client" ? "justify-end" : ""}`}><div className={`dmr-m ${m.sender === "client" ? "studio-message-client" : "studio-message-ai"}`} dir="auto">{m.body}</div></div>)}{busy && <p className="text-xs text-muted-foreground">{t("Thinking…")}</p>}</div>
        <div className="agent-test-suggestions">{["Are you available next Friday?", "What is your starting price?", "Do you travel to Dubai?", "Can you give me a discount?", "I am not happy with my booking."].map(question => <Button key={question} size="sm" variant="outline" disabled={busy} onClick={() => setMsg(t(question))}>{t(question)}</Button>)}</div>
        <form className="agent-test-input" onSubmit={event => { event.preventDefault(); void test(); }}><Input value={msg} maxLength={2000} aria-label={t("Test message")} onChange={e => setMsg(e.target.value)} placeholder={t("Write as a client would")} /><Button type="submit" disabled={busy || !msg.trim()} aria-label={t("Send test message")}><Send className="size-4" /></Button></form>
        <div className="agent-test-footer"><span>{t("Tests use task credits, like the live agent.")}</span><Button variant="ghost" size="sm" disabled={busy} onClick={() => setChat([])}>{t("Clear chat")}</Button></div>
      </section>
      <div className="agent-summary dmr-c-12"><div><small>{t("Model")}</small><b>{catalogModel(v.model)?.name ?? MODEL_LABEL[v.model] ?? t("Plan default")}</b></div><div><small>{t("Credits left")}</small><b>{wallet.data?.balance ?? "…"}</b></div><div><small>{t("Reply length")}</small><b>{t(v.reply_length)}</b></div><div><small>{t("Agent")}</small><b>{t(v.enabled ? "On" : "Off")}</b></div></div>
      <PromptLibrary artistId={artistId} />
      <section className="dmr-panel dmr-c-12"><h2>{t("Your")} <span className="it">{t("rules and facts")}</span></h2><div className="agent-own-grid"><div><div className="dmr-qe-f"><Label>{t("Reply instructions")}</Label><Textarea rows={6} maxLength={1500} value={v.extra_instructions} onChange={e=>setV({...v,extra_instructions:e.target.value})} placeholder={t("e.g. I need a 30-min sound check. No performances after 1am.")} /></div><div className="dmr-qe-f mt-5"><Label>{t("AI knowledge")}</Label><Textarea rows={8} maxLength={8000} value={v.knowledge} onChange={e=>setV({...v,knowledge:e.target.value})} placeholder={t("Facts the assistant can use: FAQ, equipment, set list, travel, rider, cancellation terms.")} /><div className="text-end text-xs text-muted-foreground">{v.knowledge.length}/8000</div></div></div><aside className="agent-knowledge-preview"><h3>{t("Live preview")}</h3><p>{v.extra_instructions}</p><p>{v.knowledge}</p></aside></div><div className="agent-save"><span>{t(dirty ? "Unsaved changes" : "Everything is saved.")}</span><Button disabled={!dirty || saving || isPending || !!settingsError} onClick={save}>{t("Save settings")}</Button></div></section>
    </div>
  );
}

export { CreditsPage as Credits } from "./CreditsPage";
