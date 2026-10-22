import { describe, expect, it, vi } from 'vitest';
import { svdSmall } from '../../core/linalg';
import { mulberry32 } from '../../core/random';
import { parseBoundedIntField as parseLength } from '../../components/boundedIntParse';
import {
  N, SPECTRUM, TOLERANCE, TOTAL_ENERGY, frobenius2, makeTarget, optimumEnergy, optimumRelative, randomCompetitor, relativeError, train, truncated,
} from './lora';
import {
  DIM_LIMITS, adapterParams, adapterShare, bitsWithScales, crossoverRank, fullParams, maxRank, memoryLines, weightBytes,
} from './memory';
import {
  BITS_CHOICES, INPUTS, SIZE, TENSOR, bitsPerWeight, compareSchemes, makeInputs, makeWeights, outputError, quantise, quantiseGroup, weightErrors,
} from './quant';

// The seeded sweeps are exact but slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 120_000 });

describe('parameter counts', () => {
  it('4,096 x 4,096: rank 1 is 8,192 (0.0488%), rank 8 is 65,536 (exactly 1/256), rank 64 is 524,288 (3.125%)', () => {
    expect(fullParams(4096, 4096)).toBe(16_777_216);
    expect(adapterParams(4096, 4096, 1)).toBe(8192);
    expect(adapterParams(4096, 4096, 8)).toBe(65_536);
    expect(adapterParams(4096, 4096, 64)).toBe(524_288);
    expect(adapterShare(4096, 4096, 8)).toBe(1 / 256);
    expect(adapterShare(4096, 4096, 8) * 100).toBe(0.390625);
    expect(adapterShare(4096, 4096, 1) * 100).toBeCloseTo(0.048828125, 12);
    expect(adapterShare(4096, 4096, 64) * 100).toBe(3.125);
  });

  it('matches a direct count of the entries of B and A over a grid that includes the extremes', () => {
    for (const dIn of [1, 7, 4096, 16_384]) for (const dOut of [1, 5, 4096, 16_384]) for (const r of [1, 2, 64]) {
      const countB = dOut * r;
      const countA = r * dIn;
      expect(adapterParams(dIn, dOut, r), `${dOut}x${dIn} r${r}`).toBe(countB + countA);
    }
  });

  it('the adapter equals the matrix at rank d_in d_out / (d_in + d_out) = 2,048 and is bigger beyond it', () => {
    expect(crossoverRank(4096, 4096)).toBe(2048);
    expect(adapterParams(4096, 4096, 2048)).toBe(fullParams(4096, 4096));
    expect(adapterParams(4096, 4096, 2049)).toBeGreaterThan(fullParams(4096, 4096));
    expect(adapterParams(4096, 4096, 2047)).toBeLessThan(fullParams(4096, 4096));
    expect(maxRank(4096, 4096)).toBe(4096);
    expect(maxRank(16_384, 3)).toBe(3);
  });

  it('a typed rank past the smaller dimension, and a typed dimension past 16,384, are refused with the bound', () => {
    const r = parseLength('4097', 'rank r', 1, maxRank(4096, 4096));
    expect(r.ok ? '' : r.error).toContain('the largest allowed value is 4,096');
    const d = parseLength('16385', 'd_in', DIM_LIMITS.min, DIM_LIMITS.max);
    expect(d.ok ? '' : d.error).toContain('the largest allowed value is 16,384');
    expect(parseLength('16384', 'd_in', DIM_LIMITS.min, DIM_LIMITS.max).ok).toBe(true);
    expect(parseLength('1', 'd_in', DIM_LIMITS.min, DIM_LIMITS.max).ok).toBe(true);
    for (const bad of ['0', '-1', '2.5', '1e3', '']) expect(parseLength(bad, 'd_in', DIM_LIMITS.min, DIM_LIMITS.max).ok, bad).toBe(false);
  });

  it('the whole-model lines at P = 7e9, f = 0.5%: 112 GB, 14.56 GB, 4.06 GB', () => {
    const m = memoryLines(7e9, 0.005);
    expect(m.full).toBe(112e9);
    expect(m.lora).toBeCloseTo(14.56e9, 0);
    expect(m.quantised).toBeCloseTo(4.06e9, 0);
  });

  it('the weight sizes at 7e9: 14, 7, 3.5 GB, and 3.609375 GB at 4 bits with groups of 128 and 16-bit scales', () => {
    expect([16, 8, 4].map((b) => weightBytes(7e9, b) / 1e9)).toEqual([14, 7, 3.5]);
    expect(weightBytes(7e9, bitsWithScales(4, 128)) / 1e9).toBe(3.609375);
  });

  it('the lines at the slider ends stay finite and ordered', () => {
    for (const [p, f] of [[0.1e9, 0.0001], [100e9, 0.05]]) {
      const m = memoryLines(p, f);
      expect(m.full).toBeGreaterThan(m.lora);
      expect(m.lora).toBeGreaterThan(m.quantised);
      expect(Number.isFinite(m.full)).toBe(true);
    }
  });
});

