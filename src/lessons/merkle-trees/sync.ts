/**
 * Anti-entropy between two replicas, on the distSim harness: replica A asks replica B for the hashes of tree nodes, compares
 * them with its own, and descends only into children whose hashes differ. Every hash comparison is counted.
 */
import { createCluster, type Cluster, type DistNode } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import { buildTree, flatten, type HashKind, type MNode } from './merkle';

export const REPLICA_LEAVES = 16;
/** The size of one key range, for the bytes shown. Illustrative. */
export const BLOCK_BYTES = 1024;
export const HASH_BYTES = 32;
export const MAX_EDITS = 6;
export const SYNC_LATENCY_MS = 2;

export type SyncMsg =
  | { type: 'hashes'; ids: string[] }
  | { type: 'reply'; hashes: Record<string, string> }
  | { type: 'fetch'; leaves: number[] }
  | { type: 'blocks'; blocks: Record<number, string> };

export type Verdict = 'same' | 'differ';

export interface SyncState {
  role: 'a' | 'b';
  leaves: string[];
  comparisons: number;
  rounds: number;
  /** The verdict of each node A compared, by id. */
  compared: Record<string, Verdict>;
  /** The leaf positions A found different. */
  found: number[];
  done: boolean;
}

const hashesOf = (kind: HashKind, leaves: readonly string[]): Record<string, string> => Object.fromEntries(flatten(buildTree(kind, leaves)).map((n) => [n.id, n.hash]));
const nodesOf = (kind: HashKind, leaves: readonly string[]): Record<string, MNode> => Object.fromEntries(flatten(buildTree(kind, leaves)).map((n) => [n.id, n]));

function replicaB(kind: HashKind, leaves: string[]): DistNode<SyncMsg, SyncState> {
  return {
    init: () => undefined,
    onTimer: () => undefined,
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'hashes') {
        const mine = hashesOf(kind, leaves);
        ctx.send(msg.from, { type: 'reply', hashes: Object.fromEntries(m.ids.map((id) => [id, mine[id]])) });
      } else if (m.type === 'fetch') ctx.send(msg.from, { type: 'blocks', blocks: Object.fromEntries(m.leaves.map((i) => [i, leaves[i]])) });
    },
    snapshot: () => ({ role: 'b', leaves: [...leaves], comparisons: 0, rounds: 0, compared: {}, found: [], done: true }),
  };
}

function replicaA(kind: HashKind, leaves: string[]): DistNode<SyncMsg, SyncState> {
  let comparisons = 0;
  let rounds = 0;
  const compared: Record<string, Verdict> = {};
  const found: number[] = [];
  let done = false;
  return {
    init: (ctx) => ctx.setTimer('start', 1),
    onTimer: (ctx) => {
      rounds += 1;
      ctx.send('b', { type: 'hashes', ids: ['r'] });
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'reply') {
        const nodes = nodesOf(kind, leaves);
        const next: string[] = [];
        for (const [id, theirs] of Object.entries(m.hashes)) {
          comparisons += 1;
          const mine = nodes[id];
          if (mine.hash === theirs) compared[id] = 'same';
          else {
            compared[id] = 'differ';
            if (mine.left === null) found.push(mine.lo);
            else next.push(`${id}L`, `${id}R`);
          }
        }
        if (next.length > 0) {
          rounds += 1;
          ctx.send('b', { type: 'hashes', ids: next });
        } else if (found.length > 0) ctx.send('b', { type: 'fetch', leaves: [...found].sort((x, y) => x - y) });
        else done = true;
      } else if (m.type === 'blocks') {
        for (const [i, text] of Object.entries(m.blocks)) leaves[Number(i)] = text;
        done = true;
      }
    },
    snapshot: () => ({ role: 'a', leaves: [...leaves], comparisons, rounds, compared: { ...compared }, found: [...found].sort((x, y) => x - y), done }),
  };
}

export function syncCluster(kind: HashKind, a: readonly string[], b: readonly string[]): Cluster<SyncMsg, SyncState> {
  return createCluster<SyncMsg, SyncState>({ seed: 1, nodes: { a: replicaA(kind, [...a]), b: replicaB(kind, [...b]) }, latency: { min: SYNC_LATENCY_MS, max: SYNC_LATENCY_MS } });
}

