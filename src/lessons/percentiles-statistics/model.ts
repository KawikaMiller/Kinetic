import { quantile } from '../../core/distributions';
import { mulberry32, type Rnd } from '../../core/random';
import { mean, percentile } from '../../core/sim';
import { stdDev } from '../../core/stats';
import { distMean, distQuantile, distSample, drawSample, type Dist } from '../distributions/model';

/* ---------- scene 1: three definitions of a percentile ---------- */

export type Rule = 'nearest' | 'floor' | 'linear';

export const RULES: readonly Rule[] = ['nearest', 'floor', 'linear'];

export const RULE_NAME: Record<Rule, string> = {
  nearest: 'nearest-rank',
  floor: 'floor(n·p) index',
  linear: 'linear interpolation',
};

/** Rounds away the 1e-16 noise in n·p/100 so ⌈7.000000000000001⌉ doesn't become 8. */
const RANK_NOISE = 1e9;
const roundNoise = (x: number) => Math.round(x * RANK_NOISE) / RANK_NOISE;

/** The 1-based rank nearest-rank picks: the ⌈p·n⌉-th smallest, clamped into 1..n. */
export function nearestRankIndex(n: number, pct: number): number {
  return Math.min(n, Math.max(1, Math.ceil(roundNoise((n * pct) / 100))));
}

/** Nearest-rank: the ⌈p·n⌉-th smallest value; null for an empty sample. */
export function nearestRank(sorted: readonly number[], pct: number): number | null {
  return sorted.length ? sorted[nearestRankIndex(sorted.length, pct) - 1] : null;
}

/** The 0-based index core/sim `percentile` (the rule this app uses) picks: ⌊n·p⌋, capped at n − 1. */
export const floorIndex = (n: number, pct: number): number => Math.min(n - 1, Math.floor(n * (pct / 100)));

/** The value of a percentile under one of the three rules (pct in percent, e.g. 99.9); null for an empty sample. */
export function ruleValue(rule: Rule, sorted: readonly number[], pct: number): number | null {
  if (!sorted.length) return null;
  if (rule === 'nearest') return nearestRank(sorted, pct);
  if (rule === 'floor') return percentile(sorted, pct / 100);
  return quantile(sorted, pct / 100);
}

/** How each rule picked its value, in words and numbers. */
export function ruleDetail(rule: Rule, n: number, pct: number): string {
  if (n === 0) return 'no samples yet';
  if (rule === 'nearest') {
    const k = nearestRankIndex(n, pct);
    return `the ${k}${ordinalSuffix(k)} smallest of ${n}`;
  }
  if (rule === 'floor') return `sorted[${floorIndex(n, pct)}], 0-based, of ${n}`;
  const pos = (pct / 100) * (n - 1);
  const lo = Math.floor(pos);
  const frac = pos - lo;
  if (lo >= n - 1 || frac === 0) return `exactly sorted[${Math.min(lo, n - 1)}]`;
  return `${Math.round(frac * 100)}% of the way from sorted[${lo}] to sorted[${lo + 1}]`;
}

function ordinalSuffix(k: number): string {
  const tens = k % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][k % 10 < 4 ? k % 10 : 0];
}

/** How many samples lie strictly above a value: "1 of 20". */
export const countAbove = (sorted: readonly number[], v: number): number => sorted.filter((x) => x > v).length;

