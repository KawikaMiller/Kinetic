import type { Pt } from '../../components/GraphView';
import { mulberry32, shuffle } from '../../core/random';

export const MAX_NODES = 12;

export type Edge = readonly [a: number, b: number];

export interface Graph {
  names: string[];
  at: Pt[];
  /** Unique undirected edges, each stored with the smaller node first. */
  edges: Edge[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const norm = (a: number, b: number): Edge => (a < b ? [a, b] : [b, a]);
const pts = (xs: [number, number][]): Pt[] => xs.map(([x, y]) => ({ x, y }));
const ring = (n: number, cx: number, cy: number, rx: number, ry: number): Pt[] =>
  Array.from({ length: n }, (_, i) => ({ x: Math.round(cx + rx * Math.sin((2 * Math.PI * i) / n)), y: Math.round(cy - ry * Math.cos((2 * Math.PI * i) / n)) }));
const named = (names: string[], at: Pt[], pairs: [string, string][]): Graph => ({
  names,
  at,
  edges: pairs.map(([a, b]) => norm(names.indexOf(a), names.indexOf(b))),
});

export type PresetId = 'crown' | 'timetable' | 'registers' | 'odd' | 'k5';

export interface Preset {
  id: PresetId;
  label: string;
  graph: Graph;
}

const CROWN_NAMES = ['a1', 'b1', 'a2', 'b2', 'a3', 'b3', 'a4', 'b4'];
/** The crown graph: ai is joined to bj for every j other than i. Listed a1, b1, a2, b2, ... so the order as given is the bad one. */
const crown = (): Graph => {
  const pairs: [string, string][] = [];
  for (let i = 1; i <= 4; i++) for (let j = 1; j <= 4; j++) if (i !== j) pairs.push([`a${i}`, `b${j}`]);
  return named(CROWN_NAMES, pts(CROWN_NAMES.map((n): [number, number] => [n[0] === 'a' ? 150 : 430, 40 + (Number(n[1]) - 1) * 62])), pairs);
};

const TIMETABLE_NAMES = ['Alg', 'Bio', 'Chem', 'Drama', 'Eng', 'French', 'Geo', 'Hist'];
const REGISTER_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

export const PRESETS: readonly Preset[] = [
  { id: 'crown', label: 'Crown graph', graph: crown() },
  {
    id: 'timetable',
    label: 'Exam timetable',
    graph: named(TIMETABLE_NAMES, ring(8, 280, 150, 220, 105), [
      ['Alg', 'Eng'], ['Bio', 'Drama'], ['Bio', 'French'], ['Bio', 'Geo'], ['Chem', 'Drama'], ['Chem', 'Eng'], ['Chem', 'Hist'], ['Drama', 'Eng'], ['Drama', 'French'], ['Eng', 'French'], ['French', 'Hist'],
    ]),
  },
  {
    id: 'registers',
    label: 'Register interference',
    graph: named(REGISTER_NAMES, ring(7, 280, 150, 180, 110), [
      ['a', 'b'], ['a', 'c'], ['b', 'd'], ['b', 'e'], ['b', 'f'], ['c', 'g'], ['d', 'g'], ['e', 'f'], ['f', 'g'],
    ]),
  },
  {
    id: 'odd',
    label: 'Odd cycle',
    graph: named(['v1', 'v2', 'v3', 'v4', 'v5'], ring(5, 280, 150, 130, 110), [['v1', 'v2'], ['v2', 'v3'], ['v3', 'v4'], ['v4', 'v5'], ['v5', 'v1']]),
  },
  {
    id: 'k5',
    label: 'Complete graph K5',
    graph: named(['v1', 'v2', 'v3', 'v4', 'v5'], ring(5, 280, 150, 130, 110), [
      ['v1', 'v2'], ['v1', 'v3'], ['v1', 'v4'], ['v1', 'v5'], ['v2', 'v3'], ['v2', 'v4'], ['v2', 'v5'], ['v3', 'v4'], ['v3', 'v5'], ['v4', 'v5'],
    ]),
  },
];

/** The graphs whose nodes are courses or variables are made up, and the lesson says so wherever they show. */
export const isInvented = (id: PresetId): boolean => id === 'timetable' || id === 'registers';

export const presetById =(id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

// ---- editing (hostile input is defined here) ---------------------------------------------

export function addEdge(g: Graph, a: number, b: number): Result<Graph> {
  if (a === b) return { ok: false, error: 'A self-loop is refused: a node cannot differ in colour from itself, so no colouring would exist.' };
  const e = norm(a, b);
  if (g.edges.some(([x, y]) => x === e[0] && y === e[1])) return { ok: false, error: `${g.names[a]}–${g.names[b]} already exists: a second copy changes nothing.` };
  return { ok: true, value: { ...g, edges: [...g.edges, e] } };
}

const SPOTS: Pt[] = [{ x: 280, y: 150 }, { x: 40, y: 40 }, { x: 520, y: 40 }, { x: 40, y: 260 }, { x: 520, y: 260 }, { x: 280, y: 20 }, { x: 280, y: 280 }, { x: 40, y: 150 }, { x: 520, y: 150 }];
const SPOT_CLEARANCE = 56;
const EXTRA_NAMES = ['p', 'q', 'r', 'u', 'w', 'x', 'y', 'z'];

export function addNode(g: Graph): Result<Graph> {
  if (g.names.length >= MAX_NODES) return { ok: false, error: `At most ${MAX_NODES} nodes: the exact search stays fast and the drawing stays readable.` };
  const spot = SPOTS.find((p) => g.at.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= SPOT_CLEARANCE));
  if (!spot) return { ok: false, error: 'No free spot left for a node.' };
  const name = EXTRA_NAMES.find((n) => !g.names.includes(n))!;
  return { ok: true, value: { ...g, names: [...g.names, name], at: [...g.at, spot] } };
}

export const removeLastEdge = (g: Graph, keep: number): Graph => (g.edges.length > keep ? { ...g, edges: g.edges.slice(0, -1) } : g);

// ---- structure -----------------------------------------------------------------------------

export function adjacency(g: Graph): number[][] {
  const adj: number[][] = g.names.map(() => []);
  for (const [a, b] of g.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj.map((l) => l.sort((x, y) => x - y));
}

export const degrees = (g: Graph): number[] => adjacency(g).map((l) => l.length);
export const maxDegree = (g: Graph): number => Math.max(0, ...degrees(g));

// ---- orders --------------------------------------------------------------------------------

export const isPermutation = (order: readonly number[], n: number): boolean => order.length === n && new Set(order).size === n && order.every((v) => Number.isInteger(v) && v >= 0 && v < n);

export const identityOrder = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Highest degree first; ties keep the order as given. */
export function highestDegreeFirst(g: Graph): number[] {
  const d = degrees(g);
  return identityOrder(g.names.length).sort((a, b) => d[b] - d[a] || a - b);
}

/** Alphabetical by name. */
export const byName = (g: Graph): number[] => identityOrder(g.names.length).sort((a, b) => (g.names[a] < g.names[b] ? -1 : g.names[a] > g.names[b] ? 1 : 0));

export const SEEDED_ORDER_SEED = 11;
export const seededOrder = (n: number): number[] => shuffle(identityOrder(n), mulberry32(SEEDED_ORDER_SEED));

export interface Peeling {
  /** Nodes in the order they were removed (a minimum-degree node each time, lowest number on a tie). */
  removal: number[];
  /** The degree each had among the nodes still present when it was removed. */
  degreeAtRemoval: number[];
  /** The largest of those: the graph's degeneracy. */
  degeneracy: number;
}

export function peel(g: Graph): Peeling {
  const adj = adjacency(g);
  const left = new Set(identityOrder(g.names.length));
  const removal: number[] = [];
  const degreeAtRemoval: number[] = [];
  while (left.size) {
    let best = -1;
    let bestDeg = Infinity;
    for (const v of [...left].sort((a, b) => a - b)) {
      const d = adj[v].filter((w) => left.has(w)).length;
      if (d < bestDeg) {
        best = v;
        bestDeg = d;
      }
    }
    removal.push(best);
    degreeAtRemoval.push(bestDeg);
    left.delete(best);
  }
  return { removal, degreeAtRemoval, degeneracy: Math.max(0, ...degreeAtRemoval) };
}

/** Smallest-last: colour in the reverse of the removal order. */
export const smallestLast = (g: Graph): number[] => [...peel(g).removal].reverse();

export type OrderId = 'given' | 'degree' | 'smallest-last' | 'name' | 'random';

export const ORDERS: { id: OrderId; label: string; build: (g: Graph) => number[] }[] = [
  { id: 'given', label: 'as given', build: (g) => identityOrder(g.names.length) },
  { id: 'name', label: 'by name', build: byName },
  { id: 'degree', label: 'highest degree first', build: highestDegreeFirst },
  { id: 'smallest-last', label: 'smallest-last', build: smallestLast },
  { id: 'random', label: `seeded random (${SEEDED_ORDER_SEED})`, build: (g) => seededOrder(g.names.length) },
];

// ---- greedy --------------------------------------------------------------------------------

export interface GreedyStep {
  node: number;
  /** Colours used by already-coloured neighbours, ascending (colours count from 1). */
  forbidden: number[];
  colour: number;
}

export interface GreedyRun {
  order: number[];
  steps: GreedyStep[];
  /** colour[v], counting from 1. */
  colours: number[];
  used: number;
}

/** Each node, in `order`, takes the smallest colour no already-coloured neighbour has. */
export function greedyColour(g: Graph, order: readonly number[]): GreedyRun {
  const adj = adjacency(g);
  const colours = Array<number>(g.names.length).fill(0);
  const steps: GreedyStep[] = [];
  for (const v of order) {
    const forbidden = [...new Set(adj[v].map((w) => colours[w]).filter((c) => c > 0))].sort((a, b) => a - b);
    let colour = 1;
    while (forbidden.includes(colour)) colour++;
    colours[v] = colour;
    steps.push({ node: v, forbidden, colour });
  }
  return { order: [...order], steps, colours, used: Math.max(0, ...colours) };
}

/** Is the (possibly partial, 0 = uncoloured) colouring free of edges with two equal colours? */
export const conflicts = (g: Graph, colours: readonly number[]): Edge[] => g.edges.filter(([a, b]) => colours[a] > 0 && colours[a] === colours[b]);

// ---- exact -----------------------------------------------------------------------------------

/** Can `k` colours colour the graph? Backtracking, nodes tried in order of decreasing degree, never opening a new colour out of order. */
export function colourWith(g: Graph, k: number): number[] | null {
  const n = g.names.length;
  const adj = adjacency(g);
  const order = highestDegreeFirst(g);
  const colours = Array<number>(n).fill(0);
  const place = (i: number, opened: number): boolean => {
    if (i === n) return true;
    const v = order[i];
    for (let c = 1; c <= Math.min(k, opened + 1); c++) {
      if (adj[v].some((w) => colours[w] === c)) continue;
      colours[v] = c;
      if (place(i + 1, Math.max(opened, c))) return true;
      colours[v] = 0;
    }
    return false;
  };
  return place(0, 0) ? colours : null;
}

export interface Chromatic {
  number: number;
  colours: number[];
}

/** The chromatic number and an optimal colouring, by trying 1, 2, 3, ... colours. */
export function chromatic(g: Graph): Chromatic {
  if (g.names.length === 0) return { number: 0, colours: [] };
  for (let k = 1; k <= g.names.length; k++) {
    const colours = colourWith(g, k);
    if (colours) return { number: k, colours };
  }
  throw new Error('unreachable: n colours always suffice');
}

// ---- two colours: the easy case --------------------------------------------------------------

export interface TwoColouring {
  /** 1 or 2 per node when the graph is two-colourable, else a partial colouring up to the clash. */
  colours: number[];
  ok: boolean;
  /** When not ok: the nodes of an odd cycle, in order round it. */
  oddCycle: number[] | null;
}

/** Breadth-first two-colouring. A clash between neighbours of the same colour closes an odd cycle through the tree paths to their meeting point. */
export function twoColour(g: Graph): TwoColouring {
  const n = g.names.length;
  const adj = adjacency(g);
  const colours = Array<number>(n).fill(0);
  const parent = Array<number>(n).fill(-1);
  const depth = Array<number>(n).fill(0);
  for (let root = 0; root < n; root++) {
    if (colours[root]) continue;
    colours[root] = 1;
    const queue = [root];
    while (queue.length) {
      const u = queue.shift()!;
      for (const w of adj[u]) {
        if (!colours[w]) {
          colours[w] = 3 - colours[u];
          parent[w] = u;
          depth[w] = depth[u] + 1;
          queue.push(w);
        } else if (colours[w] === colours[u]) {
          // Climb both nodes to their common ancestor; the two climbs plus this edge are an odd cycle.
          const left = [u];
          const right = [w];
          let a = u;
          let b = w;
          while (depth[a] > depth[b]) { a = parent[a]; left.push(a); }
          while (depth[b] > depth[a]) { b = parent[b]; right.push(b); }
          while (a !== b) { a = parent[a]; b = parent[b]; left.push(a); right.push(b); }
          right.pop();
          return { colours, ok: false, oddCycle: [...left, ...right.reverse()] };
        }
      }
    }
  }
  return { colours, ok: true, oddCycle: null };
}
