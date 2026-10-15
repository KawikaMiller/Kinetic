import type { Pt } from '../../components/GraphView';

export const MAX_NODES = 8;
export const CAP_MIN = 1;
export const CAP_MAX = 99;

export interface Edge {
  from: number;
  to: number;
  cap: number;
}

export interface Network {
  names: string[];
  at: Pt[];
  edges: Edge[];
  source: number;
  sink: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const at = (xs: [number, number][]): Pt[] => xs.map(([x, y]) => ({ x, y }));
const edgeList = (xs: [number, number, number][]): Edge[] => xs.map(([from, to, cap]) => ({ from, to, cap }));

export type PresetId = 'textbook' | 'unlucky' | 'pipeline' | 'matching';

export interface Preset {
  id: PresetId;
  label: string;
  net: Network;
}

/** The unlucky network of the spec: two fat pipes each way and a one-unit cross pipe between the middle nodes. */
export function unluckyNetwork(k: number): Network {
  return {
    names: ['s', 'a', 'b', 't'],
    at: at([[60, 130], [230, 40], [230, 220], [420, 130]]),
    edges: edgeList([[0, 1, k], [0, 2, k], [1, 2, 1], [1, 3, k], [2, 3, k]]),
    source: 0,
    sink: 3,
  };
}

export const UNLUCKY_K = 1000;

export const PRESETS: readonly Preset[] = [
  {
    id: 'textbook',
    label: 'Textbook',
    net: {
      names: ['s', 'v1', 'v2', 'v3', 'v4', 't'],
      at: at([[50, 130], [190, 50], [190, 210], [370, 50], [370, 210], [520, 130]]),
      edges: edgeList([[0, 1, 16], [0, 2, 13], [1, 3, 12], [2, 1, 4], [2, 4, 14], [3, 2, 9], [3, 5, 20], [4, 3, 7], [4, 5, 4]]),
      source: 0,
      sink: 5,
    },
  },
  { id: 'unlucky', label: 'The unlucky one', net: unluckyNetwork(UNLUCKY_K) },
  {
    id: 'pipeline',
    label: 'Pipeline',
    net: {
      names: ['s', 'a', 'b', 'c', 't'],
      at: at([[40, 130], [170, 130], [300, 130], [430, 130], [530, 130]]),
      edges: edgeList([[0, 1, 10], [1, 2, 4], [2, 3, 8], [3, 4, 9]]),
      source: 0,
      sink: 4,
    },
  },
  {
    id: 'matching',
    label: 'Matching as flow',
    net: {
      names: ['s', 'W1', 'W2', 'W3', 'J1', 'J2', 'J3', 't'],
      at: at([[30, 130], [150, 40], [150, 130], [150, 220], [380, 40], [380, 130], [380, 220], [520, 130]]),
      edges: edgeList([[0, 1, 1], [0, 2, 1], [0, 3, 1], [1, 4, 1], [1, 5, 1], [2, 4, 1], [3, 4, 1], [4, 7, 1], [5, 7, 1], [6, 7, 1]]),
      source: 0,
      sink: 7,
    },
  },
];

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

// ---- editing (hostile input is defined here) ---------------------------------------------

export function addEdge(net: Network, from: number, to: number): Result<Network> {
  const n = net.names;
  if (from === to) return { ok: false, error: 'A self-loop is refused: flow round a loop carries nothing from s to t.' };
  if (net.edges.some((e) => e.from === from && e.to === to)) return { ok: false, error: `${n[from]}→${n[to]} already exists: a parallel pipe would only add its capacity, so change that one.` };
  if (net.edges.some((e) => e.from === to && e.to === from)) return { ok: false, error: `${n[to]}→${n[from]} already exists: use one direction per pair, so the residual drawing has one arrow each way.` };
  return { ok: true, value: { ...net, edges: [...net.edges, { from, to, cap: CAP_MIN }] } };
}

const SPOTS: Pt[] = [{ x: 280, y: 130 }, { x: 110, y: 130 }, { x: 460, y: 130 }, { x: 280, y: 250 }, { x: 280, y: 20 }, { x: 40, y: 230 }, { x: 540, y: 230 }];
const SPOT_CLEARANCE = 64;
const EXTRA_NAMES = ['u', 'w', 'x', 'y', 'z', 'p', 'q'];

export function addNode(net: Network): Result<Network> {
  if (net.names.length >= MAX_NODES) return { ok: false, error: `At most ${MAX_NODES} nodes, so the flow labels stay readable.` };
  const spot = SPOTS.find((p) => net.at.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= SPOT_CLEARANCE));
  if (!spot) return { ok: false, error: 'No free spot left for a node.' };
  const name = EXTRA_NAMES.find((x) => !net.names.includes(x))!;
  return { ok: true, value: { ...net, names: [...net.names, name], at: [...net.at, spot] } };
}

