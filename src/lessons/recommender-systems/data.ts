/**
 * The invented ratings: 12 users x 15 films generated from a hidden rank-2 structure plus noise, with
 * about 40% of the cells observed. The hidden truth (every cell) is what held-out error is measured against.
 */
import { gaussian } from '../../core/fixtures/datasets';
import { mulberry32 } from '../../core/random';

export const USERS = 12;
export const ITEMS = 15;
export const TRUE_RANK = 2;
export const DENSITY = 0.4;
export const DEFAULT_SEED = 6;
/** Scale of the hidden factor product and the noise, in rating points. */
const SIGNAL = 0.9;
const NOISE = 0.3;
const MID = 3;
export const RATING_MIN = 1;
export const RATING_MAX = 5;

export const FILM_TITLES: readonly string[] = [
  'Lantern Hill', 'Salt Road', 'The Quiet Engine', 'Paper Tigers', 'Night Ferry', 'Glass Orchard', 'Cold Harbour', 'Velvet Static',
  'Iron Meadow', 'Small Hours', 'The Last Cartographer', 'Echo Park Blues', 'Marrow', 'Sundial', 'Bright Wires',
];

export type Matrix = readonly (readonly number[])[];

export interface Hidden {
  /** Every cell's rating, 1 to 5. */
  truth: Matrix;
  userFactors: readonly (readonly number[])[];
  itemFactors: readonly (readonly number[])[];
}

const clampRating = (v: number) => Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(v)));

/** Hidden structure: rating = 3 + 0.9 p . q + noise, rounded and clipped to 1..5. `noise` of 0 makes the matrix exactly rank 2 before rounding. */
export function generate(seed: number, users = USERS, items = ITEMS, noise = NOISE): Hidden {
  const rnd = mulberry32(seed);
  const userFactors = Array.from({ length: users }, () => Array.from({ length: TRUE_RANK }, () => gaussian(rnd)));
  const itemFactors = Array.from({ length: items }, () => Array.from({ length: TRUE_RANK }, () => gaussian(rnd)));
  const truth = userFactors.map((p) =>
    itemFactors.map((q) => clampRating(MID + SIGNAL * p.reduce((s, x, k) => s + x * q[k], 0) + noise * gaussian(rnd))),
  );
  return { truth, userFactors, itemFactors };
}

/** Which cells are observed: each with probability DENSITY, then every user gets at least 3 and every film at least 2. */
export function observedMask(seed: number, users = USERS, items = ITEMS, density = DENSITY): boolean[][] {
  const rnd = mulberry32(seed * 7 + 101);
  const mask = Array.from({ length: users }, () => Array.from({ length: items }, () => rnd() < density));
  for (let u = 0; u < users; u++) {
    while (mask[u].filter(Boolean).length < 3) mask[u][Math.floor(rnd() * items)] = true;
  }
  for (let i = 0; i < items; i++) {
    while (mask.filter((row) => row[i]).length < 2) mask[Math.floor(rnd() * users)][i] = true;
  }
  return mask;
}

export interface Dataset extends Hidden {
  seed: number;
  observed: boolean[][];
}

export const dataset = (seed = DEFAULT_SEED): Dataset => ({ seed, ...generate(seed), observed: observedMask(seed) });

export const countObserved = (observed: readonly (readonly boolean[])[]): number => observed.reduce((s, row) => s + row.filter(Boolean).length, 0);
