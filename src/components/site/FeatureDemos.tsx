import { useState } from "react";
import { ArrowDown, ArrowUp, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = ["Client enquiry", "Check availability", "Send quote", "Artist approval", "Invoice"];
export function FlowDemo() {
  const [items, setItems] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const move = (index: number, delta: number) => setItems(current => {
    const next = [...current], item = next[index], other = next[index + delta];
    if (item === undefined || other === undefined) return current;
    next[index] = other; next[index + delta] = item; return next;
  });
  return <div className="feature-flow-demo"><div className="dnd-pal">{steps.map((step, i) => <Button key={step} variant="outline" draggable onDragStart={() => setDragged(i)} disabled={items.includes(i)} onClick={() => { setItems(current => [...current, i]); setRunning(false); }}>{step}</Button>)}</div>
    <div className="dnd-lane" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragged !== null && !items.includes(dragged)) setItems(current => [...current, dragged]); setDragged(null); setRunning(false); }}>
      {!items.length && <p className="dnd-hint">Drag steps here, or tap a step to add it</p>}
      {items.map((item, index) => <div className={`feature-demo-step ${running ? "run" : ""}`} key={item}><span>{index + 1}</span><b>{steps[item]}</b><Button variant="ghost" size="icon" aria-label={`Move ${steps[item]} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-3 w-3" /></Button><Button variant="ghost" size="icon" aria-label={`Move ${steps[item]} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-3 w-3" /></Button><Button variant="ghost" size="icon" aria-label={`Remove ${steps[item]}`} onClick={() => { setItems(current => current.filter(x => x !== item)); setRunning(false); }}><X className="h-3 w-3" /></Button></div>)}
    </div><div className="flex gap-3"><Button className="reference-gold" disabled={!items.length} onClick={() => setRunning(true)}><Play className="h-4 w-4" />Run flow</Button><Button variant="outline" onClick={() => { setItems([]); setRunning(false); }}><RotateCcw className="h-4 w-4" />Reset</Button></div>{running && <p className="feature-demo-result" role="status">{items.map(i => steps[i]).join(" → ")}</p>}
  </div>;
}
export function NoCodeDemo() {
  const [code, setCode] = useState(false);
  return <div><div className="nc-tog"><Button variant="ghost" aria-pressed={code} onClick={() => setCode(true)}>Code</Button><Button variant="ghost" aria-pressed={!code} onClick={() => setCode(false)}>Plain words</Button></div>{code ? <pre className="feature-code">{'if (calendar.isFree(request.date)) {\n  reply(rateCard.quote(request));\n} else {\n  reply("Sorry, I am booked.");\n}'}</pre> : <div className="feature-plain"><p><b>When</b> a client asks for a date I am free,</p><p><b>reply</b> with my starting price for the set length,</p><p><b>add</b> travel if the event is in another emirate,</p><p><b>otherwise</b> say kindly that I am booked.</p></div>}</div>;
}
