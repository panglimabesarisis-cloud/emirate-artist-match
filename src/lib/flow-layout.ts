type Point = { x: number; y: number };
type Item = { id: string; position: Point; width?: number; height?: number };
type Link = { source: string; target: string };

const WIDTH = 224, HEIGHT = 120, GAP_X = 48, GAP_Y = 70;

/** Top-to-bottom layout in rows, so cards never cover each other. Loops are kept but not followed. */
export function tidyLayout(items: Item[], links: Link[]): Map<string, Point> {
  const byId = new Map(items.map(item => [item.id, item]));
  const edges = links.filter(link => byId.has(link.source) && byId.has(link.target) && link.source !== link.target);
  const connected = new Set(edges.flatMap(link => [link.source, link.target]));

  // Depth-first order without the connections that close a loop.
  const forward: Link[] = [];
  const order: string[] = [];
  const state = new Map<string, "open" | "done">();
  const visit = (id: string) => {
    state.set(id, "open");
    for (const link of edges.filter(l => l.source === id)) {
      if (state.get(link.target) === "open") continue;
      forward.push(link);
      if (!state.has(link.target)) visit(link.target);
    }
    state.set(id, "done");
    order.unshift(id);
  };
  const byPosition = [...items].filter(item => connected.has(item.id)).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const roots = byPosition.filter(item => !edges.some(l => l.target === item.id));
  for (const item of [...roots, ...byPosition]) if (!state.has(item.id)) visit(item.id);

  const depth = new Map<string, number>(order.map(id => [id, 0]));
  for (const id of order) for (const link of forward.filter(l => l.source === id)) depth.set(link.target, Math.max(depth.get(link.target) ?? 0, (depth.get(id) ?? 0) + 1));

  const placed = new Map<string, Point>();
  const rows = Math.max(-1, ...depth.values());
  let y = 0;
  for (let row = 0; row <= rows; row++) {
    const members = order.filter(id => depth.get(id) === row).map(id => {
      const parents = forward.filter(l => l.target === id).map(l => placed.get(l.source)?.x).filter((x): x is number => x !== undefined);
      const want = parents.length ? parents.reduce((sum, x) => sum + x, 0) / parents.length : 0;
      return { id, want, was: byId.get(id)!.position.x };
    }).sort((a, b) => a.want - b.want || a.was - b.was);
    // Keep each card near its parents, push neighbours apart, then centre the row on that wish.
    const xs: number[] = [];
    for (const member of members) xs.push(Math.max(member.want, xs.length ? xs[xs.length - 1]! + WIDTH + GAP_X : -Infinity));
    const shift = members.length ? members.reduce((sum, m, i) => sum + m.want - xs[i]!, 0) / members.length : 0;
    members.forEach((member, i) => placed.set(member.id, { x: Math.round(xs[i]! + shift), y }));
    y += Math.max(0, ...members.map(m => byId.get(m.id)!.height ?? HEIGHT)) + GAP_Y;
  }

  // Cards with no connection (such as knowledge) stack in their own column on the left.
  const left = Math.min(0, ...[...placed.values()].map(p => p.x)) - WIDTH - GAP_X * 2;
  let looseY = 0;
  for (const item of items.filter(i => !connected.has(i.id))) {
    placed.set(item.id, { x: left, y: looseY });
    looseY += (item.height ?? HEIGHT) + GAP_X;
  }
  return placed;
}
