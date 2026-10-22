import { describe, expect, it } from 'vitest';
import { fmix32, fnv1a } from '../../core/hash';
import { mulberry32, randInt } from '../../core/random';
import {
  DEFAULT_SEED, WORDS, bloomFpMeasured, bloomFpTheory, bloomHas, bloomPositions, buildBloom, drawRnd, hllAdd, hllBuild, hllBytes,
  PROBE_COUNT, bloomProbeNoise, hllEstimate, hllSplit, hllStdErr, itemHash, nextWord, optimalK, unseenWord,
} from './sketches';

/** Fresh words that no other test word collides with: a different `tag` is an independent sample. */
const sampleWords = (tag: string, n: number, rnd: () => number) =>
  Array.from({ length: n }, (_, i) => `${tag}-${i}-${Math.floor(rnd() * 1e9)}`);

/** The measured rate of `bits` over `probes` fresh words. */
function monteCarlo(m: number, n: number, k: number, trials: number, probes: number, seed: number) {
  const rnd = mulberry32(seed);
  let positives = 0;
  for (let t = 0; t < trials; t++) {
    const bits = buildBloom(sampleWords(`in${t}`, n, rnd), k, m);
    for (const q of sampleWords(`out${t}`, probes, rnd)) if (bloomHas(bits, q, k)) positives++;
  }
  return { rate: positives / (trials * probes), samples: trials * probes };
}

