/**
 * Graph drawing maths for GraphView: layered (Sugiyama-style) and circular layouts, edge
 * routing (straight, curved parallel pairs, self-loops, layered S-curves) and the spatial
 * arrow-key navigation between nodes. Pure, so it's tested without a DOM.
 */

export type GraphKey = string | number;

export interface Pt {
  x: number;
  y: number;
}

export interface LayoutEdge<K extends GraphKey> {
  from: K;
  to: K;
}

export interface Layering<K extends GraphKey> {
  /** Nodes per layer, in drawing order. */
  layers: K[][];
  layerOf: Map<K, number>;
}

/**
 * Longest-path layering plus barycentre ordering.
 *
 * - A node's layer is one more than its deepest predecessor's, so every edge of a DAG
 *   points to a later layer. In a cycle, the edges that close it (found depth-first in
 *   input order) are ignored for layering, so the result is still well defined.
 * - Within a layer nodes start in input order. Barycentre sweeps (down, then up) then sort
 *   each layer by the mean position of its neighbours in the adjacent layer, but a sweep
 *   is kept only if it strictly reduces crossings between adjacent layers. A drawing with
 *   no crossings keeps the caller's order exactly, and equal inputs give equal outputs.
 */
export function layeredLayout<K extends GraphKey>(ids: readonly K[], edges: readonly LayoutEdge<K>[], sweeps = 4): Layering<K> {
  const known = new Set(ids);
  const live = edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to);
  const forward = acyclicEdges(ids, live);
  const preds = new Map<K, K[]>(ids.map((id) => [id, []]));
  forward.forEach((e) => preds.get(e.to)!.push(e.from));

  const layerOf = new Map<K, number>();
  const depth = (id: K): number => {
    const cached = layerOf.get(id);
    if (cached !== undefined) return cached;
    const d = Math.max(-1, ...preds.get(id)!.map(depth)) + 1;
    layerOf.set(id, d);
    return d;
  };
  ids.forEach(depth);

  const count = Math.max(0, ...layerOf.values()) + (ids.length ? 1 : 0);
  let layers: K[][] = Array.from({ length: count }, () => []);
  ids.forEach((id) => layers[layerOf.get(id)!].push(id));

  // Only edges between adjacent layers take part in ordering (no dummy nodes for long ones).
  const adjacent = live.filter((e) => Math.abs(layerOf.get(e.from)! - layerOf.get(e.to)!) === 1);
  let best = crossings(layers, adjacent, layerOf);
  for (let s = 0; s < sweeps && best > 0; s++) {
    const down = s % 2 === 0;
    const next = sweep(layers, adjacent, down);
    const c = crossings(next, adjacent, layerOf);
    if (c < best) {
      layers = next;
      best = c;
    }
  }
  return { layers, layerOf };
}

/** The edges left after dropping the ones that close a cycle (DFS in input order). */
function acyclicEdges<K extends GraphKey>(ids: readonly K[], edges: readonly LayoutEdge<K>[]): LayoutEdge<K>[] {
  const out = new Map<K, LayoutEdge<K>[]>(ids.map((id) => [id, []]));
  edges.forEach((e) => out.get(e.from)!.push(e));
  const state = new Map<K, 1 | 2>(); // 1 = on the stack, 2 = done
  const keep: LayoutEdge<K>[] = [];
  const visit = (id: K) => {
    state.set(id, 1);
    for (const e of out.get(id)!) {
      if (state.get(e.to) === 1) continue; // back edge: closes a cycle
      keep.push(e);
      if (!state.has(e.to)) visit(e.to);
    }
    state.set(id, 2);
  };
  ids.forEach((id) => state.has(id) || visit(id));
  return keep;
}

function sweep<K extends GraphKey>(layers: K[][], edges: readonly LayoutEdge<K>[], down: boolean): K[][] {
  const next = layers.map((l) => [...l]);
  const order = (from: number, to: number, step: number) => {
    for (let li = from; li !== to; li += step) {
      const ref = next[li - step];
      const pos = new Map(ref.map((id, i) => [id, i]));
      const bary = new Map<K, number>();
      next[li].forEach((id, i) => {
        const ns = edges.flatMap((e) => (e.to === id && pos.has(e.from) ? [pos.get(e.from)!] : e.from === id && pos.has(e.to) ? [pos.get(e.to)!] : []));
        bary.set(id, ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : i);
      });
      // Stable: ties keep the current order.
      next[li] = next[li].map((id, i) => ({ id, i })).sort((a, b) => bary.get(a.id)! - bary.get(b.id)! || a.i - b.i).map((x) => x.id);
    }
  };
  if (down) order(1, next.length, 1);
  else order(next.length - 2, -1, -1);
  return next;
}

