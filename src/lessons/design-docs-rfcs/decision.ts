/**
 * Scene 2: an invented decision (a slow profile page) as options by criteria with authored
 * numbers. A weighted sum over min-max-scaled criteria ranks the options; must-have constraints
 * knock options out; a sweep names the weight at which the winner changes. Pure functions.
 */

export type CriterionId = 'latency' | 'cost' | 'staleness' | 'effort';

export interface Criterion {
  id: CriterionId;
  label: string;
  unit: string;
}

/** Every criterion is lower-is-better. */
export const CRITERIA: readonly Criterion[] = [
  { id: 'latency', label: 'p95 latency', unit: 'ms' },
  { id: 'cost', label: 'Running cost', unit: '$ a month' },
  { id: 'staleness', label: 'Staleness risk', unit: 's' },
  { id: 'effort', label: 'Effort', unit: 'weeks' },
];

export type OptionId = 'nothing' | 'cache' | 'replica' | 'denormalise';

export interface Option {
  id: OptionId;
  name: string;
  values: Readonly<Record<CriterionId, number>>;
}

/** Authored, invented numbers for an invented decision. */
export const OPTIONS: readonly Option[] = [
  { id: 'nothing', name: 'Do nothing', values: { latency: 400, cost: 0, staleness: 0, effort: 0 } },
  { id: 'cache', name: 'Add a cache', values: { latency: 80, cost: 400, staleness: 30, effort: 2 } },
  { id: 'replica', name: 'Add a read replica', values: { latency: 140, cost: 1500, staleness: 2, effort: 4 } },
  { id: 'denormalise', name: 'Denormalise the profile tables', values: { latency: 60, cost: 200, staleness: 5, effort: 6 } },
];

export const optionOf = (id: OptionId): Option => OPTIONS.find((o) => o.id === id)!;

export type Weights = Readonly<Record<CriterionId, number>>;

/** The weights the scene opens on: latency matters most. Whole percentages. */
export const OPENING_WEIGHTS: Weights = { latency: 40, cost: 20, staleness: 20, effort: 20 };

export const weightTotal = (w: Weights): number => CRITERIA.reduce((s, c) => s + w[c.id], 0);

/** Weights as shares that sum to 1, or null when they are all zero (refused). */
export function normalise(w: Weights): Weights | null {
  const total = weightTotal(w);
  if (total <= 0) return null;
  return Object.fromEntries(CRITERIA.map((c) => [c.id, w[c.id] / total])) as Weights;
}

/** Min-max scale one criterion over every option: 1 for the lowest value, 0 for the highest, 1 for all when they are equal. Lower is better. */
export function scaled(c: CriterionId, v: number): number {
  const xs = OPTIONS.map((o) => o.values[c]);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return hi === lo ? 1 : (hi - v) / (hi - lo);
}

export type ConstraintId = 'staleness' | 'effort' | 'cost';

export interface Constraint {
  id: ConstraintId;
  label: string;
  /** The option must be at or under this on `criterion`. */
  criterion: CriterionId;
  limit: number;
}

export const CONSTRAINTS: readonly Constraint[] = [
  { id: 'staleness', label: 'staleness ≤ 5 s', criterion: 'staleness', limit: 5 },
  { id: 'effort', label: 'effort ≤ 4 weeks', criterion: 'effort', limit: 4 },
  { id: 'cost', label: 'cost ≤ $1,000 a month', criterion: 'cost', limit: 1000 },
];

/** The constraints an option breaks, among the ones switched on. */
export const violated = (o: Option, on: readonly ConstraintId[]): Constraint[] =>
  CONSTRAINTS.filter((c) => on.includes(c.id) && o.values[c.criterion] > c.limit);

export interface Ranked {
  option: Option;
  score: number;
  /** The constraints that knock it out; empty when it is still in the running. */
  knockedOut: Constraint[];
}

/** Score of one option under (already normalised) weights. */
export const scoreOf = (o: Option, shares: Weights): number => CRITERIA.reduce((s, c) => s + shares[c.id] * scaled(c.id, o.values[c.id]), 0);

/**
 * Rank the options: those still in the running by score, best first, ties in table order, then
 * the knocked-out ones. Null when the weights are all zero.
 */
export function rank(w: Weights, on: readonly ConstraintId[]): Ranked[] | null {
  const shares = normalise(w);
  if (!shares) return null;
  const all = OPTIONS.map((option, i) => ({ option, i, score: scoreOf(option, shares), knockedOut: violated(option, on) }));
  const inRace = all.filter((r) => r.knockedOut.length === 0).sort((a, b) => b.score - a.score || a.i - b.i);
  const out = all.filter((r) => r.knockedOut.length > 0);
  return [...inRace, ...out].map(({ option, score, knockedOut }) => ({ option, score, knockedOut }));
}

/** The best option still in the running, or null when nothing is. */
export function winner(w: Weights, on: readonly ConstraintId[]): Option | null {
  const r = rank(w, on);
  return r && r[0] && r[0].knockedOut.length === 0 ? r[0].option : null;
}

// ── Where does the decision flip? ────────────────────────────────────────

/** Weight steps scanned from 0 to 1. */
export const SWEEP_STEP = 0.01;
export const SWEEP_STEPS = 100;

/** The weights when criterion `c` has share `share` and the other three keep their proportions (equal shares if they were all zero). */
export function withShare(w: Weights, c: CriterionId, share: number): Weights {
  const others = CRITERIA.filter((x) => x.id !== c);
  const otherTotal = others.reduce((s, x) => s + w[x.id], 0);
  return Object.fromEntries(
    CRITERIA.map((x) => [x.id, x.id === c ? share : (1 - share) * (otherTotal > 0 ? w[x.id] / otherTotal : 1 / others.length)]),
  ) as Weights;
}

export interface Flip {
  /** The weight on the swept criterion at which the winner changes: the first scanned value with the new winner. */
  at: number;
  from: OptionId | null;
  to: OptionId | null;
}

/** Scan the weight of one criterion from 0 to 1 in 0.01 steps and name every weight where the winner changes. */
export function sweepFlips(w: Weights, c: CriterionId, on: readonly ConstraintId[]): Flip[] {
  const flips: Flip[] = [];
  let previous = winner(withShare(w, c, 0), on)?.id ?? null;
  for (let k = 1; k <= SWEEP_STEPS; k++) {
    const share = k * SWEEP_STEP;
    const now = winner(withShare(w, c, share), on)?.id ?? null;
    if (now !== previous) flips.push({ at: Math.round(share * 100) / 100, from: previous, to: now });
    previous = now;
  }
  return flips;
}
