import { parseBoundedDecimal, type FieldParse } from '../../core/parse';

export const B_MIN = 2;
export const B_MAX = 50;
export const B_DEFAULT = 10;
/** Seasons are drawn up to this many buy prices long: N runs from 1 to SEASON_FACTOR x B. */
export const SEASON_FACTOR = 6;
/** Thresholds run from 0 to this many buy prices. */
export const THRESHOLD_FACTOR = 3;
export const TARGET_MIN = 1;
export const TARGET_MAX = 20;
/** The broken mode is counted over season lengths 1 to this many, whatever B is. */
export const WITNESS_HORIZON = 200;
/** The late threshold (buy a day late) at B = 10: season length 11 costs 20 against an optimum of 10. */
export const LATE_THRESHOLD_WITNESS = { B: 10, N: 11 } as const;
/** The exhaustive check covers every buy price from 1 to this value. */
export const CHECKED_B_MAX = 50;
export const MAX_REQUESTS = 60;
export const K_VALUES = [2, 3, 4] as const;
export type CacheSize = (typeof K_VALUES)[number];

/** A ski-rental strategy: rent for `t` days, then buy on day t + 1; `never` rents for the whole season. */
export interface Strategy {
  t: number;
  never: boolean;
}

export const maxSeason = (B: number) => SEASON_FACTOR * B;
export const maxThreshold = (B: number) => THRESHOLD_FACTOR * B;

/** What the online player pays for a season of N days: renting costs 1 a day, buying costs B. */
export function skiCost(s: Strategy, B: number, N: number): number {
  if (s.never) return N;
  return N <= s.t ? N : s.t + B;
}

/** What hindsight pays: rent the whole season or buy on day 1, whichever is cheaper. */
export const opt = (B: number, N: number): number => Math.min(N, B);

export const ratio = (s: Strategy, B: number, N: number): number => skiCost(s, B, N) / opt(B, N);

/** The line the break-even strategy is claimed to stay under: 2 - 1/B. */
export const breakEvenBound = (B: number): number => 2 - 1 / B;
export const breakEven = (B: number): Strategy => ({ t: B - 1, never: false });
export const lateThreshold = (B: number): Strategy => ({ t: B, never: false });

export interface Worst {
  N: number;
  ratio: number;
}

/** The season length (the first one, when several tie) with the highest ratio among N = 1 to SEASON_FACTOR x B. */
export function worstSeason(s: Strategy, B: number): Worst {
  let best: Worst = { N: 1, ratio: ratio(s, B, 1) };
  for (let N = 2; N <= maxSeason(B); N += 1) {
    const r = ratio(s, B, N);
    if (r > best.ratio + 1e-12) best = { N, ratio: r };
  }
  return best;
}

export const worstRatio = (t: number, B: number): number => worstSeason({ t, never: false }, B).ratio;

/** Closed form for t below B: the worst season is N = t + 1, costing t + B against an optimum of t + 1. */
export const worstRatioBelowB = (t: number, B: number): number => (t + B) / (t + 1);

export type Challenge =
  | { ok: true; N: number; ratio: number }
  | { ok: false; N: number; ratio: number; message: string };

const fixed2 = (x: number) => x.toFixed(2);

/** Can the adversary pick a season that reaches the target ratio against this strategy? If not, say what the best is. */
export function challenge(s: Strategy, B: number, target: number): Challenge {
  const horizon = maxSeason(B);
  for (let N = 1; N <= horizon; N += 1) {
    const r = ratio(s, B, N);
    if (r >= target - 1e-9) return { ok: true, N, ratio: r };
  }
  const best = worstSeason(s, B);
  const atBreakEven = s.t === B - 1;
  const exact = atBreakEven ? `2 - 1/${B}` : `${skiCost(s, B, best.N)} / ${opt(B, best.N)}`;
  const why = atBreakEven
    ? `For N above B the ratio stays at (2B - 1) / B, so longer seasons cannot help (read off the formula, not found by search).`
    : `Beyond N = ${s.t + 1} the cost stays at ${s.t + B} while the optimum does not fall, so longer seasons cannot raise the ratio (read off the formula, not found by search).`;
  return {
    ok: false,
    ...best,
    message: `No season length up to ${horizon} reaches ratio ${fixed2(target)} against this strategy: the best is N = ${best.N} at ${fixed2(best.ratio)} = ${exact}. ${why}`,
  };
}

