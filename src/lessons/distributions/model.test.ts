import { describe, expect, it } from 'vitest';
import { ksStatistic, normalCdf, poissonPmf, distCdf, distMean, distPdf, distQuantile, distVariance, drawSample, normalQuantile, type Dist } from '../../core/distributions';
import { stdDev } from '../../core/stats';
import { BURST_MEAN, FAMILIES, MYSTERY_DISTS, cltDist, cltReport, countArrivals, dispersionIndex, logBinsAllowed, lognormalShareBelowMean, momentsOf, mysteryDatasets, mysteryHints, replicateMeans, shapeView, shareBelowMean, summaryRows, tailSlope, totalVariation } from './model';

const SEEDS = [11, 222, 3333];

/** An independent inverse: bisect any cdf, never touching the model's quantile functions. */
function bisect(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const SAMPLE_DISTS: Dist[] = [
  { family: 'normal', mu: 100, sigma: 15 },
  { family: 'exponential', mean: 80 },
  { family: 'lognormal', mu: 4.4, sigma: 0.9 },
  { family: 'pareto', xm: 10, alpha: 3 },
];

describe('the samplers match their own cdf and moments', () => {
  it('Kolmogorov-Smirnov distance stays under 1.63/sqrt(n) (the 1% critical value) at n = 100,000 on three seeds', () => {
    const n = 100_000;
    for (const d of SAMPLE_DISTS) {
      for (const seed of SEEDS) {
        const ks = ksStatistic(drawSample(d, seed, n), (x) => distCdf(d, x));
        expect(ks, `${d.family} seed ${seed}`).toBeLessThan(1.63 / Math.sqrt(n));
      }
    }
  });

  it('sample mean and variance sit within 3 standard errors of the formulas', () => {
    const n = 200_000;
    const exp: Dist = { family: 'exponential', mean: 80 };
    const logn: Dist = { family: 'lognormal', mu: 4.4, sigma: 0.5 };
    const par: Dist = { family: 'pareto', xm: 10, alpha: 5 };
    for (const d of [exp, logn, par, SAMPLE_DISTS[0]]) {
      const xs = drawSample(d, 99, n);
      const mean = xs.reduce((s, x) => s + x, 0) / n;
      const se = Math.sqrt(distVariance(d) / n);
      expect(Math.abs(mean - distMean(d)), `${d.family} mean`).toBeLessThan(3 * se);
      // the variance of the sample variance is (m4 - sigma^4)/n; for these light tails 5% is far past 3 standard errors
      expect(stdDev(xs) ** 2 / distVariance(d), `${d.family} variance`).toBeGreaterThan(0.95);
      expect(stdDev(xs) ** 2 / distVariance(d), `${d.family} variance`).toBeLessThan(1.05);
    }
    expect(distMean(exp)).toBe(80);
    expect(distVariance(exp)).toBe(6400);
  });

  it('the log-normal puts Φ(σ/2) of its draws below its mean, within 0.01 at n = 200,000 (69.1% at σ = 1)', () => {
    const n = 200_000;
    for (const sigma of [0.5, 1, 1.5]) {
      const d: Dist = { family: 'lognormal', mu: 4.4, sigma };
      const xs = drawSample(d, 5, n);
      const share = xs.filter((x) => x < distMean(d)).length / n;
      expect(Math.abs(share - lognormalShareBelowMean(sigma))).toBeLessThan(0.01);
      expect(shareBelowMean(d)).toBeCloseTo(normalCdf(sigma / 2), 12);
    }
    expect(lognormalShareBelowMean(1)).toBeCloseTo(0.6915, 4);
  });
});

describe('exact quantiles', () => {
  it('normal z values match the published table and the exponential multiples are 0.693 and 4.605 of the mean', () => {
    expect(normalQuantile(0.99)).toBeCloseTo(2.3263478740408408, 9);
    expect(normalQuantile(0.999)).toBeCloseTo(3.090232306167813, 9);
    const exp: Dist = { family: 'exponential', mean: 100 };
    expect(distQuantile(exp, 0.5)).toBeCloseTo(100 * Math.LN2, 9);
    expect(distQuantile(exp, 0.99) / 100).toBeCloseTo(4.60517, 5);
  });

  it('every displayed exact quantile equals the numeric inverse of the cdf to 1e-9 (relative)', () => {
    for (const d of SAMPLE_DISTS) {
      for (const p of [0.5, 0.9, 0.99, 0.999]) {
        const q = distQuantile(d, p);
        const numeric = bisect((x) => distCdf(d, x), p, d.family === 'normal' ? 0 : 1e-9, 1e9);
        expect(Math.abs(q - numeric) / q, `${d.family} p=${p}`).toBeLessThan(1e-9);
      }
    }
  });

  it('the log-normal and Pareto closed forms (median exp(mu), mean, xm·(1-p)^(-1/α))', () => {
    const logn: Dist = { family: 'lognormal', mu: 4.4, sigma: 0.9 };
    expect(distQuantile(logn, 0.5)).toBeCloseTo(Math.exp(4.4), 9);
    expect(distMean(logn)).toBeCloseTo(Math.exp(4.4 + 0.405), 9);
    const par: Dist = { family: 'pareto', xm: 10, alpha: 2 };
    expect(distQuantile(par, 0.99)).toBeCloseTo(100, 9);
    expect(distMean(par)).toBe(20);
  });

  it('every pdf integrates to 1 and its cdf is the running integral (trapezoid, 200,000 steps)', () => {
    for (const d of SAMPLE_DISTS) {
      const lo = d.family === 'normal' ? 0 : d.family === 'pareto' ? 10 : 0;
      const hi = distQuantile(d, 1 - 1e-7);
      const steps = 200_000;
      const h = (hi - lo) / steps;
      let area = 0;
      for (let i = 0; i < steps; i++) area += ((distPdf(d, lo + i * h) + distPdf(d, lo + (i + 1) * h)) / 2) * h;
      expect(area, d.family).toBeCloseTo(distCdf(d, hi) - distCdf(d, lo), 4);
      expect(distCdf(d, hi)).toBeGreaterThan(1 - 1e-6);
    }
  });
});

describe('moments are decided from the parameters, never from a sample', () => {
  it('Pareto: α ≤ 1 has no mean, α ≤ 2 has no variance', () => {
    expect(momentsOf({ family: 'pareto', xm: 10, alpha: 0.8 })).toBe('infinite-mean');
    expect(momentsOf({ family: 'pareto', xm: 10, alpha: 1 })).toBe('infinite-mean');
    expect(momentsOf({ family: 'pareto', xm: 10, alpha: 1.5 })).toBe('infinite-variance');
    expect(momentsOf({ family: 'pareto', xm: 10, alpha: 2 })).toBe('infinite-variance');
    expect(momentsOf({ family: 'pareto', xm: 10, alpha: 2.5 })).toBe('finite');
    expect(momentsOf({ family: 'normal', mu: 100, sigma: 15 })).toBe('finite');
  });

  it('the summary table says "no finite value" (null) for the mean of a Pareto with α ≤ 1 and the view shows share 1', () => {
    const v = shapeView({ family: 'pareto', xm: 10, alpha: 0.8 }, 3, 'linear');
    expect(summaryRows(v).find((r) => r.key === 'mean')?.exact).toBeNull();
    expect(summaryRows(v).filter((r) => r.exact === null)).toHaveLength(1);
  });

  it('a Pareto sample mean keeps jumping where a normal one settles (running means at 100, 1,000, 10,000 draws)', () => {
    const settled = shapeView({ family: 'normal', mu: 100, sigma: 15 }, 4, 'linear').runningMeans;
    expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(5);
    let jumpy = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = shapeView({ family: 'pareto', xm: 10, alpha: 0.8 }, seed, 'linear').runningMeans;
      jumpy += r[2] / r[0] > 3 ? 1 : 0;
    }
    expect(jumpy).toBeGreaterThanOrEqual(4);
  });
});

