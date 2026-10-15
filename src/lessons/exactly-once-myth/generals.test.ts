import { describe, expect, it } from 'vitest';
import { DEFAULT_DEPTH, DEFAULT_LOSS, DEPTH, GENERALS_SEED, enumerate, messengersFor, monteCarlo, outcomeOf, pBoth, pDisagree, pNobody, runSeeded, senderOf, type Outcome } from './generals';

const PS = [0, 0.1, 0.5, 0.9, 1];
const ks = Array.from({ length: DEPTH.max }, (_, i) => i + 1);

describe('the toy rule, by hand', () => {
  it('k = 1: A sends the only message and always attacks; B attacks only if it arrives', () => {
    expect(outcomeOf([true])).toBe('both');
    expect(outcomeOf([false])).toBe('disagree');
  });
  it('k = 2: if m1 is lost B never replies, so nobody attacks; if only m2 is lost B attacks alone', () => {
    expect(outcomeOf([false, true])).toBe('nobody');
    expect(outcomeOf([false, false])).toBe('nobody');
    expect(outcomeOf([true, false])).toBe('disagree');
    expect(outcomeOf([true, true])).toBe('both');
  });
  it('a message is sent only after its predecessor arrived, so everything after a loss is unsent', () => {
    const m = messengersFor([true, true, false, true, true]);
    expect(m.sent).toEqual([true, true, true, false, false]);
    expect(m.delivered).toEqual([true, true, false, false, false]);
    expect([1, 2, 3, 4].map(senderOf)).toEqual(['A', 'B', 'A', 'B']);
  });
});

describe('enumerating all 2^k delivery patterns', () => {
  it('exactly one pattern makes the generals disagree: everything delivered except the last message', () => {
    for (const k of ks) {
      const e = enumerate(k, 0.5);
      expect(e.patterns).toBe(2 ** k);
      expect(e.disagreeing).toEqual([[...Array.from({ length: k - 1 }, () => true), false]]);
    }
  });
  it('the weights match the closed forms P(disagree) = p(1-p)^(k-1) and P(both) = (1-p)^k, with the rest nobody, for k = 1..8 and p in {0, 0.1, 0.5, 0.9, 1}', () => {
    for (const k of ks) {
      for (const p of PS) {
        const e = enumerate(k, p);
        expect(e.disagree, `k=${k} p=${p}`).toBeCloseTo(pDisagree(k, p), 12);
        expect(e.both, `k=${k} p=${p}`).toBeCloseTo(pBoth(k, p), 12);
        expect(e.nobody, `k=${k} p=${p}`).toBeCloseTo(pNobody(k, p), 12);
        expect(e.both + e.disagree + e.nobody).toBeCloseTo(1, 12);
      }
    }
  });
  it('no k makes disagreement zero while p > 0, more messages lower it and raise the chance that nothing happens', () => {
    for (const p of [0.05, 0.3, 0.9]) {
      for (let k = 1; k < DEPTH.max; k++) {
        expect(pDisagree(k, p)).toBeGreaterThan(0);
        expect(pDisagree(k + 1, p)).toBeLessThan(pDisagree(k, p));
        expect(pNobody(k + 1, p)).toBeGreaterThan(pNobody(k, p));
      }
    }
  });
  it('at p = 1 and k >= 2 nobody attacks (no division, no NaN); at p = 0 everyone attacks', () => {
    for (let k = 2; k <= DEPTH.max; k++) {
      expect([pBoth(k, 1), pDisagree(k, 1), pNobody(k, 1)]).toEqual([0, 0, 1]);
    }
    expect([pBoth(1, 1), pDisagree(1, 1), pNobody(1, 1)]).toEqual([0, 1, 0]);
    for (const k of ks) expect([pBoth(k, 0), pDisagree(k, 0), pNobody(k, 0)]).toEqual([1, 0, 0]);
  });
});

describe('100,000 seeded simulations against the closed forms, within 3 standard errors', () => {
  it('for k = 1..8 and p in {0, 0.1, 0.5, 0.9, 1}', () => {
    const N = 100_000;
    for (const k of ks) {
      for (const p of PS) {
        const mc = monteCarlo(k, p, N, 5000 + k * 100 + PS.indexOf(p));
        const exact: Record<Outcome, number> = { both: pBoth(k, p), disagree: pDisagree(k, p), nobody: pNobody(k, p) };
        for (const o of ['both', 'disagree', 'nobody'] as const) {
          const se = Math.sqrt((exact[o] * (1 - exact[o])) / N);
          expect(Math.abs(mc[o] - exact[o]), `k=${k} p=${p} ${o}`).toBeLessThanOrEqual(3 * se + 1e-12);
        }
      }
    }
  });
  it('the default seed at the default depth and capture chance ends in disagreement, with only the last message captured', () => {
    const run = runSeeded(DEFAULT_DEPTH, DEFAULT_LOSS, GENERALS_SEED);
    expect(run.outcome).toBe('disagree');
    expect(run.pattern).toEqual([true, true, true, false]);
  });
  it('a seeded run repeats for its seed and differs for another', () => {
    expect(runSeeded(6, 0.3, 5).pattern).toEqual(runSeeded(6, 0.3, 5).pattern);
    expect(runSeeded(6, 0.3, 5).pattern).not.toEqual(runSeeded(6, 0.3, 6).pattern);
  });
});
