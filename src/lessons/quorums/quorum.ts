/**
 * quorums, scenes 1 and 2: the counting behind "R + W > N", the availability arithmetic, and the order statistics of reply latency.
 */
import { exponential, lognormal, quantile } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { choose } from '../../core/stats';

export const N_RANGE = { min: 3, max: 7 } as const;
export const DEFAULT_N = 5;

export interface QuorumSizes {
  n: number;
  w: number;
  r: number;
}

/** A write set and a read set always share a replica exactly when R + W > N (the pigeonhole principle). */
export const alwaysOverlap = ({ n, w, r }: QuorumSizes): boolean => r + w > n;

/** Pairs (write set, read set) that miss each other: C(N, W) x C(N - W, R) of the C(N, W) x C(N, R) pairs. Exact (BigInt). */
export function missingPairs({ n, w, r }: QuorumSizes): { missing: bigint; total: bigint } {
  return { missing: choose(n, w) * choose(n - w, r), total: choose(n, w) * choose(n, r) };
}

/** The chance that a random read set misses a given write set: C(N - W, R) / C(N, R), as a float. */
export function missProbability({ n, w, r }: QuorumSizes): number {
  const { missing, total } = missingPairs({ n, w, r });
  return Number(missing) / Number(total);
}

/** The replicas a write set and a read set share. */
export const intersection = (writeSet: readonly number[], readSet: readonly number[]): number[] => writeSet.filter((x) => readSet.includes(x));

/** How many replicas can be unreachable before a write (or a read) can no longer gather its quorum. */
export const failuresTolerated = (n: number, quorum: number): number => n - quorum;
export const canGather = (n: number, unreachable: number, quorum: number): boolean => n - unreachable >= quorum;

/** E[k-th fastest of n] for independent exponential latencies of the given rate: (1 / rate) * sum_{i=0}^{k-1} 1 / (n - i). */
export function expectedKthFastest(n: number, k: number, rate = 1): number {
  let sum = 0;
  for (let i = 0; i < k; i++) sum += 1 / (n - i);
  return sum / rate;
}

/** The k-th smallest of a list (k from 1). */
export const kthSmallest = (xs: readonly number[], k: number): number => [...xs].sort((a, b) => a - b)[k - 1];

export const LATENCY_TRIALS = 5000;
/** Log-normal replica latency, in ms: median about 20 ms with a heavy tail (illustrative numbers). */
export const LOGNORMAL = { mu: Math.log(20), sigma: 0.6 } as const;
export const LATENCY_SEED = 11;

export interface WaitStats {
  w: number;
  p50: number;
  p99: number;
}

/** p50 and p99 of the W-th fastest of N log-normal reply times, over `trials` seeded trials, for each W from 1 to N. */
export function waitByQuorum(n: number, seed = LATENCY_SEED, trials = LATENCY_TRIALS): WaitStats[] {
  const rnd = mulberry32(seed);
  const waits: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < trials; t++) {
    const sorted = Array.from({ length: n }, () => lognormal(rnd, LOGNORMAL.mu, LOGNORMAL.sigma)).sort((a, b) => a - b);
    sorted.forEach((x, i) => waits[i].push(x));
  }
  return waits.map((xs, i) => {
    const s = xs.sort((a, b) => a - b);
    return { w: i + 1, p50: quantile(s, 0.5), p99: quantile(s, 0.99) };
  });
}

/** The same expectation by simulation: mean of the k-th fastest of n exponential latencies, and its standard error. */
export function simulateKthFastest(n: number, k: number, trials: number, seed: number, rate = 1): { mean: number; se: number } {
  const rnd = mulberry32(seed);
  const xs = Array.from({ length: trials }, () => kthSmallest(Array.from({ length: n }, () => exponential(rnd, rate)), k));
  const m = xs.reduce((s, x) => s + x, 0) / trials;
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (trials - 1);
  return { mean: m, se: Math.sqrt(variance / trials) };
}