describe('Bloom filter', () => {
  it('bloomPositions gives k positions inside [0, m), the same ones every time', () => {
    for (const m of [16, 32, 48, 64]) {
      for (let k = 1; k <= 6; k++) {
        const p = bloomPositions('apple', k, m);
        expect(p).toHaveLength(k);
        expect(p.every((x) => Number.isInteger(x) && x >= 0 && x < m)).toBe(true);
        expect(bloomPositions('apple', k, m)).toEqual(p);
      }
    }
  });

  it('has no false negatives: every inserted word queries as present, over 200 seeded word sets', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const m = 16 * randInt(1, 4, rnd);
      const k = randInt(1, 6, rnd);
      const words = sampleWords(`s${seed}`, randInt(1, 30, rnd), rnd);
      const bits = buildBloom(words, k, m);
      for (const w of words) expect(bloomHas(bits, w, k)).toBe(true);
    }
  });

  it('a 0 bit among the query positions proves the word was never inserted', () => {
    const bits = buildBloom(['apple', 'banana'], 3, 64);
    for (const w of WORDS) {
      if (['apple', 'banana'].includes(w)) continue;
      const hasZero = bloomPositions(w, 3, 64).some((p) => bits[p] === 0);
      expect(bloomHas(bits, w, 3)).toBe(!hasZero);
    }
  });

  it('the measured false-positive rate matches (1 - e^(-kn/m))^k within a Monte Carlo tolerance', () => {
    // 4 standard errors of the sampling noise, plus 15% of the formula: the formula treats bits as independent,
    // which is an approximation that is a little loose for tiny m (measured 0.81 vs formula 0.72 at m = 16, n = 12, k = 3).
    const grid: [m: number, n: number, k: number][] = [
      [32, 3, 3], [32, 12, 3], [32, 12, 2], [64, 12, 3], [16, 12, 3], [48, 6, 4], [1024, 100, 7], [1024, 100, 3], [4096, 400, 7],
    ];
    for (const [m, n, k] of grid) {
      const { rate, samples } = monteCarlo(m, n, k, 100, 200, m * 1000 + n * 10 + k);
      const theory = bloomFpTheory(n, k, m);
      const noise = 4 * Math.sqrt((theory * (1 - theory)) / samples);
      expect(Math.abs(rate - theory), `m=${m} n=${n} k=${k}: measured ${rate}, formula ${theory}`).toBeLessThanOrEqual(noise + 0.15 * theory + 0.002);
    }
  });

  describe('toy hash against ideal independent hashes (the measured stat vs the theory stat)', () => {
    /** The double hash the lesson used before: h1 + i·h2 (mod m), with m a power of two. Kept here as the counter-example. */
    const doubleHash = (word: string, k: number, m: number) => {
      const h1 = fmix32(fnv1a(word));
      const h2 = fmix32(fnv1a(`${word}\u0001`)) | 1;
      return Array.from({ length: k }, (_, i) => ((h1 + Math.imul(i, h2)) >>> 0) % m);
    };
    /** What the stage prints as "measured": the first n WORDS inserted, 1,000 fixed probes, positions from `positions`. */
    const stageMeasured = (positions: (w: string, k: number, m: number) => number[], n: number, k: number, m: number) => {
      const bits = new Uint8Array(m);
      for (const w of WORDS.slice(0, n)) for (const p of positions(w, k, m)) bits[p] = 1;
      let hits = 0;
      for (let i = 0; i < PROBE_COUNT; i++) if (positions(`probe-${i}-x`, k, m).every((p) => bits[p] === 1)) hits++;
      return hits / PROBE_COUNT;
    };
    /** Ideal independent positions: every position a fresh uniform draw from a seeded stream, averaged over many filters. */
    const ideal = (n: number, k: number, m: number) => {
      const rnd = mulberry32(m * 7919 + n * 31 + k);
      let positives = 0;
      const trials = 4000;
      for (let t = 0; t < trials; t++) {
        const bits = new Uint8Array(m);
        for (let i = 0; i < n * k; i++) bits[randInt(0, m - 1, rnd)] = 1;
        let all = true;
        for (let i = 0; i < k; i++) all = all && bits[randInt(0, m - 1, rnd)] === 1;
        if (all) positives++;
      }
      return positives / trials;
    };

    it('ideal independent hashes agree with the formula within 0.04 at the try-this 3 cell (m = 32, 12 words)', () => {
      for (let k = 1; k <= 6; k++) {
        expect(Math.abs(ideal(12, k, 32) - bloomFpTheory(12, k, 32)), `k=${k}`).toBeLessThan(0.04);
      }
    });

    it('the old double hash sat far above the formula there (0.67 against 0.36 at k = 4), which is why it was replaced', () => {
      expect(stageMeasured(doubleHash, 12, 4, 32) - bloomFpTheory(12, 4, 32)).toBeGreaterThan(0.25);
      const mean = (f: (k: number) => number) => [1, 2, 3, 4, 5, 6].reduce((a, k) => a + f(k), 0) / 6;
      expect(mean((k) => stageMeasured(doubleHash, 12, k, 32) - bloomFpTheory(12, k, 32))).toBeGreaterThan(0.1);
    });

    it('the salted hashes the lesson uses stay close to the formula there: gap under 0.1 per k and under 0.03 on average', () => {
      for (let k = 1; k <= 6; k++) {
        expect(Math.abs(stageMeasured(bloomPositions, 12, k, 32) - bloomFpTheory(12, k, 32)), `k=${k}`).toBeLessThan(0.1);
      }
      const mean = [1, 2, 3, 4, 5, 6].reduce((a, k) => a + stageMeasured(bloomPositions, 12, k, 32) - bloomFpTheory(12, k, 32), 0) / 6;
      expect(Math.abs(mean)).toBeLessThan(0.03);
    });

    it('the measured figure on stage is bloomFpMeasured, and the noise it prints is the binomial standard error of 1,000 probes', () => {
      const bits = buildBloom(WORDS.slice(0, 12), 4, 32);
      expect(bloomFpMeasured(bits, 4)).toBe(stageMeasured(bloomPositions, 12, 4, 32));
      expect(bloomProbeNoise(0.5)).toBeCloseTo(Math.sqrt(0.25 / 1000), 12);
      expect(bloomProbeNoise(0)).toBe(0);
    });
  });

  it('the formula is 0 for an empty filter and tends to 1 as the filter fills', () => {
    expect(bloomFpTheory(0, 3, 32)).toBe(0);
    expect(bloomFpTheory(1000, 3, 32)).toBeGreaterThan(0.999);
  });

  it('the best k is (m/n)·ln 2: the integer that minimises the formula is within 1 of optimalK,', () => {
    for (const m of [16, 32, 48, 64, 1024]) {
      for (const n of [3, 6, 12, 20, 100]) {
        const best = optimalK(n, m);
        const argmin = Array.from({ length: best + 10 }, (_, i) => i + 1).reduce((a, k) => (bloomFpTheory(n, k, m) < bloomFpTheory(n, a, m) ? k : a), 1);
        expect(Math.abs(best - argmin), `m=${m} n=${n}`).toBeLessThanOrEqual(1);
      }
    }
    expect(optimalK(0.5, 8)).toBeGreaterThanOrEqual(1);
    expect(optimalK(1000, 16)).toBe(1);
  });

  describe('try-this', () => {
    const START = ['apple', 'banana', 'cherry'];
    const inserted = (count: number) => {
      const words = [...START];
      while (words.length < count) words.push(nextWord(words));
      return words;
    };

    it('try-this 1: inserting next words fills the bits, and an unseen-word query then hits a false positive', () => {
      const words = inserted(14);
      const bits = buildBloom(words, 3, 32);
      const set = bits.reduce((a, b) => a + b, 0);
      expect(set).toBeGreaterThan(32 * 0.6);
      let draws = 0;
      let falsePositive = false;
      for (; draws < 10 && !falsePositive; draws++) {
        const w = unseenWord(words, drawRnd(DEFAULT_SEED, draws));
        expect(words).not.toContain(w);
        falsePositive = bloomHas(bits, w, 3);
      }
      expect(falsePositive).toBe(true);
    });

    it('try-this 2: from m = 16 to m = 64 the rate collapses, at the default words and with a dozen', () => {
      for (const count of [3, 12]) {
        const words = inserted(count);
        const small = bloomFpTheory(count, 3, 16);
        const large = bloomFpTheory(count, 3, 64);
        expect(large, `${count} words`).toBeLessThan(small / 5);
        const measuredSmall = bloomFpMeasured(buildBloom(words, 3, 16), 3);
        const measuredLarge = bloomFpMeasured(buildBloom(words, 3, 64), 3);
        expect(measuredLarge).toBeLessThan(measuredSmall / 3);
      }
    });

    it('try-this 3: with a dozen words in 32 bits the best k is 2, and both k = 1 and k = 6 are worse', () => {
      expect(optimalK(12, 32)).toBe(2);
      const f = (k: number) => bloomFpTheory(12, k, 32);
      expect(f(2)).toBeLessThan(f(1));
      expect(f(2)).toBeLessThan(f(6));
      const m = (k: number) => bloomFpMeasured(buildBloom(inserted(12), k, 32), k);
      expect(m(2)).toBeLessThan(m(6));
    });
  });
});

