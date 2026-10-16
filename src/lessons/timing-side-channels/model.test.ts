import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_GUESS, MAX_GUESS_BYTES, SECRET_BYTES, SECRET_TEXT, byteStates, constantTimeCompare, earlyExitCompare, matchedPrefix, parseGuess,
} from './compare';
import {
  COMPARISONS_FIRST_RIGHT, COMPARISONS_FIRST_WRONG, HISTOGRAM_SAMPLES, NOISE_RANGE, NOISE_SEED, SIGNAL_RANGE, average, detectionRate, meanTime, noiseOpening,
  sampleTimes, samplesNeeded, timeDistributions,
} from './noise';
import { LEAK_CLASSES, MITIGATIONS, classVerdict, coverageOf, openClasses } from './mitigations';
import { PAIR_PRESETS, PROGRAMS, programOf, secretBytes, secretHex, traceOf, verdict, type ProgramId } from './traces';

/** A guess of the secret's length that agrees with it for exactly `prefix` bytes, with the rest random and different. */
function guessWithPrefix(rnd: () => number, prefix: number): number[] {
  return SECRET_BYTES.map((b, i) => (i < prefix ? b : (b + 1 + Math.floor(rnd() * 255)) % 256));
}

describe('the comparison functions, instrumented', () => {
  it('the token is 16 bytes of fake text that matches no real credential shape', () => {
    expect(SECRET_BYTES).toHaveLength(MAX_GUESS_BYTES);
    expect(SECRET_TEXT).toBe('demo-tok-7Hq2zX9');
    expect(SECRET_TEXT).not.toMatch(/^(sk|pk|rk)_(live|test)_|^AKIA|^ghp_|^xox[abp]-|^eyJ|^AIza/);
  });

  it('early exit executes min(matched prefix + 1, n) comparisons for 2,000 seeded guesses', () => {
    const rnd = mulberry32(2024);
    for (let k = 0; k < 2000; k++) {
      const prefix = Math.floor(rnd() * (SECRET_BYTES.length + 1));
      const guess = guessWithPrefix(rnd, prefix);
      // an independent prefix count, written out here rather than imported
      let p = 0;
      while (p < guess.length && guess[p] === SECRET_BYTES[p]) p++;
      expect(p).toBe(prefix);
      const out = earlyExitCompare(SECRET_BYTES, guess);
      expect(out.comparisons).toBe(Math.min(prefix + 1, SECRET_BYTES.length));
      expect(out.visited).toEqual(Array.from({ length: out.comparisons }, (_, i) => i));
      expect(matchedPrefix(SECRET_BYTES, guess)).toBe(prefix);
    }
  });

  it('constant time executes n comparisons for every guess of the secret\'s length, and both functions agree with === on bytes', () => {
    const rnd = mulberry32(99);
    for (let k = 0; k < 2000; k++) {
      const guess = guessWithPrefix(rnd, Math.floor(rnd() * (SECRET_BYTES.length + 1)));
      const early = earlyExitCompare(SECRET_BYTES, guess);
      const constant = constantTimeCompare(SECRET_BYTES, guess);
      expect(constant.comparisons).toBe(SECRET_BYTES.length);
      const same = SECRET_BYTES.every((b, i) => b === guess[i]);
      expect([early.equal, constant.equal]).toEqual([same, same]);
    }
    expect(earlyExitCompare(SECRET_BYTES, SECRET_BYTES)).toMatchObject({ equal: true, comparisons: 16 });
    expect(constantTimeCompare(SECRET_BYTES, SECRET_BYTES)).toMatchObject({ equal: true, comparisons: 16 });
  });

  it('a length mismatch stops both functions at the length check with no byte comparison', () => {
    for (const n of [0, 1, 15]) {
      const guess = Array.from({ length: n }, () => 65);
      for (const f of [earlyExitCompare, constantTimeCompare]) {
        expect(f(SECRET_BYTES, guess)).toMatchObject({ equal: false, comparisons: 0, lengthMismatch: true });
      }
    }
  });

  it('the visit states match the instrument: matches before the first mismatch, then unvisited for early exit, all visited for constant time', () => {
    const guess = [...SECRET_BYTES.slice(0, 4), 0, ...SECRET_BYTES.slice(5)];
    const early = byteStates(SECRET_BYTES, guess, earlyExitCompare(SECRET_BYTES, guess));
    expect(early.slice(0, 4)).toEqual(['match', 'match', 'match', 'match']);
    expect(early[4]).toBe('mismatch');
    expect(early.slice(5).every((s) => s === 'unvisited')).toBe(true);
    const constant = byteStates(SECRET_BYTES, guess, constantTimeCompare(SECRET_BYTES, guess));
    expect(constant.includes('unvisited')).toBe(false);
    expect(constant.filter((s) => s === 'mismatch')).toHaveLength(1);
  });

  it('the guess field accepts up to 16 UTF-8 bytes and refuses the rest with a message', () => {
    expect(parseGuess(DEFAULT_GUESS)).toMatchObject({ ok: true });
    expect(parseGuess('')).toMatchObject({ ok: true, value: { bytes: [] } });
    expect(parseGuess('a'.repeat(16))).toMatchObject({ ok: true });
    expect(parseGuess('a'.repeat(17))).toEqual({ ok: false, error: 'That is 17 bytes in UTF-8; the limit is 16.' });
    // multi-byte characters count as bytes: 6 x 3 bytes = 18
    expect(parseGuess('€'.repeat(6))).toMatchObject({ ok: false });
    expect(parseGuess('€'.repeat(5))).toMatchObject({ ok: true, value: { bytes: expect.any(Array) } });
    expect(parseGuess('ab\ncd')).toMatchObject({ ok: false });
    expect(parseGuess('ab\u0000')).toMatchObject({ ok: false });
    expect(parseGuess('ab\uD800')).toMatchObject({ ok: false });
    expect(parseGuess('\uDC00ab')).toMatchObject({ ok: false });
    expect(parseGuess('😀')).toMatchObject({ ok: true });
  });
});

