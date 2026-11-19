import { useState } from "react";
import { Bot, RotateCcw, ArrowRight } from "lucide-react";
import type { FlowNode, FlowEdge } from "@/lib/ai-flow";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { ChatFlowButtons, ChatFlowForm } from "./ChatFlowControls";

export function FlowChatPreview({ nodes, edges, selectedId }: { nodes: FlowNode[]; edges: FlowEdge[]; selectedId: string | null }) {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const node = nodes.find((item) => item.id === (activeId ?? selectedId)) ?? nodes.find((item) => item.type === "start") ?? nodes[0];
  const advance = (answer: string, handle?: string) => {
    if (!node) return;
    setAnswers((current) => [...current, answer]);
    const next = edges.find((edge) => edge.source === node.id && edge.sourceHandle === handle) ?? edges.find((edge) => edge.source === node.id && !edge.sourceHandle);
    if (next) setActiveId(next.target);
  };
  return <section aria-label="Chat preview" className="flex min-h-[460px] flex-col">
    <div className="mb-4 flex items-center justify-between border-b pb-3"><h3 className="text-sm font-semibold">{t("Test bot")}</h3><Button size="icon" variant="ghost" aria-label="Restart preview" title={t("Restart preview")} onClick={() => { setActiveId(null); setAnswers([]); }}><RotateCcw className="size-4" /></Button></div>
    <div className="flex-1 space-y-3">
      {answers.map((answer, i) => <div key={i} className="ms-auto max-w-[90%] whitespace-pre-wrap break-words rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">{answer}</div>)}
      {node && <div key={node.id} className="flex min-w-0 gap-2">
        <div className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-primary"><Bot className="size-3.5" /></div>
        <div className="min-w-0 flex-1"><div className="whitespace-pre-wrap break-words rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed">{node.data.text}</div>
          {node.type === "ratecard" && <div className="mt-2 space-y-2 rounded-md border p-3 text-xs"><div>{node.data.rateDescription || "Artist fills invoice items"}</div><div>AED {node.data.ratePrice ?? 0}</div><Button size="sm" variant="outline" onClick={()=>advance("Artist invoice submitted")}>Preview artist approval</Button></div>}
          {node.type === "payment" && <div className="mt-2 rounded-md border p-3 text-xs">DP 20% · Stripe sandbox<br/>Calendar reserved after verified payment<br/>Balance reminder H-7</div>}
          {node.type === "buttons" && <ChatFlowButtons buttons={node.data.buttons ?? []} onSelect={(answer) => advance(answer, `b${node.data.buttons?.indexOf(answer)}`)} />}
          {node.type === "form" && <ChatFlowForm fields={node.data.fields ?? []} onSubmit={(answer) => advance(answer)} />}
          {["calendar", "condition"].includes(node.type) ? <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => advance(node.type === "calendar" ? "Available" : "Yes", "yes")}>{t(node.type === "calendar" ? "Available" : "Yes")}</Button><Button size="sm" variant="outline" onClick={() => advance(node.type === "calendar" ? "Busy" : "No", "no")}>{t(node.type === "calendar" ? "Busy" : "No")}</Button></div> : !["buttons", "form"].includes(node.type) && edges.some(edge => edge.source === node.id) && <Button size="sm" variant="outline" className="mt-2" onClick={() => advance("Continue")}><ArrowRight className="size-4" />{t("Continue")}</Button>}
          {node.data.urlButtons?.map((link, i) => /^https?:\/\//.test(link.url) && <Button key={i} asChild variant="outline" className="mt-2 h-auto w-full whitespace-normal text-primary"><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></Button>)}
        </div>
      </div>}
    </div>
  </section>;
}