import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { percentile } from '../../core/sim';
import { drawSample } from '../distributions/model';
import {
  BUCKET_EDGES, EXPERIMENTS, FLEET_PCT, SAMPLE_N, SOURCES, T_TABLE, averageOfHostPercentiles, averageVerdict, bootstrapInterval, bucketCounts,
  bucketQuantile, clampPct, countAbove, coverageRun, ecdfAt, experimentsFor, fleetReport, meanInterval, mergeBuckets, nearestRank,
  nearestRankIndex, presetHosts, presetValues, resampledPercentile, ruleDetail, ruleValue, seededHosts, sortedAscending, tCritical,
  type Host,
} from './model';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe('three definitions of a percentile, against hand-worked tables', () => {
  const hundred = presetValues(100);
  const twenty = presetValues(20);

  it('1…100: nearest-rank 50 / 99 / 100, linear 50.5 / 99.01 / 99.901, the floor rule 51 / 100 / 100', () => {
    expect([50, 99, 99.9].map((p) => ruleValue('nearest', hundred, p))).toEqual([50, 99, 100]);
    const linear = [50, 99, 99.9].map((p) => ruleValue('linear', hundred, p)!);
    expect(linear[0]).toBeCloseTo(50.5, 10);
    expect(linear[1]).toBeCloseTo(99.01, 10);
    expect(linear[2]).toBeCloseTo(99.901, 10);
    expect([50, 99, 99.9].map((p) => ruleValue('floor', hundred, p))).toEqual([51, 100, 100]);
  });

  it('1…20: p99 is the maximum under nearest-rank and the floor rule, and 81% of the way from 19 up to 20 under linear', () => {
    expect(ruleValue('nearest', twenty, 99)).toBe(20);
    expect(ruleValue('floor', twenty, 99)).toBe(20);
    expect(ruleValue('linear', twenty, 99)).toBeCloseTo(19.81, 10);
    expect(ruleDetail('linear', 20, 99)).toBe('81% of the way from sorted[18] to sorted[19]');
    expect(countAbove(twenty, ruleValue('linear', twenty, 99)!)).toBe(1);
    expect(countAbove(twenty, ruleValue('nearest', twenty, 99)!)).toBe(0);
  });

  it('nearest-rank equals sort-and-index done in integer arithmetic on 1,000 seeded arrays', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 1000; t++) {
      const n = 1 + Math.floor(rnd() * 400);
      const xs = Array.from({ length: n }, () => Math.floor(rnd() * 1000));
      const sorted = sortedAscending(xs);
      const hundredths = [5000, 9000, 9900, 9990, 9999, 7345][t % 6];
      const rank = Math.floor((n * hundredths + 9999) / 10000); // ⌈n·p⌉ with p = hundredths / 10000, no floating point
      expect(nearestRank(sorted, hundredths / 100), `n=${n} p=${hundredths / 100}`).toBe(sorted[Math.min(n, Math.max(1, rank)) - 1]);
    }
  });

  it('the floor rule is the app\'s own core/sim percentile, and nearest-rank dodges the 7.000000000000001 trap', () => {
    expect(ruleValue('floor', hundred, 90)).toBe(percentile(hundred, 0.9));
    expect(nearestRankIndex(100, 7)).toBe(7);
    expect(nearestRankIndex(50, 14)).toBe(7);
    expect(nearestRankIndex(1000, 99.9)).toBe(999);
  });

  it('every rule returns a sample value or an interpolation between neighbours, never outside the data', () => {
    const rnd = mulberry32(2);
    for (let t = 0; t < 200; t++) {
      const sorted = sortedAscending(Array.from({ length: 5 + (t % 50) }, () => rnd() * 100));
      for (const rule of ['nearest', 'floor', 'linear'] as const) {
        const v = ruleValue(rule, sorted, 50 + rnd() * 49.99)!;
        expect(v).toBeGreaterThanOrEqual(sorted[0]);
        expect(v).toBeLessThanOrEqual(sorted[sorted.length - 1]);
      }
    }
  });

  it('F(x) is the share of samples at or below x', () => {
    expect(ecdfAt(hundred, 50)).toBe(0.5);
    expect(ecdfAt(hundred, 50.5)).toBe(0.5);
    expect(ecdfAt(hundred, 0)).toBe(0);
    expect(ecdfAt(hundred, 1000)).toBe(1);
    expect(ecdfAt([], 3)).toBeNaN();
  });
});

