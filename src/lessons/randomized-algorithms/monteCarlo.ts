import { mulberry32 } from '../../core/random';

/** Probability that a dart lands inside the quarter circle: pi / 4. */
const HIT_PROBABILITY = Math.PI / 4;

/** The standard error of the dartboard estimate of pi after n darts: 4 * sqrt(p (1 - p) / n) with p = pi / 4. */
export const standardError = (n: number): number => 4 * Math.sqrt((HIT_PROBABILITY * (1 - HIT_PROBABILITY)) / n);

/** The expected absolute error of a normal estimate with that standard deviation: sigma * sqrt(2 / pi). */
export const expectedAbsError = (n: number): number => standardError(n) * Math.sqrt(2 / Math.PI);

export const MIN_EXP = 4;
export const MAX_EXP = 14;
export const DART_RUNS = 200;
export const MAX_DRAWN = 1500;

export interface Dart {
  x: number;
  y: number;
  inside: boolean;
}

/** The first `count` darts of a seeded stream. */
export function darts(seed: number, count: number): Dart[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const x = rnd();
    const y = rnd();
    return { x, y, inside: x * x + y * y <= 1 };
  });
}

export interface Checkpoint {
  n: number;
  estimate: number;
  error: number;
}

/** One seeded run of 2^MAX_EXP darts, read off at n = 2^MIN_EXP, 2^(MIN_EXP + 1), ... 2^MAX_EXP. */
export function runCheckpoints(seed: number): Checkpoint[] {
  const rnd = mulberry32(seed);
  const out: Checkpoint[] = [];
  let inside = 0;
  let nextExp = MIN_EXP;
  for (let i = 1; i <= 2 ** MAX_EXP; i++) {
    const x = rnd();
    const y = rnd();
    if (x * x + y * y <= 1) inside++;
    if (i === 2 ** nextExp) {
      const estimate = (4 * inside) / i;
      out.push({ n: i, estimate, error: Math.abs(estimate - Math.PI) });
      nextExp++;
    }
  }
  return out;
}

/** The mean absolute error at each checkpoint over `runs` independent seeded runs (seeds seed, seed + 1, ...). */
export function meanAbsErrors(seed: number, runs: number = DART_RUNS): { n: number; error: number }[] {
  const totals = new Array<number>(MAX_EXP - MIN_EXP + 1).fill(0);
  for (let r = 0; r < runs; r++) runCheckpoints(seed + 1 + r).forEach((c, k) => (totals[k] += c.error));
  return totals.map((t, k) => ({ n: 2 ** (MIN_EXP + k), error: t / runs }));
}
