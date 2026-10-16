import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  COUNTER_MAX, TAKEN_FROM, accuracy, initPredictor, missCount, predict, randomOutcomes, run, totalCycles, twoBitStationaryAccuracy, update,
  type PredictorConfig, type PredictorState,
} from './predictor';

const word = (s: string) => [...s].map((c) => c === 'T');
const cfg = (kind: PredictorConfig['kind'], initialCounter = 2, historyBits = 2): PredictorConfig => ({ kind, initialCounter, historyBits });
/** Misses over the last `n` branches of a long run: "after warm-up". */
const tailMisses = (config: PredictorConfig, unit: string, repeats: number, n: number) => {
  const steps = run(config, word(unit.repeat(repeats)));
  return missCount(steps.slice(-n));
};

describe('hand-worked streams (after warm-up)', () => {
  it('loop TTTN: the 2-bit counter misses 1 in 4, the 1-bit predictor 2 in 4', () => {
    expect(tailMisses(cfg('two-bit'), 'TTTN', 20, 40)).toBe(10);
    expect(tailMisses(cfg('one-bit'), 'TTTN', 20, 40)).toBe(20);
  });

  it('alternating TN: the 1-bit predictor misses every branch', () => {
    expect(tailMisses(cfg('one-bit'), 'TN', 30, 40)).toBe(40);
  });

  it('a stream that starts with T: the 2-bit counter misses every branch from state 1 and every second one from states 0, 2 and 3', () => {
    const alternating = word('TN'.repeat(20));
    const misses = [0, 1, 2, 3].map((initialCounter) => run(cfg('two-bit', initialCounter), alternating).map((s) => !s.hit));
    expect(misses[1].every(Boolean)).toBe(true);
    for (const start of [0, 2, 3]) {
      // hand-worked: miss, hit, miss, hit ... from state 0 (T misses, N hits); hit, miss, hit, miss ... from 2 and 3 (T hits, N misses)
      const expected = Array.from({ length: 40 }, (_, i) => (start === 0 ? i % 2 === 0 : i % 2 === 1));
      expect(misses[start]).toEqual(expected);
    }
  });

  it('two-level with h = 1 is perfect on alternating TN after its first branches', () => {
    for (const init of [0, 1, 2, 3]) {
      const steps = run(cfg('two-level', init, 1), word('TN'.repeat(20)));
      // Each of the two table entries needs at most two outcomes to settle, so everything after the 4th branch hits.
      expect(missCount(steps.slice(4))).toBe(0);
    }
    expect(missCount(run(cfg('two-level', 2, 1), word('TN'.repeat(20))).slice(2))).toBe(0);
    expect(missCount(run(cfg('two-level', 1, 1), word('TN'.repeat(20))).slice(2))).toBe(0);
  });

  it('pairs TTNN: the 1-bit predictor beats the 2-bit counter (the 2-bit is not always better)', () => {
    // hand-worked: 1-bit misses on both changes (2 in 4); 2-bit from state 3 misses N, N, T (3 in 4)
    expect(tailMisses(cfg('one-bit'), 'TTNN', 20, 40)).toBe(20);
    expect(tailMisses(cfg('two-bit', 3), 'TTNN', 20, 40)).toBe(30);
  });

  it('static predictors miss exactly the outcomes they disagree with', () => {
    const stream = word('TTNTNNNT');
    expect(missCount(run(cfg('static-taken'), stream))).toBe(4);
    expect(missCount(run(cfg('static-not-taken'), stream))).toBe(4);
    expect(missCount(run(cfg('static-taken'), word('TTTT')))).toBe(0);
  });
});

describe('the 2-bit counter machine', () => {
  const at = (counter: number): PredictorState => ({ ...initPredictor(cfg('two-bit', counter)) });
  it('moves up on taken and down on not-taken, saturating at 0 and 3', () => {
    expect([0, 1, 2, 3].map((c) => update(at(c), true).counter)).toEqual([1, 2, 3, 3]);
    expect([0, 1, 2, 3].map((c) => update(at(c), false).counter)).toEqual([0, 0, 1, 2]);
  });
  it('predicts taken exactly from state 2 up', () => {
    expect([0, 1, 2, 3].map((c) => predict(at(c)))).toEqual([false, false, true, true]);
    expect(TAKEN_FROM).toBe(2);
    expect(COUNTER_MAX).toBe(3);
  });
  it('a broken counter that wraps instead of saturating disagrees with the hand-worked TTTN count', () => {
    // 3 + 1 wraps to 0 and 0 - 1 wraps to 3: the "strongly taken" state flips to "strongly not-taken" on the next T.
    let counter = 3;
    const missed: boolean[] = [];
    for (const taken of word('TTTN'.repeat(30))) {
      missed.push((counter >= 2) !== taken);
      counter = (counter + (taken ? 1 : 3)) & 3;
    }
    expect(missed.slice(-40).filter(Boolean).length).not.toBe(10);
    expect(tailMisses(cfg('two-bit', 3), 'TTTN', 30, 40)).toBe(10);
  });
});

describe('the stationary accuracy of the 2-bit counter on independent outcomes', () => {
  it('matches 200,000 seeded outcomes within 0.01 at p = 0.5, 0.7 and 0.9', () => {
    for (const p of [0.5, 0.7, 0.9]) {
      const outcomes = randomOutcomes(mulberry32(1234), p, 200_000);
      const measured = accuracy(run(cfg('two-bit'), outcomes));
      expect(Math.abs(measured - twoBitStationaryAccuracy(p))).toBeLessThan(0.01);
    }
  });
  it('closed form: p = 0.5 gives 0.5, p = 0.9 gives about 0.9 (hand-worked from pi proportional to 9^i)', () => {
    expect(twoBitStationaryAccuracy(0.5)).toBeCloseTo(0.5, 12);
    // pi = [1, 9, 81, 729] / 820; taken share = 810 / 820; accuracy = share * 0.9 + (1 - share) * 0.1
    expect(twoBitStationaryAccuracy(0.9)).toBeCloseTo((810 / 820) * 0.9 + (10 / 820) * 0.1, 12);
  });
});

describe('cycles', () => {
  it('total cycles equal instructions + misses x penalty, recomputed from the recorded hit and miss list', () => {
    const steps = run(cfg('one-bit'), randomOutcomes(mulberry32(3), 0.5, 100));
    const misses = steps.filter((s) => s.guess !== s.taken).length;
    expect(totalCycles(600, misses, 15)).toBe(600 + misses * 15);
  });
});
