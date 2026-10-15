import type { Pt } from '../../components/GraphView';
import type { Result } from '../../core/result';

/** The editor's limits: at most this many nodes, integer weights in range, a rate range for the arbitrage preset. */
export const MAX_NODES = 7;
export const WEIGHT_MIN = -9;
export const WEIGHT_MAX = 9;
export const RATE_MIN = 0.5;
export const RATE_MAX = 2;
export const RATE_STEP = 0.05;
/** Two real-valued distances closer than this are equal (the arbitrage preset's -ln(rate) weights). */
export const EPS = 1e-9;

export interface Edge {
  from: number;
  to: number;
  /** Integer weight, or -ln(rate) when the graph is a currency market. */
  w: number;
  /** Currency graphs only: the exchange rate the weight was made from. */
  rate?: number;
}

export interface Graph {
  names: string[];
  at: Pt[];
  edges: Edge[];
  /** True for the currency market: weights are -ln(rate), and the editor nudges rates instead. */
  market?: boolean;
}

const edge = (from: number, to: number, w: number): Edge => ({ from, to, w });
const rateEdge = (from: number, to: number, rate: number): Edge => ({ from, to, w: -Math.log(rate), rate });

const TEXTBOOK_NAMES = ['s', 't', 'y', 'x', 'z'];
const TEXTBOOK_AT: Pt[] = [{ x: 60, y: 150 }, { x: 190, y: 50 }, { x: 190, y: 250 }, { x: 370, y: 50 }, { x: 370, y: 250 }];
const idx = (names: readonly string[], n: string) => names.indexOf(n);
const textbookEdges = (xt: number): Edge[] =>
  (
    [['s', 't', 6], ['s', 'y', 7], ['t', 'x', 5], ['t', 'y', 8], ['t', 'z', -4], ['y', 'x', -3], ['y', 'z', 9], ['x', 't', xt], ['z', 's', 2], ['z', 'x', 7]] as const
  ).map(([a, b, w]) => edge(idx(TEXTBOOK_NAMES, a), idx(TEXTBOOK_NAMES, b), w));

export type PresetId = 'textbook' | 'negative-cycle' | 'dijkstra-breaks' | 'arbitrage';

export interface Preset {
  id: PresetId;
  label: string;
  graph: Graph;
  source: number;
}

export const PRESETS: readonly Preset[] = [
  { id: 'textbook', label: 'Textbook', source: 0, graph: { names: TEXTBOOK_NAMES, at: TEXTBOOK_AT, edges: textbookEdges(-2) } },
  { id: 'negative-cycle', label: 'Negative cycle', source: 0, graph: { names: TEXTBOOK_NAMES, at: TEXTBOOK_AT, edges: textbookEdges(-6) } },
  {
    id: 'dijkstra-breaks',
    label: 'Dijkstra breaks',
    source: 0,
    graph: { names: ['s', 'a', 'b'], at: [{ x: 70, y: 150 }, { x: 290, y: 60 }, { x: 290, y: 240 }], edges: [edge(0, 1, 2), edge(0, 2, 3), edge(2, 1, -2)] },
  },
  {
    id: 'arbitrage',
    label: 'Arbitrage',
    source: 0,
    graph: {
      names: ['USD', 'EUR', 'GBP'],
      at: [{ x: 70, y: 220 }, { x: 290, y: 50 }, { x: 440, y: 220 }],
      market: true,
      edges: [rateEdge(0, 1, 0.9), rateEdge(1, 2, 0.9), rateEdge(2, 0, 1.3)],
    },
  },
];

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

/** What a weight reads as on the drawing: an integer, or -ln(rate) to three decimals. */
export const weightText = (g: Graph, e: Edge): string => (g.market ? e.w.toFixed(3) : String(e.w));

/** The value an edge's tooltip and ± buttons talk about. */
export const rateText = (r: number): string => r.toFixed(2);

// ---- editor operations (hostile input is defined here) -----------------------------------

const findEdge = (g: Graph, from: number, to: number) => g.edges.findIndex((e) => e.from === from && e.to === to);

export function addEdge(g: Graph, from: number, to: number): Result<Graph> {
  if (from === to) return { ok: false, error: 'A self-loop is refused: it can never lie on a simple shortest path, and a negative one is a negative cycle by itself.' };
  if (findEdge(g, from, to) >= 0) return { ok: false, error: `${g.names[from]} to ${g.names[to]} already exists: change its weight instead.` };
  const e = g.market ? rateEdge(from, to, 1) : edge(from, to, 1);
  return { ok: true, value: { ...g, edges: [...g.edges, e] } };
}

