import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  B_MAX, B_MIN, CHECKED_B_MAX, LATE_THRESHOLD_WITNESS, MAX_REQUESTS, TARGET_MAX, WITNESS_HORIZON, addRequest, autopilot, autopilotRequest, beladyMisses,
  boundViolations, breakEven, breakEvenBound, challenge, checkBound, clampSki, lateThreshold, lruRun, maxSeason, maxThreshold, neverBuyVerdict, opt,
  pagingScore, parseTarget, ratio, skiCost, thresholdSweep, worstRatio, worstRatioBelowB, worstSeason, type Strategy,
} from './model';

const B = 10;
const rent = (t: number): Strategy => ({ t, never: false });
const NEVER: Strategy = { t: 0, never: true };
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Oracle for paging: the fewest misses over every way of choosing what to evict, by dynamic programming over cache contents. */
function optimumByDp(requests: readonly number[], k: number): number {
  let states = new Map<string, number>([['', 0]]);
  for (const page of requests) {
    const next = new Map<string, number>();
    const put = (cache: number[], cost: number) => {
      const key = [...cache].sort((a, b) => a - b).join(',');
      if (cost < (next.get(key) ?? Infinity)) next.set(key, cost);
    };
    for (const [key, cost] of states) {
      const cache = key === '' ? [] : key.split(',').map(Number);
      if (cache.includes(page)) put(cache, cost);
      else if (cache.length < k) put([...cache, page], cost + 1);
      else for (const victim of cache) put([...cache.filter((p) => p !== victim), page], cost + 1);
    }
    states = next;
  }
  return Math.min(...states.values());
}

describe('ski rental, hand-worked at B = 10', () => {
  it('break-even (t = 9): 1.00 up to N = 9, then 19 / 10 = 1.90 for every longer season', () => {
    const be = breakEven(B);
    expect(be.t).toBe(9);
    expect([5, 9].map((N) => ratio(be, B, N))).toEqual([1, 1]);
    for (const N of [10, 11, 100]) expect(r2(ratio(be, B, N)), `N = ${N}`).toBe(1.9);
    expect([skiCost(be, B, 11), opt(B, 11)]).toEqual([19, 10]);
    expect(breakEvenBound(B)).toBeCloseTo(1.9, 12);
  });

  it('buy at once (t = 0): 10.00 at N = 1, 2.00 at N = 5, 1.00 at N = 100; t = 10: 1.00 at N = 10 and 2.00 at N = 11; never buy: 6.0 at N = 60', () => {
    expect([1, 5, 100].map((N) => ratio(rent(0), B, N))).toEqual([10, 2, 1]);
    expect(ratio(rent(10), B, 10)).toBe(1);
    expect(ratio(rent(10), B, 11)).toBe(2);
    expect(ratio(NEVER, B, 60)).toBe(6);
  });

  it('a season of 0 rented days still pays one day of rent when t is 0 and N is 1 (renting beats buying only at N below B)', () => {
    expect(skiCost(rent(0), B, 1)).toBe(10);
    expect(skiCost(NEVER, B, 1)).toBe(1);
    expect(opt(B, 1)).toBe(1);
  });
});

describe('oracles for the worst ratio', () => {
  it('matches the closed form on every B from 2 to 50 and every threshold from 0 to 3B', () => {
    for (let b = 2; b <= B_MAX; b += 1) {
      for (let t = 0; t <= maxThreshold(b); t += 1) {
        const closed = t < b ? worstRatioBelowB(t, b) : (t + b) / b;
        expect(worstRatio(t, b), `B = ${b}, t = ${t}`).toBeCloseTo(closed, 12);
      }
    }
  });

  it('is exhaustive: for every B up to 50 the worst ratio is at least 2 - 1/B, and equal only at t = B - 1', () => {
    const check = checkBound();
    expect(check.maxB).toBe(CHECKED_B_MAX);
    expect(check.holds).toBe(true);
    // Independent recount with plain loops over costs, not the lesson's ratio helper.
    for (let b = 1; b <= 50; b += 1) {
      for (let t = 0; t <= 3 * b; t += 1) {
        let worst = 0;
        for (let N = 1; N <= 6 * b; N += 1) {
          const online = N <= t ? N : t + b;
          const best = N < b ? N : b;
          worst = Math.max(worst, online / best);
        }
        expect(worst >= 2 - 1 / b - 1e-12, `B = ${b}, t = ${t}`).toBe(true);
        expect(Math.abs(worst - (2 - 1 / b)) < 1e-12, `B = ${b}, t = ${t}`).toBe(t === b - 1);
      }
    }
  });

  it('the break-even threshold minimises the worst ratio in the sweep, uniquely', () => {
    const sweep = thresholdSweep(B);
    expect(sweep).toHaveLength(31);
    const min = Math.min(...sweep.map((p) => p.ratio));
    expect(sweep.filter((p) => p.ratio === min).map((p) => p.t)).toEqual([9]);
  });
});

