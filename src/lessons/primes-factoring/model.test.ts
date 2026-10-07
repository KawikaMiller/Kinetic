import { describe, expect, it } from 'vitest';
import { isProbablePrime, sieve, trialFactor } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import {
  RSA_2048_DIGITS, SIEVE_SIZES, cellState, trialStepsFor, sieveCounts, STEP_CAP, TRIAL_LIMIT, advanceTrial, belowSquare, digitsOf, extrapolateSeconds, factorText,
  fermatSaysPrime, longTime, parseCandidate, primality, primeWithDigits, sievePlan, startTrial, stepsForDigits,
} from './model';

const MR_SWEEP_TIMEOUT_MS = 60_000;

const isPrimeRef = (n: number) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};

describe('sieve', () => {
  it('matches trial division for every n from 2 to 10,000', () => {
    const { isPrime } = sieve(10_000);
    for (let n = 2; n <= 10_000; n++) expect(isPrime[n], String(n)).toBe(isPrimeRef(n));
  });

  it('crosses out from p², never re-crosses, and stops once p² > N, for every lesson size', () => {
    for (const n of SIEVE_SIZES) {
      const plan = sievePlan(n);
      for (const pass of plan.passes) {
        expect(pass.prime * pass.prime).toBeLessThanOrEqual(n);
        expect(pass.crossed[0]).toBe(pass.prime * pass.prime);
        for (const m of pass.crossed) expect(m % pass.prime).toBe(0);
      }
      expect(plan.stopPrime ** 2).toBeGreaterThan(n);
      const last = plan.passes.at(-1)!.prime;
      expect(plan.primes[plan.primes.indexOf(last) + 1]).toBe(plan.stopPrime);
      const crossed = plan.passes.flatMap((p) => p.crossed);
      expect(new Set(crossed).size).toBe(crossed.length);
      expect(crossed.length + plan.primes.length).toBe(n - 1);
    }
    expect(sievePlan(100).primes.length).toBe(25);
    expect(sievePlan(100).passes.map((p) => p.prime)).toEqual([2, 3, 5, 7]);
  });

  it('every multiple below p² was already crossed by a smaller prime (why 2p is wasted work)', () => {
    const plan = sievePlan(400);
    for (const { prime } of plan.passes) {
      const pass = plan.passes.findIndex((p) => p.prime === prime);
      for (const m of belowSquare(prime)) expect(plan.crossedBy[m]).toBeLessThan(pass);
    }
  });

  it('colours cells consistently: a crossing shows red on its own pass, then dim; primes go green once passed', () => {
    const plan = sievePlan(100);
    expect(cellState(1, plan, 0, 'light')).toBe('one');
    expect(cellState(4, plan, 0, 'light')).toBe('unvisited');
    expect(cellState(2, plan, 0, 'light')).toBe('current');
    expect(cellState(4, plan, 0, 'cross')).toBe('fresh');
    expect(cellState(4, plan, 1, 'light')).toBe('crossed');
    expect(cellState(2, plan, 1, 'light')).toBe('prime');
    expect(cellState(97, plan, 3, 'cross')).toBe('unvisited');
    for (let m = 2; m <= 100; m++) expect(cellState(m, plan, plan.passes.length, 'done')).toBe(plan.primes.includes(m) ? 'prime' : 'crossed');
    // A number is fresh on exactly one frame of the run.
    for (let m = 4; m <= 100; m++) {
      const freshCount = plan.passes.filter((_, i) => cellState(m, plan, i, 'cross') === 'fresh').length;
      expect(freshCount).toBe(plan.primes.includes(m) ? 0 : 1);
    }
  });

  it('counts primes and crossings from the plan', () => {
    const plan = sievePlan(100);
    expect(sieveCounts(plan, -1, 'start')).toEqual({ primes: 0, crossings: 0 });
    expect(sieveCounts(plan, 0, 'light')).toEqual({ primes: 1, crossings: 0 });
    expect(sieveCounts(plan, 0, 'cross')).toEqual({ primes: 1, crossings: 49 });
    expect(sieveCounts(plan, 4, 'done')).toEqual({ primes: 25, crossings: 74 });
  });

  it('labels cells with their factorisation', () => {
    expect(factorText(57)).toBe('57 = 3 × 19');
    expect(factorText(53)).toBe('53 is prime');
    expect(factorText(1)).toBe('1 is neither prime nor composite');
  });
});

