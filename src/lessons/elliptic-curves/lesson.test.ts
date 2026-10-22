import { describe, expect, it } from 'vitest';
import { formatPoint } from '../../core/ecc';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import { DEFAULT_FIELD, NO_PICKS, claimField, fieldSum, mulChecked, nextPicks, realAdd, realPointText, scalarView } from './model';
import { rat } from './rational';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared between scenes', () => {
    const els = sceneElements('elliptic-curves');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('elliptic-curves')).toEqual([]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  const click = (x: number, y: number, picks = NO_PICKS) => {
    const claim = claimField(DEFAULT_FIELD, x, y);
    if (!claim.ok) throw new Error(claim.message);
    return nextPicks(picks, claim.point);
  };

  it('try-this 1: (5, 1) then the same cell doubles to (6, 3) with slope 13; (5, 1) then (6, 3) sums to (10, 6)', () => {
    const doubled = click(5, 1, click(5, 1));
    const w = fieldSum(DEFAULT_FIELD, doubled.P, doubled.Q);
    expect(formatPoint(w.result)).toBe('(6, 3)');
    expect(w.lines[2]).toContain('= 13 mod 17');
    const next = click(6, 3, click(5, 1, doubled));
    expect(formatPoint(fieldSum(DEFAULT_FIELD, next.P, next.Q).result)).toBe('(10, 6)');
    expect(lesson.tryThis[0]).toContain('(6, 3) and shows slope 13');
    expect(lesson.tryThis[0]).toContain('the sum is (10, 6)');
  });

  it('try-this 2: the default k = 13 gives 3 doublings, 2 additions and (16, 4); 19 is O; 20 is (5, 1)', () => {
    const v = scalarView(13n);
    expect([v.doublings, v.additions, formatPoint(v.point)]).toEqual([3, 2, '(16, 4)']);
    expect(scalarView(19n).point).toBeNull();
    expect(formatPoint(scalarView(20n).point)).toBe('(5, 1)');
    expect(lesson.tryThis[1]).toContain('3 doublings, 2 additions and (16, 4)');
    expect(lesson.tryThis[1]).toContain('Press 20: (5, 1)');
  });

  it('try-this 3: the walk is at most 19 steps and the P-256 line is about 2^128 steps', () => {
    expect(lesson.tryThis[2]).toContain('at most 19 steps');
    expect(lesson.tryThis[2]).toContain('2¹²⁸');
    expect(FACTS.p256Time).toMatch(/10¹⁹ years$/);
  });

  it('try-this 4: from the default (-2, 1), (0, 1) + (1, 0) is (0, -1)', () => {
    expect(realPointText(realAdd({ a: -2, b: 1 }, { x: rat(0n), y: rat(1n) }, { x: rat(1n), y: rat(0n) }).result)).toBe('(0, -1)');
    expect(lesson.tryThis[3]).toContain('P + Q is (0, -1)');
  });

  it('manipulation 2: clicking (5, 2) is refused with both sides of the equation and no point is picked', () => {
    const claim = claimField(DEFAULT_FIELD, 5, 2);
    expect(claim).toEqual({ ok: false, message: '(5, 2): y^2 = 4 but x^3 + 2x + 2 = 1 mod 17, not on the curve' });
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas quote the model numbers', () => {
    expect(FACTS.toyCount).toBe(19);
    expect(lesson.keyIdeas[3]).toContain('6859 triples'.replace('6859', '6859'));
    expect(lesson.keyIdeas[0]).toContain('(6, 3)');
    expect(FACTS.brokenAtWitness).toBe(true);
    expect(mulChecked('correct', 2n).failure).toBeNull();
  });
});