describe('Poisson counts from exponential gaps', () => {
  it('the pmf sums to 1 within 1e-12, with mean = variance = λ', () => {
    for (const lambda of [0.5, 4, 20]) {
      let sum = 0;
      let m = 0;
      let m2 = 0;
      for (let k = 0; k < 200; k++) {
        const p = poissonPmf(k, lambda);
        sum += p;
        m += k * p;
        m2 += k * k * p;
      }
      expect(Math.abs(sum - 1)).toBeLessThan(1e-12);
      expect(m).toBeCloseTo(lambda, 10);
      expect(m2 - m * m).toBeCloseTo(lambda, 10);
    }
  });

  it('counts made by counting arrivals with exponential gaps match the pmf: total variation below 0.02 at 20,000 windows', () => {
    for (const [rate, window] of [[1, 0.5], [4, 1], [10, 2]]) {
      const lambda = rate * window;
      const { counts } = countArrivals({ rate, window, windows: 20_000, seed: 8, bursty: false });
      expect(totalVariation(counts, lambda), `λ=${lambda}`).toBeLessThan(0.02);
    }
  });

  it('the dispersion index is within 0.1 of 1 for the plain process and above 1.5 for the bursty one (same overall rate)', () => {
    for (const [rate, window] of [[1, 0.5], [4, 1], [10, 2]]) {
      const plain = countArrivals({ rate, window, windows: 20_000, seed: 21, bursty: false }).counts;
      const bursty = countArrivals({ rate, window, windows: 20_000, seed: 21, bursty: true }).counts;
      expect(Math.abs(dispersionIndex(plain) - 1)).toBeLessThan(0.1);
      expect(dispersionIndex(bursty)).toBeGreaterThan(1.5);
      const mean = (c: number[]) => c.reduce((s, x) => s + x, 0) / c.length;
      expect(Math.abs(mean(bursty) - rate * window) / (rate * window), 'same overall rate').toBeLessThan(0.05);
    }
  });

  it('the bursty dispersion index matches 2b − 1 for geometric batches of mean b', () => {
    const { counts } = countArrivals({ rate: 10, window: 2, windows: 20_000, seed: 3, bursty: true });
    const expected = 2 * BURST_MEAN - 1;
    expect(Math.abs(dispersionIndex(counts) - expected) / expected).toBeLessThan(0.1);
  });

  it('same seed, same counts; a different seed differs', () => {
    const o = { rate: 4, window: 1, windows: 500, seed: 5, bursty: false };
    expect(countArrivals(o)).toEqual(countArrivals({ ...o }));
    expect(countArrivals({ ...o, seed: 6 }).counts).not.toEqual(countArrivals(o).counts);
  });
});

