import { decodeInvoice } from "@/lib/invoice";
import { InvoiceCard } from "@/components/site/InvoiceCard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { artistReply, testAgent, topUpCredits, subscribePlanDemo } from "@/lib/chat.functions";
import { TOPUP_PACKAGES } from "@/lib/masking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export function Inbox({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const reply$ = useServerFn(artistReply);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const { data: convos } = useQuery({
    queryKey: ["inbox", artistId],
    queryFn: async () => (await supabase.from("conversations").select("id, mode, ai_replies, last_message_at, quote_requests(name, event_date)").eq("artist_id", artistId).not("quote_request_id", "is", null).order("last_message_at", { ascending: false })).data ?? [],
    refetchInterval: 10000,
  });
  const { data: msgs } = useQuery({
    queryKey: ["inbox-msgs", open],
    enabled: !!open,
    queryFn: async () => (await supabase.from("messages").select("id, sender, body, created_at").eq("conversation_id", open!).order("created_at")).data ?? [],
    refetchInterval: 5000,
  });
  const current = convos?.find((c) => c.id === open);
  const setMode = async (mode: string) => {
    await supabase.from("conversations").update({ mode }).eq("id", open!);
    qc.invalidateQueries({ queryKey: ["inbox", artistId] });
  };
  const send = async () => {
    if (!text.trim() || !open) return;
    try {
      await reply$({ data: { id: open, text } });
      setText("");
      if (current?.mode === "ai") await setMode("human");
      qc.invalidateQueries({ queryKey: ["inbox-msgs", open] });
    } catch { toast.error("Reply failed"); }
  };
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-[300px_1fr]">
      <div className="space-y-2">
        {convos?.length === 0 && <p className="text-sm text-muted-foreground">No conversations yet. They start when a client requests a quote.</p>}
        {convos?.map((c) => (
          <button key={c.id} onClick={() => setOpen(c.id)} className={`w-full text-left rounded-xl p-3 border ${open === c.id ? "border-gold bg-accent" : "bg-card"}`}>
            <div className="flex justify-between items-center">
              <span className="font-semibold">{c.quote_requests?.name ?? "Client"}</span>
              <Badge variant={c.mode === "human" ? "default" : "secondary"}>{c.mode === "human" ? "Needs you" : "AI"}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">{c.quote_requests?.event_date ?? "date TBC"} · {c.ai_replies} AI replies</div>
          </button>
        ))}
      </div>
      {open ? (
        <div className="rounded-2xl bg-card shadow-card flex flex-col">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-sm">{current?.mode === "human" ? "You're handling this chat" : "AI is handling this chat"}</span>
            <Button size="sm" variant="outline" onClick={() => setMode(current?.mode === "human" ? "ai" : "human")}>
              {current?.mode === "human" ? "Hand back to AI" : "Take over"}
            </Button>
          </div>
          <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto flex-1">
            {msgs?.map((m) => m.sender === "system" ? (
              <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div>
            ) : (
              <div key={m.id} className={`flex ${m.sender === "client" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.sender === "client" ? "bg-muted" : m.sender === "ai" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`} dir="auto">
                  <div className="text-[10px] uppercase opacity-70">{m.sender === "ai" ? "AI assistant" : m.sender === "artist" ? "You" : "Client"}</div>
                  {decodeInvoice(m.body) ? <InvoiceCard inv={decodeInvoice(m.body)!} /> : m.body}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply personally…" maxLength={2000} onKeyDown={(e) => e.key === "Enter" && send()} />
            <Button onClick={send}>Send</Button>
          </div>
        </div>
      ) : <div className="rounded-2xl border border-dashed grid place-items-center text-muted-foreground text-sm p-10">Select a conversation</div>}
    </div>
  );
}

export function AgentSettings({ artistId }: { artistId: string }) {
  const test$ = useServerFn(testAgent);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["agent", artistId], queryFn: async () => (await supabase.from("agent_settings").select("*").eq("artist_id", artistId).maybeSingle()).data });
  const [v, setV] = useState({ enabled: true, tone: "warm and professional", max_discount_pct: 10, extra_instructions: "", knowledge: "" });
  useEffect(() => { if (data) setV({ enabled: data.enabled, tone: data.tone, max_discount_pct: data.max_discount_pct, extra_instructions: data.extra_instructions ?? "", knowledge: data.knowledge ?? "" }); }, [data]);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ id: string; sender: string; body: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const { error } = await supabase.from("agent_settings").upsert({ artist_id: artistId, ...v, extra_instructions: v.extra_instructions || null, knowledge: v.knowledge || null, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success("AI agent settings saved");
  };
  const test = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    try { const r = await test$({ data: { text: msg } }); setChat(r.messages); setMsg(""); qc.invalidateQueries({ queryKey: ["wallet", artistId] }); }
    catch { toast.error("Test failed"); } finally { setBusy(false); }
  };
  return (
    <div className="mt-6 grid gap-8 md:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-card">
          <div><div className="font-semibold">AI replies on</div><div className="text-xs text-muted-foreground">When off, every new chat waits for you.</div></div>
          <Switch checked={v.enabled} onCheckedChange={(c) => setV({ ...v, enabled: c })} />
        </div>
        <div><Label>Tone of voice</Label><Input value={v.tone} maxLength={80} onChange={(e) => setV({ ...v, tone: e.target.value })} /></div>
        <div><Label>Maximum discount the AI may offer (%)</Label><Input type="number" min={0} max={30} value={v.max_discount_pct} onChange={(e) => setV({ ...v, max_discount_pct: Math.min(30, Math.max(0, Number(e.target.value))) })} /></div>
        <div><Label>Reply instructions</Label><p className="text-xs text-muted-foreground">How the assistant should reply: rules, style, what to ask.</p><Textarea rows={4} maxLength={1500} value={v.extra_instructions} onChange={(e) => setV({ ...v, extra_instructions: e.target.value })} placeholder="e.g. I need a 30-min sound check. No performances after 1am." /></div>
        <div><Label>AI knowledge</Label><p className="text-xs text-muted-foreground">Facts the assistant can use: FAQ, equipment, set list, travel, rider, cancellation terms.</p><Textarea rows={8} maxLength={8000} value={v.knowledge} onChange={(e) => setV({ ...v, knowledge: e.target.value })} placeholder={"Q: Do you bring your own sound system?\nA: Yes, for up to 200 guests.\n\nSet list: Arabic pop, Khaleeji, international hits…"} /><div className="text-end text-[11px] text-muted-foreground">{v.knowledge.length}/8000</div></div>
        <Button onClick={save}>Save settings</Button>
        <p className="text-xs text-muted-foreground">The AI only quotes your package prices and never confirms a booking on its own.</p>
      </div>
      <div className="rounded-2xl bg-card shadow-card p-4 flex flex-col">
        <div className="font-semibold inline-flex items-center gap-2"><Bot className="h-4 w-4 text-gold" /> Test your assistant</div>
        <p className="text-xs text-muted-foreground">Each reply uses 1 credit, like a real chat.</p>
        <div className="mt-3 space-y-2 flex-1 max-h-80 overflow-y-auto">
          {chat.map((m) => m.sender === "system" ? <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div> : (
            <div key={m.id} className={`flex ${m.sender === "client" ? "justify-end" : ""}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.sender === "client" ? "bg-primary text-primary-foreground" : "bg-muted"}`} dir="auto">{m.body}</div>
            </div>
          ))}
          {busy && <div className="text-xs text-muted-foreground">Thinking…</div>}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Pretend to be a client…" onKeyDown={(e) => e.key === "Enter" && test()} />
          <Button onClick={test} disabled={busy}>Send</Button>
        </div>
      </div>
    </div>
  );
}

