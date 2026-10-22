/**
 * numa-multicore: a pure analytic model of a two-socket machine. Every constant is a named, illustrative one:
 * nothing is simulated and nothing is measured. Two sockets, each with a memory bank (node 0, node 1) joined by
 * an interconnect; four threads; eight pages that each live on one node.
 */
import { decimal } from '../../core/format';

export const LOCAL_NS = 80;
export const REMOTE_NS = 140;
/** One memory controller, per node. */
export const NODE_GBPS = 40;
/** The interconnect, per direction. */
export const LINK_GBPS = 20;
/** What one streaming thread asks for. */
export const THREAD_GBPS = 16;

export const SOCKETS = 2;
export const PAGES = 8;
export const THREADS = 4;
export const PAGES_PER_THREAD = PAGES / THREADS;

export type Node = 0 | 1;
export type Pattern = 'own' | 'all' | 'hot';
export type Policy = 'first-touch' | 'interleave' | 'bind0';
export type Init = 'serial' | 'parallel';

export interface Machine {
  /** The socket each thread runs on. */
  sockets: Node[];
  /** The node each page lives on. */
  homes: Node[];
}

export const DEFAULT_SOCKETS: Node[] = [0, 0, 1, 1];
export const DEFAULT_HOMES: Node[] = [0, 0, 0, 0, 1, 1, 1, 1];
export const defaultMachine = (): Machine => ({ sockets: [...DEFAULT_SOCKETS], homes: [...DEFAULT_HOMES] });

/** null when the machine is within the limits, else the sentence to show. */
export function machineError(m: Machine): string | null {
  if (m.sockets.length > THREADS) return `Use at most ${THREADS} threads: that is ${m.sockets.length}.`;
  if (m.homes.length > PAGES) return `Use at most ${PAGES} pages: that is ${m.homes.length}.`;
  if (m.sockets.length < THREADS || m.homes.length < PAGES) return `A machine has ${THREADS} threads and ${PAGES} pages.`;
  if (![...m.sockets, ...m.homes].every((n) => n === 0 || n === 1)) return `A socket or node is 0 or 1.`;
  return null;
}

function check(m: Machine): void {
  const bad = machineError(m);
  if (bad) throw new RangeError(bad);
}

export const PATTERN_LABEL: Record<Pattern, string> = { own: 'own pages', all: 'everyone reads everything', hot: 'one hot page' };

/** How much of thread `t`'s accesses go to each page: equal shares of the pages it uses, summing to 1. */
export function accessWeights(pattern: Pattern, t: number): number[] {
  const used = pattern === 'own' ? Array.from({ length: PAGES_PER_THREAD }, (_, k) => t * PAGES_PER_THREAD + k) : pattern === 'all' ? Array.from({ length: PAGES }, (_, p) => p) : [0];
  return Array.from({ length: PAGES }, (_, p) => (used.includes(p) ? 1 / used.length : 0));
}

export interface ThreadLatency { thread: number; remoteShare: number; ns: number }
export interface Latency {
  perThread: ThreadLatency[];
  /** Mean latency over the four threads, in ns. */
  mean: number;
  /** Mean remote share over the four threads. */
  remoteShare: number;
  /** mean / LOCAL_NS. */
  slowdown: number;
}

/** The formula: LOCAL_NS (1 - r) + REMOTE_NS r for each thread's remote share r, then the mean over threads. */
export function latency(m: Machine, pattern: Pattern): Latency {
  check(m);
  const perThread = m.sockets.map((socket, thread): ThreadLatency => {
    const w = accessWeights(pattern, thread);
    const remoteShare = w.reduce((sum, x, page) => sum + (m.homes[page] !== socket ? x : 0), 0);
    return { thread, remoteShare, ns: LOCAL_NS * (1 - remoteShare) + REMOTE_NS * remoteShare };
  });
  const mean = perThread.reduce((s, x) => s + x.ns, 0) / THREADS;
  return { perThread, mean, remoteShare: perThread.reduce((s, x) => s + x.remoteShare, 0) / THREADS, slowdown: mean / LOCAL_NS };
}

// ── Placement policies ──────────────────────────────────────────────────

/** One write during initialisation: the socket the writer runs on, and the page. */
export interface Write { socket: Node; page: number }

