/**
 * The two-stage funnel: candidate generation takes the films with the highest dot product p_u . q_i that the
 * user has not rated; a ranker re-scores them with an invented popularity and freshness. The catalogue here
 * has 15 films, so the stages are scaled down from the thousands-then-tens of a real system.
 */
import { mulberry32 } from '../../core/random';
import { ITEMS } from './data';
import type { MfRun } from './mf';
import type { Problem } from './problem';

export const CANDIDATES = 8;
export const SHOWN = 3;
/** The ranker's invented feature score is this much popularity and the rest freshness. */
export const POPULARITY_SHARE_OF_FEATURES = 0.7;

export interface ItemFeatures {
  popularity: number;
  freshness: number;
}

/** Invented popularity and freshness in [0, 1] per film. */
export const itemFeatures = (seed: number): ItemFeatures[] => {
  const rnd = mulberry32(seed * 977 + 5);
  return Array.from({ length: ITEMS }, () => ({ popularity: rnd(), freshness: rnd() }));
};

/** Films the user has not rated, best dot product first (ties go to the lower film index). */
export function candidates(problem: Problem, run: MfRun, user: number, count = CANDIDATES): { item: number; dot: number }[] {
  const unseen = Array.from({ length: ITEMS }, (_, i) => i).filter((i) => problem.seen(user, i) === null);
  return unseen
    .map((item) => ({ item, dot: run.model.predict(user, item) }))
    .sort((a, b) => b.dot - a.dot || a.item - b.item)
    .slice(0, count);
}

export interface Ranked {
  item: number;
  /** Dot product scaled to 0..1 over the candidates. */
  model: number;
  features: number;
  score: number;
}

/** score = (1 - w) model + w features, with the dot product scaled over the candidate list. `weight` is 0 to 1. */
export function rank(cands: readonly { item: number; dot: number }[], features: readonly ItemFeatures[], weight: number): Ranked[] {
  const dots = cands.map((c) => c.dot);
  const lo = Math.min(...dots);
  const hi = Math.max(...dots);
  return cands
    .map((c) => {
      const model = hi === lo ? 0.5 : (c.dot - lo) / (hi - lo);
      const f = features[c.item];
      const fs = POPULARITY_SHARE_OF_FEATURES * f.popularity + (1 - POPULARITY_SHARE_OF_FEATURES) * f.freshness;
      return { item: c.item, model, features: fs, score: (1 - weight) * model + weight * fs };
    })
    .sort((a, b) => b.score - a.score || a.item - b.item);
}
