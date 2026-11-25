import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BadgeCheck, CalendarCheck, CalendarDays, CircleDollarSign, FileText, Handshake, ListChecks, MessageCircle, MessageCircleQuestion, Mic2, Plus, RotateCcw, SendHorizontal, Tag, Trash2, Users, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DemoCursor, hiddenCursor, useDemoScript, type CursorState, type Director } from "./demo";
import { LightBox } from "./LightBox";
import { FLOW_KINDS, FLOW_PALETTE, FLOW_STEPS, cablePath, connect, starterCables, starterFlow, type Cable, type FlowBox, type FlowKind, type Point } from "./data";
import { ScrollIntro } from "./ScrollIntro";
import { StopAndWatch } from "./StopAndWatch";

type Layout = { width: number; height: number; box: { w: number; h: number; tall: number }; loop: number; slots: Record<string, Point> };
// The booking runs along the top two rows; the "Cancel" and "Later" paths drop below the buttons. Everything stays inside.
const WIDE: Layout = {
  width: 1400, height: 620, box: { w: 180, h: 88, tall: 140 }, loop: 16,
  slots: {
    start: { x: 20, y: 20 }, question: { x: 250, y: 20 }, date: { x: 480, y: 20 }, artist: { x: 710, y: 20 }, ratecard: { x: 940, y: 20 }, quote: { x: 1170, y: 20 },
    calendar: { x: 20, y: 182 }, buttons: { x: 260, y: 158 }, invoice: { x: 540, y: 150 }, notify: { x: 760, y: 150 }, schedule: { x: 980, y: 150 }, done: { x: 1200, y: 150 },
    why: { x: 540, y: 272 }, negotiation: { x: 880, y: 262 }, talents: { x: 880, y: 378 }, clients: { x: 880, y: 512 },
  },
};
const NARROW: Layout = {
  width: 360, height: 1032, box: { w: 156, h: 92, tall: 140 }, loop: 8,
  slots: {
    start: { x: 10, y: 12 }, question: { x: 194, y: 12 }, date: { x: 10, y: 128 }, artist: { x: 194, y: 128 }, ratecard: { x: 10, y: 244 }, quote: { x: 194, y: 244 },
    calendar: { x: 10, y: 384 }, buttons: { x: 194, y: 360 }, invoice: { x: 10, y: 524 }, notify: { x: 194, y: 524 }, schedule: { x: 10, y: 640 }, done: { x: 194, y: 640 },
    why: { x: 10, y: 764 }, negotiation: { x: 194, y: 764 }, talents: { x: 10, y: 928 }, clients: { x: 194, y: 928 },
  },
};
const ICONS: Record<FlowKind, LucideIcon> = { start: MessageCircle, question: MessageCircleQuestion, date: CalendarDays, artist: SendHorizontal, ratecard: Tag, quote: CircleDollarSign, calendar: CalendarCheck, buttons: ListChecks, invoice: FileText, negotiation: Handshake, clients: Users, talents: Mic2, done: BadgeCheck };
type Phase = "waiting" | "build" | "free";

/** Boxes with branches or buttons are taller. */
const heightOf = (layout: Layout, box: FlowBox) => (box.branches ? layout.box.tall : layout.box.h);
/** Where the branch outputs sit, as a share of the box height. Switch boxes also carry their question. */
const branchAt = (box: FlowBox, n: number) => (box.switches ? [0.59, 0.83] : [0.38, 0.61, 0.84])[n] ?? 0.5;
const port = (layout: Layout, box: FlowBox, at: Point, side: "in" | "out", branch = 0): Point => ({
  x: at.x + (side === "out" ? layout.box.w : 0),
  y: at.y + heightOf(layout, box) * (side === "out" && box.branches ? branchAt(box, branch) : 0.5),
});