describe('the simulated measurement', () => {
  it('samples needed is n = 2 (1.96 + 0.84)^2 sigma^2 / delta^2, hand-worked at the opening setting', () => {
    const open = noiseOpening();
    expect(open).toEqual({ perComparison: SIGNAL_RANGE.default, sigma: NOISE_RANGE.default });
    // sigma 40, delta 10: 2 x 7.84 x 1600 / 100 = 250.88, rounded up
    expect(samplesNeeded(open)).toBe(251);
    // ten times the signal: sigma 100 at c = 10 is 1,568
    expect(samplesNeeded({ perComparison: 10, sigma: 100 })).toBe(1568);
    // halving the noise quarters it; doubling the signal quarters it
    expect(samplesNeeded({ perComparison: 10, sigma: 20 })).toBe(63);
    expect(samplesNeeded({ perComparison: 20, sigma: 40 })).toBe(63);
  });

  it('a seeded Monte Carlo of 2,000 two-sample z-tests detects the difference in about 80% of runs at n, and clearly fewer at n / 4', () => {
    for (const s of [{ perComparison: 10, sigma: 40 }, { perComparison: 10, sigma: 60 }, { perComparison: 5, sigma: 20 }]) {
      const n = samplesNeeded(s);
      const atN = detectionRate(s, n, 2000, 5);
      expect(Math.abs(atN - 0.8)).toBeLessThan(0.03);
      const quarter = detectionRate(s, Math.max(1, Math.round(n / 4)), 2000, 6);
      expect(quarter).toBeLessThan(0.5);
      expect(quarter).toBeLessThan(atN - 0.25);
    }
  });

  it('noise raises the cost of an observer without removing the leak: the rate at 4x the samples is far above chance for any sigma', () => {
    for (const sigma of [NOISE_RANGE.min, 100, NOISE_RANGE.max]) {
      const s = { perComparison: 10, sigma };
      expect(detectionRate(s, samplesNeeded(s) * 4, 400, 8)).toBeGreaterThan(0.95);
    }
    expect(samplesNeeded({ perComparison: 10, sigma: NOISE_RANGE.max })).toBeGreaterThan(samplesNeeded({ perComparison: 10, sigma: NOISE_RANGE.min }));
  });

  it('the simulated mean is base + c x comparisons within sampling error, and the same seed gives the same plot', () => {
    const s = { perComparison: 10, sigma: 40 };
    for (const comparisons of [COMPARISONS_FIRST_WRONG, COMPARISONS_FIRST_RIGHT, 7]) {
      const xs = sampleTimes(mulberry32(3), s, comparisons, 40000);
      // standard error of the mean at n = 40,000 is 0.2; six of them is a safe bound
      expect(Math.abs(average(xs) - meanTime(s, comparisons))).toBeLessThan((6 * s.sigma) / Math.sqrt(40000));
    }
    expect(timeDistributions(s)).toEqual(timeDistributions(s));
    expect(NOISE_SEED).toBe(77);
  });

  it('the two plotted distributions are the model\'s: 500 draws each, means near base + c and base + 2c', () => {
    const s = noiseOpening();
    const d = timeDistributions(s);
    expect(d.wrong.counts.reduce((a, b) => a + b, 0) + d.wrong.outside).toBe(HISTOGRAM_SAMPLES);
    expect(d.right.counts.reduce((a, b) => a + b, 0) + d.right.outside).toBe(HISTOGRAM_SAMPLES);
    expect(Math.abs(d.wrongMean - meanTime(s, 1))).toBeLessThan(6 * s.sigma / Math.sqrt(HISTOGRAM_SAMPLES));
    expect(Math.abs(d.rightMean - meanTime(s, 2))).toBeLessThan(6 * s.sigma / Math.sqrt(HISTOGRAM_SAMPLES));
  });
});

