import { describe, expect, it } from 'vitest';
import { exponentialCdf, ksCritical, ksStatistic, normalCdf } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import {
  BACKEND_DEFAULT, CAUSES, FANOUT_STEPS, FAST_EXPONENTIAL_MEAN_MS, FAST_LOGNORMAL, HEDGE_DEFAULT, MM1, MM1_RHO, MM1_SWEEP_STEP, P99, REQUESTS,
  callQuantile, callSurvival, createFanoutRun, crossoverRho, drawHedged, extraLoad, fanoutReport, fanoutRun, fastNormalQuantile, hedgeReport, hedgeRun, hedgedQuantile,
  hedgedSurvival, hedgingHurts, loadedUtilisation, medianSlowWidth, mm1Hedging, mm1PlainP99, p95DelayMs, requestCalls, sampleCall, sampleQuantile, sampleSlowest,
  slowestOfCalls, slowestQuantile, touchesSlow, type Backend, type Family, type Hedge,
} from './model';

const FAMILIES: Family[] = ['lognormal', 'exponential'];
const backendOf = (family: Family, slowProb = 0.01, slowFactor = 10): Backend => ({ family, slowProb, slowFactor });

/** The cdf of one fast draw, written out here with the core's cdfs (the model works on survival functions). */
const fastCdf = (family: Family, x: number) =>
  family === 'lognormal' ? normalCdf(Math.log(x / FAST_LOGNORMAL.medianMs) / FAST_LOGNORMAL.sigma) : exponentialCdf(x, 1 / FAST_EXPONENTIAL_MEAN_MS);
const callCdf = (b: Backend, x: number) => (x <= 0 ? 0 : (1 - b.slowProb) * fastCdf(b.family, x) + b.slowProb * fastCdf(b.family, x / b.slowFactor));
const slowestCdf = (b: Backend, n: number) => (x: number) => callCdf(b, x) ** n;

describe('fan-out: the arithmetic of 1 − 0.99^N', () => {
  it('matches the spec table at N = 1, 10, 69, 100 and 1,000, against Math.pow', () => {
    const hand: [number, number][] = [[1, 0.01], [10, 0.0956], [69, 0.5], [100, 0.634], [1000, 0.99996]];
    for (const [n, expected] of hand) {
      expect(touchesSlow(0.01, n)).toBeCloseTo(expected, n === 69 ? 3 : 4);
      expect(touchesSlow(0.01, n)).toBeCloseTo(1 - 0.99 ** n, 12);
    }
  });

  it('N = 69 is the smallest width where more than half the requests touch a slow backend, and 68 is not', () => {
    expect(medianSlowWidth(0.01)).toBe(69);
    expect(1 - 0.99 ** 69).toBeGreaterThanOrEqual(0.5);
    expect(1 - 0.99 ** 68).toBeLessThan(0.5);
    expect(medianSlowWidth(0)).toBe(Infinity);
  });

  it('the median-slow width equals a brute-force scan for 200 slow probabilities', () => {
    for (let i = 1; i <= 200; i++) {
      const p = i / 2000;
      let n = 1;
      while (1 - (1 - p) ** n < 0.5) n++;
      expect(medianSlowWidth(p), `p = ${p}`).toBe(n);
    }
  });
});

describe('the fast inverse normal used by the samplers', () => {
  it('inverts normalCdf: a relative error in p under 1e-7 down to 1e-12 (an x error near 1e-9, times |x| out in the tail)', () => {
    for (let k = -12; k <= -1; k += 0.25) {
      const p = 10 ** k;
      expect(Math.abs(normalCdf(fastNormalQuantile(p)) / p - 1), `p = ${p}`).toBeLessThan(1e-7);
    }
    for (let p = 0.01; p < 1; p += 0.01) expect(normalCdf(fastNormalQuantile(p))).toBeCloseTo(p, 8);
    expect(fastNormalQuantile(0.5)).toBeCloseTo(0, 12);
  });
});

describe('samplers against their distributions', () => {
  for (const family of FAMILIES) {
    it(`${family}: one call matches the mixture cdf (KS below the 0.1% critical value) on a fixed seed`, () => {
      const b = backendOf(family, 0.05, 6);
      const rnd = mulberry32(11);
      const sample = Array.from({ length: 50_000 }, () => sampleCall(b, rnd));
      expect(ksStatistic(sample, (x) => callCdf(b, x))).toBeLessThan(ksCritical(sample.length));
    });

    for (const n of [1, 10, 100, 1000]) {
      it(`${family}: the O(1) slowest-of-${n} sampler matches F^N (KS) and a brute-force max of ${n} calls (two-sample KS)`, () => {
        const b = backendOf(family);
        const draws = 20_000;
        const fast = mulberry32(5);
        const sample = Array.from({ length: draws }, () => sampleSlowest(b, n, fast));
        expect(ksStatistic(sample, slowestCdf(b, n))).toBeLessThan(ksCritical(draws));
        const bruteRuns = n === 1000 ? 3_000 : draws;
        const slow = mulberry32(6);
        const brute = Array.from({ length: bruteRuns }, () => slowestOfCalls(b, n, slow));
        expect(ksStatistic(brute, slowestCdf(b, n))).toBeLessThan(ksCritical(bruteRuns));
      });
    }
  }

  it('a broken sampler (the max of N − 1 calls) is rejected by the same KS check', () => {
    const b = backendOf('exponential');
    const rnd = mulberry32(5);
    const sample = Array.from({ length: 20_000 }, () => sampleSlowest(b, 9, rnd));
    expect(ksStatistic(sample, slowestCdf(b, 10))).toBeGreaterThan(ksCritical(sample.length));
  });
});

