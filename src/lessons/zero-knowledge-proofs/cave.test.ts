import { describe, expect, it } from 'vitest';
import {
  MAX_ROUNDS, PATTERN_MIN, answers, appendCall, cheaterGame, confidence, isPattern, meter, patternFalseAlarm, policyCall, predictNext, proverKind, survival, verdict, verifierCaption, verifierCall, type Policy, type Side,
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

  it('the opening caption scopes its claim to the model and says no "always"', () => {
    for (const kind of ['knows', 'cheater'] as const) {
      const text = verifierCaption(kind, [], null);
      expect(text).toContain('In this model');
      expect(text).not.toMatch(/\balways\b/i);
    }
  });

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

  it('strictly alternating calls are NOT followed: the habit-follower repeats the last call, so the cheater is caught in round 2 and the meter is not struck', () => {
    const rounds = answers('cheater', cheater, calls('alternate', 10, cheater), 'alternate');
    expect(rounds[0].passed).toBe(true);
    expect(rounds[1]).toMatchObject({ call: 'R', entered: 'L', passed: false });
    expect(meter(rounds)).toMatchObject({ passed: 1, failedAt: 2 });
  });

  it('a cheater never uses the declared policy: of all 2^10 call sequences by hand exactly one (all the same side as round 1, left) passes 10 of 10', () => {
    let survivors = 0;
    for (let bits = 0; bits < 2 ** 10; bits++) {
      const seq: Side[] = Array.from({ length: 10 }, (_, i) => ((bits >> i) & 1 ? 'R' : 'L'));
      if (answers('cheater', 1, seq, 'manual').every((r) => r.passed)) survivors++;
    }
    expect(survivors).toBe(1);
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

  it('the predictor is causal: with no history it says left, afterwards the side called last', () => {
    expect(predictNext([])).toBe('L');
    expect(predictNext(['R'])).toBe('R');
    expect(predictNext(['L', 'R', 'L'])).toBe('L');
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

type Played = { calls: readonly Side[]; rounds: ReturnType<typeof answers> };

/** Every call sequence of length <= 7, played through the page's own append rule against one prover and policy. */
function* reachable(kind: 'knows' | 'cheater', seed: number, policy: Policy): Generator<Played> {
  const visit = function* (played: readonly Side[]): Generator<Played> {
    yield { calls: played, rounds: answers(kind, seed, played, policy) };
    if (played.length >= 7) return;
    for (const side of ['L', 'R'] as const) {
      const next = appendCall(kind, seed, policy, played, side, false);
      if (next !== played) yield* visit(next);
    }
  };
  yield* visit([]);
}

describe('a caught prover (the blocker: the caption claimed passes after a catch)', () => {
  it('repro: seed 3 (a cheater), Left, Right, then Right twice: the calls stop at the catch and the caption names round 2, not a 0.96875 meter', () => {
    expect(proverKind(3)).toBe('cheater');
    let played: readonly Side[] = [];
    for (const side of ['L', 'R', 'R', 'R'] as const) played = appendCall('cheater', 3, 'manual', played, side, false);
    expect(played).toEqual(['L', 'R']);
    const rounds = answers('cheater', 3, played, 'manual');
    expect(meter(rounds)).toMatchObject({ passed: 1, failedAt: 2, value: 0.5 });
    const text = verifierCaption('cheater', rounds, null);
    expect(text).toContain('Round 2');
    expect(text).not.toContain('0.96875');
    expect(text).not.toMatch(/\d+ rounds? passed/);
  });

  it('walking every reachable state: the caption quotes the meter only while no round has failed, and always agrees with the stats', () => {
    let states = 0;
    for (const kind of ['knows', 'cheater'] as const) {
      for (const policy of ['manual', 'always-left', 'alternate', 'random'] as const) {
        for (const seed of [3, 7]) {
          for (const { calls, rounds } of reachable(kind, seed, policy)) {
            states++;
            const m = meter(rounds);
            const text = verifierCaption(kind, rounds, null);
            if (m.failedAt !== null) {
              // a failed round ends the calls: every round after the failure is absent
              expect(calls.length, `${kind} ${policy} ${seed} ${calls.join('')}`).toBe(m.failedAt);
              expect(text).toContain(`Round ${m.failedAt}:`);
              expect(text).not.toContain('meter reads');
            } else if (calls.length > 0) {
              expect(text).toContain(`${calls.length} round${calls.length === 1 ? '' : 's'} passed`);
              expect(text).toContain(`meter reads ${confidence(calls.length)}`);
              expect(m.passed).toBe(calls.length);
            }
            if (calls.length > 0) {
              const decided = verifierCaption(kind, rounds, true);
              if (m.failedAt !== null) expect(decided).toContain(`caught in round ${m.failedAt}`);
              else expect(decided).not.toContain('caught in round');
            }
          }
        }
      }
    }
    expect(states).toBeGreaterThan(500);
  });

  it('no call is appended after a failure, after ten rounds or after a verdict', () => {
    const caught = appendCall('cheater', 3, 'manual', ['L'], 'R', false);
    expect(caught).toEqual(['L', 'R']);
    expect(appendCall('cheater', 3, 'manual', caught, 'R', false)).toBe(caught);
    const ten: readonly Side[] = Array(10).fill('L');
    expect(appendCall('knows', 7, 'manual', ten, 'L', false)).toBe(ten);
    expect(appendCall('knows', 7, 'manual', ['L'], 'L', true)).toEqual(['L']);
  });
});

describe('the pattern flag is fair to random calls', () => {
  it(`flags only runs of ${PATTERN_MIN} or more; over all 2^n sequences the share flagged is exactly 2^-(n-2), as the page states`, () => {
    expect(PATTERN_MIN).toBe(6);
    for (let n = 1; n <= 12; n++) {
      let flagged = 0;
      for (let bits = 0; bits < 2 ** n; bits++) {
        const seq: Side[] = Array.from({ length: n }, (_, i) => ((bits >> i) & 1 ? 'R' : 'L'));
        if (isPattern(seq)) flagged++;
      }
      expect(flagged / 2 ** n, `n = ${n}`).toBe(n < PATTERN_MIN ? 0 : 4 / 2 ** n);
      expect(patternFalseAlarm(n)).toBe(flagged / 2 ** n);
    }
    expect(patternFalseAlarm(6)).toBe(0.0625);
  });

  it('try-this 1: five Random calls of the default seed 7 (a prover who knows) are not struck', () => {
    const rand: Side[] = Array.from({ length: 5 }, (_, i) => verifierCall(7, i));
    expect(isPattern(rand)).toBe(false);
    expect(meter(answers('knows', 7, rand, 'manual'))).toMatchObject({ struck: false, value: 0.96875 });
  });
});