describe('the defender\'s trace test', () => {
  const leakOracle: Record<ProgramId, (a: number[], b: number[]) => boolean> = {
    'secret-if': (a, b) => (a[0] & 1) !== (b[0] & 1),
    'table-lookup': (a, b) => Math.floor((0x1000 + a[0]) / 64) !== Math.floor((0x1000 + b[0]) / 64),
    'masked-select': () => false,
    'ct-compare': () => false,
    // the loop stops at the first zero byte, so the traces differ exactly when the first zero sits at different places (or only one has one)
    'broken-compare': (a, b) => a.findIndex((x) => x === 0) !== b.findIndex((x) => x === 0),
  };

  it('over 500 seeded secret pairs, "leaks" is reported exactly when the independent oracle says the traces differ', () => {
    const rnd = mulberry32(31337);
    // mix in zero bytes so the broken compare has something to find
    const byte = () => (rnd() < 0.15 ? 0 : Math.floor(rnd() * 256));
    const seen: Record<string, number> = {};
    for (let k = 0; k < 500; k++) {
      const a = Array.from({ length: 4 }, byte);
      const b = Array.from({ length: 4 }, byte);
      for (const program of PROGRAMS) {
        const v = verdict(program, a, b);
        expect(v.leaks, `${program.id} ${a} vs ${b}`).toBe(leakOracle[program.id](a, b));
        expect(v.leaks).toBe(JSON.stringify(v.traceA) !== JSON.stringify(v.traceB));
        if (v.leaks) seen[program.id] = (seen[program.id] ?? 0) + 1;
      }
    }
    expect(seen['secret-if']).toBeGreaterThan(0);
    expect(seen['table-lookup']).toBeGreaterThan(0);
    expect(seen['broken-compare']).toBeGreaterThan(0);
    expect(seen['masked-select']).toBeUndefined();
    expect(seen['ct-compare']).toBeUndefined();
  });

  it('on the named presets: the branch and the lookup leak on the far pair, a near pair hides both, and the broken compare is caught by the zero-byte pair', () => {
    const [far, near, zero] = PAIR_PRESETS;
    const leaks = (p: ProgramId, pair: { a: number; b: number }) => verdict(programOf(p), secretBytes(pair.a), secretBytes(pair.b)).leaks;
    expect([leaks('secret-if', far), leaks('table-lookup', far)]).toEqual([true, true]);
    expect([leaks('secret-if', near), leaks('table-lookup', near)]).toEqual([false, false]);
    expect(leaks('broken-compare', far)).toBe(false);
    expect(leaks('broken-compare', zero)).toBe(true);
    for (const pair of PAIR_PRESETS) {
      expect(leaks('masked-select', pair)).toBe(false);
      expect(leaks('ct-compare', pair)).toBe(false);
    }
  });

  it('a trace records what an observer could see: the branch outcome or the line, never the secret byte itself', () => {
    expect(traceOf(programOf('secret-if'), [0x13, 0, 0, 0])).toEqual([{ kind: 'branch', at: 'secret[0] is odd', taken: true }]);
    expect(traceOf(programOf('table-lookup'), [0xc4, 0, 0, 0])).toEqual([{ kind: 'load', at: 'TABLE[secret[0]]', line: 67 }]);
  });

  it('secrets are four big-endian bytes', () => {
    expect(secretBytes(0x13219c03)).toEqual([0x13, 0x21, 0x9c, 0x03]);
    expect(secretHex(0x13219c03)).toBe('13 21 9c 03');
    expect(secretBytes(0xffffffff)).toEqual([255, 255, 255, 255]);
  });
});

describe('the mitigation matrix', () => {
  it('each leak class is fully addressed by at least one mitigation, and each mitigation addresses at least one class', () => {
    for (const c of LEAK_CLASSES) expect(MITIGATIONS.some((m) => coverageOf(m.id, c.id) === 'full'), c.id).toBe(true);
    for (const m of MITIGATIONS) expect(LEAK_CLASSES.some((c) => coverageOf(m.id, c.id) !== 'none'), m.id).toBe(true);
  });

  it('with nothing on every class is open; with everything on none is; a class is covered, partly or open by the best enabled entry', () => {
    const all = MITIGATIONS.map((m) => m.id);
    expect(openClasses([])).toHaveLength(LEAK_CLASSES.length);
    expect(openClasses(all)).toEqual([]);
    expect(classVerdict(['microcode'], 'indirect-branch')).toBe('partly');
    expect(classVerdict(['microcode', 'retpoline'], 'indirect-branch')).toBe('covered');
    expect(classVerdict(['constant-time'], 'bounds-bypass')).toBe('open');
    expect(classVerdict(['constant-time'], 'crypto-timing')).toBe('covered');
  });
});
