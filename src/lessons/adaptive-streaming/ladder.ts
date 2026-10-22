/**
 * Why one file cannot serve everyone: a seeded population of viewers, each with a sustainable bandwidth, meets a ladder
 * of one, three or five renditions. A viewer can play when a rendition fits within SAFETY of their bandwidth, and gets
 * the highest rendition that does. Storage is the sum of the ladder's bitrates over the title's length. Pure; every
 * figure is illustrative (the bandwidth mix is made up).
 */
import { lognormal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { LADDER, SAFETY } from './abr';

export type LadderSize = 1 | 3 | 5;
export const LADDER_SIZES: readonly LadderSize[] = [1, 3, 5];
/** The renditions each ladder keeps, in Mbit/s: one middling file, three spread out, or all five. */
export const LADDERS: Record<LadderSize, readonly number[]> = { 1: [1.6], 3: [0.4, 1.6, 5.0], 5: LADDER };
export const VIEWERS = 5000;
export const TITLE_SECONDS = 7200;
export const SLOW_SHARE = { min: 0, max: 100, step: 10, initial: 30 } as const;
export const POPULATION_SEED = 11;
/** Median bandwidths (Mbit/s) and spread of the two kinds of viewer. */
const SLOW = { median: 1, sigma: 0.6 };
const FAST = { median: 8, sigma: 0.6 };
const MBIT_PER_GB = 8000;

export function population(seed: number, slowSharePercent: number, n = VIEWERS): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const slow = rnd() * 100 < slowSharePercent;
    const k = slow ? SLOW : FAST;
    return lognormal(rnd, Math.log(k.median), k.sigma);
  });
}

/** The highest rung of the ladder within the safety fraction of this bandwidth, or null when even the lowest is too much. */
export function rungFor(ladder: readonly number[], bandwidth: number): number | null {
  let best: number | null = null;
  for (const b of ladder) if (b <= SAFETY * bandwidth && (best === null || b > best)) best = b;
  return best;
}

export interface LadderResult {
  size: LadderSize;
  canPlay: number;
  share: number;
  avgBitrate: number;
  storageGb: number;
}

export function evaluate(size: LadderSize, bandwidths: readonly number[]): LadderResult {
  const ladder = LADDERS[size];
  const rungs = bandwidths.map((bw) => rungFor(ladder, bw)).filter((r): r is number => r !== null);
  return {
    size,
    canPlay: rungs.length,
    share: bandwidths.length ? rungs.length / bandwidths.length : 0,
    avgBitrate: rungs.length ? rungs.reduce((a, b) => a + b, 0) / rungs.length : 0,
    storageGb: (ladder.reduce((a, b) => a + b, 0) * TITLE_SECONDS) / MBIT_PER_GB,
  };
}
