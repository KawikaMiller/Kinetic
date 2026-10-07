import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  bruteForceBest, clash, coinVerdict, dpCoins, exchange, greedyCoins, greedySchedule, isCompatible, latestStartFirst, meetings, parseCoins,
  parseTarget, PRESETS, randomMeetings, TRICKY_COINS, US_COINS, verdict, type Meeting, type Rule,
} from './model';

const RULES: Rule[] = ['finish', 'start', 'shortest'];
const preset = (id: string) => meetings(PRESETS.find((p) => p.id === id)!.pairs);

/**
 * Independent maximum: the classic recursion "skip the first meeting, or take it and drop
 * everything it overlaps", with no subsets and no greedy order involved.
 */
function maxByRecursion(ms: readonly Meeting[]): number {
  if (!ms.length) return 0;
  const [first, ...rest] = ms;
  return Math.max(maxByRecursion(rest), 1 + maxByRecursion(rest.filter((m) => !clash(m, first))));
}

/** Independent fewest-coins: breadth-first search over amounts still to pay (no DP table). */
function fewestCoinsBfs(coins: readonly number[], amount: number): number | null {
  const seen = new Set([amount]);
  let level = [amount];
  for (let used = 0; level.length; used++) {
    if (level.includes(0)) return used;
    const next: number[] = [];
    for (const left of level) {
      for (const c of coins) {
        const r = left - c;
        if (r >= 0 && !seen.has(r)) {
          seen.add(r);
          next.push(r);
        }
      }
    }
    level = next;
  }
  return null;
}

function randomInstance(rnd: () => number): Meeting[] {
  const n = randInt(1, 10, rnd);
  return meetings(
    Array.from({ length: n }, () => {
      const start = randInt(0, 20, rnd);
      return [start, start + randInt(1, 6, rnd)] as const;
    }),
  );
}

describe('interval scheduling', () => {
  it('earliest finish equals the brute-force maximum on 300 seeded instances (n ≤ 10)', () => {
    const rnd = mulberry32(2026);
    for (let t = 0; t < 300; t++) {
      const ms = randomInstance(rnd);
      const best = bruteForceBest(ms);
      expect(best.size).toBe(maxByRecursion(ms));
      expect(greedySchedule(ms, 'finish').booked.length).toBe(best.size);
    }
  });

  it('every rule books a clash-free schedule, and none ever beats the brute-force maximum', () => {
    const rnd = mulberry32(7);
    for (let t = 0; t < 300; t++) {
      const ms = randomInstance(rnd);
      const best = bruteForceBest(ms).size;
      for (const r of RULES) {
        const { booked, steps } = greedySchedule(ms, r);
        expect(isCompatible(booked)).toBe(true);
        expect(booked.length).toBeLessThanOrEqual(best);
        expect(steps).toHaveLength(ms.length);
        for (const s of steps) if (!s.accepted) expect(clash(s.meeting, s.clashWith!)).toBe(true);
      }
    }
  });

  it('the all-morning preset beats earliest start, and the short-bridges preset beats shortest first', () => {
    const long = preset('long');
    const bridge = preset('bridge');
    expect(greedySchedule(long, 'start').booked.length).toBeLessThan(bruteForceBest(long).size);
    expect(greedySchedule(bridge, 'shortest').booked.length).toBeLessThan(bruteForceBest(bridge).size);
    // Hand-checked: the morning has five 1-hour meetings plus two afternoon ones (7); earliest start books 8–14, 14–16, 16–18 (3).
    expect(bruteForceBest(long).size).toBe(7);
    expect(greedySchedule(long, 'start').booked.map((m) => [m.start, m.end])).toEqual([[8, 14], [14, 16], [16, 18]]);
  });

  it('every preset has 8 to 12 meetings and is solved exactly by earliest finish', () => {
    for (const p of PRESETS) {
      const ms = meetings(p.pairs);
      expect(ms.length).toBeGreaterThanOrEqual(8);
      expect(ms.length).toBeLessThanOrEqual(12);
      expect(greedySchedule(ms, 'finish').booked.length).toBe(maxByRecursion(ms));
    }
    for (let s = 1; s <= 50; s++) {
      const ms = randomMeetings(s);
      expect(ms.length).toBeGreaterThanOrEqual(8);
      expect(ms.length).toBeLessThanOrEqual(12);
      expect(ms.every((m) => m.start >= 8 && m.end <= 20 && m.end > m.start)).toBe(true);
    }
  });

  it('meetings that only touch (one ends at 10, the next starts at 10) do not clash', () => {
    const [a, b] = meetings([[8, 10], [10, 12]]);
    expect(clash(a, b)).toBe(false);
    expect(greedySchedule([a, b], 'start').booked).toHaveLength(2);
  });

  it('the drawn best schedule is a true optimum that shares as many meetings with greedy as any optimum does', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 100; t++) {
      const ms = randomInstance(rnd);
      for (const r of RULES) {
        const g = greedySchedule(ms, r).booked;
        const { best, size } = bruteForceBest(ms, g);
        expect(best).toHaveLength(size);
        expect(isCompatible(best)).toBe(true);
        const ids = new Set(g.map((m) => m.id));
        const shared = best.filter((m) => ids.has(m.id)).length;
        // No other optimum overlaps greedy more: check every subset of the optimum's size.
        for (let mask = 0; mask < 2 ** ms.length; mask++) {
          const pick = ms.filter((_, i) => mask & (1 << i));
          if (pick.length === size && isCompatible(pick)) expect(pick.filter((m) => ids.has(m.id)).length).toBeLessThanOrEqual(shared);
        }
      }
    }
  });

  it('the verdict comes from the counts', () => {
    expect(verdict(7, 7)).toEqual({ kind: 'optimal' });
    expect(verdict(3, 7)).toEqual({ kind: 'lost', by: 4 });
  });
});