describe('what the mean hides (the CLT, shown and failing)', () => {
  it('for finite-variance shapes the spread of the means is σ/√n: ratio within 0.15 of 1 at every n', () => {
    for (const family of ['normal', 'exponential', 'lognormal'] as const) {
      for (const n of [1, 10, 100]) {
        const d = cltDist(family, 1.5);
        const r = cltReport(d, n, replicateMeans(d, n, 17));
        expect(r.ratio, `${family} n=${n}`).not.toBeNull();
        expect(Math.abs((r.ratio ?? 0) - 1), `${family} n=${n}`).toBeLessThan(0.15);
      }
    }
  });

  it('a Pareto with α = 1.5 reports no σ (null), α = 0.8 reports no mean, and the formula is not "close to 1"', () => {
    const heavy = cltDist('pareto', 1.5);
    expect(cltReport(heavy, 100, replicateMeans(heavy, 100, 2)).ratio).toBeNull();
    expect(cltReport(heavy, 100, replicateMeans(heavy, 100, 2)).moments).toBe('infinite-variance');
    const none = cltDist('pareto', 0.8);
    expect(cltReport(none, 100, replicateMeans(none, 100, 2)).exactMean).toBeNull();
  });

  it('means of 100x more draws shrink the spread by ~10x for a normal, but far less than that for a Pareto with α = 1.5', () => {
    const shrink = (d: Dist) => stdDev(replicateMeans(d, 10, 31)) / stdDev(replicateMeans(d, 1000, 31));
    expect(Math.abs(shrink(cltDist('normal', 1.5)) - 10)).toBeLessThan(1);
    expect(shrink(cltDist('pareto', 1.5))).toBeLessThan(8);
  });

  it('the CLT shapes are pinned: scene 1 and the other shapes\' α cannot reach them', () => {
    expect(cltDist('normal', 0.8)).toEqual(cltDist('normal', 4));
    expect(cltDist('lognormal', 0.8)).toEqual(cltDist('lognormal', 4));
    expect(cltDist('pareto', 0.8)).not.toEqual(cltDist('pareto', 4));
  });
});

