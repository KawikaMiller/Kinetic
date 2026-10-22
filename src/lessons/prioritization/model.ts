/**
 * Prioritisation and cost of delay. Ten INVENTED backlog items, one worker, items done one after another. An item's
 * impact is the value per week it delivers once live, which is also what each week of waiting costs (its cost of delay).
 * Pure and seeded.
 */
import { normal } from '../../core/distributions';
import { snapDragged, type DragSource } from '../../core/plot';
import { mulberry32 } from '../../core/random';

export interface Item {
  id: string;
  label: string;
  /** Value per week once live = cost of delay per week of waiting. */
  impact: number;
  /** Weeks of work. */
  effort: number;
}

export const ITEMS: readonly Item[] = [
  { id: 'signup', label: 'Fix the signup bug', impact: 6, effort: 1 },
  { id: 'csv', label: 'CSV export', impact: 5, effort: 1 },
  { id: 'filters', label: 'Saved filters', impact: 6, effort: 2 },
  { id: 'emails', label: 'Usage emails', impact: 5, effort: 2 },
  { id: 'roles', label: 'Team roles', impact: 6, effort: 3 },
  { id: 'audit', label: 'Audit log', impact: 7, effort: 4 },
  { id: 'onboarding', label: 'New onboarding', impact: 9, effort: 6 },
  { id: 'search', label: 'Search rewrite', impact: 10, effort: 8 },
  { id: 'dark', label: 'Dark mode', impact: 3, effort: 3 },
  { id: 'mobile', label: 'Mobile polish', impact: 4, effort: 4 },
];

export const MAX_ITEMS = 10;
export const SCALE = { min: 0.5, max: 10, step: 0.5 };

/** A dependency: `before` has to be finished before `after` can start. */
export interface Dependency {
  before: string;
  after: string;
}
/** Team roles needs the audit log first, so the ratio order (roles before audit) is not allowed with it on. */
export const DEPENDENCY: Dependency = { before: 'audit', after: 'roles' };

const byId = (items: readonly Item[]) => new Map(items.map((i) => [i.id, i]));

// ---------------------------------------------------------------- placing an item on the plane

export interface Placed {
  impact: number;
  effort: number;
  /** Set when the drop was adjusted: a zero-length item has no ratio. */
  refusal: string | null;
}

/** Turn a dropped point (x is effort in weeks, y is impact) into a legal item: half-step values, effort at least the scale's minimum. With `prev` and `via: 'key'` an arrow nudge moves one step. */
export function placeItem(x: number, y: number, prev?: { impact: number; effort: number }, via?: DragSource): Placed {
  const snap = (v: number) => Math.round(v / SCALE.step) * SCALE.step;
  const clamp = (v: number) => Math.min(SCALE.max, Math.max(SCALE.min, v));
  // An arrow key moves one step per press even though its nudge is smaller than the half-step snap.
  const pick = (next: number, before: number | undefined) => (before === undefined ? snap(next) : snapDragged(before, next, snap, SCALE.step, via));
  const rawEffort = pick(x, prev?.effort);
  const effort = clamp(rawEffort);
  const impact = clamp(pick(y, prev?.impact));
  const refusal = rawEffort < SCALE.min ? `A zero-length item has no ratio: the effort is kept at ${SCALE.min} weeks.` : null;
  return { impact, effort, refusal };
}

// ---------------------------------------------------------------- orders and cost

export type Rule = 'impact' | 'effort' | 'ratio';
export const RULES: { value: Rule; label: string }[] = [
  { value: 'impact', label: 'Highest impact first' },
  { value: 'effort', label: 'Lowest effort first' },
  { value: 'ratio', label: 'Highest impact over effort' },
];

/** Item ids in the order a rule picks, ties keeping the list order. */
export function orderBy(items: readonly Item[], rule: Rule): string[] {
  const key = (i: Item) => (rule === 'impact' ? -i.impact : rule === 'effort' ? i.effort : -i.impact / i.effort);
  return items.map((it, index) => ({ it, index })).sort((a, b) => key(a.it) - key(b.it) || a.index - b.index).map((x) => x.it.id);
}