/** First touch: a page lives on the node of the socket of the first write to it. Every page must be written. */
export function firstTouch(writes: readonly Write[]): Node[] {
  const homes: (Node | undefined)[] = Array.from({ length: PAGES }, () => undefined);
  for (const w of writes) {
    if (w.page < 0 || w.page >= PAGES) throw new RangeError(`Use at most ${PAGES} pages: page ${w.page} does not exist.`);
    if (homes[w.page] === undefined) homes[w.page] = w.socket;
  }
  const unplaced = homes.findIndex((h) => h === undefined);
  if (unplaced >= 0) throw new RangeError(`Page ${unplaced} was never written, so first touch has not placed it.`);
  return homes as Node[];
}

/** The writes of an initialisation: the main thread (on socket 0) fills every page, or each worker fills its own chunk. */
export function initWrites(init: Init, sockets: readonly Node[]): Write[] {
  if (init === 'serial') return Array.from({ length: PAGES }, (_, page) => ({ socket: 0, page }));
  return Array.from({ length: PAGES }, (_, page) => ({ socket: sockets[Math.floor(page / PAGES_PER_THREAD)], page }));
}

export function place(policy: Policy, init: Init, sockets: readonly Node[]): Node[] {
  if (policy === 'interleave') return Array.from({ length: PAGES }, (_, page) => (page % SOCKETS) as Node);
  if (policy === 'bind0') return Array.from({ length: PAGES }, () => 0);
  return firstTouch(initWrites(init, sockets));
}

// ── Streaming bandwidth ─────────────────────────────────────────────────

export interface Bandwidth {
  /** GB/s each thread gets after the link and then the controller. */
  perThread: number[];
  total: number;
  /** What the four threads ask for. */
  demand: number;
  /** Load on each memory controller: what reaches it over its capacity (above 1 is saturated). */
  nodeLoad: [number, number];
  /** Load on the interconnect leaving each node for the other socket. */
  linkLoad: [number, number];
}

/**
 * The proportional model, applied link first and then controller. A thread's demand on a node is THREAD_GBPS times
 * the share of its pages there. Demand that crosses the interconnect (a thread on the other socket) is scaled by
 * min(1, LINK_GBPS / that link's demand); each node's controller then serves what reaches it, scaled by
 * min(1, NODE_GBPS / what reaches it). Queueing delay and coherence traffic are left out.
 */
export function bandwidth(m: Machine): Bandwidth {
  check(m);
  const demand = m.sockets.map((_, t) => {
    const w = accessWeights('own', t);
    return ([0, 1] as const).map((n) => THREAD_GBPS * w.reduce((s, x, page) => s + (m.homes[page] === n ? x : 0), 0));
  });
  const crossing = ([0, 1] as const).map((n) => m.sockets.reduce<number>((s, sock, t) => s + (sock !== n ? demand[t][n] : 0), 0));
  const linkScale = crossing.map((d) => (d > LINK_GBPS ? LINK_GBPS / d : 1));
  const reaching = demand.map((row, t) => row.map((d, n) => (m.sockets[t] !== n ? d * linkScale[n] : d)));
  const atNode = ([0, 1] as const).map((n) => reaching.reduce((s, row) => s + row[n], 0));
  const nodeScale = atNode.map((d) => (d > NODE_GBPS ? NODE_GBPS / d : 1));
  const perThread = reaching.map((row) => row.reduce((s, d, n) => s + d * nodeScale[n], 0));
  return {
    perThread,
    total: perThread.reduce((a, b) => a + b, 0),
    demand: THREADS * THREAD_GBPS,
    nodeLoad: [atNode[0] / NODE_GBPS, atNode[1] / NODE_GBPS],
    linkLoad: [crossing[0] / LINK_GBPS, crossing[1] / LINK_GBPS],
  };
}

export const gbps = (v: number): string => `${decimal(v, 1)} GB/s`;
export const nsText = (ns: number): string => `${decimal(ns, 1)} ns`;

/** Why the initialiser may not matter. */
export const initNote = (policy: Policy): string => (policy === 'first-touch' ? 'Under first touch, whoever writes a page first decides where it lives.' : 'This policy places pages without looking at who writes them, so the initialiser changes nothing here.');