/** F(x): the share of samples at or below x; NaN for an empty sample. */
export function ecdfAt(sorted: readonly number[], x: number): number {
  if (!sorted.length) return NaN;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

/** The percentile slider's range: p reaches 99.99 but never 100, which would just be the maximum. */
export const P_RANGE = { min: 50, max: 99.99, step: 0.01 } as const;
export const clampPct = (p: number): number => Math.min(P_RANGE.max, Math.max(P_RANGE.min, p));

/** The latency stream of scene 1 (log-normal, illustrative) and the sample sizes offered. */
export const STREAM_DIST: Dist = { family: 'lognormal', mu: Math.log(80), sigma: 0.6 };
export const STREAM_SIZES = [20, 100, 1_000, 5_000] as const;

export type DataSource = 'stream' | 'hundred' | 'twenty';

/** The two hand-made presets: 1…100 and 1…20. */
export const presetValues = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

export const sortedAscending = (xs: readonly number[]): number[] => [...xs].sort((a, b) => a - b);

export function scene1Data(source: DataSource, seed: number, n: number): number[] {
  if (source === 'hundred') return presetValues(100);
  if (source === 'twenty') return presetValues(20);
  return sortedAscending(drawSample(STREAM_DIST, seed, n));
}

/* ---------- scene 2: never average your p99s ---------- */

export type HostsMode = 'seeded' | 'understates' | 'overstates';

export interface Host {
  name: string;
  /** Latencies in ms, any order. */
  values: number[];
}

export const HOST_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const MAX_HOSTS = HOST_NAMES.length;
export const MIN_HOSTS = 2;
/** The percentile scene 2 compares (nearest-rank, the rule the preset vectors are worked with). */
export const FLEET_PCT = 99;
/** Requests behind the seeded fleet at 100% total share: each host takes its share of this. */
export const FLEET_REQUESTS = 2_000;
/** Seeded hosts differ in typical latency (median, ms) and tail weight (σ of ln). */
const HOST_MEDIANS = [40, 55, 45, 70, 50, 65];
const HOST_SIGMAS = [0.4, 0.5, 0.7, 0.9, 0.6, 1.1];
export const DEFAULT_SHARES = [60, 25, 10, 5, 3, 2];

const repeat = (value: number, n: number): number[] => Array.from({ length: n }, () => value);

/** The two hand-worked fleets from the lesson text. */
export function presetHosts(mode: Exclude<HostsMode, 'seeded'>): Host[] {
  if (mode === 'understates') {
    return [
      { name: 'A', values: [...repeat(10, 90), ...repeat(100, 10)] },
      { name: 'B', values: repeat(10, 100) },
    ];
  }
  return [
    { name: 'A', values: [...repeat(10, 990), ...repeat(20, 10)] },
    { name: 'B', values: [...repeat(10, 9), 1000] },
  ];
}

/** Each host's own seeded stream, long enough that a bigger share only extends it; its share sets how much of it is used. */
export function seededHosts(shares: readonly number[], seed: number): Host[] {
  const total = shares.reduce((s, x) => s + x, 0);
  return shares.map((share, i) => {
    const count = total === 0 ? 0 : Math.round((FLEET_REQUESTS * share) / total);
    const dist: Dist = { family: 'lognormal', mu: Math.log(HOST_MEDIANS[i]), sigma: HOST_SIGMAS[i] };
    return { name: HOST_NAMES[i], values: drawSample(dist, seed * 101 + i + 1, FLEET_REQUESTS).slice(0, count) };
  });
}

/** Fixed latency buckets (ratio 1.2 per step from 1 ms) to merge by adding counts, as histogram-based monitoring does. */
export const BUCKET_RATIO = 1.2;
export const BUCKET_START = 1;
export const BUCKET_COUNT = 64;
export const BUCKET_EDGES: readonly number[] = Array.from({ length: BUCKET_COUNT }, (_, k) => BUCKET_START * BUCKET_RATIO ** k);

/** Counts per bucket: a value falls in the first bucket whose upper edge is at least that large (the last one catches the rest). */
export function bucketCounts(values: readonly number[]): number[] {
  const counts = new Array<number>(BUCKET_EDGES.length).fill(0);
  for (const v of values) {
    const i = BUCKET_EDGES.findIndex((e) => v <= e);
    counts[i === -1 ? BUCKET_EDGES.length - 1 : i]++;
  }
  return counts;
}

export const mergeBuckets = (all: readonly (readonly number[])[]): number[] =>
  BUCKET_EDGES.map((_, i) => all.reduce((s, c) => s + c[i], 0));

export interface BucketQuantile {
  /** The upper edge of the bucket holding the rank: what a bucket-based system reports. */
  value: number;
  /** The bucket's own span: the value is off by at most this much. */
  lo: number;
  hi: number;
  width: number;
}

/** The nearest-rank percentile read from merged bucket counts; null when nothing was counted. */
export function bucketQuantile(counts: readonly number[], pct: number): BucketQuantile | null {
  const n = counts.reduce((s, c) => s + c, 0);
  if (n === 0) return null;
  const rank = nearestRankIndex(n, pct);
  let seen = 0;
  for (let i = 0; i < counts.length; i++) {
    seen += counts[i];
    if (seen >= rank) {
      const lo = i === 0 ? 0 : BUCKET_EDGES[i - 1];
      return { value: BUCKET_EDGES[i], lo, hi: BUCKET_EDGES[i], width: BUCKET_EDGES[i] - lo };
    }
  }
  return null;
}

export interface HostRow {
  name: string;
  requests: number;
  /** Nearest-rank p99 of this host's own requests; null for a host with none. */
  p99: number | null;
}

export interface FleetReport {
  hosts: HostRow[];
  /** Hosts with no requests, dropped from the average. */
  dropped: string[];
  /** Mean of the per-host p99s (unweighted): the tempting wrong number. */
  average: number | null;
  /** Nearest-rank p99 of every request merged: the right number. */
  merged: number | null;
  /** average − merged, in ms (negative: the average understates). */
  gap: number | null;
  gapPct: number | null;
  total: number;
  buckets: BucketQuantile | null;
}

export function fleetReport(hosts: readonly Host[]): FleetReport {
  const rows: HostRow[] = hosts.map((h) => ({
    name: h.name,
    requests: h.values.length,
    p99: nearestRank(sortedAscending(h.values), FLEET_PCT),
  }));
  const live = rows.filter((r): r is HostRow & { p99: number } => r.p99 !== null);
  const all = sortedAscending(hosts.flatMap((h) => h.values));
  const merged = nearestRank(all, FLEET_PCT);
  const average = live.length ? mean(live.map((r) => r.p99)) : null;
  const gap = average === null || merged === null ? null : average - merged;
  return {
    hosts: rows,
    dropped: rows.filter((r) => r.requests === 0).map((r) => r.name),
    average,
    merged,
    gap,
    gapPct: gap === null || merged === null || merged === 0 ? null : gap / merged,
    total: all.length,
    buckets: bucketQuantile(mergeBuckets(hosts.map((h) => bucketCounts(h.values))), FLEET_PCT),
  };
}

/** What the average does to the fleet p99: 'understates', 'overstates' or 'matches' (within 1%). */
export function averageVerdict(r: FleetReport): 'understates' | 'overstates' | 'matches' | 'none' {
  if (r.gapPct === null) return 'none';
  if (Math.abs(r.gapPct) <= 0.01) return 'matches';
  return r.gap! < 0 ? 'understates' : 'overstates';
}

/** The wrong aggregation, used by the "broken variant" test: a "percentile" that averages host percentiles. */
export function averageOfHostPercentiles(hosts: readonly Host[], pct: number): number | null {
  const ps = hosts.map((h) => nearestRank(sortedAscending(h.values), pct)).filter((p): p is number => p !== null);
  return ps.length ? mean(ps) : null;
}

/* ---------- scene 3: sampling and intervals ---------- */

/** Two-sided 95% t critical values by degrees of freedom: a small table, read at the largest row not above df. */
export const T_TABLE: readonly (readonly [number, number])[] = [
  [1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447], [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228],
  [12, 2.179], [15, 2.131], [20, 2.086], [25, 2.06], [30, 2.042], [40, 2.021], [60, 2], [120, 1.98], [500, 1.965],
  [1000, 1.962], [5000, 1.96],
];

/** t critical value for df degrees of freedom: the row at or below df (slightly wide between rows, never narrow). */
export function tCritical(df: number): number {
  let value = T_TABLE[0][1];
  for (const [rowDf, t] of T_TABLE) if (rowDf <= df) value = t;
  return value;
}

export interface Interval {
  estimate: number;
  lo: number;
  hi: number;
}

/** mean ± t·s/√n; null with fewer than two values (the interval is undefined). */
export function meanInterval(xs: readonly number[]): Interval | null {
  const n = xs.length;
  if (n < 2) return null;
  const m = mean(xs);
  const half = (tCritical(n - 1) * stdDev(xs, { sample: true })) / Math.sqrt(n);
  return { estimate: m, lo: m - half, hi: m + half };
}

/** Binomial(n, p) by inversion: fine here because n·p stays near 1 in the bootstrap below. */
function binomial(rnd: Rnd, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  const ratio = p / (1 - p);
  let k = 0;
  let pk = (1 - p) ** n;
  let cdf = pk;
  const u = rnd();
  while (u > cdf && k < n) {
    k++;
    pk *= ((n - k + 1) / k) * ratio;
    cdf += pk;
  }
  return k;
}

/**
 * The nearest-rank percentile of ONE bootstrap resample (n draws with replacement from `sorted`),
 * without drawing all n: the copies each element gets are multinomial, so they are drawn one
 * element at a time from the top until the ⌈p·n⌉-th smallest is covered. Same distribution as
 * resampling and sorting (the tests compare the two), at O((1−p)·n) instead of O(n log n).
 */
export function resampledPercentile(sorted: readonly number[], pct: number, rnd: Rnd): number {
  const n = sorted.length;
  const copiesNeeded = n - nearestRankIndex(n, pct) + 1;
  let remaining = n;
  let covered = 0;
  for (let fromTop = 1; fromTop <= n; fromTop++) {
    const copies = binomial(rnd, remaining, 1 / (n - fromTop + 1));
    remaining -= copies;
    covered += copies;
    if (covered >= copiesNeeded) return sorted[n - fromTop];
  }
  return sorted[0];
}

export const BOOTSTRAP_RESAMPLES = 1_000;
/** Coverage experiments use fewer resamples per interval, so 1,000 experiments stay quick. */
export const COVERAGE_RESAMPLES = 200;
const INTERVAL_TAILS = [0.025, 0.975] as const;

/** A percentile-bootstrap 95% interval for the p-th percentile of `sorted`; null with fewer than two values. */
export function bootstrapInterval(sorted: readonly number[], pct: number, resamples: number, rnd: Rnd): Interval | null {
  if (sorted.length < 2) return null;
  const draws = Array.from({ length: resamples }, () => resampledPercentile(sorted, pct, rnd)).sort((a, b) => a - b);
  return { estimate: nearestRank(sorted, pct)!, lo: quantile(draws, INTERVAL_TAILS[0]), hi: quantile(draws, INTERVAL_TAILS[1]) };
}

export type Statistic = 'mean' | 'p99';
export type SourceId = 'normal' | 'heavy';

export const SOURCES: Record<SourceId, { dist: Dist; name: string }> = {
  normal: { dist: { family: 'normal', mu: 100, sigma: 20 }, name: 'normal (mean 100, SD 20)' },
  heavy: { dist: { family: 'lognormal', mu: Math.log(80), sigma: 1.5 }, name: 'heavy-tailed log-normal (σ = 1.5)' },
};

export const SAMPLE_N = { min: 10, max: 10_000 } as const;
export const SWEEP_SIZES = [10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000] as const;
/** The percentile of scene 3's tail statistic. */
export const TAIL_PCT = 99;

/** The true value the interval is trying to cover: the source's exact mean or exact p99. */
export const truth = (source: SourceId, stat: Statistic): number =>
  stat === 'mean' ? distMean(SOURCES[source].dist) : distQuantile(SOURCES[source].dist, TAIL_PCT / 100);

/** The interval for one statistic of one sample (already sorted for p99). */
export function intervalFor(stat: Statistic, sample: readonly number[], resamples: number, rnd: Rnd): Interval | null {
  return stat === 'mean' ? meanInterval(sample) : bootstrapInterval(sortedAscending(sample), TAIL_PCT, resamples, rnd);
}

/** The seed of the k-th sample: far apart per k, so samples never share a stream. */
const SAMPLE_STRIDE = 7919;
export const sampleSeed = (seed: number, index: number): number => seed + index * SAMPLE_STRIDE;

export function drawSampleOf(source: SourceId, seed: number, index: number, n: number): number[] {
  return drawSample(SOURCES[source].dist, sampleSeed(seed, index), n);
}

/** Intervals across a sweep of n, each on the first n values of one master stream, so the band shrinks smoothly. */
export function sweepIntervals(source: SourceId, stat: Statistic, seed: number, index: number): { n: number; interval: Interval }[] {
  const master = drawSampleOf(source, seed, index, SWEEP_SIZES[SWEEP_SIZES.length - 1]);
  const rnd = mulberry32(sampleSeed(seed, index) + 1);
  return SWEEP_SIZES.map((n) => ({ n, interval: intervalFor(stat, master.slice(0, n), BOOTSTRAP_RESAMPLES, rnd)! }));
}

/** Expected observations above the p-th percentile: n·(1 − p/100). */
export const expectedAbove = (n: number, pct: number): number => (n * (100 - pct)) / 100;

/** Experiments are capped by total draws so a click stays quick; at most 1,000. */
export const EXPERIMENTS = 1_000;
export const WORK_BUDGET = 2_000_000;
export const experimentsFor = (n: number): number => Math.min(EXPERIMENTS, Math.max(1, Math.floor(WORK_BUDGET / n)));
/** Intervals drawn in the coverage picture. */
export const SHOWN_INTERVALS = 40;

export interface CoverageRun {
  experiments: number;
  covered: number;
  coverage: number;
  /** The first SHOWN_INTERVALS intervals, for the picture, each with whether it covered the truth. */
  shown: { interval: Interval; covered: boolean }[];
  truth: number;
}

/** Repeats the sampling `experiments` times at size n and reports how often the interval contained the true value. */
export function coverageRun(source: SourceId, stat: Statistic, n: number, seed: number, experiments = experimentsFor(n)): CoverageRun {
  const exact = truth(source, stat);
  const dist = SOURCES[source].dist;
  let covered = 0;
  const shown: CoverageRun['shown'] = [];
  for (let e = 0; e < experiments; e++) {
    const rnd = mulberry32(sampleSeed(seed, e + 1));
    const sample = Array.from({ length: n }, () => distSample(dist, rnd));
    const interval = intervalFor(stat, sample, COVERAGE_RESAMPLES, rnd);
    const hit = interval !== null && interval.lo <= exact && exact <= interval.hi;
    if (hit) covered++;
    if (shown.length < SHOWN_INTERVALS && interval) shown.push({ interval, covered: hit });
  }
  return { experiments, covered, coverage: covered / experiments, shown, truth: exact };
}

/* ---------- each scene's default state, named so a test can pin the real first screen ---------- */

export const RULE_DEFAULT = { source: 'stream' as DataSource, rule: 'nearest' as Rule, pct: 99, n: 100, seed: 1 };
export const FLEET_DEFAULT = { mode: 'understates' as HostsMode, hosts: 4, shares: DEFAULT_SHARES, seed: 1 };
export const INTERVAL_DEFAULT = { source: 'normal' as SourceId, stat: 'mean' as Statistic, exponent: 2, seed: 1 };