describe('never average your p99s', () => {
  it('the "understates" fleet: per-host p99 100 and 10, average 55, merged p99 100', () => {
    const r = fleetReport(presetHosts('understates'));
    expect(r.hosts.map((h) => h.p99)).toEqual([100, 10]);
    expect(r.average).toBe(55);
    expect(r.merged).toBe(100);
    expect(r.gap).toBe(-45);
    expect(r.gapPct).toBe(-0.45);
    expect(r.total).toBe(200);
    expect(averageVerdict(r)).toBe('understates');
  });

  it('the "overstates" fleet: per-host p99 10 and 1,000, average 505, merged p99 over 1,010 requests is 20', () => {
    const r = fleetReport(presetHosts('overstates'));
    expect(r.hosts.map((h) => h.p99)).toEqual([10, 1000]);
    expect(r.average).toBe(505);
    expect(r.merged).toBe(20);
    expect(r.total).toBe(1010);
    expect(averageVerdict(r)).toBe('overstates');
  });

  it('a broken variant that averages host percentiles fails "equals the merged percentile" on both presets', () => {
    for (const mode of ['understates', 'overstates'] as const) {
      const hosts = presetHosts(mode);
      const merged = nearestRank(sortedAscending(hosts.flatMap((h) => h.values)), FLEET_PCT);
      expect(fleetReport(hosts).merged).toBe(merged);
      expect(averageOfHostPercentiles(hosts, FLEET_PCT)).not.toBe(merged);
    }
  });

  it('the merged p99 equals the p99 of the concatenated requests for 200 seeded fleets, and differs from the average on most', () => {
    let differ = 0;
    for (const seed of SEEDS) {
      const shares = Array.from({ length: 2 + (seed % 5) }, (_, i) => 5 + ((seed * (i + 3)) % 40));
      const hosts = seededHosts(shares, seed);
      const all = sortedAscending(hosts.flatMap((h) => h.values));
      const r = fleetReport(hosts);
      expect(r.merged).toBe(all[Math.ceil((all.length * FLEET_PCT) / 100 - 1e-9) - 1]);
      if (r.average !== r.merged) differ++;
    }
    expect(differ).toBeGreaterThan(190);
  });

  it('a p99 read from merged fixed buckets is within one bucket width of the true value on 200 seeded host mixes', () => {
    for (const seed of SEEDS) {
      const shares = Array.from({ length: 2 + (seed % 5) }, (_, i) => 1 + ((seed * (i + 7)) % 50));
      const hosts = seededHosts(shares, seed);
      const all = sortedAscending(hosts.flatMap((h) => h.values));
      const truth = nearestRank(all, FLEET_PCT)!;
      const b = bucketQuantile(mergeBuckets(hosts.map((h) => bucketCounts(h.values))), FLEET_PCT)!;
      expect(Math.abs(b.value - truth), `seed ${seed}`).toBeLessThanOrEqual(b.width);
      expect(truth).toBeGreaterThan(b.lo);
      expect(truth).toBeLessThanOrEqual(b.hi);
    }
    expect(BUCKET_EDGES[1] / BUCKET_EDGES[0]).toBeCloseTo(1.2, 12);
  });

  it('merging buckets by adding counts equals bucketing the merged requests', () => {
    const hosts = seededHosts([30, 20, 10], 4);
    expect(mergeBuckets(hosts.map((h) => bucketCounts(h.values)))).toEqual(bucketCounts(hosts.flatMap((h) => h.values)));
  });

  it('a host with a 0% share is dropped from the average with its name reported, and nothing is NaN', () => {
    const r = fleetReport(seededHosts([50, 0, 50], 3));
    expect(r.dropped).toEqual(['B']);
    expect(r.hosts[1].p99).toBeNull();
    expect(Number.isFinite(r.average!)).toBe(true);
    const none = fleetReport(seededHosts([0, 0], 3));
    expect(none.average).toBeNull();
    expect(none.merged).toBeNull();
    expect(none.gapPct).toBeNull();
    expect(averageVerdict(none)).toBe('none');
  });

  it('a bigger share only extends a host\'s stream (the first requests stay the same)', () => {
    const small = seededHosts([10, 10], 9)[0].values;
    const big = seededHosts([30, 10], 9)[0].values;
    expect(big.slice(0, small.length)).toEqual(small);
    expect(big.length).toBeGreaterThan(small.length);
  });
});

