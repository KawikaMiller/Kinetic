/** The learner's edits to the matrix (hidden cells, ratings for a new user) and the training problem they define. */
import type { Rating } from '../../core/nn';
import { ITEMS, USERS, RATING_MAX, RATING_MIN, type Dataset } from './data';

/** The extra row a learner can fill in: a user with no history. */
export const NEW_USER = USERS;
export const TOTAL_USERS = USERS + 1;

export interface Edits {
  /** Observed cells the learner hid, as "user:item". */
  hidden: readonly string[];
  /** Ratings given as the new user, by film. */
  newUser: Readonly<Record<number, number>>;
}

export const EMPTY_EDITS: Edits = { hidden: [], newUser: {} };
export const cellKey = (user: number, item: number) => `${user}:${item}`;

export function toggleHidden(data: Dataset, edits: Edits, user: number, item: number): Edits {
  if (user >= USERS || !data.observed[user][item]) return edits;
  const key = cellKey(user, item);
  return { ...edits, hidden: edits.hidden.includes(key) ? edits.hidden.filter((k) => k !== key) : [...edits.hidden, key] };
}

/** Rate a film as the new user; the same rating again clears it. Only ratings 1 to 5 and films 0 to 14 are accepted. */
export function rateNewUser(edits: Edits, item: number, rating: number): Edits {
  if (!Number.isInteger(item) || item < 0 || item >= ITEMS || !Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) return edits;
  const next = { ...edits.newUser };
  if (next[item] === rating) delete next[item];
  else next[item] = rating;
  return { ...edits, newUser: next };
}

export interface TestCell {
  user: number;
  item: number;
  truth: number;
}

export interface Problem {
  data: Dataset;
  edits: Edits;
  /** Ratings the model may learn from. */
  train: Rating[];
  /** Cells with a known hidden truth that the model has not seen. */
  test: TestCell[];
  /** Mean training rating: models predict the deviation from it. */
  mean: number;
  /** Rating of a training cell, or null. */
  seen: (user: number, item: number) => number | null;
}

export function buildProblem(data: Dataset, edits: Edits): Problem {
  const hidden = new Set(edits.hidden);
  const train: Rating[] = [];
  const test: TestCell[] = [];
  for (let u = 0; u < USERS; u++) {
    for (let i = 0; i < ITEMS; i++) {
      if (data.observed[u][i] && !hidden.has(cellKey(u, i))) train.push({ user: u, item: i, rating: data.truth[u][i] });
      else test.push({ user: u, item: i, truth: data.truth[u][i] });
    }
  }
  for (const [item, rating] of Object.entries(edits.newUser)) train.push({ user: NEW_USER, item: Number(item), rating });
  const mean = train.reduce((s, r) => s + r.rating, 0) / train.length;
  const lookup = new Map(train.map((r) => [cellKey(r.user, r.item), r.rating]));
  return { data, edits, train, test, mean, seen: (u, i) => lookup.get(cellKey(u, i)) ?? null };
}