describe('analytic quantiles', () => {
  it('callQuantile inverts the mixture cdf, for both families and three causes', () => {
    for (const family of FAMILIES) {
      for (const c of CAUSES) {
        const b = backendOf(family, c.slowProb, c.slowFactor);
        for (const q of [0.5, 0.9, 0.99, 0.999]) expect(callCdf(b, callQuantile(b, q))).toBeCloseTo(q, 9);
      }
    }
  });

  it('the exponential, no slow calls: the slowest of N has p-quantile −ln(1 − p^(1/N))·mean (the spec formula)', () => {
    const b = backendOf('exponential', 0, 10);
    for (const n of [1, 10, 100, 1000]) {
      for (const p of [0.5, 0.99]) {
        expect(slowestQuantile(b, n, p)).toBeCloseTo(-Math.log(1 - p ** (1 / n)) * FAST_EXPONENTIAL_MEAN_MS, 6);
      }
    }
  });

  it('the simulated p99 of the slowest of N sits within 3 standard errors of the analytic value, N = 1 to 1,000, both families', () => {
    for (const family of FAMILIES) {
      const b = backendOf(family);
      for (const n of [1, 10, 100, 1000]) {
        const run = fanoutRun(b, n, 3);
        const exact = slowestQuantile(b, n, P99);
        const f = slowestCdf(b, n);
        const eps = 1e-4;
        const density = (f(exact * (1 + eps)) - f(exact * (1 - eps))) / (2 * eps * exact);
        const se = Math.sqrt((P99 * (1 - P99)) / REQUESTS) / density;
        expect(Math.abs(sampleQuantile(run.slowest, run.count, P99) - exact), `${family} N=${n}`).toBeLessThan(3 * se);
      }
    }
  });

  it('the single-call p99 from the run matches the analytic one, and the slowest-of-100 p99 is far larger (the point of the lesson)', () => {
    const run = fanoutRun(BACKEND_DEFAULT, 100, 1);
    const report = fanoutReport(BACKEND_DEFAULT, 100, run);
    expect(Math.abs(report.singleP99Sim / report.singleP99 - 1)).toBeLessThan(0.03);
    expect(Math.abs(report.slowestP99Sim / report.slowestP99 - 1)).toBeLessThan(0.03);
    expect(report.slowestP99).toBeGreaterThan(3 * report.singleP99);
    expect(report.touchSlow).toBeCloseTo(0.634, 3);
  });

  it('the share of simulated requests that touch a slow backend equals 1 − (1 − p)^N within 3 standard errors', () => {
    const b = BACKEND_DEFAULT;
    const rnd = mulberry32(9);
    const n = 100;
    const trials = 40_000;
    let touched = 0;
    for (let i = 0; i < trials; i++) {
      let any = false;
      for (let k = 0; k < n; k++) if (rnd() < b.slowProb) any = true;
      if (any) touched++;
    }
    const p = touchesSlow(b.slowProb, n);
    expect(Math.abs(touched / trials - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / trials));
  });
});

describe('the seeded run', () => {
  it('the same seed gives the same histogram and a different seed does not', () => {
    const a = fanoutRun(BACKEND_DEFAULT, 100, 4);
    const b = fanoutRun(BACKEND_DEFAULT, 100, 4);
    const c = fanoutRun(BACKEND_DEFAULT, 100, 5);
    expect(Array.from(a.slowest.subarray(0, 50))).toEqual(Array.from(b.slowest.subarray(0, 50)));
    expect(Array.from(a.slowest.subarray(0, 50))).not.toEqual(Array.from(c.slowest.subarray(0, 50)));
    expect(a.count).toBe(REQUESTS);
  });

  it('scrubbing to tick k reads the first k chunks only, and equals running k ticks', () => {
    const sim = createFanoutRun(BACKEND_DEFAULT, 10, 2);
    sim.run(20);
    const half = sim.at(10)!;
    expect(half.count).toBe(REQUESTS / 2);
    const fresh = createFanoutRun(BACKEND_DEFAULT, 10, 2);
    fresh.run(10);
    expect(Array.from(fresh.state.slowest.subarray(0, 1000))).toEqual(Array.from(half.slowest.subarray(0, 1000)));
  });

  it('the slider ladder holds the headline widths', () => {
    for (const n of [1, 10, 69, 100, 1000]) expect(FANOUT_STEPS).toContain(n);
  });

  it('one request lists N call latencies, slowest first', () => {
    const calls = requestCalls(BACKEND_DEFAULT, 20, 1);
    expect(calls).toHaveLength(20);
    expect([...calls].sort((a, b) => b - a)).toEqual(calls);
  });
});