describe('the t table and the mean interval', () => {
  /** An independent oracle: the t density integrated numerically (Simpson), with Lanczos for ln Γ. */
  function lnGamma(x: number): number {
    const c = [76.1800917294715, -86.5053203294168, 24.0140982408309, -1.23173957245015, 0.120865097386618e-2, -0.5395239384953e-5];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.00000000019001;
    for (const k of c) ser += k / ++y;
    return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x);
  }
  function upperTail(t: number, df: number): number {
    const logC = lnGamma((df + 1) / 2) - lnGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
    const pdf = (x: number) => Math.exp(logC - ((df + 1) / 2) * Math.log(1 + (x * x) / df));
    const hi = 2000;
    const steps = 400_000;
    const h = (hi - t) / steps;
    let s = pdf(t) + pdf(hi);
    for (let i = 1; i < steps; i++) s += pdf(t + i * h) * (i % 2 ? 4 : 2);
    return (s * h) / 3;
  }

  it('every row of the table puts 2.5% in each tail (within 0.0007) when integrated numerically', () => {
    for (const [df, t] of T_TABLE) {
      if (df > 1) expect(Math.abs(upperTail(t, df) - 0.025), `df ${df}`).toBeLessThan(0.0007);
    }
  });

  it('n = 10 uses 2.262 and a large n uses 1.960; between rows it reads the row below (a little wide, never narrow)', () => {
    expect(tCritical(9)).toBe(2.262);
    expect(tCritical(SAMPLE_N.max - 1)).toBe(1.96);
    for (let df = 1; df < 6000; df += 7) {
      const exact = tCritical(df);
      expect(exact).toBeGreaterThanOrEqual(1.96);
      expect(exact + 1e-12, `df ${df}`).toBeGreaterThanOrEqual(tCritical(df + 7));
    }
  });

  it('95% intervals for a normal source cover 0.95 ± 0.01 over 10,000 seeded runs at n = 10, 30 and 100', () => {
    const truth = 100;
    for (const n of [10, 30, 100]) {
      let hit = 0;
      for (let i = 0; i < 10_000; i++) {
        const iv = meanInterval(drawSample(SOURCES.normal.dist, 1000 + i, n))!;
        if (iv.lo <= truth && truth <= iv.hi) hit++;
      }
      expect(Math.abs(hit / 10_000 - 0.95), `n=${n}`).toBeLessThan(0.01);
    }
  });

  it('the interval width between n and 4n shrinks by 2 ± 10% on average over seeds', () => {
    for (const n of [25, 100, 400]) {
      let ratio = 0;
      const runs = 200;
      for (let seed = 1; seed <= runs; seed++) {
        const wide = meanInterval(drawSample(SOURCES.normal.dist, seed, n))!;
        const narrow = meanInterval(drawSample(SOURCES.normal.dist, seed + 5000, 4 * n))!;
        ratio += (wide.hi - wide.lo) / (narrow.hi - narrow.lo) / runs;
      }
      expect(Math.abs(ratio - 2) / 2, `n=${n}`).toBeLessThan(0.1);
    }
  });

  it('a one-sample stream has no interval, and an empty one has no percentile (not NaN)', () => {
    expect(meanInterval([5])).toBeNull();
    expect(meanInterval([])).toBeNull();
    expect(bootstrapInterval([5], 99, 100, mulberry32(1))).toBeNull();
    expect(nearestRank([], 99)).toBeNull();
    expect(ruleValue('linear', [], 99)).toBeNull();
    expect(ruleDetail('nearest', 0, 99)).toBe('no samples yet');
  });
});

