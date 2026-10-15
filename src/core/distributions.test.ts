import { describe, expect, it } from 'vitest';
import {
  distCdf, drawSample, erf, exponential, exponentialCdf, exponentialPdf, fastNormalQuantile, harmonic, ksCritical, ksStatistic, lognormal, lognormalCdf,
  lognormalPdf, normal, normalCdf, normalPdf, normalQuantile, pareto, paretoCdf, paretoPdf, poisson, poissonCdf, poissonPmf, quantile, zipfPmf, zipfSampler,
} from './distributions';
import { mulberry32 } from './random';
import { mean } from './sim';
import { ecdf, logHistogram, variance } from './stats';

describe('ecdf and logHistogram (core/stats)', () => {
  it('ecdf gives one step vertex per distinct value', () => {
    expect(ecdf([])).toEqual([]);
    expect(ecdf([3, 1, 2, 2])).toEqual([[1, 0.25], [2, 0.75], [3, 1]]);
    expect(ecdf([5, Number.NaN])).toEqual([[5, 1]]);
  });

  it('ecdf of a large sample tracks the true cdf', () => {
    const r = mulberry32(51);
    const sample = Array.from({ length: 5000 }, () => exponential(r, 1));
    const gap = Math.max(...ecdf(sample).map(([x, p]) => Math.abs(p - exponentialCdf(x, 1))));
    expect(gap).toBeLessThan(ksCritical(5000));
  });

  it('logHistogram spaces edges by a constant ratio and counts every in-range value once', () => {
    const h = logHistogram([1, 9.99, 10, 99, 100, 1000, 0.5, 5000], { bins: 3, min: 1, max: 1000 });
    expect(h.edges.map((e) => Number(e.toPrecision(6)))).toEqual([1, 10, 100, 1000]);
    expect(h.counts).toEqual([2, 2, 2]);
    expect(h.outside).toBe(2);
    expect(() => logHistogram([1], { bins: 2, min: 0, max: 10 })).toThrow(RangeError);
  });
});

const N = 20000;
const draw = (seed: number, f: (r: () => number) => number, n = N) => {
  const r = mulberry32(seed);
  return Array.from({ length: n }, () => f(r));
};

/** Trapezoid rule. */
const integrate = (f: (x: number) => number, a: number, b: number, steps = 20000) => {
  const h = (b - a) / steps;
  let s = (f(a) + f(b)) / 2;
  for (let i = 1; i < steps; i++) s += f(a + i * h);
  return s * h;
};

describe('special functions', () => {
  it('erf matches known values and is odd', () => {
    expect(erf(0)).toBe(0);
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 12);
    expect(erf(2.5)).toBeCloseTo(0.999593047982555, 12);
    expect(erf(3.5)).toBeCloseTo(0.9999992569016276, 12);
    expect(erf(-1)).toBeCloseTo(-erf(1), 15);
  });

  it('normalCdf matches known values and keeps the far tail', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 14);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 12);
    expect(normalCdf(-6)).toBeCloseTo(9.865876450376946e-10, 18);
    expect(normalCdf(10, 0, 2)).toBeCloseTo(1 - 2.866515718791939e-7, 12);
  });
});