/** Pairs of adjacent-layer edges that cross. */
export function crossings<K extends GraphKey>(layers: K[][], edges: readonly LayoutEdge<K>[], layerOf: Map<K, number>): number {
  const pos = new Map<K, number>();
  layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  const spans = edges.map((e) => {
    const [a, b]: [K, K] = layerOf.get(e.from)! < layerOf.get(e.to)! ? [e.from, e.to] : [e.to, e.from];
    return { layer: layerOf.get(a)!, p: pos.get(a)!, q: pos.get(b)! };
  });
  let n = 0;
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const s = spans[i];
      const t = spans[j];
      if (s.layer === t.layer && (s.p - t.p) * (s.q - t.q) < 0) n++;
    }
  }
  return n;
}

export interface LayeredSpacing {
  /** 'right': layers are columns, left to right; 'down': layers are rows, top to bottom. */
  direction?: 'right' | 'down';
  /** Distance between neighbouring layers. */
  layerGap: number;
  /** Distance between neighbouring nodes in one layer. */
  nodeGap: number;
  /** Padding before the first layer, and on both sides of the tallest layer. */
  padMain: number;
  padCross: number;
}

/**
 * Positions for a layering: layer k at padMain + k × layerGap; a layer's nodes centred on
 * the cross axis, nodeGap apart. The size is the smallest box that holds them.
 */
export function layeredPositions<K extends GraphKey>(l: Layering<K>, s: LayeredSpacing): { at: Map<K, Pt>; width: number; height: number } {
  const tallest = Math.max(1, ...l.layers.map((layer) => layer.length));
  const main = s.padMain * 2 + s.layerGap * Math.max(0, l.layers.length - 1);
  const cross = s.padCross * 2 + s.nodeGap * (tallest - 1);
  const at = new Map<K, Pt>();
  l.layers.forEach((layer, k) =>
    layer.forEach((id, i) => {
      const m = s.padMain + k * s.layerGap;
      const c = cross / 2 + (i - (layer.length - 1) / 2) * s.nodeGap;
      at.set(id, s.direction === 'down' ? { x: c, y: m } : { x: m, y: c });
    }),
  );
  return s.direction === 'down' ? { at, width: cross, height: main } : { at, width: main, height: cross };
}

/** Nodes evenly round a circle, the first at the top, clockwise. */
export function circlePositions<K extends GraphKey>(ids: readonly K[], width: number, height: number, pad: number): Map<K, Pt> {
  const r = Math.max(0, Math.min(width, height) / 2 - pad);
  return new Map(
    ids.map((id, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, ids.length);
      return [id, { x: width / 2 + r * Math.cos(a), y: height / 2 + r * Math.sin(a) }];
    }),
  );
}

/* ---------- edge routing ---------- */

export interface NodeBox {
  /** 'circle' uses r; 'box' uses w × h. */
  shape: 'circle' | 'box';
  r: number;
  w: number;
  h: number;
}

export type EdgeRoute =
  /** A straight line (start at the centre: the node is drawn over it). */
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; label: Pt }
  /** Any curve: a bent parallel edge, a self-loop, a layered S-curve. */
  | { kind: 'path'; d: string; label: Pt };

