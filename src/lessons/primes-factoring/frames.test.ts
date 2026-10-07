import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { primalityCaption, runCaption, sieveFrames } from './frames';
import { SIEVE_SIZES, STEP_CAP, advanceTrial, extrapolateSeconds, longTime, primality, sievePlan, startTrial } from './model';

describe('sieveFrames', () => {
  it('captions every pass with its true crossing count, and ends on the true prime count, for every size', () => {
    for (const n of SIEVE_SIZES) {
      const plan = sievePlan(n);
      const frames = sieveFrames(plan);
      plan.passes.forEach((pass, i) => {
        const cross = frames.find((f) => f.pass === i && f.phase === 'cross')!;
        expect(text(cross.say)).toContain(`starting at ${pass.prime}² = ${pass.prime ** 2}: ${pass.crossed.length} new`);
      });
      expect(text(frames.at(-1)!.say)).toContain(`all ${plan.primes.length} survivors are prime`);
      expect(text(frames.at(-1)!.say)).toContain(`${plan.stopPrime}² = ${plan.stopPrime ** 2} > ${n}`);
      // close() adds the summary after the last crossing; it doesn't overwrite it.
      expect(frames.at(-2)!.phase).toBe('cross');
    }
    expect(text(sieveFrames(sievePlan(100)).at(-1)!.say)).toContain('all 25 survivors');
  });

  it('explains why crossing starts at p², not 2p', () => {
    const frames = sieveFrames(sievePlan(100));
    const seven = frames.find((f) => f.pass === 3 && f.phase === 'cross')!;
    expect(text(seven.say)).toContain('Not from 2·7: 14, 21, 28, 35 … were already crossed');
  });
});

describe('runCaption', () => {
  it('reports the factor and step count it actually found', () => {
    let run = startTrial(61n * 53n);
    while (run.status === 'running') run = advanceTrial(run, 1e9);
    expect(text(runCaption(run, 0.001))).toBe(`Found 53 after ${run.steps} divisions in 1 ms. Multiplying took one step; undoing it took ${run.steps}.`);
  });

  it('says "too big to try here" at the cap, with the extrapolation from the named function', () => {
    const run = advanceTrial({ ...startTrial((2n ** 61n - 1n) ** 2n), steps: STEP_CAP - 10 }, 1e6);
    const c = text(runCaption(run, 10));
    expect(c).toContain('too big to try here');
    expect(c).toContain(longTime(extrapolateSeconds(37, run.steps / 10)));
    expect(c).not.toContain('prime');
  });
});

describe('primalityCaption', () => {
  it('names the Carmichael trap, and never claims prime without proof', () => {
    expect(text(primalityCaption(561n, primality(561n)))).toContain('561 = 3 × 11 × 17 fools Fermat');
    expect(text(primalityCaption(97n, primality(97n)))).toBe('97 is prime: all three agree.');
    expect(text(primalityCaption(91n, primality(91n)))).toBe('91 = 7 × 13: composite, and every test says so.');
    const big = 2n ** 61n - 1n;
    expect(text(primalityCaption(big, primality(big)))).toContain('prime: Miller-Rabin proves it');
    const huge = 10n ** 39n + 3n;
    expect(text(primalityCaption(huge, primality(huge)))).toContain('probably prime');
  });
});