/** Rank (1 is first) of every item under a rule. */
export function ranksBy(items: readonly Item[], rule: Rule): Record<string, number> {
  return Object.fromEntries(orderBy(items, rule).map((id, i) => [id, i + 1]));
}

/** Finish week of each item when done one after another in this order. */
export function finishTimes(items: readonly Item[], order: readonly string[]): Record<string, number> {
  const lookup = byId(items);
  let t = 0;
  const out: Record<string, number> = {};
  for (const id of order) {
    t += lookup.get(id)!.effort;
    out[id] = t;
  }
  return out;
}

/** Total delay cost: the sum over items of cost of delay times finish week. */
export function delayCost(items: readonly Item[], order: readonly string[]): number {
  const f = finishTimes(items, order);
  return items.reduce((sum, i) => sum + i.impact * f[i.id], 0);
}

/** Value delivered by week `t`: each item earns its impact per week from its finish week on. */
export function valueBy(items: readonly Item[], order: readonly string[], t: number): number {
  const f = finishTimes(items, order);
  return items.reduce((sum, i) => sum + i.impact * Math.max(0, t - f[i.id]), 0);
}

/** First dependency an order breaks, or null. */
export function violation(order: readonly string[], dep: Dependency | null): Dependency | null {
  if (!dep) return null;
  return order.indexOf(dep.before) > order.indexOf(dep.after) ? dep : null;
}

/** The cheapest order that respects a dependency (or none), found exactly by dynamic programming over subsets. */
export function bestOrder(items: readonly Item[], dep: Dependency | null): { order: string[]; cost: number } {
  const n = items.length;
  const index = new Map(items.map((i, k) => [i.id, k]));
  const need = items.map((i) => (dep && dep.after === i.id ? 1 << index.get(dep.before)! : 0));
  const size = 1 << n;
  const workOf = new Float64Array(size);
  for (let m = 1; m < size; m++) {
    const low = Math.log2(m & -m);
    workOf[m] = workOf[m & (m - 1)] + items[low].effort;
  }
  const best = new Float64Array(size).fill(Infinity);
  const last = new Int8Array(size).fill(-1);
  best[0] = 0;
  for (let m = 1; m < size; m++) {
    for (let k = 0; k < n; k++) {
      if (!(m & (1 << k))) continue;
      const rest = m & ~(1 << k);
      if ((need[k] & rest) !== need[k] || best[rest] === Infinity) continue;
      const cost = best[rest] + items[k].impact * workOf[m];
      if (cost < best[m]) {
        best[m] = cost;
        last[m] = k;
      }
    }
  }
  const order: string[] = [];
  for (let m = size - 1; m > 0; m &= ~(1 << last[m])) order.unshift(items[last[m]].id);
  return { order, cost: best[size - 1] };
}

export interface Swap {
  /** The item that was ahead and moves behind. */
  ahead: string;
  /** The item that moves up. */
  behind: string;
  /** Delay cost removed by this swap: impact(behind) x effort(ahead) - impact(ahead) x effort(behind). */
  saved: number;
}