export function WorkflowShowcase() {
  const { t } = useI18n();
  const [layout, setLayout] = useState(WIDE);
  const [scale, setScale] = useState(1);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [boxes, setBoxes] = useState<FlowBox[]>([]);
  const [places, setPlaces] = useState<Record<string, Point>>({});
  const [cables, setCables] = useState<Cable[]>([]);
  const [draft, setDraft] = useState<{ from: string; port: number; to: Point } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [off, setOff] = useState<string[]>([]); // switches the visitor turned off, as "box:output"
  const [cursor, setCursor] = useState<CursorState>(hiddenCursor);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const added = useRef(0);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => {
      const width = node.clientWidth;
      const next = width < 760 ? NARROW : WIDE;
      // On wide screens the board also has to fit the screen height, so the box keeps the same width as the inbox above.
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-height")) || 0;
      const room = window.innerHeight - header - 232; // palette, note and the line below
      setLayout(next);
      setScale(next === WIDE ? Math.min(width / next.width, Math.max(0.55, room / next.height)) : Math.min(1.3, width / next.width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const finished = (shape: Layout) => {
    setBoxes(starterFlow());
    setPlaces({ ...shape.slots });
    setCables(starterCables());
    setDraft(null); setOff([]); setCursor(hiddenCursor); setPhase("free");
  };
  const shape = useRef(layout);
  shape.current = layout;

  const { ref, replay, stop, reduced } = useDemoScript<HTMLDivElement>(async (d: Director) => {
    const view = shape.current;
    setBoxes([]); setPlaces({}); setCables([]); setDraft(null); setSelected(null); setOff([]); setCursor(hiddenCursor);
    setPhase("waiting");
    await d.wait(700);
    setPhase("build");
    // The pointer travels over both the palette and the board, so it is measured against their common wrapper.
    const space = () => {
      const outer = wrap.current!.getBoundingClientRect(); const inner = board.current!.getBoundingClientRect();
      const k = outer.width ? wrap.current!.offsetWidth / outer.width : 1;
      return { outer, k, x: (inner.left - outer.left) * k, y: (inner.top - outer.top) * k, s: inner.width * k / view.width };
    };
    const toWrap = (q: Point): Point => { const m = space(); return { x: m.x + q.x * m.s, y: m.y + q.y * m.s }; };
    const toBoard = (c: Point): Point => { const m = space(); return { x: (c.x - m.x) / m.s, y: (c.y - m.y) / m.s }; };
    const chipPoint = (kind: FlowKind): Point => {
      const chip = wrap.current!.querySelector<HTMLElement>(`[data-demo="chip-${kind}"]`)!;
      const row = chip.parentElement!;
      row.scrollTo({ left: chip.offsetLeft - row.offsetLeft - 24 }); // phones show the palette as one scrolling row
      const m = space(); const r = chip.getBoundingClientRect();
      return { x: (r.left - m.outer.left + r.width * 0.55) * m.k, y: (r.top - m.outer.top + r.height * 0.6) * m.k };
    };
    let hand: Point = { x: wrap.current!.offsetWidth / 2, y: wrap.current!.offsetHeight / 2 };
    const pointer = (down: boolean, ms = 40): CursorState => ({ x: hand.x, y: hand.y, shown: true, down, ms });
    const glide = async (to: Point, ms: number, down = false, each?: (p: Point) => void) => {
      const start = hand;
      await d.tween(ms, (k) => {
        hand = { x: start.x + (to.x - start.x) * k, y: start.y + (to.y - start.y) * k };
        setCursor(pointer(down));
        each?.(hand);
      });
    };
    const grip = { x: view.box.w * 0.5, y: view.box.h * 0.35 };
    const held = (p: Point): Point => { const q = toBoard(p); return { x: q.x - grip.x, y: q.y - grip.y }; };
    for (const step of FLOW_STEPS) {
      const { inputs, ...box } = step;
      const slot = view.slots[box.id]!;
      // Pick the box up from the palette and drag it into place.
      await glide(chipPoint(box.kind), 400);
      setCursor(pointer(true)); await d.wait(130);
      setPlaces((all) => ({ ...all, [box.id]: held(hand) }));
      setBoxes((all) => [...all, box]);
      setSelected(box.id);
      await glide(toWrap({ x: slot.x + grip.x, y: slot.y + grip.y }), 580, true, (p) => setPlaces((all) => ({ ...all, [box.id]: held(p) })));
      setPlaces((all) => ({ ...all, [box.id]: slot }));
      setCursor(pointer(false)); await d.wait(120);
      setSelected(null);
      // Then pull a cable from every step it hangs from.
      for (const [from, branch] of inputs) {
        const source = FLOW_STEPS.find((other) => other.id === from)!;
        await glide(toWrap(port(view, source, view.slots[from]!, "out", branch)), 280);
        setCursor(pointer(true)); await d.wait(90);
        await glide(toWrap(port(view, box, slot, "in")), 360, true, (p) => setDraft({ from, port: branch, to: toBoard(p) }));
        setDraft(null); setCables((all) => connect(all, from, box.id, branch)); setCursor(pointer(false)); await d.wait(110);
      }
    }
    await d.wait(500);
    setCursor(hiddenCursor); setPhase("free");
  }, 0.4, ready);
  useEffect(() => { if (reduced) finished(layout); }, [reduced, layout]);
  // A narrower or wider screen uses the other layout, so the finished board is placed again.
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (phase !== "waiting") { stop(); finished(layout); } }, [layout.width]);

  const at = (event: { clientX: number; clientY: number }): Point => {
    // Measured from the board as drawn, so any scaling of the panel is included.
    const box = board.current!.getBoundingClientRect();
    return { x: (event.clientX - box.left) * layout.width / box.width, y: (event.clientY - box.top) * layout.height / box.height };
  };
  const clamp = (p: Point, height = layout.box.tall): Point => ({ x: Math.min(layout.width - layout.box.w, Math.max(0, p.x)), y: Math.min(layout.height - height, Math.max(0, p.y)) });
  const takeControl = () => { if (phase !== "free") { stop(); finished(layout); return true; } return false; };

  const boxDown = (event: ReactPointerEvent, id: string) => {
    if (takeControl()) return;
    event.stopPropagation();
    const p = at(event); const place = places[id]!;
    drag.current = { id, dx: p.x - place.x, dy: p.y - place.y };
    setSelected(id);
    board.current?.setPointerCapture(event.pointerId);
  };
  const portDown = (event: ReactPointerEvent, id: string, branch: number) => {
    if (takeControl()) return;
    event.stopPropagation(); event.preventDefault();
    setDraft({ from: id, port: branch, to: at(event) });
    board.current?.setPointerCapture(event.pointerId);
  };
  const boardMove = (event: ReactPointerEvent) => {
    if (phase !== "free") return;
    const p = at(event);
    if (drag.current) {
      const { id, dx, dy } = drag.current;
      const box = boxes.find((b) => b.id === id);
      setPlaces((all) => ({ ...all, [id]: clamp({ x: p.x - dx, y: p.y - dy }, box ? heightOf(layout, box) : undefined) }));
    } else if (draft) setDraft({ ...draft, to: p });
  };
  const boardUp = (event: ReactPointerEvent) => {
    drag.current = null;
    if (!draft || phase !== "free") return;
    const p = at(event);
    // Dropping the cable anywhere on a box, or just beside it, connects it.
    const target = boxes.find((b) => { const q = places[b.id]!; return p.x >= q.x - 16 && p.x <= q.x + layout.box.w + 16 && p.y >= q.y - 16 && p.y <= q.y + heightOf(layout, b) + 16; });
    if (target) setCables((all) => connect(all, draft.from, target.id, draft.port));
    setDraft(null);
  };
  const add = (kind: FlowKind, point?: Point) => {
    takeControl();
    const n = ++added.current;
    const id = `${kind}-${n}`;
    const spot = point ? { x: point.x - layout.box.w / 2, y: point.y - layout.box.h / 2 } : { x: layout.width / 2 - layout.box.w / 2 + (n % 5) * 18, y: layout.height / 2 - layout.box.h / 2 + (n % 5) * 18 };
    setBoxes((all) => [...all, { id, kind, ...FLOW_KINDS[kind] }]);
    setPlaces((all) => ({ ...all, [id]: clamp(spot) }));
    setSelected(id);
  };
  const dropped = useRef(false);
  const paletteUp = (event: ReactPointerEvent, kind: FlowKind) => {
    const box = board.current?.getBoundingClientRect();
    if (!box || event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) return;
    dropped.current = true;
    add(kind, at(event));
  };
  const remove = (id: string) => { setBoxes((all) => all.filter((b) => b.id !== id)); setCables((all) => all.filter((c) => c.from !== id && c.to !== id)); setSelected(null); };
  const path = (a: Point, b: Point) => cablePath(a, b, layout.loop);

  return (
    <section className="sc sc-pinned sc-flow" aria-labelledby="sc-flow-title">
      <ScrollIntro id="sc-flow-title" effect="zoom" oneLine onReady={setReady} title={t("How It")} accent={t("Works")} text={t("Build the questions your AI agent asks.")} teaser={[t("How Agent Work"), t("With No Code")]}>
        <div ref={(node) => { ref.current = node; frame.current = node; }} className={`sc-flow-frame is-${phase}`} dir="ltr">
          <LightBox tone="gold" className="sc-panel sc-board-panel">
            <div ref={wrap} className="sc-board-wrap">
              <div className="sc-palette">
                <span>{t("Drag a box onto the board")}</span>
                <div>
                  {FLOW_PALETTE.map((kind) => {
                    const Icon = ICONS[kind];
                    return (
                      <button key={kind} type="button" data-demo={`chip-${kind}`} className="sc-chip" onPointerDown={(e) => { dropped.current = false; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={(e) => paletteUp(e, kind)} onClick={() => { if (!dropped.current) add(kind); dropped.current = false; }}>
                        <Plus aria-hidden="true" /><Icon aria-hidden="true" />{FLOW_KINDS[kind].title}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="sc-board-fit" style={{ height: layout.height * scale }}>
                <div ref={board} className="sc-board" style={{ width: layout.width, height: layout.height, transform: `translateX(-50%) scale(${scale})` }} onPointerDown={(e) => { if (phase === "free") setSelected(null); else if (e.pointerType !== "touch") takeControl(); /* a swipe past the board must not skip the animation */ }} onPointerMove={boardMove} onPointerUp={boardUp} onPointerCancel={() => { drag.current = null; setDraft(null); }}>
                  {boxes.length === 0 && <p className="sc-board-empty">Empty workflow. Drag your first step here.</p>}
                  <svg className="sc-cables" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
                    {cables.map((c) => {
                      const a = places[c.from]; const b = places[c.to];
                      const source = boxes.find((box) => box.id === c.from); const end = boxes.find((box) => box.id === c.to);
                      if (!a || !b || !source || !end) return null;
                      const d = path(port(layout, source, a, "out", c.port), port(layout, end, b, "in"));
                      return (
                        <g key={`${c.from}:${c.port}>${c.to}`} className={`sc-cable${off.includes(`${c.from}:${c.port}`) ? " is-off" : ""}`}>
                          <path d={d} />
                          <path d={d} className="sc-cable-flow" />
                          <path d={d} className="sc-cable-hit" onPointerDown={(e) => { if (takeControl()) return; e.stopPropagation(); setCables((all) => all.filter((x) => x !== c)); }}><title>Remove cable</title></path>
                        </g>
                      );
                    })}
                    {draft && boxes.some((b) => b.id === draft.from) && places[draft.from] && <path className="sc-cable-draft" d={path(port(layout, boxes.find((b) => b.id === draft.from)!, places[draft.from]!, "out", draft.port), draft.to)} />}
                  </svg>
                  {boxes.map((b) => {
                    const place = places[b.id];
                    if (!place) return null;
                    const Icon = ICONS[b.kind];
                    return (
                      <div key={b.id} className={`sc-node kind-${b.kind}${selected === b.id ? " is-selected" : ""}`} style={{ left: place.x, top: place.y, width: layout.box.w, height: heightOf(layout, b) }} onPointerDown={(e) => boxDown(e, b.id)}>
                        <span className="sc-node-head"><Icon aria-hidden="true" />{b.title}</span>
                        {(!b.branches || b.switches) && <p>{b.text}</p>}
                        {b.kind !== "start" && <span className="sc-port is-in" />}
                        {b.branches
                          ? b.branches.map((label, n) => (
                            <span key={label} className={`sc-branch${b.switches ? " is-switch" : ""}`} style={{ top: `${branchAt(b, n) * 100}%` }}>
                              {b.switches ? (() => {
                                // A switch is on once its output has a cable, until the visitor turns it off.
                                const key = `${b.id}:${n}`; const on = cables.some((c) => c.from === b.id && c.port === n) && !off.includes(key);
                                return (
                                  <button type="button" role="switch" aria-checked={on} className="sc-toggle" onPointerDown={(e) => e.stopPropagation()} onClick={() => { if (takeControl()) return; setOff((all) => (all.includes(key) ? all.filter((k) => k !== key) : [...all, key])); }}>
                                    <i aria-hidden="true" /><em>{label}</em>
                                  </button>
                                );
                              })() : <span>{label}</span>}
                              <span className="sc-port is-out" title={`Drag to connect: ${label}`} onPointerDown={(e) => portDown(e, b.id, n)} />
                            </span>
                          ))
                          : <span className="sc-port is-out" title="Drag to connect" onPointerDown={(e) => portDown(e, b.id, 0)} />}
                        {selected === b.id && phase === "free" && b.kind !== "start" && <button type="button" className="sc-node-remove" aria-label={`${t("Remove box")}: ${b.title}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => remove(b.id)}><Trash2 aria-hidden="true" /></button>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <DemoCursor cursor={cursor} />
            </div>
          </LightBox>
          <div className="sc-foot"><span>{t("Practice board: drag boxes, pull a cable from a gold dot, click a cable to remove it. Nothing is saved.")}</span><button type="button" className="sc-link" onClick={() => (reduced ? finished(layout) : replay())}><RotateCcw aria-hidden="true" />{t("Replay")}</button></div>
          <StopAndWatch active={ready} />
        </div>
      </ScrollIntro>
    </section>
  );
}
