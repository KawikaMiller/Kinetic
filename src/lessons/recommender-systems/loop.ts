/**
 * The feedback loop: a system that fills each slate by drawing films with probability proportional to
 * 1 + the likes they have collected so far. Users can only rate what they were shown, so a film that
 * is not shown cannot collect likes. The counterfactual runs the identical rule but lets the system learn
 * every user's true like for every film each round, shown or not: the only difference between the two runs
 * is feedback. Exposure inequality is the Gini coefficient of the show counts.
 */
import { mulberry32 } from '../../core/random';
import { gini } from '../../core/stats';
import { ITEMS, USERS } from './data';
import type { Matrix } from './data';

export const ROUNDS = 50;
export const SLATE = 3;
export const EXPLORATION = 0.1;
/** A rating at or above this counts as a like. */
export const LIKE_AT = 4;

/** What the system learns each round: only the likes of the films it showed (the loop), or every user's like for every film (no feedback). */
export type LearnsFrom = 'shown' | 'everyone';

export interface LoopRun {
  exposure: number[];
  /** Gini of the exposure after each round. */
  giniByRound: number[];
  likes: number[];
}

/** Draws `SLATE` distinct films: each slot is a uniform random film with probability `exploration`, else a draw weighted by 1 + likes. */
function drawSlate(rnd: () => number, likes: readonly number[], exploration: number): number[] {
  const slate: number[] = [];
  while (slate.length < SLATE) {
    let item = -1;
    if (rnd() < exploration) {
      item = Math.floor(rnd() * ITEMS);
    } else {
      const weights = likes.map((l, i) => (slate.includes(i) ? 0 : 1 + l));
      let ticket = rnd() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < ITEMS && item < 0; i++) {
        ticket -= weights[i];
        if (ticket <= 0) item = i;
      }
    }
    if (item >= 0 && !slate.includes(item)) slate.push(item);
  }
  return slate;
}

export function simulateLoop(truth: Matrix, seed: number, exploration: number, learnsFrom: LearnsFrom = 'shown', rounds = ROUNDS): LoopRun {
  const rnd = mulberry32(seed * 6151 + 3);
  const likes = new Array<number>(ITEMS).fill(0);
  const exposure = new Array<number>(ITEMS).fill(0);
  const giniByRound: number[] = [];
  for (let round = 0; round < rounds; round++) {
    // the weights are fixed for the round: every user is served from the same state
    const state = [...likes];
    for (let u = 0; u < USERS; u++) {
      for (const item of drawSlate(rnd, state, exploration)) {
        exposure[item]++;
        if (learnsFrom === 'shown' && truth[u][item] >= LIKE_AT) likes[item]++;
      }
      if (learnsFrom === 'everyone') for (let i = 0; i < ITEMS; i++) if (truth[u][i] >= LIKE_AT) likes[i]++;
    }
    giniByRound.push(gini(exposure));
  }
  return { exposure, giniByRound, likes };
}

/** A film's mean true rating over all users. */
export const meanRating = (truth: Matrix, item: number): number => truth.reduce((s, row) => s + row[item], 0) / truth.length;

/** 1-based rank of a film by mean true rating (1 is the best-liked film; ties share the better rank). */
export function ratingRank(truth: Matrix, item: number): number {
  const mine = meanRating(truth, item);
  return 1 + Array.from({ length: ITEMS }, (_, i) => meanRating(truth, i)).filter((m) => m > mine).length;
}

/** The film with the most impressions (the lowest index on a tie). */
export const mostShown = (exposure: readonly number[]): number => exposure.indexOf(Math.max(...exposure));
