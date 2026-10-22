/**
 * count-min-heavy-hitters: the lesson's stream sizes and defaults, and runs of a sketch that is broken on purpose. The streams, exact counts and the sketch itself are in `core/countMin`. Pure.
 */
import { estimate, itemKey, keyOfRank, sketchOf, update, type Estimator, UNIVERSE, exactCounts } from '../../core/countMin';

export const MAX_STREAM = 50_000;
export const MIN_STREAM = 500;
export const STREAM_STEP = 500;
export const DEFAULT_STREAM = 20_000;
export const MIN_SKEW = 0.6;
export const MAX_SKEW = 1.6;
export const DEFAULT_SKEW = 1.2;
export const DEFAULT_SEED = 5;
/** The size the scenes open on: what epsilon = delta = 0.01 asks for. */
export const DEFAULT_WIDTH = 272;
export const DEFAULT_DEPTH = 5;
/** The narrowest width the width sliders offer. */
export const MIN_SCENE_WIDTH = 8;

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
/** Ranks the sketch estimates below their true count: only a delete of something never added can cause one. */
export const underCount = (run: ErrorRun): number => run.errors.reduce((n, e) => n + (e < 0 ? 1 : 0), 0);
export const overCount = (run: ErrorRun): number => run.errors.reduce((n, e) => n + (e > 0 ? 1 : 0), 0);