describe('densities', () => {
  it('each pdf integrates to ~1 and its cdf is the integral of the pdf', () => {
    const cases: { name: string; pdf: (x: number) => number; cdf: (x: number) => number; lo: number; hi: number; probe: number[] }[] = [
      { name: 'normal', pdf: (x) => normalPdf(x, 1, 2), cdf: (x) => normalCdf(x, 1, 2), lo: -15, hi: 17, probe: [-2, 1, 4] },
      { name: 'exponential', pdf: (x) => exponentialPdf(x, 0.5), cdf: (x) => exponentialCdf(x, 0.5), lo: 0, hi: 80, probe: [0.5, 2, 6] },
      { name: 'lognormal', pdf: (x) => lognormalPdf(x, 0.3, 0.6), cdf: (x) => lognormalCdf(x, 0.3, 0.6), lo: 1e-9, hi: 60, probe: [0.5, 1.5, 4] },
      { name: 'pareto', pdf: (x) => paretoPdf(x, 1, 3), cdf: (x) => paretoCdf(x, 1, 3), lo: 1, hi: 2000, probe: [1.2, 2, 5] },
    ];
    for (const c of cases) {
      expect(integrate(c.pdf, c.lo, c.hi, 200000), c.name).toBeCloseTo(1, 2);
      for (const x of c.probe) expect(integrate(c.pdf, c.lo, x, 100000), `${c.name} @ ${x}`).toBeCloseTo(c.cdf(x), 3);
    }
  });

  it('the Poisson pmf sums to 1, has mean lambda, and agrees with its cdf', () => {
    for (const lambda of [0.5, 4, 30, 120]) {
      let sum = 0;
      let m = 0;
      for (let k = 0; k < lambda * 6 + 40; k++) {
        const p = poissonPmf(k, lambda);
        sum += p;
        m += k * p;
      }
      expect(sum).toBeCloseTo(1, 10);
      expect(m).toBeCloseTo(lambda, 8);
    }
    expect(poissonPmf(3, 2)).toBeCloseTo((Math.exp(-2) * 8) / 6, 14);
    expect(poissonCdf(2, 2)).toBeCloseTo(Math.exp(-2) * (1 + 2 + 2), 14);
    expect(poissonPmf(-1, 2)).toBe(0);
    expect(poissonPmf(1.5, 2)).toBe(0);
    expect(poissonPmf(0, 0)).toBe(1);
  });
});

describe('samplers', () => {
  it('are reproducible: the same seed gives the same sample, another seed does not', () => {
    const a = draw(7, (r) => normal(r), 50);
    expect(draw(7, (r) => normal(r), 50)).toEqual(a);
    expect(draw(8, (r) => normal(r), 50)).not.toEqual(a);
  });

  it('have the right mean and variance on fixed seeds', () => {
    const normals = draw(1, (r) => normal(r, 5, 2));
    expect(mean(normals)).toBeCloseTo(5, 1);
    expect(variance(normals)).toBeCloseTo(4, 0);
    const exps = draw(2, (r) => exponential(r, 0.25));
    expect(mean(exps)).toBeCloseTo(4, 0);
    expect(variance(exps)).toBeGreaterThan(14);
    expect(variance(exps)).toBeLessThan(18);
    const poissons = draw(3, (r) => poisson(r, 6));
    expect(mean(poissons)).toBeCloseTo(6, 1);
    expect(variance(poissons)).toBeCloseTo(6, 0);
    const big = draw(4, (r) => poisson(r, 1200), 2000);
    expect(mean(big)).toBeGreaterThan(1190);
    expect(mean(big)).toBeLessThan(1210);
    const logs = draw(5, (r) => Math.log(lognormal(r, 1, 0.5)));
    expect(mean(logs)).toBeCloseTo(1, 1);
    const pars = draw(6, (r) => pareto(r, 2, 4));
    expect(Math.min(...pars)).toBeGreaterThanOrEqual(2);
    expect(mean(pars)).toBeCloseTo((4 * 2) / 3, 1);
  });

  it('pass a Kolmogorov-Smirnov check against their own cdf, and fail against a wrong one', () => {
    const crit = ksCritical(N);
    const cases: [string, number[], (x: number) => number, (x: number) => number][] = [
      ['normal', draw(11, (r) => normal(r, 2, 3)), (x) => normalCdf(x, 2, 3), (x) => normalCdf(x, 2.3, 3)],
      ['exponential', draw(12, (r) => exponential(r, 0.7)), (x) => exponentialCdf(x, 0.7), (x) => exponentialCdf(x, 0.8)],
      ['lognormal', draw(13, (r) => lognormal(r, 0.5, 0.8)), (x) => lognormalCdf(x, 0.5, 0.8), (x) => lognormalCdf(x, 0.6, 0.8)],
      ['pareto', draw(14, (r) => pareto(r, 1.5, 2.5)), (x) => paretoCdf(x, 1.5, 2.5), (x) => paretoCdf(x, 1.5, 2.8)],
    ];
    for (const [name, sample, cdf, wrong] of cases) {
      expect(ksStatistic(sample, cdf), name).toBeLessThan(crit);
      expect(ksStatistic(sample, wrong), `${name} vs a shifted cdf`).toBeGreaterThan(crit);
    }
  });

  it('Poisson counts match the pmf frequency by frequency', () => {
    const sample = draw(21, (r) => poisson(r, 3.5), 60000);
    for (let k = 0; k <= 10; k++) {
      const freq = sample.filter((x) => x === k).length / sample.length;
      expect(freq, `k = ${k}`).toBeCloseTo(poissonPmf(k, 3.5), 2);
    }
  });
});

