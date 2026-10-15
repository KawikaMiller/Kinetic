/**
 * count-min-heavy-hitters: the seeded streams (Zipf over a fixed set of items), the exact counts, and runs of a sketch over a stream. Pure.
 *
 * Items are ranks, 0 the most popular; an item's name is `item<rank>`, which is what the sketch hashes.
 */
import { zipfSampler } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { estimate, itemKey, makeFamily, newSketch, update, type Estimator, type Sketch } from './sketch';

export const UNIVERSE = 2_000;
export const MAX_STREAM = 50_000;
export const MIN_STREAM = 500;
export const STREAM_STEP = 500;
export const DEFAULT_STREAM = 20_000;
export const MIN_SKEW = 0.6;
export const MAX_SKEW = 1.6;
export const DEFAULT_SKEW = 1.2;
export const DEFAULT_SEED = 5;
export const TOP_K = 5;
/** The size the scenes open on: what epsilon = delta = 0.01 asks for. */
export const DEFAULT_WIDTH = 272;
export const DEFAULT_DEPTH = 5;
/** The narrowest width the width sliders offer. */
export const MIN_SCENE_WIDTH = 8;

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

export interface ErrorRun {
  w: number;
  d: number;
  n: number;
  counts: Int32Array;
  /** estimate - truth for every rank (can be fractional with the mean estimator). */
  errors: Float64Array;
}

/** How the run is spoiled, for the scene that breaks the sketch: a different estimator, and deletes of things that were never added. */
export interface Variant {
  how: Estimator;
  /** This many distinct never-added items are each deleted once (decremented in every row). */
  ghostDeletes: number;
}
/** How many never-added items the "deletes" variant deletes. */
export const GHOST_DELETES = 300;
export const PLAIN: Variant = { how: 'min', ghostDeletes: 0 };
export const ghostKey = (i: number): number => itemKey(`ghost${i}`);

export function errorRun(stream: readonly number[], w: number, d: number, hashSeed: number, variant: Variant = PLAIN, universe = UNIVERSE): ErrorRun {
  const s = sketchOf(stream, w, d, hashSeed);
  for (let g = 0; g < variant.ghostDeletes; g++) update(s, ghostKey(g), -1);
  const counts = exactCounts(stream, universe);
  const errors = new Float64Array(universe);
  for (let r = 0; r < universe; r++) errors[r] = estimate(s, keyOfRank(r), variant.how) - counts[r];
  return { w, d, n: stream.length, counts, errors };
}

/** Ranks whose error is above `limit`. */
export const overLimit = (run: ErrorRun, limit: number): number => run.errors.reduce((n, e) => n + (e > limit ? 1 : 0), 0);
/** The ranks of the K most frequent items, ties going to the lower rank. */
export function exactTop(counts: Int32Array, k = TOP_K): number[] {
  return Array.from(counts, (c, r) => ({ c, r })).sort((a, b) => b.c - a.c || a.r - b.r).slice(0, k).map((x) => x.r);
}

/** Ranks the sketch estimates below their true count: only a delete of something never added can cause one. */
export const underCount = (run: ErrorRun): number => run.errors.reduce((n, e) => n + (e < 0 ? 1 : 0), 0);
export const overCount = (run: ErrorRun): number => run.errors.reduce((n, e) => n + (e > 0 ? 1 : 0), 0);
