import { parseBoundedInt, parseIntegers, type FieldParse } from '../../core/parse';
import { mulberry32, randInt } from '../../core/random';

// ── Interval scheduling ──────────────────────────────────────────────

/** A meeting from `start` to `end` in whole hours, half-open: one ending at 10 doesn't clash with one starting at 10. */
export interface Meeting {
  id: string;
  start: number;
  end: number;
}

export type Rule = 'finish' | 'start' | 'shortest';

export const RULE_LABEL: Record<Rule, string> = {
  finish: 'earliest finish',
  start: 'earliest start',
  shortest: 'shortest first',
};

/** The day the timeline covers, in hours. */
export const DAY: readonly [number, number] = [8, 20];
export const MAX_MEETINGS = 12;

export const clash = (a: Meeting, b: Meeting) => a.start < b.end && b.start < a.end;
export const span = (m: Meeting) => `${m.start}–${m.end}`;
const length = (m: Meeting) => m.end - m.start;

/** True when no two meetings in the list overlap. */
export function isCompatible(ms: readonly Meeting[]): boolean {
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) if (clash(ms[i], ms[j])) return false;
  return true;
}

/** The order a rule scans in. Ties fall back to start, then end, then name, so every run is reproducible. */
export function scanOrder(ms: readonly Meeting[], rule: Rule): Meeting[] {
  const key: Record<Rule, (m: Meeting) => number> = { finish: (m) => m.end, start: (m) => m.start, shortest: length };
  return [...ms].sort((a, b) => key[rule](a) - key[rule](b) || a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
}

export interface ScanStep {
  meeting: Meeting;
  accepted: boolean;
  /** The first already-booked meeting it overlaps, when rejected. */
  clashWith: Meeting | null;
}

/** Scan in the rule's order, booking every meeting that doesn't overlap one already booked. */
export function greedySchedule(ms: readonly Meeting[], rule: Rule): { steps: ScanStep[]; booked: Meeting[] } {
  const booked: Meeting[] = [];
  const steps = scanOrder(ms, rule).map((meeting) => {
    const clashWith = booked.find((b) => clash(b, meeting)) ?? null;
    if (!clashWith) booked.push(meeting);
    return { meeting, accepted: !clashWith, clashWith };
  });
  return { steps, booked };
}

const byStart = (ms: readonly Meeting[]) => [...ms].sort((a, b) => a.start - b.start || a.end - b.end);
const subset = (ms: readonly Meeting[], mask: number) => ms.filter((_, i) => mask & (1 << i));

/**
 * The true maximum by brute force: try every one of the 2ⁿ subsets and keep the largest
 * with no overlap. Among the best subsets, return the one sharing the most meetings with
 * `prefer` (greedy's picks), so the outlined mistakes are ones no best schedule avoids
 * making differently.
 */
export function bruteForceBest(ms: readonly Meeting[], prefer: readonly Meeting[] = []): { size: number; tried: number; best: Meeting[] } {
  const want = new Set(prefer.map((m) => m.id));
  let size = 0;
  let shared = -1;
  let best: Meeting[] = [];
  const tried = 2 ** ms.length;
  for (let mask = 0; mask < tried; mask++) {
    const pick = subset(ms, mask);
    if (pick.length < size || !isCompatible(pick)) continue;
    const s = pick.filter((m) => want.has(m.id)).length;
    if (pick.length > size || s > shared) {
      size = pick.length;
      shared = s;
      best = pick;
    }
  }
  return { size, tried, best: byStart(best) };
}

/** Verdict on a greedy result against the best possible count. */
export type Verdict = { kind: 'optimal' } | { kind: 'lost'; by: number };
export const verdict = (got: number, best: number): Verdict => (got >= best ? { kind: 'optimal' } : { kind: 'lost', by: best - got });

/**
 * Another best schedule, for the exchange argument: the mirror-image greedy, scanning by
 * latest start and booking what fits. It's optimal for the same reason earliest finish is,
 * and it usually picks different meetings, so there's something to swap.
 */
export function latestStartFirst(ms: readonly Meeting[]): Meeting[] {
  const booked: Meeting[] = [];
  for (const m of [...ms].sort((a, b) => b.start - a.start || b.end - a.end || a.id.localeCompare(b.id))) {
    if (!booked.some((b) => clash(b, m))) booked.push(m);
  }
  return byStart(booked);
}

export interface Swap {
  /** Position in time order, 0-based. */
  i: number;
  greedy: Meeting;
  /** The optimum's meeting at that position before the swap. */
  was: Meeting;
  /** The schedule after this step. */
  schedule: Meeting[];
  valid: boolean;
}

/**
 * The exchange argument, run for real: starting from a best schedule, replace its i-th
 * meeting (in time order) with earliest-finish's i-th, for i = 0, 1, ….
 */
export function exchange(ms: readonly Meeting[]): { greedy: Meeting[]; optimum: Meeting[]; swaps: Swap[] } {
  const greedy = byStart(greedySchedule(ms, 'finish').booked);
  const optimum = latestStartFirst(ms);
  let schedule = optimum.slice();
  const swaps = greedy.slice(0, optimum.length).map((g, i) => {
    const was = schedule[i];
    schedule = schedule.map((m, j) => (j === i ? g : m));
    return { i, greedy: g, was, schedule, valid: isCompatible(schedule) };
  });
  return { greedy, optimum, swaps };
}

const letters = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

/** Meetings from [start, end] pairs, named A, B, C… in order of start time. */
export function meetings(pairs: readonly (readonly [number, number])[]): Meeting[] {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return sorted.map(([start, end], i) => ({ id: letters(sorted.length)[i], start, end }));
}

/** A random day of meetings (8-12 of them, 1-4 hours each), from a seed so it's reproducible. */
export function randomMeetings(seed: number): Meeting[] {
  const rnd = mulberry32(seed);
  const n = randInt(8, MAX_MEETINGS, rnd);
  return meetings(
    Array.from({ length: n }, () => {
      const len = randInt(1, 4, rnd);
      const start = randInt(DAY[0], DAY[1] - len, rnd);
      return [start, start + len] as const;
    }),
  );
}

export type PresetId = 'workday' | 'long' | 'bridge';

export const PRESETS: { id: PresetId; label: string; pairs: readonly (readonly [number, number])[] }[] = [
  {
    id: 'workday',
    label: 'Busy workday',
    pairs: [[8, 10], [9, 11], [9, 12], [10, 13], [11, 12], [12, 14], [13, 15], [14, 17], [15, 16], [16, 18], [17, 19]],
  },
  {
    // One meeting starts first and swallows the morning: earliest start books it and loses.
    id: 'long',
    label: 'All-morning meeting',
    pairs: [[8, 14], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 16], [15, 17], [16, 18], [17, 19]],
  },
  {
    // Short meetings that each straddle two longer ones: shortest first books them and loses.
    id: 'bridge',
    label: 'Short bridges',
    pairs: [[8, 9], [8, 11], [10, 12], [11, 14], [12, 13], [14, 17], [16, 18], [17, 20]],
  },
];