describe('HyperLogLog', () => {
  /** An independent oracle for the register index and rank: string operations instead of bit tricks. */
  const splitByString = (h: number, p: number) => {
    const bits = (h >>> 0).toString(2).padStart(32, '0');
    const idx = parseInt(bits.slice(0, p), 2);
    const rest = bits.slice(p);
    const firstOne = rest.indexOf('1');
    return { idx, rank: firstOne < 0 ? rest.length + 1 : firstOne + 1 };
  };

  it('hllSplit agrees with a string-based register index and rank, including the all-zero remainder', () => {
    const rnd = mulberry32(3);
    for (const p of [4, 6, 8]) {
      for (let i = 0; i < 500; i++) {
        const h = Math.floor(rnd() * 2 ** 32);
        expect(hllSplit(h, p)).toEqual(splitByString(h, p));
      }
      expect(hllSplit(0b101 << (32 - p), p)).toEqual(splitByString(0b101 << (32 - p), p));
    }
  });

  it('the estimate is unbiased and its relative standard error is 1.04/√m, over seeded runs of independent items', () => {
    const RUNS = 200;
    const N = 5000; // well past the small-range correction (2.5 m) for every m below
    for (const p of [4, 6, 8]) {
      const m = 1 << p;
      let sum = 0;
      let squares = 0;
      for (let run = 0; run < RUNS; run++) {
        const e = hllEstimate(hllBuild(N, p, 5_000_000 + run * N)) / N - 1;
        sum += e;
        squares += e * e;
      }
      const rms = Math.sqrt(squares / RUNS);
      const std = hllStdErr(m);
      expect(rms / std, `p=${p}: rms ${rms}, formula ${std}`).toBeGreaterThan(0.75);
      expect(rms / std, `p=${p}`).toBeLessThan(1.3);
      expect(Math.abs(sum / RUNS), `p=${p} mean error`).toBeLessThan(std / 2);
    }
  });

  it('the standard error halves when the registers quadruple, and the formula is 1.04/√m', () => {
    expect(hllStdErr(256)).toBeCloseTo(0.065, 10);
    expect(hllStdErr(16)).toBeCloseTo(0.26, 10);
    expect(hllStdErr(1024)).toBeCloseTo(hllStdErr(256) / 2, 12);
  });

  it('duplicates do not move the estimate: re-adding drawn ids leaves every register unchanged, over 100 seeds', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = mulberry32(seed);
      const p = [4, 6, 8][seed % 3];
      const count = randInt(1, 3000, rnd);
      const regs = hllBuild(count, p);
      const before = regs.slice();
      const estimate = hllEstimate(regs);
      for (let i = 0; i < 1000; i++) hllAdd(regs, randInt(0, count - 1, rnd), p);
      expect(Array.from(regs)).toEqual(Array.from(before));
      expect(hllEstimate(regs)).toBe(estimate);
    }
  });

  it('the small-range correction keeps small counts close: 10 items in 256 registers estimate within 20%', () => {
    for (let start = 0; start < 50; start++) {
      const e = hllEstimate(hllBuild(10, 8, start * 10));
      expect(Math.abs(e - 10) / 10).toBeLessThan(0.2);
    }
  });

  it('itemHash is a bijection on 32-bit ids, so distinct ids always have distinct hashes', () => {
    const seen = new Set<number>();
    for (let id = 0; id < 100_000; id++) seen.add(itemHash(id));
    expect(seen.size).toBe(100_000);
  });

  it('try-this 4: 1,000,000 items in 256 registers is 192 bytes, and the error is inside three standard errors', () => {
    expect(hllBytes(256)).toBe(192);
    const regs = hllBuild(1_000_000, 8);
    const err = (hllEstimate(regs) - 1_000_000) / 1_000_000;
    expect(Math.abs(err)).toBeLessThan(3 * hllStdErr(256));
    // The old text promised "a few percent": the run the button makes is further off than that.
    expect(Math.abs(err)).toBeGreaterThan(0.05);
  });

  it('try-this 4 from the default view: 64 registers, the same million items, stays within three standard errors', () => {
    const regs = hllBuild(1_000_000, 6);
    expect(Math.abs(hllEstimate(regs) / 1_000_000 - 1)).toBeLessThan(3 * hllStdErr(64));
  });
});

describe('HyperLogLog try-this 4 note', () => {
  const err = (count: number) => (hllEstimate(hllBuild(count, 8)) - count) / count;

  it('the 1,000,000-item run is a roughly 2-sigma draw (the red Error stat), and +100 / +100,000 from a fresh Reset land closer', () => {
    expect(Math.abs(err(1_000_000)) / hllStdErr(256)).toBeGreaterThan(2);
    for (const n of [100, 100_000]) expect(Math.abs(err(n)) / hllStdErr(256), `n=${n}`).toBeLessThan(1);
  });
});

describe('draws', () => {
  it('drawRnd is the same stream for the same (seed, n) and a different one for the next n', () => {
    expect(drawRnd(7, 3)()).toBe(drawRnd(7, 3)());
    expect(drawRnd(7, 3)()).not.toBe(drawRnd(7, 4)());
  });
});
