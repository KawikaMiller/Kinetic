/** Captions and verdict sentences, every number from the model on screen. Plain strings, so tests can read them. */
import { flatten, shortHash, type MNode, type OddRule, type Verification } from './merkle';
import { comparisonBound, type SyncResult } from './sync';
import type { SyncFrame } from './view';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const RULE_NAME: Record<OddRule, string> = { rfc: 'split at the largest power of two below n', duplicate: 'duplicate the last node' };

/** Nodes whose hash changed because a leaf under them did. */
export const changedNodes = (tree: MNode, changed: ReadonlySet<number>) => flatten(tree).filter((n) => [...changed].some((i) => i >= n.lo && i < n.hi)).length;

export function buildCaption(tree: MNode, n: number, rule: OddRule, changed: ReadonlySet<number>): string {
  const all = flatten(tree).length;
  const head = `${plural(n, 'leaf', 'leaves')}, ${RULE_NAME[rule]}: ${plural(all, 'hash', 'hashes')}, root ${shortHash(tree.hash)} (4 of 64 hex characters shown).`;
  if (changed.size === 0) return `${head} Click a leaf and edit its text.`;
  const c = changedNodes(tree, changed);
  return `${head} ${plural(changed.size, 'leaf', 'leaves')} edited: ${plural(c, 'hash', 'hashes')} changed on the way to the root, the other ${all - c} did not.`;
}

export function syncCaption(f: SyncFrame, n: number): string {
  if (f.phase === 'start') return `Two replicas of ${n} key ranges. Press play: replica A asks B for hashes, and compares only where the parents differed.`;
  if (f.phase === 'transfer') return `Compared ${plural(f.comparisons, 'pair')} of hashes and found ${plural(f.found.length, 'differing range')}: ${f.found.join(', ')}. Only those are transferred, and then the trees match.`;
  const same = Object.values(f.compared).filter((v) => v === 'same').length;
  const differ = Object.values(f.compared).filter((v) => v === 'differ').length;
  if (differ === 0) return `Round ${f.round}: the roots match after ${plural(f.comparisons, 'comparison')}, so the replicas are equal and nothing is sent.`;
  return `Round ${f.round}: ${plural(f.comparisons, 'comparison')} so far, ${same} matched and ${differ} differed. A matching node settles its whole subtree without looking inside.`;
}

export function syncVerdict(r: SyncResult, n: number, k: number): string {
  const bound = comparisonBound(n, k);
  if (r.missed.length > 0) return `The descent missed ${plural(r.missed.length, 'difference')} (range ${r.missed.join(', ')}) because a differing subtree hashed equal, so the replicas still differ.`;
  return `Found ${plural(r.found.length, 'difference')} in ${plural(r.comparisons, 'comparison')} (the bound for ${plural(k, 'difference')} is ${bound}), against ${n} to compare range by range.`;
}

export function proofCaption(v: Verification, index: number, size: number): string {
  const steps = v.steps.length;
  return v.ok
    ? `Leaf ${index} of ${size}: ${plural(steps, 'sibling hash', 'sibling hashes')} recompute the root, which equals the trusted root.`
    : `Verification failed: ${v.reason}.`;
}

export function toyCaption(toy: boolean, missed: number[], truth: number[], seed: number, missCount: number): string {
  const hash = toy ? 'the toy 8-bit hash' : 'the 256-bit hash';
  if (missed.length === 0) return `Seed ${seed}, ${hash}: all ${plural(truth.length, 'difference')} found (${truth.length === 1 ? 'range' : 'ranges'} ${truth.join(', ')}).`;
  return `Seed ${seed}, ${hash}: ${plural(truth.length, 'range')} differ, the descent found ${truth.length - missed.length} and missed ${plural(missed.length, 'range')} (${missed.join(', ')}). ${missCount} of 200 seeds miss something with this hash.`;
}
