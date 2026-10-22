/**
 * Scene 3: can we even measure this? The standard two-proportion sample size, the time to reach it, and a seeded
 * Monte Carlo of the test at that size. Counts are drawn exactly for small n and from the normal approximation of the
 * binomial for large n (stated on screen).
 */
import { normal, normalCdf, normalQuantile } from '../../core/distributions';
import { parseBoundedInt, type FieldParse } from '../../core/parse';
import { mulberry32, type Rnd } from '../../core/random';

export const RUNS = 5000;
export const POWER_SEED = 17;
export const BASELINE = { min: 1, max: 90, step: 1 };
export const LIFT = { min: 0.5, max: 10, step: 0.5 };
export const ALPHAS = [0.05, 0.01] as const;
export const POWERS = [0.8, 0.9] as const;
export const TRAFFIC = { min: 100, max: 1_000_000 };
export const POWER_DEFAULT = { baseline: 10, lift: 2, alpha: 0.05 as number, power: 0.8 as number, traffic: '2,000' };
/** A test that needs longer than this many days is called long in the caption. */
export const LONG_WINDOW_DAYS = 90;
/** Largest n for which counts are drawn exactly; above it the normal approximation is used. */
const EXACT_LIMIT = 40;

export const parseTraffic = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    ...TRAFFIC,
    thousands: true,
    messages: {
      empty: 'Type visitors a day, as a whole number.',
      invalid: () => 'Type a whole number of visitors a day; commas only between groups of three.',
      tooSmall: () => `Use at least ${TRAFFIC.min} visitors a day.`,
      tooBig: () => `Keep it to ${TRAFFIC.max.toLocaleString('en-US')} visitors a day or fewer.`,
    },
  });

/** The lift must keep both rates inside 0 to 100%; the refusal says which side fails. */
export function checkLift(baseline: number, lift: number): string | null {
  if (baseline + lift > 100) return `${baseline}% plus a ${lift}-point lift would pass 100%: lower the lift or the baseline.`;
  if (baseline - lift < 0) return `${baseline}% minus ${lift} points would go below 0%: lower the lift or raise the baseline.`;
  return null;
}

export interface PowerSpec {
  /** Baseline conversion, in percent. */
  baseline: number;
  /** Absolute lift to detect, in percentage points. */
  lift: number;
  alpha: number;
  power: number;
}

/** n per arm = 2 (z_{alpha/2} + z_beta)^2 pbar (1 - pbar) / delta^2, rounded up. */
export function sampleSize(s: PowerSpec): number {
  const p0 = s.baseline / 100;
  const delta = s.lift / 100;
  const pbar = p0 + delta / 2;
  const z = normalQuantile(1 - s.alpha / 2) + normalQuantile(s.power);
  return Math.ceil((2 * z * z * pbar * (1 - pbar)) / (delta * delta));
}

/** Days to collect n visitors in each of two arms at a daily traffic. */
export const daysToReach = (nPerArm: number, perDay: number): number => (2 * nPerArm) / perDay;

function binomial(rnd: Rnd, n: number, p: number): number {
  if (n <= EXACT_LIMIT) {
    let c = 0;
    for (let i = 0; i < n; i++) if (rnd() < p) c++;
    return c;
  }
  const draw = Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal(rnd));
  return Math.min(n, Math.max(0, draw));
}

/** Share of simulated tests, with a real lift, whose two-sided pooled z-test is significant at alpha. */
export function simulatedPower(s: PowerSpec, n: number, seed: number, runs = RUNS): number {
  const rnd = mulberry32(seed);
  const [p0, p1] = [s.baseline / 100, (s.baseline + s.lift) / 100];
  const zCrit = normalQuantile(1 - s.alpha / 2);
  let hits = 0;
  for (let r = 0; r < runs; r++) {
    const [a, b] = [binomial(rnd, n, p0), binomial(rnd, n, p1)];
    const pooled = (a + b) / (2 * n);
    const se = Math.sqrt(2 * pooled * (1 - pooled) / n);
    if (se > 0 && Math.abs((b - a) / n / se) > zCrit) hits++;
  }
  return hits / runs;
}

/** Power at n per arm by the same normal approximation the sample-size formula inverts (one tail of the two-sided test). */
export function analyticPower(s: PowerSpec, n: number): number {
  const p0 = s.baseline / 100;
  const delta = s.lift / 100;
  const pbar = p0 + delta / 2;
  return normalCdf(delta * Math.sqrt(n / (2 * pbar * (1 - pbar))) - normalQuantile(1 - s.alpha / 2));
}