describe('trial division', () => {
  it('trialFactor multiplies back to n for 1,000 seeded n below 10¹²', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const n = BigInt(1 + Math.floor(rnd() * 1e12));
      const { factors } = trialFactor(n);
      expect(factors.reduce((a, b) => a * b, 1n)).toBe(n);
      for (const f of factors) expect(isProbablePrime(f).prime).toBe(true);
    }
  });

  it('the sliced run finds the smallest factor whatever the slice size, on both number paths', () => {
    const cases: [bigint, bigint | null][] = [
      [61n * 53n, 53n],
      [999_983n * 1_000_003n, 999_983n],
      [104_729n, null],
      [9_007_199_254_740_881n * 3n, 3n], // above 2⁵³: the bigint path
      [4n, 2n],
      [3n, null],
    ];
    for (const [n, factor] of cases) {
      for (const budget of [1, 7, 1000, 1e9]) {
        let run = startTrial(n);
        while (run.status === 'running') run = advanceTrial(run, budget);
        expect(run.status).toBe(factor === null ? 'prime' : 'found');
        expect(run.factor).toBe(factor);
      }
    }
  });

  it('counts the same divisions as one uninterrupted run, and stops at the cap', () => {
    const n = 999_983n * 1_000_003n;
    let sliced = startTrial(n);
    while (sliced.status === 'running') sliced = advanceTrial(sliced, 333);
    expect(advanceTrial(startTrial(n), 1e9).steps).toBe(sliced.steps);
    // 2, then the odd numbers 3 … 999,983: 1 + 499,991 divisions.
    expect(sliced.steps).toBe(1 + (999_983 - 1) / 2);
    const capped = advanceTrial({ ...startTrial(10n ** 30n + 57n), steps: STEP_CAP - 5 }, 1e6);
    expect(capped.status).toBe('capped');
    expect(capped.steps).toBe(STEP_CAP);
  });
});

describe('extrapolation', () => {
  it('is √n / 2 divisions at the measured speed, the number the caption and plot read', () => {
    expect(stepsForDigits(12)).toBe(500_000);
    expect(extrapolateSeconds(12, 1e6)).toBeCloseTo(0.5, 12);
    expect(extrapolateSeconds(14, 1e6) / extrapolateSeconds(12, 1e6)).toBeCloseTo(10, 9);
    expect(Number.isFinite(extrapolateSeconds(RSA_2048_DIGITS, 1e7))).toBe(true);
  });

  it('a 1,000× faster computer only buys 6 more digits', () => {
    for (const d of [20, 100, 611]) {
      expect(Math.log10(extrapolateSeconds(d + 6, 1e10)) - Math.log10(extrapolateSeconds(d, 1e7))).toBeCloseTo(0, 9);
    }
  });

  it('writes huge spans as powers of ten', () => {
    expect(longTime(90)).toBe('1.5 min');
    expect(longTime(extrapolateSeconds(RSA_2048_DIGITS, 1e7))).toMatch(/^\d(\.\d)?\u00a0×\u00a010\S+ years$/);
  });

  it('makes primes with exactly the asked-for digits', () => {
    const rnd = mulberry32(7);
    for (let d = 2; d <= 12; d++) {
      const p = primeWithDigits(d, rnd);
      expect(digitsOf(p)).toBe(d);
      expect(isProbablePrime(p)).toEqual({ prime: true, certain: true });
    }
  });
});

describe('primality', () => {
  // A million bigint Miller-Rabin runs: a few seconds alone, more when the whole suite runs in parallel.
  it('Miller-Rabin agrees with the sieve below 10⁶', () => {
    const { isPrime } = sieve(1_000_000);
    const wrong: number[] = [];
    for (let n = 2; n < 1_000_000; n++) if (isProbablePrime(BigInt(n)).prime !== isPrime[n]) wrong.push(n);
    expect(wrong).toEqual([]);
  }, MR_SWEEP_TIMEOUT_MS);

  it('Fermat base 2 is fooled by Carmichael numbers; Miller-Rabin and trial division are not', () => {
    for (const c of [561n, 1105n, 1729n]) {
      const r = primality(c);
      expect(r.fermat).toBe(true);
      expect(r.millerRabin.prime).toBe(false);
      expect(r.truth).toBe(false);
    }
    expect(primality(561n).trial).toEqual({ factors: [3n, 11n, 17n], steps: expect.any(Number) });
    expect(fermatSaysPrime(97n)).toBe(true);
    expect(fermatSaysPrime(91n)).toBe(false);
  });

  it('never calls a number prime when trial division is too big to run', () => {
    const big = TRIAL_LIMIT * 1_000_003n;
    const r = primality(big);
    expect(r.trial).toBe('too-big');
    expect(r.truth).toBe(false);
    const huge = primality(10n ** 39n + 3n);
    expect(huge.millerRabin.certain).toBe(false);
    expect(huge.truth).toBeNull();
  });

  it('estimates the divisions trial division would need', () => {
    expect(trialStepsFor(10n ** 12n)).toBe(500_000);
    expect(Math.log10(trialStepsFor(2n ** 61n - 1n))).toBeCloseTo(8.88, 2);
  });

  it('refuses hostile input', () => {
    for (const bad of ['', '  ', '-7', '−7', '1.5', '1e400', '1,2', '😀', '<b>7</b>', '0x11', '1', '0', '9'.repeat(41)]) {
      expect('error' in parseCandidate(bad), bad).toBe(true);
    }
    expect(parseCandidate(' 561 ')).toEqual({ ok: true, value: 561n });
    expect(parseCandidate('1,000,003')).toEqual({ ok: true, value: 1_000_003n });
  });
});