describe('manipulation: the adversary is refused with the computed reason', () => {
  it('manipulation 1: a target of 2.00 against break-even is refused, naming N = 10 at 1.90 = 2 - 1/10', () => {
    const result = challenge(breakEven(B), B, 2);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toBe(
      'No season length up to 60 reaches ratio 2.00 against this strategy: the best is N = 10 at 1.90 = 2 - 1/10. For N above B the ratio stays at (2B - 1) / B, so longer seasons cannot help (read off the formula, not found by search).',
    );
    expect([result.N, r2(result.ratio)]).toEqual([10, 1.9]);
  });

  it('manipulation 2: declaring never buy competitive is refused with N / B = 6.0 at N = 60', () => {
    expect(neverBuyVerdict(B)).toBe(
      'Never buying is not competitive: at season length 60 the ratio is 60 / 10 = 6.0, and it equals N / B, which grows with N, so no fixed ratio bound holds for it (read off the formula).',
    );
    expect(ratio(NEVER, B, maxSeason(B))).toBe(6);
    expect(ratio(NEVER, B, 600) > ratio(NEVER, B, 60)).toBe(true);
  });

  it('manipulation 3: against threshold 10 the same challenge succeeds at N = 11, ratio 2.00', () => {
    expect(challenge(rent(10), B, 2)).toEqual({ ok: true, N: 11, ratio: 2 });
  });

  it('a target is a plain decimal from 1.00 to 20.00, refused (not clamped) outside it', () => {
    expect(parseTarget('2.00')).toEqual({ ok: true, value: 2 });
    expect(parseTarget('1')).toEqual({ ok: true, value: 1 });
    expect(parseTarget(String(TARGET_MAX))).toEqual({ ok: true, value: 20 });
    expect(parseTarget('20.01').ok).toBe(false);
    expect(parseTarget('0.99').ok).toBe(false);
    expect(parseTarget('').ok).toBe(false);
    expect(parseTarget('2e1').ok).toBe(false);
  });

  it('every target from 1.00 to the break-even bound is reachable, and every one above it is refused, for break-even at every B', () => {
    for (let b = B_MIN; b <= B_MAX; b += 6) {
      const bound = breakEvenBound(b);
      expect(challenge(breakEven(b), b, bound).ok).toBe(true);
      expect(challenge(breakEven(b), b, bound + 0.01).ok).toBe(false);
      expect(worstSeason(breakEven(b), b).N).toBe(b);
    }
  });
});

describe('broken mode: the threshold one day late', () => {
  it('breaks the bound at the witness B = 10, N = 11: 20 / 10 = 2.00 against 1.90', () => {
    const { B: b, N } = LATE_THRESHOLD_WITNESS;
    expect(skiCost(lateThreshold(b), b, N)).toBe(20);
    expect(opt(b, N)).toBe(10);
    expect(ratio(lateThreshold(b), b, N)).toBe(2);
    expect(ratio(lateThreshold(b), b, N) > breakEvenBound(b)).toBe(true);
  });

  it('violates the bound on 190 of the 200 season lengths (95%), for the stated reason; the fixed threshold on none', () => {
    const late = boundViolations(lateThreshold(B), B);
    expect(late.horizon).toBe(WITNESS_HORIZON);
    expect(late.violations).toBe(190);
    expect(late.violations / late.horizon).toBeCloseTo(0.95, 12);
    expect(late.firstViolation).toEqual({ N: 11, ratio: 2 });
    expect(boundViolations(breakEven(B), B).violations).toBe(0);
    for (let b = 2; b <= 50; b += 8) expect(boundViolations(breakEven(b), b).violations).toBe(0);
  });
});

describe('controls at their extremes and one beyond', () => {
  it('B at 2 and 50, t at 0 and 3B, N at 1 and 6B all give finite ratios', () => {
    for (const b of [B_MIN, B_MAX]) {
      for (const t of [0, maxThreshold(b)]) {
        for (const N of [1, maxSeason(b)]) {
          const r = ratio(rent(t), b, N);
          expect(Number.isFinite(r) && r >= 1).toBe(true);
        }
      }
    }
  });

  it('shrinking B clamps t and N and says so; a B that keeps them in range says nothing', () => {
    expect(clampSki(2, 150, 300)).toEqual({ B: 2, t: 6, N: 12, note: 'With B = 2, the threshold t came down from 150 to 6 (3B) and the season length N came down from 300 to 12 (6B).' });
    expect(clampSki(50, 9, 11).note).toBeNull();
    expect(clampSki(10, 31, 11)).toMatchObject({ t: 30, note: 'With B = 10, the threshold t came down from 31 to 30 (3B).' });
  });
});

