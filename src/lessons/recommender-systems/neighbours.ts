/**
 * User-based collaborative filtering: cosine over the films two users both rated (centred on each user's
 * mean), a minimum overlap, and a prediction from the neighbours who rated the film.
 */
import { cosine } from '../../core/vec';
import { ITEMS, RATING_MAX, RATING_MIN } from './data';
import { TOTAL_USERS, type Problem } from './problem';

export const MIN_OVERLAP_MAX = 6;
export const DEFAULT_MIN_OVERLAP = 2;

const clip = (v: number) => Math.min(RATING_MAX, Math.max(RATING_MIN, v));

export interface UserRatings {
  means: number[];
  /** ratings[u][i] is a rating or null. */
  ratings: (number | null)[][];
}

export function userRatings(problem: Problem): UserRatings {
  const ratings: (number | null)[][] = Array.from({ length: TOTAL_USERS }, (_, u) => Array.from({ length: ITEMS }, (_, i) => problem.seen(u, i)));
  const means = ratings.map((row) => {
    const own = row.filter((r): r is number => r !== null);
    return own.length === 0 ? problem.mean : own.reduce((a, b) => a + b, 0) / own.length;
  });
  return { means, ratings };
}

/** Similarity of two users on their co-rated films, or null when they share fewer than `minOverlap`. */
export function similarity(data: UserRatings, a: number, b: number, minOverlap: number): { sim: number; overlap: number } | null {
  const shared: number[] = [];
  for (let i = 0; i < ITEMS; i++) if (data.ratings[a][i] !== null && data.ratings[b][i] !== null) shared.push(i);
  if (shared.length < minOverlap || shared.length === 0) return null;
  const va = shared.map((i) => data.ratings[a][i]! - data.means[a]);
  const vb = shared.map((i) => data.ratings[b][i]! - data.means[b]);
  const c = cosine(va, vb);
  return { sim: Number.isNaN(c) ? 0 : c, overlap: shared.length };
}

export interface Prediction {
  value: number;
  /** Neighbours that voted (positive similarity, enough overlap, rated the film). 0 means the user's mean was used. */
  neighbours: number;
}

/** mean_u + sum_v sim(u, v) (r_vi - mean_v) / sum |sim(u, v)| over the neighbours with positive similarity who rated i. */
export function predictCell(data: UserRatings, user: number, item: number, minOverlap: number): Prediction {
  let num = 0;
  let den = 0;
  let neighbours = 0;
  for (let v = 0; v < TOTAL_USERS; v++) {
    const r = data.ratings[v][item];
    if (v === user || r === null) continue;
    const s = similarity(data, user, v, minOverlap);
    if (!s || !(s.sim > 0)) continue;
    num += s.sim * (r - data.means[v]);
    den += Math.abs(s.sim);
    neighbours++;
  }
  return neighbours === 0 ? { value: clip(data.means[user]), neighbours: 0 } : { value: clip(data.means[user] + num / den), neighbours };
}

export interface NeighbourScore {
  rmse: number;
  /** Share of held-out cells that had at least one neighbour. */
  coverage: number;
}

export function scoreNeighbours(problem: Problem, minOverlap: number): NeighbourScore {
  const data = userRatings(problem);
  let sq = 0;
  let covered = 0;
  for (const t of problem.test) {
    const p = predictCell(data, t.user, t.item, minOverlap);
    sq += (p.value - t.truth) ** 2;
    if (p.neighbours > 0) covered++;
  }
  return { rmse: Math.sqrt(sq / problem.test.length), coverage: covered / problem.test.length };
}