const randomMatrix = (seed: number): number[][] => {
  const rnd = mulberry32(seed);
  return Array.from({ length: N }, () => Array.from({ length: N }, () => rnd() * 2 - 1));
};

describe('the best rank-r update (Eckart-Young)', () => {
  it('the truncated SVD error equals the sum of the squared dropped singular values to 1e-9, on 100 seeded matrices and every rank', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const m = randomMatrix(seed);
      const { s } = svdSmall(m);
      for (let r = 1; r <= N; r += 1) {
        const dropped = s.slice(r).reduce((a, v) => a + v * v, 0);
        const err = frobenius2(m.map((row, i) => row.map((v, j) => v - truncated(m, r)[i][j])));
        expect(Math.abs(err - dropped), `seed ${seed} r ${r}`).toBeLessThan(1e-9);
      }
    }
  });

  it('no random rank-r matrix beats the truncated SVD: 10,000 competitors for each of 5 seeded matrices and ranks 1, 3, 5', () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const m = randomMatrix(seed * 11);
      const rnd = mulberry32(seed);
      for (const r of [1, 3, 5]) {
        const floor = frobenius2(m.map((row, i) => row.map((v, j) => v - truncated(m, r)[i][j])));
        let best = Infinity;
        for (let k = 0; k < 10_000; k += 1) best = Math.min(best, randomCompetitor(m, r, rnd));
        expect(best, `seed ${seed} r ${r}`).toBeGreaterThanOrEqual(floor - 1e-9);
      }
    }
  });

  it('the designed spectrum: total energy 35.3254 and the dropped shares 29.23%, 3.752%, 0.921%, 0.213% at ranks 1 to 4', () => {
    // 25 + 9 + 1 + 0.25 + 0.0625 + 0.01 + 0.0025 + 0.0004
    expect(TOTAL_ENERGY).toBeCloseTo(35.3254, 12);
    expect(optimumEnergy(1)).toBeCloseTo(10.3254, 12);
    expect(optimumEnergy(2)).toBeCloseTo(1.3254, 12);
    expect(optimumEnergy(3)).toBeCloseTo(0.3254, 12);
    expect(optimumEnergy(4)).toBeCloseTo(0.0754, 12);
    expect(optimumRelative(1) * 100).toBeCloseTo(29.23, 2);
    expect(optimumRelative(2) * 100).toBeCloseTo(3.752, 3);
    expect(optimumRelative(3) * 100).toBeCloseTo(0.921, 3);
    expect(optimumRelative(4) * 100).toBeCloseTo(0.213, 3);
    expect(optimumRelative(N)).toBe(0);
  });

  it('the seeded target really has that spectrum, and the library truncation reproduces the closed-form floor', () => {
    for (const seed of [1, 3, 9]) {
      const target = makeTarget(seed);
      const { s } = svdSmall(target);
      SPECTRUM.forEach((sigma, i) => expect(s[i]).toBeCloseTo(sigma, 9));
      for (let r = 1; r <= N; r += 1) expect(relativeError(target, truncated(target, r))).toBeCloseTo(optimumRelative(r), 9);
    }
  });

  it('the trained adapter is never below the floor (to 1e-9) and, after the stated steps, within the stated tolerance on every one of 100 seeds and every rank', () => {
    let within = 0;
    let total = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const target = makeTarget(seed);
      for (let r = 1; r <= N; r += 1) {
        const run = train(target, r, seed);
        expect(Number.isFinite(run.final), `seed ${seed} r ${r}`).toBe(true);
        expect(run.gap, `seed ${seed} r ${r}`).toBeGreaterThanOrEqual(-1e-9);
        for (const v of run.curve) expect(v).toBeGreaterThanOrEqual(run.optimum - 1e-9);
        if (run.withinTolerance) within += 1;
        total += 1;
      }
    }
    expect(TOLERANCE).toBe(0.005);
    expect(within).toBe(total);
  }, 120_000);

  it('the default run (rank 2, seed 3) ends at 3.752%', () => {
    const run = train(makeTarget(3), 2, 3);
    expect(run.final * 100).toBeCloseTo(3.752, 3);
    expect(run.curve[0]).toBeGreaterThan(0.9);
  });
});