/** The refusal when the learner declares "never buy" competitive: its ratio is N / B once the season passes B. */
export function neverBuyVerdict(B: number): string {
  const N = maxSeason(B);
  return `Never buying is not competitive: at season length ${N} the ratio is ${N} / ${B} = ${(N / B).toFixed(1)}, and it equals N / B, which grows with N, so no fixed ratio bound holds for it (read off the formula).`;
}

/** Worst ratio of every threshold 0 to 3B, for the sweep panel. */
export function thresholdSweep(B: number): { t: number; ratio: number }[] {
  return Array.from({ length: maxThreshold(B) + 1 }, (_, t) => ({ t, ratio: worstRatio(t, B) }));
}

export interface BoundCheck {
  /** Buy prices 1 to maxB were checked. */
  maxB: number;
  /** Every (B, t, N) was at least 2 - 1/B in worst ratio, and equal only at t = B - 1. */
  holds: boolean;
  evaluations: number;
}

/** The exhaustive check behind "within the bound": for B from 1 to maxB, every threshold 0 to 3B and every season 1 to 6B. */
export function checkBound(maxB = CHECKED_B_MAX): BoundCheck {
  let holds = true;
  let evaluations = 0;
  for (let B = 1; B <= maxB; B += 1) {
    for (let t = 0; t <= maxThreshold(B); t += 1) {
      const w = worstRatio(t, B);
      evaluations += maxSeason(B);
      const atLeast = w >= breakEvenBound(B) - 1e-12;
      const equal = Math.abs(w - breakEvenBound(B)) < 1e-12;
      if (!atLeast || equal !== (t === B - 1)) holds = false;
    }
  }
  return { maxB, holds, evaluations };
}

export interface WitnessReport {
  B: number;
  horizon: number;
  /** Season lengths 1 to horizon where the strategy's ratio is above the break-even bound. */
  violations: number;
  firstViolation: Worst | null;
}

/** How often a strategy breaks the break-even bound 2 - 1/B over season lengths 1 to WITNESS_HORIZON. */
export function boundViolations(s: Strategy, B: number): WitnessReport {
  let violations = 0;
  let firstViolation: Worst | null = null;
  for (let N = 1; N <= WITNESS_HORIZON; N += 1) {
    const r = ratio(s, B, N);
    if (r > breakEvenBound(B) + 1e-12) {
      violations += 1;
      firstViolation ??= { N, ratio: r };
    }
  }
  return { B, horizon: WITNESS_HORIZON, violations, firstViolation };
}

/** The B and t sliders clamp each other: shrinking B can leave t or N out of range. */
export function clampSki(B: number, t: number, N: number): { B: number; t: number; N: number; note: string | null } {
  const newT = Math.min(t, maxThreshold(B));
  const newN = Math.min(N, maxSeason(B));
  const parts: string[] = [];
  if (newT !== t) parts.push(`the threshold t came down from ${t} to ${newT} (3B)`);
  if (newN !== N) parts.push(`the season length N came down from ${N} to ${newN} (6B)`);
  return { B, t: newT, N: newN, note: parts.length ? `With B = ${B}, ${parts.join(' and ')}.` : null };
}

// ── Paging ───────────────────────────────────────────────────────────

export interface LruStep {
  page: number;
  hit: boolean;
  /** The cache after the request, least recently used first. */
  cache: readonly number[];
}

