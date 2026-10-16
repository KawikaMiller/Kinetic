/**
 * mapreduce-batch: the data side of a job, with no clock in it. Split the words, map each word to a record, optionally
 * combine on the mapper, shuffle by hash(key) mod R, sort inside each partition, reduce. Every record carries a
 * running (sum, count) so one reducer serves both jobs: word count adds the sums, the average divides them.
 */
import { fnv1a } from '../../core/hash';

export type JobId = 'wordcount' | 'avglen';
/** Where a mapper's records are merged before the shuffle: not at all, by adding (sum, count), or by averaging them (the broken one). */
export type CombinerId = 'off' | 'sum' | 'naive';

export interface Rec {
  key: string;
  sum: number;
  count: number;
}

export const JOBS: { id: JobId; label: string; what: string }[] = [
  { id: 'wordcount', label: 'Word count', what: 'how many times each word occurs' },
  { id: 'avglen', label: 'Average word length by first letter', what: 'the mean length of the words that start with each letter' },
];

/** What one word becomes in the map step. */
export function mapWord(job: JobId, word: string): Rec {
  return job === 'wordcount' ? { key: word, sum: 1, count: 1 } : { key: word[0], sum: word.length, count: 1 };
}

/** M contiguous splits of the words, as even as possible: the first `n mod m` get one more word. An empty split is allowed. */
export function splitWords(words: readonly string[], m: number): string[][] {
  const base = Math.floor(words.length / m);
  const extra = words.length % m;
  const out: string[][] = [];
  let from = 0;
  for (let i = 0; i < m; i++) {
    const size = base + (i < extra ? 1 : 0);
    out.push(words.slice(from, from + size));
    from += size;
  }
  return out;
}

/** A mapper's local reduce, key by key in order of first appearance. `naive` keeps only each key's average: valid for no reduce but a sum. */
export function combine(recs: readonly Rec[], how: CombinerId): Rec[] {
  if (how === 'off') return [...recs];
  const groups = new Map<string, Rec>();
  for (const r of recs) {
    const g = groups.get(r.key);
    if (g) groups.set(r.key, { key: r.key, sum: g.sum + r.sum, count: g.count + r.count });
    else groups.set(r.key, { ...r });
  }
  return [...groups.values()].map((g) => (how === 'sum' ? g : { key: g.key, sum: g.sum / g.count, count: 1 }));
}

export const partitionOf = (key: string, reducers: number): number => fnv1a(key) % reducers;

/** What a reducer makes of the records it got: one value per key. Word count adds the sums; the average divides them. */
export function reduceRecs(job: JobId, recs: readonly Rec[]): Map<string, number> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const r of recs) {
    const s = sums.get(r.key) ?? { sum: 0, count: 0 };
    sums.set(r.key, { sum: s.sum + r.sum, count: s.count + r.count });
  }
  return new Map([...sums].map(([k, s]) => [k, job === 'wordcount' ? s.sum : s.sum / s.count]));
}

/** The plain single-process answer, written without the record pipeline: the oracle the equality tick compares against. */
export function reference(job: JobId, words: readonly string[]): Map<string, number> {
  if (job === 'wordcount') {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    return counts;
  }
  const lengths = new Map<string, number[]>();
  for (const w of words) lengths.set(w[0], [...(lengths.get(w[0]) ?? []), w.length]);
  return new Map([...lengths].map(([k, ls]) => [k, ls.reduce((a, b) => a + b, 0) / ls.length]));
}

export const EPSILON = 1e-9;
export function sameResult(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  return a.size === b.size && [...a].every(([k, v]) => b.has(k) && Math.abs(b.get(k)! - v) < EPSILON);
}

export interface JobConfig {
  job: JobId;
  combiner: CombinerId;
  words: readonly string[];
  mappers: number;
  reducers: number;
}

export interface Plan extends JobConfig {
  splits: string[][];
  /** What each mapper emits (after its combiner), in order. */
  mapOut: Rec[][];
  /** What each reducer is sent, sorted by key (ties keep their arrival order). */
  parts: Rec[][];
  /** Records that cross the shuffle: the length of every mapper's output together. */
  shuffled: number;
  /** What each reducer produces. */
  reduced: Map<string, number>[];
  /** All reducers' output as one table. */
  result: Map<string, number>;
}

export function plan(c: JobConfig): Plan {
  const splits = splitWords(c.words, c.mappers);
  const mapOut = splits.map((s) => combine(s.map((w) => mapWord(c.job, w)), c.combiner));
  const parts: Rec[][] = Array.from({ length: c.reducers }, () => []);
  for (const out of mapOut) for (const r of out) parts[partitionOf(r.key, c.reducers)].push(r);
  for (const p of parts) p.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const reduced = parts.map((p) => reduceRecs(c.job, p));
  return {
    ...c,
    splits,
    mapOut,
    parts,
    shuffled: mapOut.reduce((n, o) => n + o.length, 0),
    reduced,
    result: new Map(reduced.flatMap((m) => [...m])),
  };
}

/** A table sorted by value (largest first) and then key, for showing. */
export const sortedEntries = (m: ReadonlyMap<string, number>): [string, number][] => [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