describe('paging', () => {
  const cyclic = Array.from({ length: 12 }, (_, i) => (i % 4) + 1);

  it('k = 3, requests 1 2 3 4 repeated three times: LRU misses all 12, the optimum 6, ratio 2.0', () => {
    expect(lruRun(cyclic, 3).misses).toBe(12);
    expect(beladyMisses(cyclic, 3)).toBe(6);
    expect(optimumByDp(cyclic, 3)).toBe(6);
    expect(pagingScore(cyclic, 3)).toEqual({ requests: 12, lru: 12, optimum: 6, ratio: 2 });
    // The optimum misses at requests 1, 2, 3, 4, 7 and 10: the best miss count of each prefix steps up there.
    const byPrefix = cyclic.map((_, i) => optimumByDp(cyclic.slice(0, i + 1), 3));
    expect(byPrefix).toEqual([1, 2, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]);
  });

  it('autopilot asks for the lowest page missing from the cache: 1 2 3 4 1 2 3 4 ..., and over 30 requests LRU misses 30, the optimum 12, ratio 2.5', () => {
    expect(autopilot([], 3, 12)).toEqual(cyclic);
    expect(autopilotRequest([1, 2, 3], 3)).toBe(4);
    const thirty = autopilot([], 3, 30);
    expect(thirty).toHaveLength(30);
    expect(pagingScore(thirty, 3)).toEqual({ requests: 30, lru: 30, optimum: 12, ratio: 2.5 });
    expect(optimumByDp(thirty, 3)).toBe(12);
  });

  it('the autopilot ratio tends towards k for each cache size', () => {
    for (const k of [2, 3, 4] as const) {
      const long = autopilot([], k, MAX_REQUESTS);
      const score = pagingScore(long, k);
      expect(score.lru).toBe(MAX_REQUESTS);
      expect(score.ratio!).toBeGreaterThan(k - 1);
      expect(score.ratio!).toBeLessThanOrEqual(k + 0.5);
    }
  });

  it("Belady's misses equal a dynamic program over all cache contents on 500 seeded sequences (length up to 14, k from 2 to 4)", () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < 500; t += 1) {
      const k = 2 + Math.floor(rnd() * 3);
      const length = 1 + Math.floor(rnd() * 14);
      const requests = Array.from({ length }, () => 1 + Math.floor(rnd() * (k + 2)));
      expect(beladyMisses(requests, k), `${requests} k=${k}`).toBe(optimumByDp(requests, k));
    }
  });

  it('LRU misses at most k times the optimum on 500 seeded sequences of length 40: a bound on this seeded set, not a proof', () => {
    const rnd = mulberry32(77);
    let worst = 0;
    for (let t = 0; t < 500; t += 1) {
      const k = 2 + Math.floor(rnd() * 3);
      const requests = Array.from({ length: 40 }, () => 1 + Math.floor(rnd() * (k + 2)));
      const lru = lruRun(requests, k).misses;
      const best = beladyMisses(requests, k);
      expect(lru, `${requests} k=${k}`).toBeLessThanOrEqual(k * best);
      worst = Math.max(worst, lru / best);
    }
    expect(worst).toBeGreaterThan(1);
  });

  it('page and sequence limits: a page outside 1 to k + 1 is refused, and the sequence stops at its cap', () => {
    expect(addRequest([], 4, 3)).toEqual({ ok: true, requests: [4] });
    expect(addRequest([], 5, 3)).toEqual({ ok: false, error: 'Pages run from 1 to 4 with a cache of 3.' });
    expect(addRequest([], 0, 3).ok).toBe(false);
    const full = autopilot([], 3, MAX_REQUESTS + 10);
    expect(full).toHaveLength(MAX_REQUESTS);
    expect(addRequest(full, 1, 3)).toEqual({ ok: false, error: 'The sequence is capped at 60 requests: press Reset.' });
  });

  it('an empty sequence has no optimum miss yet, so no ratio', () => {
    expect(pagingScore([], 3)).toEqual({ requests: 0, lru: 0, optimum: 0, ratio: null });
  });
});