// ── Coin change ──────────────────────────────────────────────────────

export const TARGET_MAX = 99;
export const COIN_MAX = 99;
export const MAX_COINS = 6;
export const US_COINS: readonly number[] = [1, 5, 10, 25];
export const TRICKY_COINS: readonly number[] = [1, 3, 4];

/** Largest coin that fits, again and again. `left` > 0 means greedy got stuck with no coin small enough. */
export function greedyCoins(coins: readonly number[], amount: number): { taken: number[]; left: number } {
  const desc = [...coins].sort((a, b) => b - a);
  const taken: number[] = [];
  let left = amount;
  for (;;) {
    const c = desc.find((x) => x <= left);
    if (left === 0 || c === undefined) return { taken, left };
    taken.push(c);
    left -= c;
  }
}

/**
 * The reference answer, by dynamic programming: best[a] is the fewest coins that make a
 * exactly (null if no combination does), and the coins of one best way to make `amount`.
 */
export function dpCoins(coins: readonly number[], amount: number): { best: (number | null)[]; coins: number[] | null } {
  const best: (number | null)[] = [0];
  const last: number[] = [0];
  for (let a = 1; a <= amount; a++) {
    best[a] = null;
    for (const c of coins) {
      const prev = c <= a ? best[a - c] : null;
      if (prev !== null && (best[a] === null || prev + 1 < best[a]!)) {
        best[a] = prev + 1;
        last[a] = c;
      }
    }
  }
  if (best[amount] === null) return { best, coins: null };
  const way: number[] = [];
  for (let a = amount; a > 0; a -= last[a]) way.push(last[a]);
  return { best, coins: way.sort((x, y) => y - x) };
}

export type CoinVerdict =
  | { kind: 'optimal' }
  | { kind: 'lost'; by: number }
  | { kind: 'stuck'; left: number }
  | { kind: 'impossible' };

export function coinVerdict(coins: readonly number[], amount: number): CoinVerdict {
  const g = greedyCoins(coins, amount);
  const dp = dpCoins(coins, amount);
  if (!dp.coins) return { kind: 'impossible' };
  if (g.left > 0) return { kind: 'stuck', left: g.left };
  const extra = g.taken.length - dp.coins.length;
  return extra === 0 ? { kind: 'optimal' } : { kind: 'lost', by: extra };
}

export const parseTarget = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: 1,
    max: TARGET_MAX,
    messages: { empty: `Type a target from 1 to ${TARGET_MAX}.`, tooSmall: () => `The target is at least 1.`, tooBig: () => `Keep the target at ${TARGET_MAX} or under, so the table stays small.` },
  });

/** A learner-typed coin list: 1-6 distinct whole numbers from 1 to 99, commas and/or spaces between. */
export function parseCoins(text: string): FieldParse<number[]> {
  const t = text.trim();
  if (!t) return { ok: false, error: 'Type at least one coin, like 1, 3, 4.' };
  if (/(^|,)\s*(,|$)/.test(t)) return { ok: false, error: 'There is a gap in the list: remove the extra comma.' };
  const xs = parseIntegers(t);
  if (!xs) return { ok: false, error: 'Coins are whole numbers, like 1, 3, 4.' };
  if (xs.some((x) => x < 1)) return { ok: false, error: 'Every coin is worth at least 1.' };
  if (xs.some((x) => x > COIN_MAX)) return { ok: false, error: `Keep each coin between 1 and ${COIN_MAX}.` };
  if (new Set(xs).size !== xs.length) return { ok: false, error: 'List each coin once.' };
  if (xs.length > MAX_COINS) return { ok: false, error: `Up to ${MAX_COINS} coins.` };
  return { ok: true, value: [...xs].sort((a, b) => a - b) };
}