/** How far a node's outline is from its centre in direction (ux, uy). */
export function outlineDistance(n: NodeBox, ux: number, uy: number): number {
  if (n.shape === 'circle') return n.r;
  const tx = Math.abs(ux) > 1e-9 ? n.w / 2 / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-9 ? n.h / 2 / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

/** Sideways offset of each edge of an a→b / b→a pair, so both stay visible. */
export const PARALLEL_BEND = 22;
const LABEL_LIFT = 6;

/**
 * The route of one edge.
 * - `curve`: a layered S-curve from the side of `a` facing the next layer to the side of
 *   `b` facing back (`direction` as in layeredPositions), ending `arrowGap` short.
 * - otherwise a straight line from a's centre, trimmed at b's outline when `directed`;
 *   bent sideways when `parallel` (the reverse edge exists too); a loop when a is b.
 */
export function routeEdge(
  a: Pt, b: Pt, nodeA: NodeBox, nodeB: NodeBox,
  o: { directed: boolean; arrowGap: number; parallel?: boolean; curve?: 'right' | 'down' },
): EdgeRoute {
  if (a === b || (a.x === b.x && a.y === b.y)) return selfLoop(a, nodeA);
  if (o.curve === 'right') {
    const x1 = a.x + nodeA.w / 2;
    const x2 = b.x - nodeB.w / 2 - o.arrowGap;
    const mid = (x1 + x2) / 2;
    return { kind: 'path', d: `M ${x1} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${x2} ${b.y}`, label: { x: mid, y: (a.y + b.y) / 2 - LABEL_LIFT } };
  }
  if (o.curve === 'down') {
    const y1 = a.y + nodeA.h / 2;
    const y2 = b.y - nodeB.h / 2 - o.arrowGap;
    const mid = (y1 + y2) / 2;
    return { kind: 'path', d: `M ${a.x} ${y1} C ${a.x} ${mid}, ${b.x} ${mid}, ${b.x} ${y2}`, label: { x: (a.x + b.x) / 2 + LABEL_LIFT, y: mid } };
  }
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len];
  if (!o.parallel) {
    const trim = o.directed ? outlineDistance(nodeB, ux, uy) + o.arrowGap : 0;
    return {
      kind: 'line', x1: a.x, y1: a.y, x2: b.x - ux * trim, y2: b.y - uy * trim,
      label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - LABEL_LIFT },
    };
  }
  // Bend to the right of the direction of travel, so a→b and b→a sit on opposite sides.
  const [nx, ny] = [-uy, ux];
  const c = { x: (a.x + b.x) / 2 + nx * PARALLEL_BEND * 2, y: (a.y + b.y) / 2 + ny * PARALLEL_BEND * 2 };
  const toward = (p: Pt, q: Pt, d: number) => {
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: p.x + ((q.x - p.x) / l) * d, y: p.y + ((q.y - p.y) / l) * d };
  };
  const dirB = { x: (c.x - b.x), y: (c.y - b.y) };
  const lb = Math.hypot(dirB.x, dirB.y) || 1;
  const dirA = { x: (c.x - a.x), y: (c.y - a.y) };
  const la = Math.hypot(dirA.x, dirA.y) || 1;
  const start = toward(a, c, outlineDistance(nodeA, dirA.x / la, dirA.y / la));
  const end = toward(b, c, outlineDistance(nodeB, dirB.x / lb, dirB.y / lb) + (o.directed ? o.arrowGap : 0));
  const f = (v: number) => Number(v.toFixed(2));
  return {
    kind: 'path',
    d: `M ${f(start.x)} ${f(start.y)} Q ${f(c.x)} ${f(c.y)} ${f(end.x)} ${f(end.y)}`,
    // The curve's midpoint is halfway between the chord's midpoint and the control point.
    label: { x: (a.x + b.x) / 4 + c.x / 2 + nx * LABEL_LIFT, y: (a.y + b.y) / 4 + c.y / 2 + ny * LABEL_LIFT },
  };
}

function selfLoop(p: Pt, n: NodeBox): EdgeRoute {
  const top = n.shape === 'circle' ? n.r : n.h / 2;
  const half = n.shape === 'circle' ? n.r * 0.6 : Math.min(n.w / 4, 14);
  const lift = Math.max(top, 16) * 1.9;
  const f = (v: number) => Number(v.toFixed(2));
  const sx = p.x - half;
  const ex = p.x + half;
  const y0 = p.y - top * (n.shape === 'circle' ? 0.8 : 1);
  return {
    kind: 'path',
    d: `M ${f(sx)} ${f(y0)} C ${f(sx - half)} ${f(y0 - lift)}, ${f(ex + half)} ${f(y0 - lift)}, ${f(ex)} ${f(y0 - 2)}`,
    label: { x: p.x, y: y0 - lift * 0.75 - 4 },
  };
}

/* ---------- keyboard ---------- */

export interface NavItem {
  key: string;
  x: number;
  y: number;
}

/**
 * Arrow-key navigation over a drawing: the nearest item roughly in the arrow's direction
 * (within 60° of it), preferring items straight ahead over ones off to the side. Home and
 * End go to the first and last item. Null when nothing lies that way.
 */
export function spatialNext(items: readonly NavItem[], from: string, key: string): string | null {
  if (!items.length) return null;
  if (key === 'Home') return items[0].key;
  if (key === 'End') return items[items.length - 1].key;
  const dir: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  const d = dir[key];
  const here = items.find((i) => i.key === from);
  if (!d || !here) return null;
  let best: { key: string; score: number } | null = null;
  for (const it of items) {
    if (it.key === from) continue;
    const dx = it.x - here.x;
    const dy = it.y - here.y;
    const ahead = dx * d[0] + dy * d[1];
    const side = Math.abs(dx * d[1] - dy * d[0]);
    if (ahead <= 0 || side > ahead * Math.tan(Math.PI / 3)) continue;
    const score = ahead + side * 2;
    if (!best || score < best.score) best = { key: it.key, score };
  }
  return best?.key ?? null;
}
