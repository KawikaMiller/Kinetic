/**
 * A simulated measurement: time = base + c x comparisons + noise, with noise drawn from a seeded normal. Nothing here
 * times anything: every number is a draw from a generator the lesson owns.
 */
import { normal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { histogram, type Histogram } from '../../core/stats';

/** Simulated time units; a made-up base cost of a request. */
export const BASE_TIME = 1000;
export const NOISE_SEED = 77;
export const SIGNAL_RANGE = { min: 1, max: 20, step: 1, default: 10 } as const;
export const NOISE_RANGE = { min: 5, max: 200, step: 5, default: 40 } as const;
/** About 95% confidence (two-sided) and 80% power. */
export const Z_CONFIDENCE = 1.96;
export const Z_POWER = 0.84;
/** Byte comparisons executed when the first byte is wrong, and when it is right (the next byte is looked at too). */
export const COMPARISONS_FIRST_WRONG = 1;
export const COMPARISONS_FIRST_RIGHT = 2;
export const HISTOGRAM_SAMPLES = 500;
export const HISTOGRAM_BINS = 36;
export const HISTOGRAM_SPREAD = 4;

export interface NoiseSetting {
  /** Time added by one more byte comparison: the signal. */
  perComparison: number;
  /** Standard deviation of the noise. */
  sigma: number;
}

export const noiseOpening = (): NoiseSetting => ({ perComparison: SIGNAL_RANGE.default, sigma: NOISE_RANGE.default });

export const meanTime = (s: NoiseSetting, comparisons: number) => BASE_TIME + s.perComparison * comparisons;

/** The gap between the two cases: one extra byte comparison. */
export const delta = (s: NoiseSetting) => s.perComparison * (COMPARISONS_FIRST_RIGHT - COMPARISONS_FIRST_WRONG);

/** Observations per case to separate the two means at about 95% confidence and 80% power: n = 2 (1.96 + 0.84)^2 sigma^2 / delta^2. */
export function samplesNeeded(s: NoiseSetting): number {
  return Math.ceil((2 * (Z_CONFIDENCE + Z_POWER) ** 2 * s.sigma ** 2) / delta(s) ** 2);
}

export function sampleTimes(rnd: () => number, s: NoiseSetting, comparisons: number, count: number): number[] {
  const mean = meanTime(s, comparisons);
  return Array.from({ length: count }, () => normal(rnd, mean, s.sigma));
}

export const average = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * One experiment: n observations of each case, then a two-sample z-test with the known sigma. True when it reports a
 * difference (|z| above the 95% threshold).
 */
export function detects(rnd: () => number, s: NoiseSetting, n: number): boolean {
  const a = average(sampleTimes(rnd, s, COMPARISONS_FIRST_WRONG, n));
  const b = average(sampleTimes(rnd, s, COMPARISONS_FIRST_RIGHT, n));
  const z = (b - a) / (s.sigma * Math.sqrt(2 / n));
  return Math.abs(z) > Z_CONFIDENCE;
}

/** The share of seeded experiments, each with n observations per case, that detect the difference. */
export function detectionRate(s: NoiseSetting, n: number, experiments: number, seed: number): number {
  const rnd = mulberry32(seed);
  let hits = 0;
  for (let i = 0; i < experiments; i++) if (detects(rnd, s, n)) hits++;
  return hits / experiments;
}

export interface TimeDistributions {
  wrong: Histogram;
  right: Histogram;
  wrongMean: number;
  rightMean: number;
}

/** The two time distributions of the lesson's plot: 500 seeded draws each, on shared bins. */
export function timeDistributions(s: NoiseSetting): TimeDistributions {
  const wrong = sampleTimes(mulberry32(NOISE_SEED), s, COMPARISONS_FIRST_WRONG, HISTOGRAM_SAMPLES);
  const right = sampleTimes(mulberry32(NOISE_SEED + 1), s, COMPARISONS_FIRST_RIGHT, HISTOGRAM_SAMPLES);
  const min = Math.floor(meanTime(s, COMPARISONS_FIRST_WRONG) - HISTOGRAM_SPREAD * s.sigma);
  const max = Math.ceil(meanTime(s, COMPARISONS_FIRST_RIGHT) + HISTOGRAM_SPREAD * s.sigma);
  const bins = { bins: HISTOGRAM_BINS, min, max };
  return { wrong: histogram(wrong, bins), right: histogram(right, bins), wrongMean: average(wrong), rightMean: average(right) };
}
