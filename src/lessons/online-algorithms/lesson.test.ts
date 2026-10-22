import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import {
  B_DEFAULT, autopilot, boundViolations, breakEven, challenge, clampSki, lateThreshold, opt, pagingScore, ratio, skiCost,
} from './model';

const be = breakEven(B_DEFAULT);

describe('scenes', () => {
  it('every scene component carries its own key, and no component is shared between scenes', () => {
    const els = sceneElements('online-algorithms');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('online-algorithms')).toEqual([]);
  });

  it('scene 1 opens on B = 10, t = 9, N = 11', () => {
    expect([FACTS.B, FACTS.t, FACTS.N]).toEqual([10, 9, 11]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: online 19, optimum 10, ratio 1.90', () => {
    expect([skiCost(be, 10, 11), opt(10, 11), ratio(be, 10, 11)]).toEqual([19, 10, 1.9]);
    expect(lesson.tryThis[0]).toContain('online 19, optimum 10, ratio 1.90');
  });

  it('try-this 2: N = 9 gives 1.00, then t = 0 with N = 1 gives 10.00', () => {
    expect(ratio(be, 10, 9)).toBe(1);
    expect(ratio({ t: 0, never: false }, 10, 1)).toBe(10);
    expect(FACTS.shortSeasonRatio).toBe('1.00');
    expect(FACTS.buyAtOnceRatio).toBe('10.00');
  });

  it('try-this 3: the late chip shows N = 11 at 2.00 against 1.90, breaking the bound on 190 of 200 lengths', () => {
    const late = boundViolations(lateThreshold(10), 10);
    expect([late.firstViolation?.N, late.firstViolation?.ratio, late.violations, late.horizon]).toEqual([11, 2, 190, 200]);
    expect(lesson.tryThis[2]).toContain('N = 11, ratio 2.00 against 1.90');
    expect(lesson.tryThis[2]).toContain('190 of the 200');
  });

  it('try-this 4: a target of 2.00 against t = 9 is refused with N = 10 at 1.90', () => {
    const r = challenge(be, 10, 2);
    expect([r.ok, r.N, r.ratio.toFixed(2)]).toEqual([false, 10, '1.90']);
    expect(lesson.tryThis[3]).toContain('N = 10 at 1.90');
  });

  it('try-this 5: Autopilot x 12 on a cache of 3 gives 12 LRU misses and 6 for the optimum', () => {
    expect(pagingScore(autopilot([], 3, 12), 3)).toMatchObject({ lru: 12, optimum: 6 });
    expect(lesson.tryThis[4]).toContain('12 times and the optimum 6');
  });
});

describe('the lesson text agrees with the model', () => {
  it('the key ideas quote the model numbers', () => {
    expect(lesson.keyIdeas[0]).toContain('pays 19 against 10');
    expect(lesson.keyIdeas[1]).toContain('costs 20 against 10, ratio 2.00');
    expect(lesson.keyIdeas[2]).toContain('6.0 at a season of 60 days');
    expect(lesson.keyIdeas[3]).toContain('2.5');
  });

  it('controls shrink B to its minimum and the page says what it clamped', () => {
    const c = clampSki(2, 9, 11);
    expect([c.t, c.N]).toEqual([6, 11]);
    expect(c.note).toContain('came down from 9 to 6');
  });
});