/** LRU on a request sequence: the cache is kept least recently used first. */
export function lruRun(requests: readonly number[], k: number): { steps: LruStep[]; misses: number } {
  const steps: LruStep[] = [];
  let cache: number[] = [];
  let misses = 0;
  for (const page of requests) {
    const hit = cache.includes(page);
    if (hit) cache = cache.filter((p) => p !== page);
    else {
      misses += 1;
      if (cache.length === k) cache = cache.slice(1);
    }
    cache = [...cache, page];
    steps.push({ page, hit, cache });
  }
  return { steps, misses };
}

/** The offline optimum by Belady's rule: on a miss with a full cache, evict the page whose next use is farthest away. */
export function beladyMisses(requests: readonly number[], k: number): number {
  let cache: number[] = [];
  let misses = 0;
  requests.forEach((page, i) => {
    if (cache.includes(page)) return;
    misses += 1;
    if (cache.length === k) {
      const nextUse = (p: number) => {
        const at = requests.indexOf(p, i + 1);
        return at === -1 ? Infinity : at;
      };
      const victim = cache.reduce((far, p) => (nextUse(p) > nextUse(far) ? p : far));
      cache = cache.filter((p) => p !== victim);
    }
    cache = [...cache, page];
  });
  return misses;
}

/** The lowest-numbered page (1 to k + 1) that is not in LRU's cache: the request that always misses. */
export function autopilotRequest(requests: readonly number[], k: number): number {
  const { steps } = lruRun(requests, k);
  const cache = steps.length ? steps[steps.length - 1].cache : [];
  for (let page = 1; page <= k + 1; page += 1) if (!cache.includes(page)) return page;
  return 1;
}

export type PagingAdd = { ok: true; requests: number[] } | { ok: false; error: string };

/** Appends a page to the sequence, or says why not (a page outside 1 to k + 1, or a full sequence). */
export function addRequest(requests: readonly number[], page: number, k: number): PagingAdd {
  if (!Number.isInteger(page) || page < 1 || page > k + 1) return { ok: false, error: `Pages run from 1 to ${k + 1} with a cache of ${k}.` };
  if (requests.length >= MAX_REQUESTS) return { ok: false, error: `The sequence is capped at ${MAX_REQUESTS} requests: press Reset.` };
  return { ok: true, requests: [...requests, page] };
}

/** Adds up to `count` autopilot requests (stopping at the cap). */
export function autopilot(requests: readonly number[], k: number, count: number): number[] {
  const out = [...requests];
  for (let i = 0; i < count && out.length < MAX_REQUESTS; i += 1) out.push(autopilotRequest(out, k));
  return out;
}

export interface PagingScore {
  requests: number;
  lru: number;
  optimum: number;
  /** LRU misses over the optimum's, or null before the optimum has missed. */
  ratio: number | null;
}

export function pagingScore(requests: readonly number[], k: number): PagingScore {
  const lru = lruRun(requests, k).misses;
  const optimum = beladyMisses(requests, k);
  return { requests: requests.length, lru, optimum, ratio: optimum === 0 ? null : lru / optimum };
}

/** The target-ratio field: a plain decimal from 1.00 to 20.00, refused (not clamped) with the range otherwise. */
export const parseTarget = (text: string): FieldParse<number> =>
  parseBoundedDecimal(text, {
    min: TARGET_MIN,
    max: TARGET_MAX,
    messages: {
      empty: 'Type a target ratio, like 2.00.',
      invalid: (typed) => `"${typed}" isn't a plain number like 2.00.`,
      tooSmall: () => `A ratio below ${TARGET_MIN.toFixed(2)} cannot happen: the online player never pays less than the optimum. Try ${TARGET_MIN.toFixed(2)} to ${TARGET_MAX.toFixed(2)}.`,
      tooBig: () => `Targets run up to ${TARGET_MAX.toFixed(2)}.`,
    },
  });