describe('exchange argument', () => {
  it('every swap keeps the schedule valid and the same size, and ends at greedy’s schedule (300 seeded instances)', () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < 300; t++) {
      const ms = randomInstance(rnd);
      const { greedy, optimum, swaps } = exchange(ms);
      expect(optimum.length).toBe(maxByRecursion(ms));
      expect(greedy.length).toBe(optimum.length);
      for (const s of swaps) {
        expect(s.valid).toBe(true);
        expect(isCompatible(s.schedule)).toBe(true);
        expect(s.schedule).toHaveLength(optimum.length);
        // Greedy stays ahead: its i-th meeting ends no later than the optimum's i-th.
        expect(s.greedy.end).toBeLessThanOrEqual(s.was.end);
      }
      if (swaps.length) expect(swaps[swaps.length - 1].schedule.map((m) => m.id)).toEqual(greedy.map((m) => m.id));
    }
  });

  it('latest start first is also optimal (it is the starting point of the argument)', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 200; t++) {
      const ms = randomInstance(rnd);
      const o = latestStartFirst(ms);
      expect(isCompatible(o)).toBe(true);
      expect(o.length).toBe(maxByRecursion(ms));
    }
  });

  it('the busy-workday preset has real swaps to show', () => {
    expect(exchange(preset('workday')).swaps.filter((s) => s.was.id !== s.greedy.id).length).toBeGreaterThan(0);
  });
});

describe('coin change', () => {
  it('greedy on {1, 3, 4} for 6 takes 4 + 1 + 1 (3 coins); the optimum is 3 + 3 (2 coins)', () => {
    expect(greedyCoins(TRICKY_COINS, 6)).toEqual({ taken: [4, 1, 1], left: 0 });
    expect(dpCoins(TRICKY_COINS, 6).coins).toEqual([3, 3]);
    expect(coinVerdict(TRICKY_COINS, 6)).toEqual({ kind: 'lost', by: 1 });
  });

  it('greedy equals the optimum for every amount 1-99 on {1, 5, 10, 25}', () => {
    for (let a = 1; a <= 99; a++) {
      expect(greedyCoins(US_COINS, a).taken.length).toBe(fewestCoinsBfs(US_COINS, a));
      expect(coinVerdict(US_COINS, a)).toEqual({ kind: 'optimal' });
    }
  });

  it('the DP table matches breadth-first search for every amount and 200 seeded coin systems', () => {
    const rnd = mulberry32(12);
    for (let t = 0; t < 200; t++) {
      const coins = [...new Set(Array.from({ length: randInt(1, 6, rnd) }, () => randInt(1, 30, rnd)))];
      const { best } = dpCoins(coins, 99);
      for (let a = 0; a <= 99; a++) expect(best[a]).toBe(fewestCoinsBfs(coins, a));
      const way = dpCoins(coins, 60).coins;
      if (way) {
        expect(way.reduce((s, c) => s + c, 0)).toBe(60);
        expect(way.every((c) => coins.includes(c))).toBe(true);
      }
      const g = greedyCoins(coins, 60);
      expect(g.taken.reduce((s, c) => s + c, 0) + g.left).toBe(60);
    }
  });

  it('greedy can get stuck where a solution exists, and some amounts have none', () => {
    // {4, 5} for 8: greedy takes 5 and has 3 left that no coin fits; 4 + 4 works.
    expect(greedyCoins([4, 5], 8)).toEqual({ taken: [5], left: 3 });
    expect(coinVerdict([4, 5], 8)).toEqual({ kind: 'stuck', left: 3 });
    expect(coinVerdict([4, 5], 7)).toEqual({ kind: 'impossible' });
  });

  it('{1, 3, 4} loses on exactly the amounts brute force says it does', () => {
    const lost = [];
    for (let a = 1; a <= 99; a++) if (greedyCoins(TRICKY_COINS, a).taken.length > fewestCoinsBfs(TRICKY_COINS, a)!) lost.push(a);
    expect(lost.slice(0, 3)).toEqual([6, 10, 14]);
    for (const a of lost) expect(coinVerdict(TRICKY_COINS, a).kind).toBe('lost');
  });
});

describe('typed input', () => {
  it('accepts targets 1-99 and refuses everything else with a message', () => {
    expect(parseTarget(' 6 ')).toEqual({ ok: true, value: 6 });
    expect(parseTarget('99')).toEqual({ ok: true, value: 99 });
    for (const bad of ['', '   ', '0', '-1', '100', '12345678901234567890123', '1e400', '6.5', '😀', '<b>6</b>', '1,,2']) {
      const r = parseTarget(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
    }
  });

  it('accepts 1-6 distinct coins from 1 to 99, sorted, and refuses the rest', () => {
    expect(parseCoins('4, 1 3')).toEqual({ ok: true, value: [1, 3, 4] });
    const refused: Record<string, string> = {
      '': 'at least one',
      '   ': 'at least one',
      '1,,3': 'gap',
      '1, 3,': 'gap',
      ',1': 'gap',
      '0, 1': 'at least 1',
      '-1, 2': 'at least 1',
      '1, 100': 'between 1 and 99',
      '12345678901234567890123': 'between 1 and 99',
      '1e400': 'whole numbers',
      '1.5': 'whole numbers',
      '😀': 'whole numbers',
      '<b>1</b>': 'whole numbers',
      '1, 1, 3': 'once',
      '1 2 3 4 5 6 7': 'Up to 6',
    };
    for (const [text, why] of Object.entries(refused)) {
      const r = parseCoins(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.error, text).toContain(why);
    }
  });
});
