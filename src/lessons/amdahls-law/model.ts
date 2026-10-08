// Pure maths behind the amdahls-law lesson. s is the serial fraction of the work (0..1),
// n the number of cores, c an illustrative per-extra-core coordination cost.

/** Amdahl: a fixed job, its serial part unchanged, its parallel part split n ways. */
export const amdahl = (s: number, n: number) => 1 / (s + (1 - s) / n);

/** Gustafson: fixed time, with the parallel part of the work growing with n (scaled speedup). */
export const gustafson = (s: number, n: number) => s + (1 - s) * n;

/** Amdahl's ceiling as n → ∞: 1/s (Infinity when nothing is serial). */
export const ceiling = (s: number) => (s === 0 ? Infinity : 1 / s);

/** Run time of the job (1 on one core) on n cores, plus a coordination cost c per extra core. */
export const runTime = (s: number, n: number, c = 0) => s + (1 - s) / n + c * (n - 1);

/** Speedup with the coordination cost: 1 / (s + (1 − s)/n + c·(n − 1)). */
export const withOverhead = (s: number, n: number, c: number) => 1 / runTime(s, n, c);

/** The core count that minimises run time with overhead: n* = √((1 − s)/c) (Infinity when c = 0). */
export const peakCores = (s: number, c: number) => (c === 0 ? Infinity : Math.sqrt((1 - s) / c));

/** The best whole number of cores in [1, max]: the better neighbour of n*, clamped. */
export function bestWholeCores(s: number, c: number, max: number): number {
  const star = peakCores(s, c);
  if (!Number.isFinite(star)) return max;
  const candidates = [Math.floor(star), Math.ceil(star)].map((k) => Math.min(max, Math.max(1, k)));
  return candidates.reduce((a, b) => (withOverhead(s, b, c) > withOverhead(s, a, c) ? b : a));
}

/** The cores slider: powers of two from 1 to 256. */
export const CORE_STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;
export const MAX_CORES = 256;

/** Preset serial fractions for the overlay curves. */
export const PRESETS = [0.5, 0.1, 0.05, 0.01] as const;

/** How much shorter the run gets going from n to 2n cores (0.5 would be "halves"). */
export const doublingCut = (s: number, n: number) => 1 - runTime(s, 2 * n) / runTime(s, n);