/** Where a new node goes: the first free spot of a fixed ring of candidates. */
const SPOTS: Pt[] = [{ x: 60, y: 50 }, { x: 460, y: 150 }, { x: 60, y: 250 }, { x: 250, y: 150 }, { x: 460, y: 50 }, { x: 460, y: 250 }, { x: 250, y: 280 }];
const SPOT_CLEARANCE = 60;
const farFrom = (at: readonly Pt[], p: Pt) => at.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= SPOT_CLEARANCE);
const NODE_NAMES = ['p', 'q', 'r', 'u', 'v', 'w', 'a', 'b', 'c'];

export function addNode(g: Graph): Result<Graph> {
  if (g.names.length >= MAX_NODES) return { ok: false, error: `At most ${MAX_NODES} nodes: the matrix and the drawing stay readable.` };
  const spot = SPOTS.find((p) => farFrom(g.at, p));
  if (!spot) return { ok: false, error: 'No free spot left to place a node.' };
  const name = NODE_NAMES.find((n) => !g.names.includes(n))!;
  return { ok: true, value: { ...g, names: [...g.names, name], at: [...g.at, spot] } };
}

export function removeEdge(g: Graph, i: number): Graph {
  return { ...g, edges: g.edges.filter((_, j) => j !== i) };
}

/** Move edge `i`'s weight (or, in a market, its rate) one step; refuses to leave the range. */
export function nudgeEdge(g: Graph, i: number, direction: 1 | -1): Result<Graph> {
  const e = g.edges[i];
  let next: Edge;
  if (g.market) {
    const rate = Math.round(((e.rate ?? 1) + direction * RATE_STEP) * 100) / 100;
    if (rate < RATE_MIN || rate > RATE_MAX) return { ok: false, error: `Rates stay between ${rateText(RATE_MIN)} and ${rateText(RATE_MAX)}.` };
    next = rateEdge(e.from, e.to, rate);
  } else {
    const w = e.w + direction;
    if (w < WEIGHT_MIN || w > WEIGHT_MAX) return { ok: false, error: `Weights stay between ${WEIGHT_MIN} and ${WEIGHT_MAX}.` };
    next = edge(e.from, e.to, w);
  }
  return { ok: true, value: { ...g, edges: g.edges.map((x, j) => (j === i ? next : x)) } };
}

// ---- Bellman-Ford ------------------------------------------------------------------------

export interface Relaxation {
  round: number;
  edge: number;
  /** The distance of the edge's target before and after this test (Infinity = not reached yet). */
  before: number;
  after: number;
  lowered: boolean;
}

export interface NegativeCycle {
  /** Edge indices in order round the cycle. */
  edges: number[];
  nodes: number[];
  sum: number;
}

export interface BfRun {
  source: number;
  tests: Relaxation[];
  /** How many distances each round changed, in order. */
  roundChanges: number[];
  /** True when a round changed nothing, so the run stopped early. */
  stoppedEarly: boolean;
  /** Edges that still lower a distance in the extra check round (empty without a negative cycle). */
  checkEdges: number[];
  cycle: NegativeCycle | null;
  /** Nodes that have no shortest path (reachable from a reachable negative cycle). */
  noPath: number[];
  /** Distances after the rounds: Infinity unreached, -Infinity no shortest path. */
  dist: number[];
  /** Distance array after each completed round. */
  afterRound: number[][];
}

const lowers = (d: number[], e: Edge): boolean => d[e.from] !== Infinity && d[e.from] + e.w < d[e.to] - EPS;

function reachableFrom(g: Graph, starts: readonly number[]): number[] {
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    const u = queue.shift()!;
    for (const e of g.edges) if (e.from === u && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
  }
  return [...seen].sort((a, b) => a - b);
}

function cycleThrough(g: Graph, pred: number[], start: number): NegativeCycle {
  // Walk back n steps so the walk has certainly landed on the cycle, then go round it once.
  let v = start;
  for (let i = 0; i < g.names.length; i++) v = g.edges[pred[v]].from;
  // A predecessor chain that left the cycle would end at an unreached node; the tests rule that out.
  const edges: number[] = [];
  let u = v;
  do {
    edges.unshift(pred[u]);
    u = g.edges[pred[u]].from;
  } while (u !== v);
  return { edges, nodes: edges.map((i) => g.edges[i].from), sum: edges.reduce((s, i) => s + g.edges[i].w, 0) };
}

