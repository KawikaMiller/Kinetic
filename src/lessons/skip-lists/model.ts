/**
 * A skip list, computed live. Level 0 is the plain sorted linked list; a tower of height h takes
 * part in levels 0..h-1. Search starts at the head on the top level, moves right while the next key
 * is smaller than the target and drops a level when it would overshoot; one move or one drop is
 * one step. Heights come from coin flips, which the caller supplies so a replay is exact.
 */
import { mean } from '../../core/sim';
import { mulberry32, type Rnd } from '../../core/random';

/** Taller towers are cut off here (Pugh's analysis uses a cap near log n; the lesson states it on screen). */
export const LEVEL_CAP = 16;

export const HEAD = 'head' as const;
/** Where a search token sits: the head, or the tower with this key. */
export type Pos = number | typeof HEAD;

export interface Tower {
  key: number;
  height: number;
  /** Forward pointer per level, 0..height-1: the next key at that level, or null for nil. */
  next: (number | null)[];
}

/** An immutable picture of the list: the head's pointers and the towers in key order. */
export interface Snapshot {
  head: (number | null)[];
  towers: Tower[];
  /** Levels drawn: the tallest tower (at least 1). */
  levels: number;
}

export type SearchEvent =
  | { kind: 'move'; from: Pos; to: number; level: number }
  /** Dropped from `level` to `level - 1` at `at`; `saw` is the next key at `level` that stopped it (null = nil). */
  | { kind: 'drop'; at: Pos; level: number; saw: number | null };

export interface SearchResult {
  found: boolean;
  /** The last node with a key below the target (the head when none is). */
  pred: Pos;
  /** What follows `pred` at level 0: the target when found, else the next larger key or null. */
  candidate: number | null;
  moves: number;
  drops: number;
  /** moves + drops */
  steps: number;
  /** Key comparisons against the target: one per non-nil next pointer looked at. */
  comparisons: number;
  events: SearchEvent[];
  /** update[l]: the last node at level l below the target (where an insert links in). */
  update: Pos[];
}

export type Rig = 'fair' | 'tails' | 'heads';

export interface Flips {
  height: number;
  /** true = heads, in the order flipped (heads promote the tower one level). */
  flips: boolean[];
}

/** Flip until tails: height is 1 + the heads before the first tail, cut off at the cap. A rigged coin is not random. */
export function flipHeight(rnd: Rnd, p: number, rig: Rig = 'fair', cap = LEVEL_CAP): Flips {
  const flips: boolean[] = [];
  let height = 1;
  while (height < cap) {
    const heads = rig === 'heads' ? true : rig === 'tails' ? false : rnd() < p;
    flips.push(heads);
    if (!heads) break;
    height++;
  }
  return { height, flips };
}

export class SkipList {
  private readonly head: (number | null)[] = Array<number | null>(LEVEL_CAP).fill(null);
  private readonly towers = new Map<number, Tower>();

  get size(): number {
    return this.towers.size;
  }

  has(key: number): boolean {
    return this.towers.has(key);
  }

  heightOf(key: number): number {
    return (this.towers.get(key) as Tower).height;
  }

  /** The tallest tower, or 1 for an empty list. */
  get levels(): number {
    let top = 0;
    for (let l = 0; l < LEVEL_CAP; l++) if (this.head[l] !== null) top = l + 1;
    return Math.max(1, top);
  }

  nextOf(pos: Pos, level: number): number | null {
    return pos === HEAD ? this.head[level] : (this.towers.get(pos) as Tower).next[level];
  }

  private setNext(pos: Pos, level: number, to: number | null) {
    if (pos === HEAD) this.head[level] = to;
    else (this.towers.get(pos) as Tower).next[level] = to;
  }

  search(target: number): SearchResult {
    const top = this.levels - 1;
    const events: SearchEvent[] = [];
    const update: Pos[] = Array<Pos>(top + 1).fill(HEAD);
    let cur: Pos = HEAD;
    let moves = 0;
    let drops = 0;
    let comparisons = 0;
    for (let level = top; level >= 0; level--) {
      let saw: number | null;
      for (;;) {
        saw = this.nextOf(cur, level);
        if (saw === null) break;
        comparisons++;
        if (saw >= target) break;
        events.push({ kind: 'move', from: cur, to: saw, level });
        cur = saw;
        moves++;
      }
      update[level] = cur;
      if (level > 0) {
        events.push({ kind: 'drop', at: cur, level, saw });
        drops++;
      }
    }
    const candidate = this.nextOf(cur, 0);
    return { found: candidate === target, pred: cur, candidate, moves, drops, steps: moves + drops, comparisons, events, update };
  }

  /** Link a new tower of `height` into every level it reaches. Throws on a key already present. */
  insert(key: number, height: number, onLink?: (level: number) => void): void {
    if (this.has(key)) throw new Error(`${key} is already in the list`);
    const { update } = this.search(key);
    const tower: Tower = { key, height, next: Array<number | null>(height).fill(null) };
    this.towers.set(key, tower);
    for (let level = 0; level < height; level++) {
      const pred = update[level] ?? HEAD;
      tower.next[level] = this.nextOf(pred, level);
      this.setNext(pred, level, key);
      onLink?.(level);
    }
  }

