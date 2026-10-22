/**
 * Seeded item streams for the Count-Min sketch: Zipf draws over a fixed set of items, the exact counts and
 * top-K to compare a sketch against, and a sketch of a whole stream. Pure.
 *
 * Items are ranks, 0 the most popular; an item's name is `item<rank>`, which is what the sketch hashes.
 */
import { zipfSampler } from '../distributions';
import { mulberry32 } from '../random';
import { itemKey, makeFamily, newSketch, update, type Sketch } from './sketch';

export const UNIVERSE = 2_000;
export const TOP_K = 5;

export const itemName = (rank: number): string => `item${rank}`;

const keyCache = new Map<number, number>();
/** The hash key of an item rank, remembered: a stream hashes the same 2,000 names again and again. */
export const keyOfRank = (rank: number): number => {
  let k = keyCache.get(rank);
  if (k === undefined) {
    k = itemKey(itemName(rank));
    keyCache.set(rank, k);
  }
  return k;
};

/** `n` draws from a Zipf distribution over `universe` items, as ranks from 0. */
export function zipfStream(n: number, skew: number, seed: number, universe = UNIVERSE): number[] {
  const draw = zipfSampler(universe, skew);
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => draw(rnd) - 1);
}

/** How many times each rank occurs. */
export function exactCounts(stream: readonly number[], universe = UNIVERSE): Int32Array {
  const counts = new Int32Array(universe);
  for (const r of stream) counts[r]++;
  return counts;
}

/** A sketch of the stream under hash seed `hashSeed`. */
export function sketchOf(stream: readonly number[], w: number, d: number, hashSeed: number): Sketch {
  const s = newSketch(w, d, makeFamily(hashSeed, d));
  for (const r of stream) update(s, keyOfRank(r));
  return s;
}

/** The ranks of the K most frequent items, ties going to the lower rank. */
export function exactTop(counts: Int32Array, k = TOP_K): number[] {
  return Array.from(counts, (c, r) => ({ c, r })).sort((a, b) => b.c - a.c || a.r - b.r).slice(0, k).map((x) => x.r);
}