describe('the percentile bootstrap', () => {
  it('is seeded: the same seed gives the same interval, a different seed a different one', () => {
    const sorted = sortedAscending(drawSample(SOURCES.heavy.dist, 3, 200));
    const a = bootstrapInterval(sorted, 99, 500, mulberry32(9));
    expect(bootstrapInterval(sorted, 99, 500, mulberry32(9))).toEqual(a);
    expect(bootstrapInterval(sorted, 99, 500, mulberry32(10))).not.toEqual(a);
  });

  it('the fast resample draws the same distribution as resampling n indices and sorting (total variation under 0.02)', () => {
    const n = 200;
    const sorted = sortedAscending(Array.from({ length: n }, (_, i) => i));
    const trials = 40_000;
    const fast = new Map<number, number>();
    const brute = new Map<number, number>();
    const rndFast = mulberry32(1);
    const rndBrute = mulberry32(2);
    for (let t = 0; t < trials; t++) {
      const f = resampledPercentile(sorted, 99, rndFast);
      fast.set(f, (fast.get(f) ?? 0) + 1);
      const draw = sortedAscending(Array.from({ length: n }, () => sorted[Math.floor(rndBrute() * n)]));
      const b = draw[Math.ceil(n * 0.99) - 1];
      brute.set(b, (brute.get(b) ?? 0) + 1);
    }
    const keys = new Set([...fast.keys(), ...brute.keys()]);
    let tv = 0;
    for (const k of keys) tv += Math.abs((fast.get(k) ?? 0) - (brute.get(k) ?? 0)) / trials / 2;
    expect(tv).toBeLessThan(0.02);
  });

  it('the interval contains the sample p99 and lies inside the sample range', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const sorted = sortedAscending(drawSample(SOURCES.heavy.dist, seed, 300));
      const iv = bootstrapInterval(sorted, 99, 300, mulberry32(seed))!;
      expect(iv.lo).toBeLessThanOrEqual(iv.estimate);
      expect(iv.hi).toBeGreaterThanOrEqual(iv.estimate);
      expect(iv.lo).toBeGreaterThanOrEqual(sorted[0]);
      expect(iv.hi).toBeLessThanOrEqual(sorted[sorted.length - 1]);
    }
  });
});

describe('coverage experiments', () => {
  it('a normal source covers about 95% at n = 10, 100 and 10,000, and a heavy-tailed log-normal falls short at n = 10', () => {
    for (const n of [10, 100, 10_000]) {
      const run = coverageRun('normal', 'mean', n, 1);
      // 3 standard errors of a proportion near 0.95 over the experiments actually run (fewer at n = 10,000)
      const tolerance = 3 * Math.sqrt((0.95 * 0.05) / run.experiments);
      expect(Math.abs(run.coverage - 0.95), `n=${n}`).toBeLessThan(tolerance);
    }
    expect(coverageRun('heavy', 'mean', 10, 1).coverage).toBeLessThan(0.9);
  });

  it('is seeded, counts what it reports, and caps work so a click stays quick', () => {
    const a = coverageRun('normal', 'p99', 50, 3, 100);
    expect(coverageRun('normal', 'p99', 50, 3, 100)).toEqual(a);
    expect(a.experiments).toBe(100);
    expect(a.covered / a.experiments).toBe(a.coverage);
    expect(a.shown.filter((s) => s.covered).length).toBeLessThanOrEqual(a.covered);
    expect(experimentsFor(10)).toBe(EXPERIMENTS);
    expect(experimentsFor(10_000)).toBe(200);
    expect(experimentsFor(10_000) * 10_000).toBeLessThanOrEqual(2_000_000);
  });

  it('the p slider never reaches 100 and never goes below 50', () => {
    expect(clampPct(100)).toBe(99.99);
    expect(clampPct(0)).toBe(50);
    expect(clampPct(99.9)).toBe(99.9);
  });
});

describe('host lists stay plain data', () => {
  it('presets are exactly the vectors in the text (200 and 1,010 requests)', () => {
    const sum = (hs: Host[]) => hs.reduce((s, h) => s + h.values.length, 0);
    expect(sum(presetHosts('understates'))).toBe(200);
    expect(sum(presetHosts('overstates'))).toBe(1010);
  });
});