describe('the quantiser', () => {
  const hand = [[0.5, -1.2, 0.3, 0.9, 20, -0.7, 0.1, 1.5]];

  it('hand vector at 4 bits per tensor: scale 20 / 7, codes 0 0 0 0 7 0 0 1, the four ordinary weights all round to zero (error energy 2.59, 100% of theirs)', () => {
    const q = quantise(hand, 4, TENSOR);
    expect(q.scales[0]).toBeCloseTo(20 / 7, 12);
    expect(q.codes[0]).toEqual([0, 0, 0, 0, 7, 0, 0, 1]);
    expect(q.dequantised[0][4]).toBeCloseTo(20, 12);
    expect(q.dequantised[0][7]).toBeCloseTo(2.857142857, 8);
    // 0.5^2 + 1.2^2 + 0.3^2 + 0.9^2 = 0.25 + 1.44 + 0.09 + 0.81
    const ordinary = [0, 1, 2, 3];
    const energy = ordinary.reduce((s, i) => s + hand[0][i] ** 2, 0);
    const error = ordinary.reduce((s, i) => s + (hand[0][i] - q.dequantised[0][i]) ** 2, 0);
    expect(energy).toBeCloseTo(2.59, 12);
    expect(error).toBeCloseTo(energy, 12);
  });

  it('hand vector per group of 4: group 1 scale 1.2 / 7, codes 3 -7 2 5, error energy 0.0039 (0.15% of 2.59); group 2 as in the per-tensor case', () => {
    const q = quantise(hand, 4, { kind: 'group', size: 4 });
    expect(q.scales[0]).toBeCloseTo(1.2 / 7, 12);
    expect(q.codes[0].slice(0, 4)).toEqual([3, -7, 2, 5]);
    expect(q.codes[0].slice(4)).toEqual([7, 0, 0, 1]);
    const deq = [0.5143, -1.2, 0.3429, 0.8571];
    deq.forEach((v, i) => expect(q.dequantised[0][i]).toBeCloseTo(v, 4));
    const error = [0, 1, 2, 3].reduce((s, i) => s + (hand[0][i] - q.dequantised[0][i]) ** 2, 0);
    expect(error).toBeCloseTo(0.0039, 4);
    expect(error / 2.59).toBeCloseTo(0.0015, 4);
  });

  it('at 8 bits per tensor the four ordinary weights\' error energy is 0.0066', () => {
    const q = quantise(hand, 8, TENSOR);
    const error = [0, 1, 2, 3].reduce((s, i) => s + (hand[0][i] - q.dequantised[0][i]) ** 2, 0);
    expect(error).toBeCloseTo(0.0066, 4);
  });

  it('dequantised values lie on the grid k x scale with |k| <= 2^(bits-1) - 1, and no weight moves by more than half a step', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const w = makeWeights(seed, seed % 2 === 0);
      for (const bits of BITS_CHOICES) {
        for (const scheme of [TENSOR, { kind: 'group', size: 4 } as const, { kind: 'group', size: 8 } as const]) {
          const q = quantise(w, bits, scheme);
          const perGroup = scheme.kind === 'tensor' ? 64 : scheme.size;
          q.codes.forEach((row, r) => row.forEach((k, c) => {
            expect(Math.abs(k)).toBeLessThanOrEqual(2 ** (bits - 1) - 1);
            const scale = q.scales[scheme.kind === 'tensor' ? 0 : r * (SIZE / perGroup) + Math.floor(c / perGroup)];
            expect(q.dequantised[r][c]).toBeCloseTo(k * scale, 12);
            expect(Math.abs(w[r][c] - q.dequantised[r][c])).toBeLessThanOrEqual(scale / 2 + 1e-12);
          }));
        }
      }
    }
  });

  it('an all-zero group does not divide by zero, and the extremes of bits are refused one beyond', () => {
    const zero = quantiseGroup([0, 0, 0], 4);
    expect(zero).toEqual({ codes: [0, 0, 0], deq: [0, 0, 0], scale: 0 });
    expect(quantise([[0, 0, 0, 0, 1, 2, 3, 4]], 4, { kind: 'group', size: 4 }).dequantised[0].slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(() => quantiseGroup([1], 1)).toThrow(RangeError);
    expect(() => quantiseGroup([1], 17)).toThrow(RangeError);
    expect(() => quantiseGroup([1], 4.5)).toThrow(RangeError);
    expect(quantiseGroup([1, -1], 2).codes).toEqual([1, -1]);
  });

  it('per-group of 4 beats per-tensor at 4 bits with the outlier on all 200 seeded matrices', () => {
    let beats = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const c = compareSchemes(seed, true, 4, 4);
      if (c.perGroup.rms < c.perTensor.rms) beats += 1;
    }
    expect(beats).toBe(200);
  });

  it('the outlier is the cause: without it per-tensor 4-bit error is a fraction of what it is with it, so the failure is not trivially everywhere', () => {
    let withOutlier = 0;
    let without = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      withOutlier += compareSchemes(seed, true, 4, 4).perTensor.rms;
      without += compareSchemes(seed, false, 4, 4).perTensor.rms;
    }
    expect(withOutlier / 200).toBeGreaterThan(0.5);
    expect(without / 200).toBeLessThan(0.2);
    expect(withOutlier / without).toBeGreaterThan(3);
  });

  it('error is non-increasing in bits on a fixed matrix, ties allowed, for the per-group scheme on all 200 seeds and for per-tensor on 197 of 200', () => {
    let tensorMonotone = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      for (const scheme of [TENSOR, { kind: 'group', size: 4 } as const]) {
        const w = makeWeights(seed, true);
        const x = makeInputs(seed);
        const errs = [...BITS_CHOICES].reverse().map((b) => outputError(w, quantise(w, b, scheme).dequantised, x).rms);
        const monotone = errs.every((e, i) => i === 0 || e <= errs[i - 1] + 1e-12);
        if (scheme.kind === 'group') expect(monotone, `group, seed ${seed}`).toBe(true);
        else if (monotone) tensorMonotone += 1;
      }
    }
    // Measured: 197 of 200. The 3 exceptions are at 2 to 4 bits where every code is zero or close to it and the error sits near 93% either way.
    expect(tensorMonotone).toBe(197);
  });

  it('the meter: a perfect copy has zero error, 200 inputs are used, and one row of zeros prints 0 not NaN', () => {
    const w = makeWeights(1, true);
    const x = makeInputs(1);
    expect(x).toHaveLength(INPUTS);
    expect(outputError(w, w, x).rms).toBe(0);
    const zeroRows = outputError([[0, 0], [1, 1]], [[0, 0], [0, 0]], [[1, 0], [0, 1]]);
    expect(zeroRows.perRow).toEqual([0, 1]);
    expect(weightErrors(w, w).flat().every((e) => e === 0)).toBe(true);
  });

  it('bits per weight include one 16-bit scale per group: 4 + 16 / 4, and 4 + 16 / 64 for a single tensor scale', () => {
    expect(bitsPerWeight(4, { kind: 'group', size: 4 })).toBe(8);
    expect(bitsPerWeight(4, TENSOR)).toBe(4.25);
    expect(bitsPerWeight(8, { kind: 'group', size: 8 })).toBe(10);
  });
});