/** Adjacent swaps (bubble sort by ratio) that turn an order into the ratio order, each with the cost it removes. */
export function swapsToRatioOrder(items: readonly Item[], order: readonly string[]): Swap[] {
  const lookup = byId(items);
  const o = [...order];
  const out: Swap[] = [];
  const ratio = (id: string) => lookup.get(id)!.impact / lookup.get(id)!.effort;
  for (let again = true; again; ) {
    again = false;
    for (let i = 0; i + 1 < o.length; i++) {
      const [a, b] = [lookup.get(o[i])!, lookup.get(o[i + 1])!];
      if (ratio(b.id) > ratio(a.id)) {
        out.push({ ahead: a.id, behind: b.id, saved: b.impact * a.effort - a.impact * b.effort });
        [o[i], o[i + 1]] = [o[i + 1], o[i]];
        again = true;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- when the numbers are ranges

export const RUNS = 5000;
export const SPREAD = { min: 0, max: 0.6, step: 0.1 };
export const RANGES_DEFAULT = { sigma: 0.3, seed: 12 };
/** Two top items are a "close call" when their chances of ranking first differ by less than this. */
export const CLOSE_CALL = 0.1;

export interface RankStats {
  /** probability[item][rank - 1]: the share of runs in which the item took that rank. */
  probability: Record<string, number[]>;
  /** 5th and 95th percentile rank of each item. */
  interval: Record<string, [number, number]>;
  first: Record<string, number>;
}

/** Each run draws impact and effort log-normally around the plan, then ranks the items by impact over effort. */
export function simulateRanks(items: readonly Item[], sigma: number, seed: number, runs = RUNS): RankStats {
  const rnd = mulberry32(seed);
  const n = items.length;
  const counts = Object.fromEntries(items.map((i) => [i.id, new Array<number>(n).fill(0)]));
  for (let r = 0; r < runs; r++) {
    const drawn = items.map((i) => ({ id: i.id, ratio: (i.impact * Math.exp(sigma * normal(rnd))) / (i.effort * Math.exp(sigma * normal(rnd))) }));
    drawn.sort((a, b) => b.ratio - a.ratio);
    drawn.forEach((d, k) => counts[d.id][k]++);
  }
  const probability = Object.fromEntries(items.map((i) => [i.id, counts[i.id].map((c) => c / runs)]));
  /** The 5th and 95th percentile rank: the first rank where the running share reaches 5% and 95%. */
  const interval = Object.fromEntries(
    items.map((i) => {
      let acc = 0;
      let lo = 0;
      let hi = 0;
      counts[i.id].forEach((c, k) => {
        acc += c / runs;
        if (lo === 0 && acc >= 0.05) lo = k + 1;
        if (hi === 0 && acc >= 0.95) hi = k + 1;
      });
      return [i.id, [lo, hi || n] as [number, number]];
    }),
  );
  return { probability, interval, first: Object.fromEntries(items.map((i) => [i.id, probability[i.id][0]])) };
}

/** The two items most likely to rank first, and whether they are a close call. */
export function topTwo(stats: RankStats): { top: string; second: string; gap: number; close: boolean } {
  const ranked = Object.entries(stats.first).sort((a, b) => b[1] - a[1]);
  const gap = ranked[0][1] - ranked[1][1];
  return { top: ranked[0][0], second: ranked[1][0], gap, close: gap < CLOSE_CALL };
}

// ---------------------------------------------------------------- the capacity line

export const CAPACITY = { min: 4, max: 34, step: 1, default: 13 };

/** The ratio order cut at the first item that does not fit: what is "this quarter" at a capacity in weeks. */
export function withinCapacity(items: readonly Item[], capacity: number): string[] {
  const lookup = byId(items);
  const out: string[] = [];
  let used = 0;
  for (const id of orderBy(items, 'ratio')) {
    used += lookup.get(id)!.effort;
    if (used > capacity) break;
    out.push(id);
  }
  return out;
}

export interface Line {
  /** Weeks of work in the chosen set. */
  used: number;
  /** Value per week once everything chosen is live. */
  value: number;
  /** Cost of delay per week of everything left out: the price of "not this quarter". */
  cutCost: number;
}

export function lineOf(items: readonly Item[], chosen: ReadonlySet<string>): Line {
  const inside = items.filter((i) => chosen.has(i.id));
  const outside = items.filter((i) => !chosen.has(i.id));
  return {
    used: inside.reduce((s, i) => s + i.effort, 0),
    value: inside.reduce((s, i) => s + i.impact, 0),
    cutCost: outside.reduce((s, i) => s + i.impact, 0),
  };
}

// ---------------------------------------------------------------- scoring frameworks (common practice)

export const FRAMEWORKS: { name: string; inputs: string; note: string }[] = [
  { name: 'RICE', inputs: 'reach, impact, confidence, effort', note: 'reach x impact x confidence / effort; attributed to Intercom, from memory, check the source' },
  { name: 'ICE', inputs: 'impact, confidence, ease', note: 'three scores multiplied or averaged' },
  { name: 'MoSCoW', inputs: 'must, should, could, will not', note: 'buckets, with no order inside a bucket' },
  { name: 'WSJF', inputs: 'cost of delay, job size', note: 'cost of delay over duration: this lesson\'s ratio rule' },
];