/** Bellman-Ford in rounds: every edge, in array order, once per round; at most n-1 rounds, stopping early; then one check round. */
export function bellmanFord(g: Graph, source: number): BfRun {
  const n = g.names.length;
  const d = Array<number>(n).fill(Infinity);
  d[source] = 0;
  const pred = Array<number>(n).fill(-1);
  const tests: Relaxation[] = [];
  const roundChanges: number[] = [];
  const afterRound: number[][] = [];
  let stoppedEarly = false;
  for (let round = 1; round <= n - 1; round++) {
    let changes = 0;
    g.edges.forEach((e, i) => {
      const before = d[e.to];
      const lowered = lowers(d, e);
      if (lowered) {
        d[e.to] = d[e.from] + e.w;
        pred[e.to] = i;
        changes++;
      }
      tests.push({ round, edge: i, before, after: d[e.to], lowered });
    });
    roundChanges.push(changes);
    afterRound.push([...d]);
    if (changes === 0) {
      stoppedEarly = true;
      break;
    }
  }
  const checkEdges = stoppedEarly ? [] : g.edges.flatMap((e, i) => (lowers(d, e) ? [i] : []));
  let cycle: NegativeCycle | null = null;
  let noPath: number[] = [];
  const dist = [...d];
  if (checkEdges.length) {
    const first = g.edges[checkEdges[0]];
    pred[first.to] = checkEdges[0];
    cycle = cycleThrough(g, pred, first.to);
    noPath = reachableFrom(g, checkEdges.map((i) => g.edges[i].to));
    for (const v of noPath) dist[v] = -Infinity;
  }
  return { source, tests, roundChanges, stoppedEarly, checkEdges, cycle, noPath, dist, afterRound };
}

/** The shortest-path hop count of each node: fewest edges among shortest paths (Infinity unreached). Only meaningful without a negative cycle. */
export function hopsOfShortest(g: Graph, run: BfRun): number[] {
  const n = g.names.length;
  const hops = Array<number>(n).fill(Infinity);
  hops[run.source] = 0;
  // Relax over (distance, hops) pairs until stable: n rounds suffice because a shortest path has at most n-1 edges.
  for (let round = 0; round < n; round++) {
    for (const e of g.edges) {
      if (hops[e.from] === Infinity) continue;
      const viaDist = run.dist[e.from] + e.w;
      if (Math.abs(viaDist - run.dist[e.to]) < EPS && hops[e.from] + 1 < hops[e.to]) hops[e.to] = hops[e.from] + 1;
    }
  }
  return hops;
}

/** Nodes whose distance after `round` rounds already equals their final distance (reachable ones). */
export function settledAfter(run: BfRun, round: number): number[] {
  const at = run.afterRound[Math.min(round, run.afterRound.length) - 1];
  if (!at) return [];
  return at.flatMap((x, v) => (x !== Infinity && Math.abs(x - run.dist[v]) < EPS ? [v] : []));
}

// ---- Dijkstra with a visited set ---------------------------------------------------------

export interface DijkstraStep {
  node: number;
  dist: number;
  /** Edges out of the node that lowered a still-open node. */
  lowered: number[];
  /** Edges out of the node whose target was already finalised, so were not looked at. */
  skipped: number[];
}

export interface DijkstraRun {
  steps: DijkstraStep[];
  dist: number[];
}

/** Dijkstra the textbook way: finalise the closest open node, relax its edges into open nodes only. Fine for non-negative weights; this is what breaks with negative ones. */
export function dijkstraVisited(g: Graph, source: number): DijkstraRun {
  const n = g.names.length;
  const d = Array<number>(n).fill(Infinity);
  d[source] = 0;
  const done = new Set<number>();
  const steps: DijkstraStep[] = [];
  for (;;) {
    let u = -1;
    for (let v = 0; v < n; v++) if (!done.has(v) && d[v] !== Infinity && (u < 0 || d[v] < d[u])) u = v;
    if (u < 0) break;
    done.add(u);
    const lowered: number[] = [];
    const skipped: number[] = [];
    g.edges.forEach((e, i) => {
      if (e.from !== u) return;
      if (done.has(e.to)) {
        skipped.push(i);
      } else if (d[u] + e.w < d[e.to] - EPS) {
        d[e.to] = d[u] + e.w;
        lowered.push(i);
      }
    });
    steps.push({ node: u, dist: d[u], lowered, skipped });
  }
  return { steps, dist: d };
}