describe('Zipf', () => {
  it('the harmonic number matches closed forms', () => {
    expect(harmonic(4, 1)).toBeCloseTo(1 + 1 / 2 + 1 / 3 + 1 / 4, 14);
    expect(harmonic(3, 2)).toBeCloseTo(1 + 1 / 4 + 1 / 9, 14);
    expect(harmonic(5, 0)).toBe(5);
    expect(harmonic(0, 1)).toBe(0);
  });

  it('the pmf sums to 1 and is zero off the ranks', () => {
    let sum = 0;
    for (let k = 1; k <= 50; k++) sum += zipfPmf(k, 50, 1.2);
    expect(sum).toBeCloseTo(1, 12);
    expect(zipfPmf(0, 50)).toBe(0);
    expect(zipfPmf(51, 50)).toBe(0);
    expect(zipfPmf(2, 50, 1)).toBeCloseTo(zipfPmf(1, 50, 1) / 2, 14);
  });

  it('the sampler stays in 1..n and its rank frequencies match the pmf on fixed seeds', () => {
    for (const [seed, n, s] of [[31, 20, 1], [32, 100, 1.3], [33, 8, 0]] as const) {
      const sample = draw(seed, zipfSampler(n, s), 100000);
      expect(Math.min(...sample)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...sample)).toBeLessThanOrEqual(n);
      for (let k = 1; k <= Math.min(n, 12); k++) {
        const freq = sample.filter((x) => x === k).length / sample.length;
        expect(Math.abs(freq - zipfPmf(k, n, s)), `n=${n} s=${s} rank ${k}`).toBeLessThan(0.006);
      }
    }
  });
});

describe('quantile', () => {
  it('interpolates between neighbours and clamps p', () => {
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10, 20], 0.25)).toBe(12.5);
    expect(quantile([1, 2, 3, 4], 2)).toBe(4);
    expect(quantile([7], 0.9)).toBe(7);
    expect(quantile([], 0.5)).toBeNaN();
  });

  it('recovers the true quantile of a large sample', () => {
    const sorted = draw(41, (r) => exponential(r, 1)).sort((a, b) => a - b);
    expect(quantile(sorted, 0.5)).toBeCloseTo(Math.LN2, 1);
  });
});

describe('the inverse normal cdf', () => {
  it('the fast one inverts normalCdf: a relative error in p under 1e-7 down to 1e-12 (an x error near 1e-9, times |x| out in the tail)', () => {
    for (let k = -12; k <= -1; k += 0.25) {
      const p = 10 ** k;
      expect(Math.abs(normalCdf(fastNormalQuantile(p)) / p - 1), `p = ${p}`).toBeLessThan(1e-7);
    }
    for (let p = 0.01; p < 1; p += 0.01) expect(normalCdf(fastNormalQuantile(p))).toBeCloseTo(p, 8);
    expect(fastNormalQuantile(0.5)).toBeCloseTo(0, 12);
  });

  it('the bisection one matches the published z values and the fast one agrees with it to 1e-8', () => {
    expect(normalQuantile(0.99)).toBeCloseTo(2.3263478740408408, 9);
    expect(normalQuantile(0.999)).toBeCloseTo(3.090232306167813, 9);
    for (const p of [1e-6, 0.001, 0.02, 0.3, 0.5, 0.8, 0.97, 0.9999]) expect(fastNormalQuantile(p)).toBeCloseTo(normalQuantile(p), 7);
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
  });
});

describe('drawSample', () => {
  it('is deterministic per seed and draws from the family it is given', () => {
    const d = { family: 'exponential', mean: 5 } as const;
    expect(drawSample(d, 7, 50)).toEqual(drawSample(d, 7, 50));
    expect(drawSample(d, 7, 50)).not.toEqual(drawSample(d, 8, 50));
    const xs = drawSample(d, 3, 20_000);
    expect(mean(xs)).toBeCloseTo(5, 0);
    expect(ksStatistic(xs, (x) => distCdf(d, x))).toBeLessThan(ksCritical(xs.length));
  });
});
