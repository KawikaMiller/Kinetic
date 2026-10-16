/** What the scenes draw, as pure functions of the model, plus each scene's opening state. */
import type { TreeNodeMark } from '../../components/TreeSvg';
import { mulberry32 } from '../../core/random';
import type { Frame } from '../../core/types';
import { bytes } from '../../core/format';
import { buildTree, flatten, type HashKind, type MNode } from './merkle';
import { BLOCK_BYTES, HASH_BYTES, REPLICA_LEAVES, baseLeaves, directDiff, expectedComparisons, seededReplicas, type Verdict } from './sync';

export const BUILD_OPEN = { n: 8, rule: 'rfc' as const, selected: 2 };
export const SYNC_OPEN = { seed: 3, edits: 2 };
export const PROOF_OPEN = { n: REPLICA_LEAVES, selected: 5 };
export const TOY_OPEN = { seed: 10, toy: true };
export const MIN_LEAVES = 3;
export const MAX_BUILD_LEAVES = 16;

export const buildLeaves = (n: number): string[] => Array.from({ length: n }, (_, i) => `block ${i}`);

export const nodesById = (tree: MNode): Record<string, MNode> => Object.fromEntries(flatten(tree).map((n) => [n.id, n]));

const covers = (n: MNode, changed: ReadonlySet<number>) => [...changed].some((i) => i >= n.lo && i < n.hi);

/** Scene 1: a changed leaf and every ancestor up to the root are red, everything else green; the changed leaf itself is solid. */
export function changeMark(n: MNode, changed: ReadonlySet<number>): TreeNodeMark {
  if (!covers(n, changed)) return { tone: 'ok', fill: 'tint' };
  return { tone: 'bad', fill: n.left === null && !n.copy ? 'solid' : 'tint' };
}

// ── anti-entropy frames ───────────────────────────────────────────────

export interface SyncFrame extends Frame {
  index: number;
  /** The verdict of each node compared so far. */
  compared: Record<string, Verdict>;
  /** Nodes that were never compared because an ancestor matched. */
  skipped: Set<string>;
  comparisons: number;
  found: number[];
  phase: 'start' | 'round' | 'transfer';
  round: number;
}

/** Round by round, the descent A makes against B: frame 0 before anything, one frame per round of comparisons, a last frame for the transfer. */
export function syncFrames(kind: HashKind, a: readonly string[], b: readonly string[], caption: (f: SyncFrame, totalLeaves: number) => string): SyncFrame[] {
  const ta = nodesById(buildTree(kind, a)!);
  const tb = nodesById(buildTree(kind, b)!);
  const frames: SyncFrame[] = [];
  const compared: Record<string, Verdict> = {};
  const found: number[] = [];
  let comparisons = 0;
  const push = (phase: SyncFrame['phase'], round: number) => {
    const f: SyncFrame = { index: frames.length, compared: { ...compared }, skipped: skippedOf(ta, compared), comparisons, found: [...found].sort((x, y) => x - y), phase, round };
    frames.push({ ...f, say: caption(f, a.length) });
  };
  push('start', 0);
  let frontier = ['r'];
  let round = 0;
  while (frontier.length > 0) {
    round += 1;
    const next: string[] = [];
    for (const id of frontier) {
      comparisons += 1;
      if (ta[id].hash === tb[id].hash) compared[id] = 'same';
      else {
        compared[id] = 'differ';
        if (ta[id].left === null) found.push(ta[id].lo);
        else next.push(`${id}L`, `${id}R`);
      }
    }
    frontier = next;
    push('round', round);
  }
  if (found.length > 0) push('transfer', round);
  return frames;
}

/** Nodes below a node that matched: never compared, never needed. */
function skippedOf(tree: Record<string, MNode>, compared: Record<string, Verdict>): Set<string> {
  const out = new Set<string>();
  const below = (n: MNode) => {
    if (n.left) for (const c of [n.left, n.right!]) {
      out.add(c.id);
      below(c);
    }
  };
  for (const [id, v] of Object.entries(compared)) if (v === 'same') below(tree[id]);
  return out;
}

/** A node's mark in the anti-entropy tree: matching twin green, differing red, skipped dim, not reached yet plain. */
export function syncMark(id: string, f: SyncFrame, collision: ReadonlySet<string> = new Set()): TreeNodeMark | null {
  if (collision.has(id) && f.compared[id] === 'same') return { tone: 'orange', fill: 'solid' };
  const v = f.compared[id];
  if (v === 'same') return { tone: 'ok', fill: 'tint' };
  if (v === 'differ') return { tone: 'bad', fill: 'tint' };
  if (f.skipped.has(id)) return { tone: 'dim', fill: 'tint', tint: 6 };
  return null;
}

/** Nodes compared as the same although their 256-bit hashes differ: a collision of the toy hash. */
export function collisionNodes(kind: HashKind, a: readonly string[], b: readonly string[]): Set<string> {
  if (kind === 'sha256') return new Set();
  const [ta, tb, fa, fb] = [nodesById(buildTree(kind, a)!), nodesById(buildTree(kind, b)!), nodesById(buildTree('sha256', a)!), nodesById(buildTree('sha256', b)!)];
  return new Set(Object.keys(ta).filter((id) => ta[id].hash === tb[id].hash && fa[id].hash !== fb[id].hash));
}

// ── edits ─────────────────────────────────────────────────────────────

/** `k` distinct positions of `n` chosen from a seed. */
export function pickPositions(seed: number, k: number, n = REPLICA_LEAVES): Set<number> {
  const rnd = mulberry32(seed * 7919 + k);
  const out = new Set<number>();
  while (out.size < Math.min(k, n)) out.add(Math.floor(rnd() * n));
  return out;
}

/** B's leaves with the given positions changed. */
export function replicaB(edits: ReadonlySet<number>, n = REPLICA_LEAVES): string[] {
  const b = baseLeaves(n);
  for (const p of edits) b[p] = `key range ${p}, version 2`;
  return b;
}

export const toggleEdit = (edits: ReadonlySet<number>, i: number): Set<number> => {
  const next = new Set(edits);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  return next;
};

/** The sizes in bytes: everything sent the naive way, and what anti-entropy sends (hashes compared plus the changed blocks). */
export function bytesSent(n: number, comparisons: number, transferred: number) {
  const naive = n * BLOCK_BYTES;
  const smart = comparisons * HASH_BYTES + transferred * BLOCK_BYTES;
  return { naive, smart, saved: naive - smart };
}

export const sizeText = (n: number) => bytes(n, { iec: true, dp: 1 });

/** Comparisons for each tree size at k differences placed from a seed, for the n-versus-comparisons plot. */
export function comparisonSeries(k: number, seed: number, sizes: readonly number[]): { n: number; comparisons: number }[] {
  return sizes.map((n) => ({ n, comparisons: expectedComparisons(n, pickPositions(seed, k, n)) }));
}

export type Tamper = 'none' | 'leaf' | 'sibling' | 'index';

/** The proof the verifier is handed: with `sibling` tampering, the first sibling hash has its first hex digit changed. */
export function tamperedProof(proof: readonly string[], tamper: Tamper): string[] {
  if (tamper !== 'sibling' || proof.length === 0) return [...proof];
  const first = proof[0];
  return [`${first[0] === '0' ? '1' : '0'}${first.slice(1)}`, ...proof.slice(1)];
}

export const SIZES =[16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
export const seededOf = (seed: number) => seededReplicas(seed);
export const trueDiff = directDiff;