/** Nodes where Dijkstra's answer differs from the truth (Bellman-Ford's, with "no shortest path" counting as different). */
export function dijkstraWrong(dij: DijkstraRun, bf: BfRun): number[] {
  return dij.dist.flatMap((x, v) => (Math.abs(x - bf.dist[v]) < EPS || (x === Infinity && bf.dist[v] === Infinity) ? [] : [v]));
}

// ---- Floyd-Warshall ----------------------------------------------------------------------

export interface Cell {
  i: number;
  j: number;
}

export interface FwStep {
  /** The node just allowed as an intermediate (-1 for the starting matrix). */
  k: number;
  d: number[][];
  next: number[][];
  changed: Cell[];
  /** Nodes whose diagonal entry is below zero after this step. */
  negativeDiagonal: number[];
}

export interface FwRun {
  steps: FwStep[];
  /** The k at which a negative diagonal first appeared, and the run stopped; null when none did. */
  stoppedAt: number | null;
  /** The number of cell updates the run performed: k steps of n x n comparisons. */
  comparisons: number;
}

export function floydWarshall(g: Graph): FwRun {
  const n = g.names.length;
  const d0 = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 0 : Infinity)));
  const next0 = Array.from({ length: n }, () => Array<number>(n).fill(-1));
  for (const e of g.edges) {
    if (e.w < d0[e.from][e.to]) {
      d0[e.from][e.to] = e.w;
      next0[e.from][e.to] = e.to;
    }
  }
  for (let i = 0; i < n; i++) next0[i][i] = i;
  const steps: FwStep[] = [{ k: -1, d: d0, next: next0, changed: [], negativeDiagonal: [] }];
  let comparisons = 0;
  let stoppedAt: number | null = null;
  for (let k = 0; k < n; k++) {
    const prev = steps[steps.length - 1];
    const d = prev.d.map((r) => [...r]);
    const next = prev.next.map((r) => [...r]);
    const changed: Cell[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        comparisons++;
        const via = prev.d[i][k] + prev.d[k][j];
        if (prev.d[i][k] !== Infinity && prev.d[k][j] !== Infinity && via < prev.d[i][j] - EPS) {
          d[i][j] = via;
          next[i][j] = prev.next[i][k];
          changed.push({ i, j });
        }
      }
    }
    const negativeDiagonal = d.flatMap((r, i) => (r[i] < -EPS ? [i] : []));
    steps.push({ k, d, next, changed, negativeDiagonal });
    if (negativeDiagonal.length) {
      stoppedAt = k;
      break;
    }
  }
  return { steps, stoppedAt, comparisons };
}

/** The node sequence from i to j by following `next`, or null when j is unreachable (or the walk does not end). */
export function pathFromNext(next: number[][], i: number, j: number): number[] | null {
  if (next[i][j] < 0) return null;
  const path = [i];
  let at = i;
  while (at !== j) {
    at = next[at][j];
    if (at < 0 || path.length > next.length) return null;
    path.push(at);
  }
  return path;
}

// ---- cost --------------------------------------------------------------------------------

export interface Costs {
  nodes: number;
  edges: number;
  /** Edge tests Bellman-Ford made from one source in this run (rounds, plus the check round if it ran) x edges. */
  bellmanFordOne: number;
  /** The same added up over every source: what all-pairs shortest paths costs this way. */
  bellmanFordAll: number;
  /** The most one source can cost: n rounds (n-1 plus the check) x edges. */
  bellmanFordWorst: number;
  /** Cell updates Floyd-Warshall made in this run. */
  floydWarshall: number;
  /** n^3, the full run. */
  floydWarshallFull: number;
}

/** Edge tests of one Bellman-Ford run: the rounds it made, plus the check round when it did not stop early. */
export const edgeTests = (run: BfRun, edges: number): number => run.tests.length + (run.stoppedEarly ? 0 : edges);

export function costs(g: Graph, bf: BfRun, fw: FwRun): Costs {
  const n = g.names.length;
  const m = g.edges.length;
  let all = 0;
  for (let s = 0; s < n; s++) all += edgeTests(bellmanFord(g, s), m);
  return {
    nodes: n,
    edges: m,
    bellmanFordOne: edgeTests(bf, m),
    bellmanFordAll: all,
    bellmanFordWorst: n * m,
    floydWarshall: fw.comparisons,
    floydWarshallFull: n * n * n,
  };
}