  remove(key: number, onUnlink?: (level: number) => void): boolean {
    if (!this.has(key)) return false;
    const { update } = this.search(key);
    const tower = this.towers.get(key) as Tower;
    for (let level = 0; level < tower.height; level++) {
      if (this.nextOf(update[level], level) === key) this.setNext(update[level], level, tower.next[level]);
      onUnlink?.(level);
    }
    this.towers.delete(key);
    return true;
  }

  /** Keys in the order level 0 links them. */
  keys(): number[] {
    return this.levelKeys(0);
  }

  /** The keys that level `level` links, from the head. */
  levelKeys(level: number): number[] {
    const out: number[] = [];
    for (let k = this.head[level]; k !== null; ) {
      out.push(k);
      const tower = this.towers.get(k);
      k = tower && level < tower.height ? tower.next[level] : null;
    }
    return out;
  }

  snapshot(): Snapshot {
    const towers = [...this.towers.values()].sort((a, b) => a.key - b.key).map((t) => ({ key: t.key, height: t.height, next: [...t.next] }));
    return { head: [...this.head], towers, levels: this.levels };
  }
}

/** A tower to build: its key and height. */
export interface Entry {
  key: number;
  height: number;
}

/** Build a list by inserting the entries in order (a replay: same input, same towers). */
export function buildList(entries: readonly Entry[]): SkipList {
  const list = new SkipList();
  for (const e of entries) list.insert(e.key, e.height);
  return list;
}

/**
 * Every skip-list rule, recomputed by walking the pointers: level 0 is strictly ascending and holds
 * every key, each level is a sublist of the one below, a tower of height h is on levels 0..h-1 and no
 * others, and heights lie in 1..cap. Empty when the list is valid.
 */
export function checkSkipList(list: SkipList): string[] {
  const problems: string[] = [];
  const snap = list.snapshot();
  let below: number[] | null = null;
  for (let level = 0; level < LEVEL_CAP; level++) {
    const keys = list.levelKeys(level);
    if (keys.some((k, i) => i > 0 && k <= keys[i - 1])) problems.push(`level ${level} is not in ascending order`);
    if (below && !keys.every((k) => below!.includes(k))) problems.push(`level ${level} holds a key that level ${level - 1} lacks`);
    const expected = snap.towers.filter((t) => t.height > level).map((t) => t.key);
    if (keys.join() !== expected.join()) problems.push(`level ${level} links ${keys.join(' ')} but towers of that height are ${expected.join(' ')}`);
    below = keys;
  }
  if (list.levelKeys(0).length !== list.size) problems.push('level 0 does not link every key');
  for (const t of snap.towers) if (t.height < 1 || t.height > LEVEL_CAP) problems.push(`${t.key} has height ${t.height}`);
  return problems;
}

/** Nodes present in both pictures whose forward pointers differ: the head counts when any head pointer moved. */
export function touchedNodes(before: Snapshot, after: Snapshot): Pos[] {
  const out: Pos[] = [];
  const levels = Math.max(before.levels, after.levels);
  if (before.head.slice(0, levels).join() !== after.head.slice(0, levels).join()) out.push(HEAD);
  const old = new Map(before.towers.map((t) => [t.key, t]));
  for (const t of after.towers) {
    const was = old.get(t.key);
    if (was && was.next.join() !== t.next.join()) out.push(t.key);
  }
  return out;
}
/** Pugh's expected search cost, log_{1/p}(n) / p + 1 / (1 - p) (Pugh 1990; quoted from memory, shown as a reference line). */
export const pughCost = (n: number, p: number): number => Math.log(n) / Math.log(1 / p) / p + 1 / (1 - p);

/** Expected pointers per node, 1 / (1 - p): the mean tower height. */
export const expectedPointers = (p: number): number => 1 / (1 - p);

export interface Measured {
  n: number;
  /** Mean steps (moves + drops) of a search for a key in the list, over the sampled searches. */
  meanSteps: number;
  /** Pointers per node, counted from the built towers. */
  pointersPerNode: number;
}

/** Searches sampled per list in the Monte Carlo (keys picked at random from those present). */
export const SAMPLE_SEARCHES = 200;

/** Build one list of keys 1..n with fair coins at probability p and measure it. Same seed, same list. */
export function measureList(n: number, p: number, seed: number): Measured {
  const rnd = mulberry32(seed);
  const list = new SkipList();
  for (let key = 1; key <= n; key++) list.insert(key, flipHeight(rnd, p).height);
  const samples = Math.min(n, SAMPLE_SEARCHES);
  const costs: number[] = [];
  for (let i = 0; i < samples; i++) costs.push(list.search(1 + Math.floor(rnd() * n)).steps);
  const snap = list.snapshot();
  return { n, meanSteps: mean(costs), pointersPerNode: snap.towers.reduce((s, t) => s + t.height, 0) / n };
}

export interface MonteCarlo {
  n: number;
  /** Mean over seeds of each list's mean steps. */
  mean: number;
  /** The worst single list's mean steps over the seeds: the bad luck. */
  worst: number;
  pointers: number;
}

/** Lists of n keys over `seeds` seeds (1..seeds): the mean and the worst luck. */
export function monteCarlo(n: number, p: number, seeds: number): MonteCarlo {
  const runs = Array.from({ length: seeds }, (_, i) => measureList(n, p, i + 1));
  return { n, mean: mean(runs.map((r) => r.meanSteps)), worst: Math.max(...runs.map((r) => r.meanSteps)), pointers: mean(runs.map((r) => r.pointersPerNode)) };
}
