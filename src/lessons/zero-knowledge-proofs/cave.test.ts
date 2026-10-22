import { describe, expect, it } from 'vitest';
import {
  MAX_ROUNDS, answers, cheaterGame, confidence, isPattern, meter, policyCall, predictNext, proverKind, survival, verdict, verifierCall, type Policy, type Side,
} from './cave';

const calls = (policy: Policy, n: number, seed: number): Side[] => Array.from({ length: n }, (_, i) => policyCall(policy, i, seed));

/** A seed for which the prover is a cheater and one for which it knows the passphrase. */
const seedOf = (kind: 'knows' | 'cheater'): number => {
  for (let s = 1; s < 100; s++) if (proverKind(s) === kind) return s;
  throw new Error('no seed');
};

describe('the confidence meter', () => {
  it('reads 1 - 2^-n: 0.5, 0.96875 and 0.9990234375 for n = 1, 5, 10', () => {
    expect([confidence(1), confidence(5), confidence(10)]).toEqual([0.5, 0.96875, 0.9990234375]);
    expect(MAX_ROUNDS).toBe(10);
  });
});

describe('the cave as verifier', () => {
  const cheater = seedOf('cheater');

  it('a prover who knows the passphrase passes every round whatever you call', () => {
    const k = seedOf('knows');
    for (const policy of ['manual', 'always-left', 'alternate', 'random'] as const) {
      const rounds = answers('knows', k, calls(policy, 10, k), policy);
      expect(rounds.every((r) => r.passed)).toBe(true);
    }
  });

  it('manipulation 2: calling "left" ten times, a cheater passes 10 of 10 and the meter reads 99.9% but is struck as predictable', () => {
    const rounds = answers('cheater', cheater, calls('always-left', 10, cheater), 'always-left');
    expect(rounds.filter((r) => r.passed)).toHaveLength(10);
    const m = meter(rounds);
    expect(m.value).toBe(0.9990234375);
    expect(m.struck).toBe(true);
    // the same by hand-pressed left calls (the manual policy): the predictor follows the habit from the first round
    const manual = answers('cheater', cheater, Array(10).fill('L' as Side), 'manual');
    expect(manual.every((r) => r.passed)).toBe(true);
  });

  it('strictly alternating calls are followed too, when the policy is declared', () => {
    const rounds = answers('cheater', cheater, calls('alternate', 10, cheater), 'alternate');
    expect(rounds.every((r) => r.passed)).toBe(true);
    expect(isPattern(rounds.map((r) => r.call))).toBe(true);
  });

  it('with seeded random calls the same cheater is caught: the pass share over 200 seeds is printed and is far below 100%', () => {
    let allPassed = 0;
    let firstRoundPassed = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rounds = answers('cheater', seed, calls('random', 10, seed), 'random');
      if (rounds.every((r) => r.passed)) allPassed++;
      if (rounds[0].passed) firstRoundPassed++;
    }
    expect(allPassed).toBeLessThanOrEqual(2);
    expect(firstRoundPassed / 200).toBeGreaterThan(0.35);
    expect(firstRoundPassed / 200).toBeLessThan(0.65);
  });

  it('the predictor is causal: with no history it says left, and after L R L it says R', () => {
    expect(predictNext([])).toBe('L');
    expect(predictNext(['R'])).toBe('R');
    expect(predictNext(['L', 'R', 'L'])).toBe('R');
    expect(predictNext(['L', 'L', 'R'])).toBe('R');
  });

  it('the verdict: accepting a cheater or rejecting an honest prover is wrong', () => {
    expect(verdict('cheater', true).correct).toBe(false);
    expect(verdict('knows', true).correct).toBe(true);
    expect(verdict('knows', false).correct).toBe(false);
    expect(verdict('cheater', false).correct).toBe(true);
  });

  it('the meter counts only rounds passed in a row and names the failing round', () => {
    const rounds = answers('cheater', 9, ['L', 'R', 'R'], 'always-left');
    expect(meter(rounds)).toMatchObject({ passed: 1, failedAt: 2 });
  });
});

describe('the cave as cheater', () => {
  it('manipulation 1: you are caught at the first round where your side differs from the seeded call; survival of n rounds is about 2^-n over seeded games for n = 1..8', () => {
    const seed = 3;
    const sides: Side[] = Array.from({ length: 5 }, (_, i) => verifierCall(seed, i));
    expect(cheaterGame(seed, sides)).toEqual({ caughtAt: null, survived: 5 });
    const wrong = [...sides];
    wrong[2] = wrong[2] === 'L' ? 'R' : 'L';
    expect(cheaterGame(seed, wrong)).toEqual({ caughtAt: 3, survived: 2 });
    expect(confidence(5)).toBe(1 - 1 / 32);
    for (let n = 1; n <= 8; n++) {
      const s = survival(22, n, 1000);
      expect(s.withinThreeSigma, `n = ${n}: ${s.survived} of 1000 against ${s.expected.toFixed(2)} +- ${(3 * s.sigma).toFixed(1)}`).toBe(true);
    }
  });

  it('1,000 seeded games of 5 rounds survive a number within 3 sigma of 31.25 (sigma = 5.5)', () => {
    const s = survival(22, 5, 1000);
    expect(s.expected).toBe(31.25);
    expect(s.sigma).toBeCloseTo(5.5, 1);
    expect(Math.abs(s.survived - 31.25)).toBeLessThanOrEqual(3 * s.sigma);
  });
});