export function Credits({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const top$ = useServerFn(topUpCredits);
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
    try { const r = await top$({ data: { packageId: id } }); toast.success(`${r.credits} credits added (demo payment)`); qc.invalidateQueries({ queryKey: ["wallet", artistId] }); }
    catch { toast.error("Top-up failed"); } finally { setBusy(null); }
  };
  const labels: Record<string, string> = { plan_allocation: "Plan credits", ai_reply: "AI reply", topup_demo: "Top-up (demo)" };
  return (
    <div className="mt-6 space-y-8">
      <DemoPlans artistId={artistId} />
      <div className="rounded-2xl bg-night text-night-foreground p-6 flex items-center justify-between">
        <div>
          <div className="text-sm opacity-75">AI credit balance</div>
          <div className="font-display text-5xl font-semibold mt-1">{data?.balance ?? "—"}</div>
          <div className="text-xs opacity-70 mt-1">1 credit = 1 AI reply. Clients never pay for AI.</div>
        </div>
        <Coins className="h-12 w-12 text-gold" />
      </div>
      {data && data.balance < 20 && <div className="rounded-xl bg-accent text-accent-foreground p-3 text-sm">Your credits are running low. When they run out, new chats wait for your personal reply.</div>}
      <div className="grid gap-4 md:grid-cols-3">
        {TOPUP_PACKAGES.map((p) => (
          <div key={p.id} className="rounded-2xl border bg-card p-5">
            <div className="font-display text-3xl">{p.credits}</div>
            <div className="text-sm text-muted-foreground">credits</div>
            <div className="mt-3 font-semibold">AED {p.priceAed}</div>
            <Button className="mt-4 w-full bg-gradient-gold text-gold-foreground" disabled={busy === p.id} onClick={() => buy(p.id)}>{busy === p.id ? "Processing…" : "Buy (demo)"}</Button>
          </div>
        ))}
      </div>
      <div>
        <h3 className="font-semibold text-lg">History</h3>
        <div className="mt-2 divide-y rounded-xl bg-card shadow-card">
          {data?.ledger.map((l) => (
            <div key={l.id} className="flex justify-between p-3 text-sm">
              <span>{labels[l.reason] ?? l.reason} <span className="text-muted-foreground">· {new Date(l.created_at).toLocaleString("en-GB")}</span></span>
              <span className={l.delta < 0 ? "text-destructive" : "text-success font-semibold"}>{l.delta > 0 ? "+" : ""}{l.delta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoPlans({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const sub$ = useServerFn(subscribePlanDemo);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["demo-plans", artistId],
    queryFn: async () => {
      const [t, a] = await Promise.all([
        supabase.from("plan_tiers").select("*").order("sort"),
        supabase.from("artists").select("plan").eq("id", artistId).maybeSingle(),
      ]);
      return { tiers: t.data ?? [], plan: a.data?.plan as string | undefined };
    },
  });
  const pick = async (code: string) => {
    setBusy(code);
    try { const r = await sub$({ data: { code, cycle } }); toast.success(`Now on ${r.name} (demo payment)`); qc.invalidateQueries(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  };
  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Your plan</h2><p className="text-xs text-muted-foreground">DEMO MODE · no real money is charged.</p></div>
        <div className="flex gap-1 rounded-full bg-muted p-1 text-sm">
          {(["monthly", "yearly"] as const).map((c) => <button key={c} onClick={() => setCycle(c)} className={`rounded-full px-3 py-1 ${cycle === c ? "bg-background shadow-sm" : ""}`}>{c === "monthly" ? "Monthly" : "Yearly"}</button>)}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {data?.tiers.map((t) => {
          const current = data.plan === t.code;
          const price = cycle === "yearly" ? t.price_yearly : t.price_monthly;
          return (
            <div key={t.code} className={`rounded-xl border p-4 ${current ? "border-primary" : ""}`}>
              <div className="font-medium">{t.name}</div>
              <div className="mt-1 text-2xl font-semibold">AED {Number(price).toLocaleString("en-US")}<span className="text-xs font-normal text-muted-foreground">/{cycle === "yearly" ? "yr" : "mo"}</span></div>
              <div className="mt-1 text-xs text-muted-foreground">{t.ai_credits} AI credits · {t.commission_pct}% fee</div>
              <Button size="sm" className="mt-3 w-full" variant={current ? "outline" : "default"} disabled={current || busy !== null} onClick={() => pick(t.code)}>
                {current ? "Current plan" : busy === t.code ? "Processing…" : `Pay (demo) & switch`}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
