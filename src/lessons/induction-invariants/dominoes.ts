/**
 * Scene 1: induction as falling dominoes. Domino k is the statement P(k). The base case
 * knocks over domino 1; the inductive step says domino k knocks over domino k + 1. The
 * learner's toggles say which parts they claim to have proven; the run then checks the step
 * for real at every k, so a step that only *looks* proven is caught where it breaks.
 */

export type DominoClaim = 'odd' | 'horses';
export const DOMINOES = 12;

/** 1 + 3 + … + (2n − 1), added up term by term. */
export function oddSum(n: number): number {
  let s = 0;
  for (let i = 1; i <= n; i++) s += 2 * i - 1;
  return s;
}

/** P(1). Odd sums: 1 = 1². Horses: one horse has one colour. Both are true. */
export function baseHolds(claim: DominoClaim): boolean {
  return claim === 'odd' ? oddSum(1) === 1 : true;
}

/**
 * Does the step's argument actually work from k to k + 1?
 * - Odd sums: k² + (2k + 1) = (k + 1)², checked numerically.
 * - Horses: remove one horse, the other k match; remove another, those k match; the two
 *   groups share k − 1 horses, and the argument needs at least one shared horse to tie the
 *   colours together. So it works only for k ≥ 2.
 */
export function stepHolds(claim: DominoClaim, k: number): boolean {
  if (claim === 'odd') return k * k + (2 * k + 1) === (k + 1) * (k + 1);
  return horseOverlap(k) >= 1;
}

/** Horses shared by "all but the last" and "all but the first" of k + 1 horses. */
export const horseOverlap = (k: number) => k - 1;

export type Stop =
  | { kind: 'all' }
  | { kind: 'no-base' }
  | { kind: 'no-step' }
  /** The step from `at` to `at + 1` doesn't actually follow. */
  | { kind: 'gap'; at: number };

export interface DominoRun {
  fallen: number;
  stop: Stop;
}

/** How far the dominoes fall, given what the learner claims is proven. */
export function dominoRun(claim: DominoClaim, baseProven: boolean, stepProven: boolean, n = DOMINOES): DominoRun {
  if (!baseProven) return { fallen: 0, stop: { kind: 'no-base' } };
  if (!baseHolds(claim)) return { fallen: 0, stop: { kind: 'no-base' } };
  let fallen = 1;
  for (let k = 1; k < n; k++) {
    if (!stepProven) return { fallen, stop: { kind: 'no-step' } };
    if (!stepHolds(claim, k)) return { fallen, stop: { kind: 'gap', at: k } };
    fallen = k + 1;
  }
  return { fallen, stop: { kind: 'all' } };
}

/** Which L-shaped layer (1-based) of an n × n square a cell belongs to: layer k holds 2k − 1 cells. */
export const layerOf = (r: number, c: number) => Math.max(r, c) + 1;