describe('hedged requests', () => {
  const b = BACKEND_DEFAULT;
  const hedgeAt = (delay: number, replicas: 1 | 2 | 3 = 2, correlation = 0): Hedge => ({ delay, replicas, correlation });

  it('the survival formula for an exponential backend: S(t) for t < h and S(t)·S(t − h) after, derived by hand', () => {
    const e = backendOf('exponential', 0, 10);
    const h = 25;
    const s = (t: number) => Math.exp(-t / FAST_EXPONENTIAL_MEAN_MS);
    for (const t of [5, 20, 25, 30, 80]) {
      const expected = t < h ? s(t) : s(t) * s(t - h);
      expect(hedgedSurvival(e, hedgeAt(h), t)).toBeCloseTo(expected, 12);
    }
  });

  it('the hedged p99 from the formula matches the simulation within 3% at five hedge delays, and the share that hedged equals S(h)', () => {
    const p95 = p95DelayMs(b);
    for (const delay of [0, 15, 40, p95, 120]) {
      const hedge = hedgeAt(delay);
      const run = hedgeRun(b, hedge, 7);
      const report = hedgeReport(b, hedge, run);
      expect(Math.abs(report.hedgedP99Sim / report.hedgedP99 - 1), `delay ${delay}`).toBeLessThan(0.03);
      const share = callSurvival(b, delay);
      expect(Math.abs(report.extraSim - share), `delay ${delay}`).toBeLessThan(3 * Math.sqrt((share * (1 - share)) / REQUESTS) + 1e-12);
      expect(report.extra).toBeCloseTo(share, 12);
    }
  });

  it('with the delay at the single-request p95, about 5% of requests hedge and p99 falls', () => {
    const delay = p95DelayMs(b);
    expect(callSurvival(b, delay)).toBeGreaterThan(0.045);
    expect(callSurvival(b, delay)).toBeLessThan(0.055);
    expect(hedgedQuantile(b, hedgeAt(delay), P99)).toBeLessThan(callQuantile(b, P99));
    expect(HEDGE_DEFAULT.delay).toBe(delay);
  });

  it('broken variant: hedging at delay 0 duplicates every request, so the extra load is 100%', () => {
    expect(extraLoad(b, hedgeAt(0))).toBeCloseTo(1, 12);
    expect(extraLoad(b, hedgeAt(0, 3))).toBeCloseTo(2, 12);
    const run = hedgeRun(b, hedgeAt(0), 3);
    expect(hedgeReport(b, hedgeAt(0), run).extraSim).toBe(1);
  });

  it('full correlation: hedging adds load and no benefit (hedged = plain, request by request, and p99 equal)', () => {
    const hedge = hedgeAt(40, 2, 1);
    const run = hedgeRun(b, hedge, 2);
    for (let i = 0; i < 2000; i++) expect(run.hedged[i]).toBe(run.plain[i]);
    expect(hedgedQuantile(b, hedge, P99)).toBeCloseTo(callQuantile(b, P99), 6);
    expect(extraLoad(b, hedge)).toBeGreaterThan(0);
  });

  it('correlation only ever reduces the benefit: the hedged p99 is non-decreasing in correlation', () => {
    let last = 0;
    for (let c = 0; c <= 1.0001; c += 0.1) {
      const p99 = hedgedQuantile(b, hedgeAt(p95DelayMs(b), 2, Math.min(1, c)), P99);
      expect(p99).toBeGreaterThanOrEqual(last - 1e-9);
      last = p99;
    }
  });

  it('a third copy helps again, and adds at most S(h) + S(2h) extra requests', () => {
    const two = hedgedQuantile(b, hedgeAt(30, 2), P99);
    const three = hedgedQuantile(b, hedgeAt(30, 3), P99);
    expect(three).toBeLessThanOrEqual(two);
    expect(extraLoad(b, hedgeAt(30, 3))).toBeLessThanOrEqual(callSurvival(b, 30) + callSurvival(b, 60) + 1e-12);
  });

  it('drawHedged sends copy j only if nothing has replied by j·delay, and the winner is the earliest reply', () => {
    const rnd = mulberry32(4);
    for (let i = 0; i < 2000; i++) {
      const hedge = hedgeAt(30, 3, 0.2);
      const r = drawHedged(b, hedge, rnd);
      r.sentAt.forEach((at, j) => {
        expect(at).toBe(j * hedge.delay);
        if (j > 0) expect(Math.min(...r.replyAt.slice(0, j))).toBeGreaterThan(at);
      });
      expect(r.latency).toBe(Math.min(...r.replyAt));
      expect(r.replyAt[r.winner]).toBe(r.latency);
    }
  });
});