export interface SyncResult {
  found: number[];
  comparisons: number;
  rounds: number;
  compared: Record<string, Verdict>;
  /** A's leaves after the sync. */
  after: string[];
  /** The true differences, by a direct comparison of the leaves. */
  truth: number[];
  /** True differences the descent did not find. */
  missed: number[];
  cluster: Cluster<SyncMsg, SyncState>;
}

/** The leaf positions at which two replicas hold different text: the oracle. */
export const directDiff = (a: readonly string[], b: readonly string[]): number[] => a.map((_, i) => i).filter((i) => a[i] !== b[i]);

export function runSync(kind: HashKind, a: readonly string[], b: readonly string[]): SyncResult {
  const cluster = syncCluster(kind, a, b);
  cluster.run();
  const sa = cluster.snapshot().nodes.a.state!;
  const truth = directDiff(a, b);
  return { found: sa.found, comparisons: sa.comparisons, rounds: sa.rounds, compared: sa.compared, after: sa.leaves, truth, missed: truth.filter((i) => !sa.found.includes(i)), cluster };
}

/** Hash comparisons the descent makes for n leaves with these differing positions, from the tree shape alone (no hashing). */
export function expectedComparisons(n: number, diffs: ReadonlySet<number> | readonly number[]): number {
  const set = new Set(diffs);
  const cmp = (lo: number, hi: number): number => {
    const hasDiff = [...set].some((i) => i >= lo && i < hi);
    if (!hasDiff || hi - lo === 1) return 1;
    let k = 1;
    while (k * 2 < hi - lo) k *= 2;
    return 1 + cmp(lo, lo + k) + cmp(lo + k, hi);
  };
  return cmp(0, n);
}

/** The bound: one comparison of the roots, then two children for each differing node on the path of each difference. */
export const comparisonBound = (n: number, k: number) => 1 + 2 * k * Math.ceil(Math.log2(n));

// ── seeded edits ──────────────────────────────────────────────────────

export const baseLeaves = (n: number): string[] => Array.from({ length: n }, (_, i) => `key range ${i}, version 1`);

/** B's copy: the base with k seeded positions changed. */
export function seededReplicas(seed: number, n = REPLICA_LEAVES, kMax = MAX_EDITS): { a: string[]; b: string[]; k: number } {
  const rnd = mulberry32(seed);
  const k = 1 + Math.floor(rnd() * kMax);
  const positions = new Set<number>();
  while (positions.size < Math.min(k, n)) positions.add(Math.floor(rnd() * n));
  const a = baseLeaves(n);
  const b = [...a];
  for (const p of positions) b[p] = `key range ${p}, version 2`;
  return { a, b, k: positions.size };
}

/** The same descent run directly on two trees, with no messages: the leaves it finds and the comparisons it makes. */
export function findDiffs(kind: HashKind, a: readonly string[], b: readonly string[]): { found: number[]; comparisons: number } {
  const ta = nodesOf(kind, a);
  const tb = nodesOf(kind, b);
  const found: number[] = [];
  let comparisons = 0;
  let frontier = ['r'];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      comparisons += 1;
      if (ta[id].hash === tb[id].hash) continue;
      if (ta[id].left === null) found.push(ta[id].lo);
      else next.push(`${id}L`, `${id}R`);
    }
    frontier = next;
  }
  return { found: found.sort((x, y) => x - y), comparisons };
}

export const SYNC_SEEDS = Array.from({ length: 200 }, (_, i) => i);
/** On how many of the 200 seeds the descent with this hash misses a real difference. */
export const missSeedCount = (kind: HashKind): number => SYNC_SEEDS.filter((s) => { const r = seededReplicas(s); return findDiffs(kind, r.a, r.b).found.length !== directDiff(r.a, r.b).length; }).length;
/** The lowest seed of 0..199 on which the descent with this hash misses a real difference. */
export const lowestMiss = (kind: HashKind): number | undefined => SYNC_SEEDS.find((seed) => { const r = seededReplicas(seed); return runSync(kind, r.a, r.b).missed.length > 0; });