describe('the Pareto tail slope and the mystery game', () => {
  it('the fitted slope of the log-log CCDF above the 90th percentile is −α within 0.1 for α ∈ {1.5, 2, 3} at n = 100,000', () => {
    for (const alpha of [1.5, 2, 3]) {
      const sorted = drawSample({ family: 'pareto', xm: 10, alpha }, 41, 100_000).sort((a, b) => a - b);
      expect(Math.abs(tailSlope(sorted) + alpha), `α=${alpha}`).toBeLessThan(0.1);
    }
  });

  it('three datasets from three different families, deterministic per seed, drawn from the documented parameters', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sets = mysteryDatasets(seed);
      expect(new Set(sets.map((s) => s.truth)).size).toBe(3);
      expect(mysteryDatasets(seed).map((s) => s.truth)).toEqual(sets.map((s) => s.truth));
      for (const s of sets) {
        const d = MYSTERY_DISTS[s.truth];
        expect(ksStatistic(s.sorted, (x) => distCdf(d, x))).toBeLessThan(1.95 / Math.sqrt(s.sorted.length));
      }
    }
    expect(new Set(Array.from({ length: 20 }, (_, i) => mysteryDatasets(i + 1).map((s) => s.truth).join())).size).toBeGreaterThan(3);
  });

  it('the computed hints point the right way on 20 seeds: Pareto straightest on log-log, exponential on log-y, log-normal symmetric in logs', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const s of mysteryDatasets(seed)) {
        const h = mysteryHints(s.sorted);
        if (s.truth === 'pareto') expect(h.r2LogLog, `seed ${seed}`).toBeGreaterThan(h.r2LogY);
        if (s.truth === 'exponential') expect(h.r2LogY, `seed ${seed}`).toBeGreaterThan(h.r2LogLog);
        if (s.truth === 'lognormal') expect(Math.abs(h.logSkew), `seed ${seed}`).toBeLessThan(0.2);
      }
    }
  });
});

describe('hostile input', () => {
  it('log bins are refused for the normal (it has non-positive values) and honoured for the rest', () => {
    expect(logBinsAllowed({ family: 'normal', mu: 0, sigma: 1 })).toBe(false);
    expect(shapeView({ family: 'normal', mu: 100, sigma: 15 }, 1, 'log').mode).toBe('linear');
    for (const family of FAMILIES.filter((f) => f !== 'normal')) {
      const d = SAMPLE_DISTS.find((x) => x.family === family)!;
      expect(shapeView(d, 1, 'log').mode).toBe('log');
    }
  });

  it('histogram counts add up to the draws that fall on the axis, and bins exist at both extreme slider settings', () => {
    for (const d of [
      { family: 'pareto', xm: 5, alpha: 0.8 }, { family: 'pareto', xm: 100, alpha: 4 }, { family: 'lognormal', mu: 2, sigma: 0.1 },
      { family: 'lognormal', mu: 7, sigma: 2 }, { family: 'normal', mu: 50, sigma: 50 }, { family: 'exponential', mean: 10 },
    ] as Dist[]) {
      for (const mode of ['linear', 'log'] as const) {
        const v = shapeView(d, 9, mode);
        expect(v.counts.reduce((s, c) => s + c, 0) + v.outside).toBe(v.n);
        expect(v.counts.every(Number.isFinite)).toBe(true);
      }
    }
  });
});