export const removeEdge = (net: Network, i: number): Network => ({ ...net, edges: net.edges.filter((_, j) => j !== i) });

/** Change edge i's capacity by `delta`, staying in 1..99. A preset capacity above 99 steps down to 99; it never steps up. */
export function nudgeCap(net: Network, i: number, delta: number): Result<Network> {
  const cap = net.edges[i].cap;
  let next = cap + delta;
  if (cap > CAP_MAX && delta < 0) next = CAP_MAX;
  if (next < CAP_MIN) return { ok: false, error: `Capacities stay at ${CAP_MIN} or more.` };
  if (next > CAP_MAX) return { ok: false, error: `Capacities stay at ${CAP_MAX} or less when you edit them.` };
  return { ok: true, value: { ...net, edges: net.edges.map((e, j) => (j === i ? { ...e, cap: next } : e)) } };
}

// ---- flow and the residual network --------------------------------------------------------

/** One arrow of the residual network: spare room on an edge (forward) or flow that could be undone (backward). */
export interface Arc {
  edge: number;
  from: number;
  to: number;
  res: number;
  back: boolean;
}

export const zeroFlow = (net: Network): number[] => net.edges.map(() => 0);

/** Every arc with something left, forward arcs first for each edge. Arcs out of a node are listed by target node, so a search visits neighbours in ascending order. */
export function residualArcs(net: Network, flow: readonly number[]): Arc[] {
  const arcs: Arc[] = [];
  net.edges.forEach((e, i) => {
    if (e.cap - flow[i] > 0) arcs.push({ edge: i, from: e.from, to: e.to, res: e.cap - flow[i], back: false });
    if (flow[i] > 0) arcs.push({ edge: i, from: e.to, to: e.from, res: flow[i], back: true });
  });
  return arcs.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** The arc from u to v with room left, if any (there is at most one: no parallel or opposite edges). */
export const arcBetween = (net: Network, flow: readonly number[], u: number, v: number): Arc | undefined => residualArcs(net, flow).find((a) => a.from === u && a.to === v);

export const bottleneck = (path: readonly Arc[]): number => Math.min(...path.map((a) => a.res));

/** Edmonds-Karp's choice: a fewest-edges source-to-sink path in the residual network (breadth-first, nodes in ascending order), or null. */
export function shortestPath(net: Network, flow: readonly number[]): Arc[] | null {
  const arcs = residualArcs(net, flow);
  const via = new Map<number, Arc>();
  const seen = new Set([net.source]);
  const queue = [net.source];
  while (queue.length && !seen.has(net.sink)) {
    const u = queue.shift()!;
    for (const a of arcs) {
      if (a.from !== u || seen.has(a.to)) continue;
      seen.add(a.to);
      via.set(a.to, a);
      queue.push(a.to);
    }
  }
  if (!seen.has(net.sink)) return null;
  const path: Arc[] = [];
  for (let v = net.sink; v !== net.source; v = via.get(v)!.from) path.unshift(via.get(v)!);
  return path;
}

/** Push `delta` along `path`: forward arcs add flow, backward arcs take it back. */
export function applyPath(flow: readonly number[], path: readonly Arc[], delta: number): number[] {
  const next = [...flow];
  for (const a of path) next[a.edge] += a.back ? -delta : delta;
  return next;
}

/** The flow value: net flow out of the source. */
export function flowValue(net: Network, flow: readonly number[]): number {
  return net.edges.reduce((sum, e, i) => sum + (e.from === net.source ? flow[i] : 0) - (e.to === net.source ? flow[i] : 0), 0);
}

/** Everything wrong with a flow: capacity broken, conservation broken at a node other than s and t. Empty means it is a legal flow. */
export function checkFlow(net: Network, flow: readonly number[]): string[] {
  const problems: string[] = [];
  net.edges.forEach((e, i) => {
    if (flow[i] < 0 || flow[i] > e.cap) problems.push(`capacity: ${net.names[e.from]}→${net.names[e.to]} carries ${flow[i]} of ${e.cap}`);
  });
  net.names.forEach((name, v) => {
    if (v === net.source || v === net.sink) return;
    const inflow = net.edges.reduce((s, e, i) => s + (e.to === v ? flow[i] : 0), 0);
    const outflow = net.edges.reduce((s, e, i) => s + (e.from === v ? flow[i] : 0), 0);
    if (inflow !== outflow) problems.push(`conservation: ${name} takes in ${inflow} and sends out ${outflow}`);
  });
  return problems;
}

export interface Augmentation {
  path: Arc[];
  delta: number;
  /** The flow value once this path has been pushed. */
  valueAfter: number;
}

export interface FlowRun {
  flow: number[];
  value: number;
  steps: Augmentation[];
}

/** Edmonds-Karp: keep pushing along a shortest augmenting path until there is none. */
export function edmondsKarp(net: Network, start: readonly number[] = zeroFlow(net)): FlowRun {
  let flow = [...start];
  const steps: Augmentation[] = [];
  for (let path = shortestPath(net, flow); path; path = shortestPath(net, flow)) {
    const delta = bottleneck(path);
    flow = applyPath(flow, path, delta);
    steps.push({ path, delta, valueAfter: flowValue(net, flow) });
  }
  return { flow, value: flowValue(net, flow), steps };
}

// ---- cuts ---------------------------------------------------------------------------------

/** The nodes reachable from the source in the residual network. At a maximum flow this is the source side of a minimum cut. */
export function reachableSet(net: Network, flow: readonly number[]): Set<number> {
  const arcs = residualArcs(net, flow);
  const seen = new Set([net.source]);
  const queue = [net.source];
  while (queue.length) {
    const u = queue.shift()!;
    for (const a of arcs) if (a.from === u && !seen.has(a.to)) { seen.add(a.to); queue.push(a.to); }
  }
  return seen;
}

/** The cut's capacity: only edges that go from the source side to the other side count. */
export function cutCapacity(net: Network, side: ReadonlySet<number>): number {
  return net.edges.reduce((s, e) => s + (side.has(e.from) && !side.has(e.to) ? e.cap : 0), 0);
}

/** Edges that cross the cut from the source side to the sink side. */
export const crossingEdges = (net: Network, side: ReadonlySet<number>): number[] =>
  net.edges.flatMap((e, i) => (side.has(e.from) && !side.has(e.to) ? [i] : []));

/** Edges that go back across the cut, from the sink side into the source side: they do not count. */
export const backEdges = (net: Network, side: ReadonlySet<number>): number[] =>
  net.edges.flatMap((e, i) => (!side.has(e.from) && side.has(e.to) ? [i] : []));

/** Can any more flow be pushed? False means the flow is a maximum flow. */
export const isMaximum = (net: Network, flow: readonly number[]): boolean => shortestPath(net, flow) === null;

// ---- the scripted worst case --------------------------------------------------------------

/**
 * The adversarial order on the unlucky network, scripted: alternate s→a→b→t and s→b→a→t, the second using the cross
 * pipe backwards. Each push is checked against the residual network, so a path that the model would not allow stops the run.
 */
export function adversarialRun(k: number): FlowRun {
  const net = unluckyNetwork(k);
  const [s, a, b, t] = [0, 1, 2, 3];
  const routes = [[s, a, b, t], [s, b, a, t]];
  let flow = zeroFlow(net);
  const steps: Augmentation[] = [];
  for (let turn = 0; ; turn++) {
    const route = routes[turn % 2];
    const path: Arc[] = [];
    for (let h = 0; h + 1 < route.length; h++) {
      const arc = arcBetween(net, flow, route[h], route[h + 1]);
      if (!arc) break;
      path.push(arc);
    }
    if (path.length !== route.length - 1) break;
    const delta = bottleneck(path);
    flow = applyPath(flow, path, delta);
    steps.push({ path, delta, valueAfter: flowValue(net, flow) });
  }
  return { flow, value: flowValue(net, flow), steps };
}