describe('when hedging hurts: an M/M/1 backend', () => {
  const h = MM1.hedgeAfterMs / 1000;

  /** The smallest fixed point of x = ρ(1 + e^(−μ(1 − x)h)) in [ρ, 1), by a fine scan for the first sign change, then bisection. */
  function bruteRoot(rho: number): number | null {
    const g = (x: number) => rho * (1 + Math.exp(-MM1.mu * (1 - x) * h)) - x;
    const steps = 200_000;
    let prev = rho;
    for (let i = 1; i < steps; i++) {
      const x = rho + ((1 - rho) * i) / steps;
      if (g(prev) > 0 && g(x) <= 0) {
        let lo = prev;
        let hi = x;
        for (let k = 0; k < 100; k++) {
          const mid = (lo + hi) / 2;
          if (g(mid) > 0) lo = mid;
          else hi = mid;
        }
        return (lo + hi) / 2;
      }
      prev = x;
    }
    return null;
  }

  /** The hedged p99 in ms by bisecting the piecewise survival function directly. */
  function bruteHedgedP99(theta: number): number {
    const survival = (t: number) => (t < h ? Math.exp(-theta * t) : Math.exp(-theta * t) * Math.exp(-theta * (t - h)));
    let lo = 0;
    let hi = 100;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (survival(mid) > 0.01) lo = mid;
      else hi = mid;
    }
    return ((lo + hi) / 2) * 1000;
  }

  it('the fixed point equals a brute-force root at every slider value, and reports overload exactly when there is none', () => {
    for (let rho = MM1_RHO.min; rho <= MM1_RHO.max + 1e-9; rho += MM1_RHO.step) {
      const r = Math.round(rho * 100) / 100;
      const root = bruteRoot(r);
      const fixed = loadedUtilisation(r);
      if (root === null) expect(fixed, `ρ = ${r}`).toBeNull();
      else expect(fixed, `ρ = ${r}`).toBeCloseTo(root, 6);
    }
  });

  it('the hedged p99 equals the piecewise bisection wherever a steady state exists, and the plain p99 is ln(100)/(μ(1 − ρ))', () => {
    for (let rho = 0.1; rho < 0.95; rho += 0.05) {
      const r = mm1Hedging(Math.round(rho * 100) / 100);
      expect(r.plainP99).toBeCloseTo((4.605170185988092 / (MM1.mu * (1 - r.rho))) * 1000, 6);
      expect(mm1PlainP99(r.rho)).toBe(r.plainP99);
      if (r.loadedRho !== null) expect(r.hedgedP99!).toBeCloseTo(bruteHedgedP99(MM1.mu * (1 - r.loadedRho)), 6);
    }
  });

  it('hedging helps at low load, hurts above a crossover that equals a brute-force scan, and overload is reported as hurting', () => {
    const cross = crossoverRho()!;
    expect(cross).not.toBeNull();
    let first: number | null = null;
    for (let i = 0; i <= 85 && first === null; i++) {
      const rho = Math.round((0.1 + i * MM1_SWEEP_STEP) * 100) / 100;
      const root = bruteRoot(rho);
      const worse = root === null ? true : bruteHedgedP99(MM1.mu * (1 - root)) > (Math.log(100) / (MM1.mu * (1 - rho))) * 1000;
      if (worse) first = rho;
    }
    expect(cross).toBe(first);
    expect(hedgingHurts(mm1Hedging(0.1))).toBe(false);
    expect(hedgingHurts(mm1Hedging(0.95))).toBe(true);
    expect(mm1Hedging(0.95).hedgedP99).toBeNull();
  });

  it('every ρ above the crossover also hurts (it is a crossover, not a blip)', () => {
    const cross = crossoverRho()!;
    for (let rho = cross; rho <= 0.95 + 1e-9; rho += 0.01) expect(hedgingHurts(mm1Hedging(Math.round(rho * 100) / 100)), `ρ = ${rho}`).toBe(true);
  });

  it('extra load is P(T > h) at the loaded utilisation, and loaded utilisation is above ρ', () => {
    const r = mm1Hedging(0.5);
    expect(r.loadedRho!).toBeGreaterThan(0.5);
    expect(r.extra!).toBeCloseTo(Math.exp(-MM1.mu * (1 - r.loadedRho!) * h), 9);
  });
});
