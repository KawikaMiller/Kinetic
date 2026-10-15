import type { Pt } from '../../components/GraphView';
import type { Result } from '../../core/result';
import { adjacency, reverseEdges, type Arc } from '../../core/scc';

export const MAX_NODES = 9;

export interface Digraph {
  names: string[];
  at: Pt[];
  /** Unique directed edges; a self-loop is allowed. */
  edges: Arc[];
}

const at = (xs: [number, number][]): Pt[] => xs.map(([x, y]) => ({ x, y }));
const letters = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));

export type PresetId = 'tangle' | 'deadlock' | 'loop' | 'dag';

export interface Preset {
  id: PresetId;
  label: string;
  graph: Digraph;
}

const ring = (n: number, cx: number, cy: number, r: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [Math.round(cx + r * Math.sin((2 * Math.PI * i) / n)), Math.round(cy - r * Math.cos((2 * Math.PI * i) / n))]);

export const PRESETS: readonly Preset[] = [
  {
    id: 'tangle',
    label: 'Dependency tangle',
    graph: {
      names: letters(8),
      at: at([[60, 70], [170, 40], [110, 160], [250, 110], [350, 50], [360, 170], [450, 110], [500, 200]]),
      edges: [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3], [5, 6], [6, 7]],
    },
  },
  {
    id: 'deadlock',
    label: 'Deadlock',
    graph: {
      names: ['T1', 'T2', 'T3', 'T4'],
      at: at([[110, 60], [310, 60], [210, 190], [430, 190]]),
      edges: [[0, 1], [1, 2], [2, 0], [3, 1]],
    },
  },
  { id: 'loop', label: 'One big loop', graph: { names: letters(6), at: at(ring(6, 250, 120, 100)), edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] } },
  {
    id: 'dag',
    label: 'A DAG',
    graph: {
      names: letters(6),
      at: at([[60, 120], [180, 50], [180, 190], [310, 50], [310, 190], [440, 120]]),
      edges: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [1, 4]],
    },
  },
];

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

// ---- editing (hostile input is defined here) ---------------------------------------------

const has = (g: Digraph, from: number, to: number) => g.edges.some(([a, b]) => a === from && b === to);

export function addEdge(g: Digraph, from: number, to: number): Result<Digraph> {
  if (has(g, from, to)) return { ok: false, error: `${g.names[from]}→${g.names[to]} already exists: a second copy changes nothing.` };
  return { ok: true, value: { ...g, edges: [...g.edges, [from, to]] } };
}

const SPOTS: Pt[] = [{ x: 60, y: 200 }, { x: 250, y: 220 }, { x: 440, y: 40 }, { x: 540, y: 120 }, { x: 40, y: 110 }, { x: 250, y: 30 }, { x: 400, y: 230 }, { x: 540, y: 220 }, { x: 150, y: 130 }];
const SPOT_CLEARANCE = 60;
const EXTRA_NAMES = ['p', 'q', 'r', 'u', 'v', 'w', 'x', 'y', 'z'];

export function addNode(g: Digraph): Result<Digraph> {
  if (g.names.length >= MAX_NODES) return { ok: false, error: `At most ${MAX_NODES} nodes, so the hulls stay readable.` };
  const spot = SPOTS.find((p) => g.at.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= SPOT_CLEARANCE));
  if (!spot) return { ok: false, error: 'No free spot left for a node.' };
  const name = EXTRA_NAMES.find((n) => !g.names.includes(n))!;
  return { ok: true, value: { ...g, names: [...g.names, name], at: [...g.at, spot] } };
}

export const removeLastEdge = (g: Digraph, keep: number): Digraph => (g.edges.length > keep ? { ...g, edges: g.edges.slice(0, -1) } : g);

// ---- Kosaraju ----------------------------------------------------------------------------

export interface DfsEvent {
  kind: 'enter' | 'finish';
  node: number;
  /** The node it was entered from (enter only; null for a tree root). */
  parent: number | null;
  /** Finish time, 1-based (finish only). */
  time: number;
}

export interface Pass2Event {
  kind: 'root' | 'visit';
  node: number;
  /** Component index (in discovery order). */
  comp: number;
  parent: number | null;
}

export interface KosarajuRun {
  order: number[];
  pass1: DfsEvent[];
  /** Nodes in the order they finished; the last one is the top of the stack. */
  finishOrder: number[];
  pass2: Pass2Event[];
  /** comp[v] is the index of v's component. */
  comp: number[];
  components: number[][];
}

/** A depth-first search from each unvisited node of `starts`, in order; returns the events. */
function dfsAll(n: number, adj: number[][], starts: readonly number[]): { events: { kind: 'enter' | 'finish'; node: number; parent: number | null; root: boolean }[] } {
  const seen = new Array<boolean>(n).fill(false);
  const events: { kind: 'enter' | 'finish'; node: number; parent: number | null; root: boolean }[] = [];
  const visit = (v: number, parent: number | null, root: boolean) => {
    seen[v] = true;
    events.push({ kind: 'enter', node: v, parent, root });
    for (const w of adj[v]) if (!seen[w]) visit(w, v, false);
    events.push({ kind: 'finish', node: v, parent, root });
  };
  for (const s of starts) if (!seen[s]) visit(s, null, true);
  return { events };
}

/** Kosaraju's two passes, with `order` as the order pass 1 tries its start nodes in. */
export function kosaraju(g: Digraph, order: readonly number[] = g.names.map((_, i) => i)): KosarajuRun {
  const n = g.names.length;
  const fwd = adjacency(n, g.edges);
  const rev = adjacency(n, reverseEdges(g.edges));
  const first = dfsAll(n, fwd, order);
  let time = 0;
  const pass1: DfsEvent[] = first.events.map((e) => ({ kind: e.kind, node: e.node, parent: e.kind === 'enter' ? e.parent : null, time: e.kind === 'finish' ? ++time : 0 }));
  const finishOrder = pass1.filter((e) => e.kind === 'finish').map((e) => e.node);
  const stackTopFirst = [...finishOrder].reverse();
  const comp = new Array<number>(n).fill(-1);
  const pass2: Pass2Event[] = [];
  const components: number[][] = [];
  const grow = (v: number, c: number, parent: number | null) => {
    comp[v] = c;
    components[c].push(v);
    pass2.push({ kind: parent === null ? 'root' : 'visit', node: v, comp: c, parent });
    for (const w of rev[v]) if (comp[w] < 0) grow(w, c, v);
  };
  for (const v of stackTopFirst) {
    if (comp[v] >= 0) continue;
    components.push([]);
    grow(v, components.length - 1, null);
  }
  return { order: [...order], pass1, finishOrder, pass2, comp, components };
}

// ---- adding an edge: what changes -------------------------------------------------------

export interface EdgeEffect {
  before: number;
  after: number;
  /** The components (as node lists) that merged into one, empty when the edge changed nothing. */
  merged: number[][];
}

/** What adding `from→to` does to the number of components, and which components fuse. */
export function edgeEffect(g: Digraph, from: number, to: number): EdgeEffect {
  const before = kosaraju(g);
  const added = addEdge(g, from, to);
  const withEdge = added.ok ? added.value : g;
  const after = kosaraju(withEdge);
  const fused = after.components.filter((c) => new Set(c.map((v) => before.comp[v])).size > 1);
  return { before: before.components.length, after: after.components.length, merged: fused.map((c) => [...c].sort((a, b) => a - b)) };
}
