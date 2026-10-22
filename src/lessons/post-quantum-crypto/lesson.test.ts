import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import { BAD, DEFAULT_TARGET, GOOD, babai } from './lattice';
import { BROKEN_SEED, DEFAULT_PARAMS, DEFAULT_SEED, FAILING_PARAMS, sweep } from './lwe';
import { DEFAULT_MOSCA, verdict } from './mosca';
import { isRun, shorRun } from './shor';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared between scenes', () => {
    const els = sceneElements('post-quantum-crypto');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('post-quantum-crypto')).toEqual([]);
  });
});

describe('try-this entries, in written order from the default state', () => {
  it('try-this 1: 10, 5, 12 reads at risk with slack -3; x = 5 and y = 2 is not at risk with slack 5', () => {
    expect(verdict(DEFAULT_MOSCA)).toEqual({ exposure: 15, slack: -3, atRisk: true });
    expect(verdict({ x: 5, y: 2, z: 12 })).toEqual({ exposure: 7, slack: 5, atRisk: false });
    expect(lesson.tryThis[0]).toContain('slack -3');
  });

  it('try-this 2: N = 15, a = 7 has order 4 in 4 steps with factors 3 and 5; a = 14 fails on a^(r/2) = -1', () => {
    const run = shorRun(15, 7);
    expect(isRun(run) && [run.r, run.steps, run.factors]).toEqual([4, 4, [3, 5]]);
    expect(lesson.tryThis[1]).toContain('the order is 4, found in 4 steps, and the factors are 3 and 5');
    expect(lesson.tryThis[1]).toContain('a^(r/2) = -1');
  });

  it('try-this 3: the defaults fail on none of 1,000 and the failing preset fails on its pinned seed, with the noise past 24', () => {
    expect(sweep(DEFAULT_PARAMS, DEFAULT_SEED).failures).toBe(0);
    const failing = sweep(FAILING_PARAMS, BROKEN_SEED);
    expect(lesson.tryThis[2]).toContain(`${failing.failures.toLocaleString('en-US')} of 1,000 fail`);
    expect(Math.abs(failing.firstFailure!.epsCentred)).toBeGreaterThan(24);
    expect(lesson.tryThis[2]).toContain('the noise passed 24');
  });

  it('try-this 4: target (10, 7): the good basis lands at (11, 7), 1 away; the bad basis at (10, 11), 4 away', () => {
    expect(babai(GOOD, DEFAULT_TARGET).point).toEqual([11, 7]);
    expect(babai(BAD, DEFAULT_TARGET).point).toEqual([10, 11]);
    expect(lesson.tryThis[3]).toContain('(11, 7), 1 away');
    expect(lesson.tryThis[3]).toContain('(10, 11), 4 away');
  });
});

describe('the lesson text agrees with the model', () => {
  it('the hybrid share is 1,249 bytes against 65, about 19 times', () => {
    expect(FACTS.hybridShare).toBe('1,249');
    expect(FACTS.hybridFactor).toBe(19);
    expect(lesson.keyIdeas[3]).toContain('1,249-byte client share against 65 bytes');
  });
});
