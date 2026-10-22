/**
 * Shuffle sharding: N workers, and each tenant is given its own random k of them. The exact
 * probabilities come from counting (`choose`); a brute-force enumeration and a seeded Monte Carlo
 * check them in the tests and sit next to them on screen.
 */
import { mulberry32, type Rnd } from '../../core/random';
import { choose } from '../../core/stats';

export const N_RANGE = { min: 4, max: 12 } as const;
export const DEFAULT_N = 8;
export const DEFAULT_K = 2;
export const MONTE_CARLO_SAMPLES = 20_000;

/** The largest k offered for n workers: a tenant gets at most half of them. */
export const maxK = (n: number): number => Math.min(6, Math.floor(n / 2));

/** Ways to give a tenant k of n workers. */
export const assignments = (n: number, k: number): number => Number(choose(n, k));

/** P(another tenant shares at least one worker with the noisy one) = 1 - C(n-k, k) / C(n, k). */
export const exactShare = (n: number, k: number): number => 1 - Number(choose(n - k, k)) / Number(choose(n, k));

/** P(another tenant has exactly the noisy tenant's workers) = 1 / C(n, k): it loses every worker. */
export const exactIdentical = (n: number, k: number): number => 1 / Number(choose(n, k));

/** Every k-subset of 0..n-1, in lexicographic order. */
export function subsets(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === k) {
      out.push(chosen);
      return;
    }
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return out;
}

export interface Overlap {
  /** Assignments that share at least one worker with the noisy tenant's, and all assignments. */
  sharing: number;
  identical: number;
  total: number;
}

/** Counts by looking at every assignment against the noisy tenant's workers (by symmetry, workers 0..k-1). */
export function enumerateOverlap(n: number, k: number): Overlap {
  const all = subsets(n, k);
  return {
    sharing: all.filter((s) => s.some((w) => w < k)).length,
    identical: all.filter((s) => s.every((w) => w < k)).length,
    total: all.length,
  };
}

/** A random k-subset of 0..n-1, sorted. */
export function randomSubset(n: number, k: number, rnd: Rnd): number[] {
  const pool = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rnd() * (n - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k).sort((a, b) => a - b);
}

export interface Estimate {
  samples: number;
  share: number;
  identical: number;
}

/** The share of random assignments that overlap the noisy tenant's workers, and that match them exactly. */
export function monteCarlo(n: number, k: number, samples: number, seed: number): Estimate {
  const rnd = mulberry32(seed);
  let sharing = 0;
  let identical = 0;
  for (let i = 0; i < samples; i++) {
    const s = randomSubset(n, k, rnd);
    if (s.some((w) => w < k)) sharing++;
    if (s.every((w) => w < k)) identical++;
  }
  return { samples, share: sharing / samples, identical: identical / samples };
}
