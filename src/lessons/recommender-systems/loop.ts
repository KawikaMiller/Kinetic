/**
 * The feedback loop: a system that recommends the films with the most high ratings so far, to users who
 * can only rate what they were shown. With no exploration the early leaders keep the exposure; random
 * slots let other films collect ratings. Exposure inequality is the Gini coefficient of the show counts.
 */
import { mulberry32 } from '../../core/random';
import { ITEMS, USERS } from './data';
import type { Matrix } from './data';

export const ROUNDS = 50;
export const SLATE = 3;
export const EXPLORATION = 0.1;
/** A rating at or above this counts as a like. */
export const LIKE_AT = 4;

/** Gini coefficient of non-negative counts: 0 when equal, 1 - 1/n when one item holds everything. */
export function gini(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let sum = 0;
  for (const a of counts) for (const b of counts) sum += Math.abs(a - b);
  return sum / (2 * counts.length * total);
}

/** Share of all impressions that the three most-shown films took. */
export const topShare = (exposure: readonly number[]): number => [...exposure].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / exposure.reduce((a, b) => a + b, 0);

export interface LoopRun {
  exposure: number[];
  /** Gini of the exposure after each round. */
  giniByRound: number[];
  likes: number[];
}

export function simulateLoop(truth: Matrix, seed: number, exploration: number, rounds = ROUNDS): LoopRun {
  const rnd = mulberry32(seed * 6151 + 3);
  const jitter = Array.from({ length: ITEMS }, () => rnd() * 0.01);
  const likes = new Array<number>(ITEMS).fill(0);
  const exposure = new Array<number>(ITEMS).fill(0);
  const giniByRound: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const byScore = Array.from({ length: ITEMS }, (_, i) => i).sort((a, b) => likes[b] + jitter[b] - (likes[a] + jitter[a]) || a - b);
    for (let u = 0; u < USERS; u++) {
      const slate: number[] = [];
      let next = 0;
      while (slate.length < SLATE) {
        let item: number;
        if (rnd() < exploration) {
          item = Math.floor(rnd() * ITEMS);
        } else {
          while (slate.includes(byScore[next])) next++;
          item = byScore[next];
        }
        if (slate.includes(item)) continue;
        slate.push(item);
      }
      for (const item of slate) {
        exposure[item]++;
        if (truth[u][item] >= LIKE_AT) likes[item]++;
      }
    }
    giniByRound.push(gini(exposure));
  }
  return { exposure, giniByRound, likes };
}
