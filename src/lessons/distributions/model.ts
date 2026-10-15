import {
  distCdf, distMean, distQuantile, distSample, distVariance, drawSample, exponential, normalCdf, poissonPmf, quantile,
  type Dist, type Family,
} from '../../core/distributions';
import { leastSquares } from '../../core/fit';
import { mulberry32, shuffle } from '../../core/random';
import { histogram, logHistogram, stdDev, variance } from '../../core/stats';

/* ---------- the four families ---------- */

export const FAMILIES: readonly Family[] = ['normal', 'exponential', 'lognormal', 'pareto'];

export const FAMILY_NAME: Record<Family, string> = {
  normal: 'Normal',
  exponential: 'Exponential',
  lognormal: 'Log-normal',
  pareto: 'Pareto',
};

/** Draws behind the scene-1 histogram and table. */
export const N_DRAWS = 10_000;
/** Bins in every histogram of the lesson. */
export const BINS = 40;
/** Replicate means drawn in scene 3 (the CLT picture). */
export const REPLICATES = 2_000;
/** Sample sizes offered in scene 3. */
export const SAMPLE_SIZES = [1, 10, 100, 1_000] as const;
/** Windows counted in scene 2. */
export const WINDOWS = 5_000;
/** In the bursty process every arrival event brings a geometric batch with this mean size. */
export const BURST_MEAN = 4;
/** Size of each mystery dataset in scene 4. */
export const MYSTERY_N = 5_000;

/** The scene-1 slider ranges: the model clamps to these, and the readouts name them. */
export const BOUNDS = {
  normalMu: { min: 50, max: 200 },
  normalSigma: { min: 1, max: 50 },
  expMean: { min: 10, max: 300 },
  logMu: { min: 2, max: 7 },
  logSigma: { min: 0.1, max: 2 },
  paretoXm: { min: 5, max: 100 },
  paretoAlpha: { min: 0.8, max: 4 },
} as const;

const P99 = 0.99;
const P999 = 0.999;
/** The linear x axis ends at this exact quantile, so a heavy tail runs off the right edge instead of squashing the picture. */
const AXIS_QUANTILE = 0.9995;

/** Which moments exist, decided from the parameters alone (never from a sample). */
export type Moments = 'finite' | 'infinite-variance' | 'infinite-mean';

export function momentsOf(d: Dist): Moments {
  if (!Number.isFinite(distMean(d))) return 'infinite-mean';
  return Number.isFinite(distVariance(d)) ? 'finite' : 'infinite-variance';
}

/** The share of draws below the exact mean: P(X < mean). Φ(σ/2) for a log-normal; 1 when the mean is infinite. */
export const shareBelowMean = (d: Dist): number => {
  const m = distMean(d);
  return Number.isFinite(m) ? distCdf(d, m) : 1;
};

/** Φ(σ/2): the log-normal's share below its own mean, written in closed form (the lesson's headline number). */
export const lognormalShareBelowMean = (sigma: number): number => normalCdf(sigma / 2);

/* ---------- scene 1: one shape, a histogram and a table ---------- */

export interface ShapeDefaults {
  normal: Extract<Dist, { family: 'normal' }>;
  exponential: Extract<Dist, { family: 'exponential' }>;
  lognormal: Extract<Dist, { family: 'lognormal' }>;
  pareto: Extract<Dist, { family: 'pareto' }>;
}

export const DEFAULT_SHAPES: ShapeDefaults = {
  normal: { family: 'normal', mu: 170, sigma: 10 },
  exponential: { family: 'exponential', mean: 100 },
  lognormal: { family: 'lognormal', mu: 4.4, sigma: 0.9 },
  pareto: { family: 'pareto', xm: 10, alpha: 1.5 },
};

export interface Preset {
  id: string;
  label: string;
  dist: Dist;
  /** What the family is a model of, said plainly: a model, not a law. */
  note: string;
}

export const PRESETS: readonly Preset[] = [
  { id: 'latency', label: 'Request latency (log-normal)', dist: DEFAULT_SHAPES.lognormal, note: 'Request latencies are often right-skewed, and a log-normal is a convenient model of that here, not a law of nature.' },
  { id: 'gaps', label: 'Gaps between arrivals (exponential)', dist: DEFAULT_SHAPES.exponential, note: 'Gaps between independent arrivals fit an exponential in this model; real traffic can be burstier.' },
  { id: 'sizes', label: 'File sizes (Pareto, illustrative)', dist: DEFAULT_SHAPES.pareto, note: 'Heavy-tailed sizes are sometimes modelled with a Pareto; the parameters here are illustrative, not measured.' },
  { id: 'heights', label: 'Heights (normal)', dist: DEFAULT_SHAPES.normal, note: 'A normal is a reasonable model for many sums of small effects; the parameters here are illustrative.' },
];

export type BinMode = 'linear' | 'log';

/** The scene-1 model: the sorted sample, its histogram and the exact expectations beside it. */
export interface ShapeView {
  dist: Dist;
  seed: number;
  mode: BinMode;
  n: number;
  sorted: number[];
  mean: number;
  median: number;
  p99: number;
  p999: number;
  /** The sample mean after the first RUNNING_AT draws: does it settle? */
  runningMeans: number[];
  /** Share of the draws below the sample mean. */
  belowMeanSample: number;
  belowMeanExact: number;
  edges: number[];
  counts: number[];
  /** Exact expected count per bin, N·(F(x1) − F(x0)). */
  expected: number[];
  /** Draws outside the histogram's axis (a heavy tail runs off the right edge on linear bins). */
  outside: number;
  domain: [number, number];
}

/** Draw counts at which scene 1 reports the running sample mean. */
export const RUNNING_AT = [100, 1_000, N_DRAWS] as const;

export const logBinsAllowed = (d: Dist) => d.family !== 'normal';

export function shapeView(dist: Dist, seed: number, requested: BinMode, n = N_DRAWS): ShapeView {
  const mode: BinMode = requested === 'log' && !logBinsAllowed(dist) ? 'linear' : requested;
  const draws = drawSample(dist, seed, n);
  const sorted = [...draws].sort((a, b) => a - b);
  const mean = draws.reduce((s, x) => s + x, 0) / n;
  const domain: [number, number] = mode === 'log'
    ? [sorted.find((x) => x > 0) ?? Number.MIN_VALUE, sorted[n - 1]]
    : [dist.family === 'normal' ? distQuantile(dist, 1 - AXIS_QUANTILE) : 0, distQuantile(dist, AXIS_QUANTILE)];
  const h = mode === 'log'
    ? logHistogram(draws, { bins: BINS, min: domain[0], max: domain[1] })
    : histogram(draws, { bins: BINS, min: domain[0], max: domain[1] });
  return {
    dist, seed, mode, n, sorted, mean,
    runningMeans: RUNNING_AT.map((k) => draws.slice(0, Math.min(k, n)).reduce((s, x) => s + x, 0) / Math.min(k, n)),
    median: quantile(sorted, 0.5),
    p99: quantile(sorted, P99),
    p999: quantile(sorted, P999),
    belowMeanSample: draws.filter((x) => x < mean).length / n,
    belowMeanExact: shareBelowMean(dist),
    edges: h.edges,
    counts: h.counts,
    expected: h.counts.map((_, i) => n * (distCdf(dist, h.edges[i + 1]) - distCdf(dist, h.edges[i]))),
    outside: h.outside,
    domain,
  };
}

export type StatKey = 'mean' | 'median' | 'p99' | 'p999';

export interface SummaryRow {
  key: StatKey;
  label: string;
  sample: number;
  /** null: no finite value exists (a Pareto with α ≤ 1 has no mean). */
  exact: number | null;
}

/** The four numbers the plot marks, sample beside exact. */
export function summaryRows(v: ShapeView): SummaryRow[] {
  const mean = distMean(v.dist);
  return [
    { key: 'mean', label: 'mean', sample: v.mean, exact: Number.isFinite(mean) ? mean : null },
    { key: 'median', label: 'median', sample: v.median, exact: distQuantile(v.dist, 0.5) },
    { key: 'p99', label: 'p99', sample: v.p99, exact: distQuantile(v.dist, P99) },
    { key: 'p999', label: 'p99.9', sample: v.p999, exact: distQuantile(v.dist, P999) },
  ];
}

/* ---------- scene 2: counts and gaps ---------- */

export interface ArrivalOptions {
  /** Arrivals per second, overall. */
  rate: number;
  /** Window length in seconds: λ = rate × window. */
  window: number;
  windows: number;
  seed: number;
  /** Clumped arrivals: each event brings a geometric batch (mean BURST_MEAN), with the same overall rate. */
  bursty: boolean;
}

export interface ArrivalEvent {
  t: number;
  size: number;
}

export interface ArrivalRun {
  /** Arrivals counted in each window. */
  counts: number[];
  /** Arrival events (time in seconds, batch size) in the first TIMELINE_WINDOWS windows, for the picture. */
  events: ArrivalEvent[];
}

/** Windows drawn on the timeline in scene 2. */
export const TIMELINE_WINDOWS = 6;

/** A geometric batch size on {1, 2, ...} with the given mean. */
export function geometricBatch(rnd: () => number, mean: number): number {
  const p = 1 / mean;
  return mean <= 1 ? 1 : 1 + Math.floor(Math.log(1 - rnd()) / Math.log(1 - p));
}

/** Counts arrivals per window, where the gaps between arrival events are exponential. */
export function countArrivals(o: ArrivalOptions): ArrivalRun {
  const rnd = mulberry32(o.seed);
  const eventRate = o.bursty ? o.rate / BURST_MEAN : o.rate;
  const horizon = o.windows * o.window;
  const counts = new Array<number>(o.windows).fill(0);
  const events: ArrivalEvent[] = [];
  for (let t = exponential(rnd, eventRate); t < horizon; t += exponential(rnd, eventRate)) {
    const size = o.bursty ? geometricBatch(rnd, BURST_MEAN) : 1;
    counts[Math.floor(t / o.window)] += size;
    if (t < TIMELINE_WINDOWS * o.window) events.push({ t, size });
  }
  return { counts, events };
}

/** Variance ÷ mean of the counts: about 1 for a Poisson process, well above 1 for clumps. */
export function dispersionIndex(counts: readonly number[]): number {
  const m = counts.reduce((s, c) => s + c, 0) / counts.length;
  return m === 0 ? NaN : variance(counts) / m;
}

/** Share of windows holding exactly k arrivals, k = 0..kMax. */
export function countShares(counts: readonly number[], kMax: number): number[] {
  const shares = new Array<number>(kMax + 1).fill(0);
  for (const c of counts) if (c <= kMax) shares[c] += 1 / counts.length;
  return shares;
}

/** Total variation distance between the observed shares of 0..∞ and Poisson(λ): half the sum of |difference|. */
export function totalVariation(counts: readonly number[], lambda: number): number {
  const top = Math.max(...counts, Math.ceil(lambda + 10 * Math.sqrt(lambda)));
  const shares = countShares(counts, top);
  let sum = 0;
  let poissonMass = 0;
  for (let k = 0; k <= top; k++) {
    const q = poissonPmf(k, lambda);
    poissonMass += q;
    sum += Math.abs(shares[k] - q);
  }
  return (sum + (1 - poissonMass)) / 2;
}

/** The largest count the scene-2 axis shows: Poisson's tail or the 99.5th percentile of what was counted, whichever is further. */
export function countAxisMax(counts: readonly number[], lambda: number): number {
  const sorted = [...counts].sort((a, b) => a - b);
  const observed = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.995))];
  return Math.min(60, Math.max(8, Math.ceil(lambda + 4 * Math.sqrt(lambda)), observed));
}

export interface ArrivalSummary {
  lambda: number;
  mean: number;
  variance: number;
  dispersion: number;
}

export function arrivalSummary(o: ArrivalOptions, counts: readonly number[]): ArrivalSummary {
  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  return { lambda: o.rate * o.window, mean, variance: variance(counts), dispersion: dispersionIndex(counts) };
}

/* ---------- scene 3: what the mean hides ---------- */

/** Scene 3's own shapes, pinned here so scene 1's sliders can't reach it. Only the Pareto's α is a control. */
const CLT_FIXED: Record<Exclude<Family, 'pareto'>, Dist> = {
  normal: { family: 'normal', mu: 100, sigma: 15 },
  exponential: { family: 'exponential', mean: 100 },
  lognormal: { family: 'lognormal', mu: 4.4, sigma: 0.9 },
};
const CLT_PARETO_XM = 10;

export const cltDist = (family: Family, alpha: number): Dist =>
  family === 'pareto' ? { family: 'pareto', xm: CLT_PARETO_XM, alpha } : CLT_FIXED[family];

/** `replicates` means of n draws each, from one seeded stream. */
export function replicateMeans(d: Dist, n: number, seed: number, replicates = REPLICATES): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: replicates }, () => {
    let s = 0;
    for (let i = 0; i < n; i++) s += distSample(d, rnd);
    return s / n;
  });
}

export interface CltReport {
  moments: Moments;
  /** The measured spread of the replicate means. */
  spread: number;
  /** σ/√n from the exact variance, or null when σ is infinite. */
  predicted: number | null;
  /** spread ÷ (σ/√n): about 1 when the formula applies, null when σ is infinite. */
  ratio: number | null;
  /** The exact mean, null when there is none. */
  exactMean: number | null;
}

export function cltReport(d: Dist, n: number, means: readonly number[]): CltReport {
  const moments = momentsOf(d);
  const spread = stdDev(means);
  const predicted = moments === 'finite' ? Math.sqrt(distVariance(d) / n) : null;
  return {
    moments,
    spread,
    predicted,
    ratio: predicted === null ? null : spread / predicted,
    exactMean: moments === 'infinite-mean' ? null : distMean(d),
  };
}

/** The histogram window for replicate means: the middle 99% of them, so one wild mean can't flatten the picture. */
export function meansDomain(means: readonly number[]): [number, number] {
  const sorted = [...means].sort((a, b) => a - b);
  const lo = quantile(sorted, 0.005);
  const hi = quantile(sorted, 0.995);
  return hi > lo ? [lo, hi] : [lo - 1, lo + 1];
}

/* ---------- scene 4: which one is mine? ---------- */

export const MYSTERY_DISTS: Record<Family, Dist> = {
  normal: { family: 'normal', mu: 60, sigma: 12 },
  exponential: { family: 'exponential', mean: 40 },
  lognormal: { family: 'lognormal', mu: 3.4, sigma: 0.9 },
  pareto: { family: 'pareto', xm: 10, alpha: 1.6 },
};

export const MYSTERY_LABELS = ['A', 'B', 'C'] as const;
export type MysteryLabel = (typeof MYSTERY_LABELS)[number];

export interface Mystery {
  label: MysteryLabel;
  truth: Family;
  sorted: number[];
}

/** Three datasets from three different families, which three and in what order decided by the seed. */
export function mysteryDatasets(seed: number): Mystery[] {
  const order = shuffle(FAMILIES, mulberry32(seed)).slice(0, MYSTERY_LABELS.length);
  return order.map((truth, i) => ({
    label: MYSTERY_LABELS[i],
    truth,
    sorted: drawSample(MYSTERY_DISTS[truth], seed * MYSTERY_LABELS.length + i + 1, MYSTERY_N).sort((a, b) => a - b),
  }));
}

/** Complementary CDF vertices [x, P(X > x)], dropping the last point (P = 0 has no place on a log axis). */
export function ccdf(sorted: readonly number[]): [number, number][] {
  const n = sorted.length;
  const out: [number, number][] = [];
  sorted.forEach((x, i) => {
    const survive = (n - 1 - i) / n;
    if (survive <= 0) return;
    if (out.length && out[out.length - 1][0] === x) out[out.length - 1][1] = survive;
    else out.push([x, survive]);
  });
  return out;
}

/** Ranks (from the top) sampled log-evenly inside the upper 10%: the part of the tail every fit below uses. */
const TAIL_POINTS = 60;
const TAIL_SHARE = 0.1;
const TAIL_MIN_RANK = 5;

function tailPoints(sorted: readonly number[]): { x: number; survive: number }[] {
  const n = sorted.length;
  const lo = Math.max(TAIL_MIN_RANK, 1);
  const hi = Math.floor(n * TAIL_SHARE);
  const seen = new Set<number>();
  const out: { x: number; survive: number }[] = [];
  for (let i = 0; i < TAIL_POINTS; i++) {
    const rank = Math.round(lo * (hi / lo) ** (i / (TAIL_POINTS - 1)));
    if (seen.has(rank)) continue;
    seen.add(rank);
    out.push({ x: sorted[n - rank], survive: rank / n });
  }
  return out;
}

function lineFit(xs: readonly number[], ys: readonly number[]): { slope: number; r2: number } {
  const fit = leastSquares(xs, ys, 1);
  if (!fit) return { slope: NaN, r2: NaN };
  const [intercept, slope] = fit.coeffs;
  const meanY = ys.reduce((s, y) => s + y, 0) / ys.length;
  const ssRes = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i])) ** 2, 0);
  const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
  return { slope, r2: 1 - ssRes / ssTot };
}

/** The slope of ln P(X > x) against ln x over the upper tail: −α for a Pareto. */
export function tailSlope(sorted: readonly number[]): number {
  const pts = tailPoints(sorted);
  return lineFit(pts.map((p) => Math.log(p.x)), pts.map((p) => Math.log(p.survive))).slope;
}

export interface MysteryHints {
  meanOverMedian: number;
  /** Skewness of ln x: near 0 when the values are log-normal. */
  logSkew: number;
  /** How straight the upper tail is on log-log axes (a Pareto's signature), R². */
  r2LogLog: number;
  /** How straight it is with only the survival axis logged (an exponential's signature), R². */
  r2LogY: number;
}

/* ---------- each scene's default state, named so a test can pin the real first screen ---------- */

export const SHAPE_DEFAULT = { family: 'lognormal' as Family, mode: 'linear' as BinMode, seed: 1 };
export const POISSON_DEFAULT = { rate: 4, window: 1, bursty: false, seed: 1 };
export const MEAN_DEFAULT = { family: 'exponential' as Family, n: 10, alpha: 1.5, seed: 1 };
export const MYSTERY_DEFAULT = { seed: 3 };

export function mysteryHints(sorted: readonly number[]): MysteryHints {
  const n = sorted.length;
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  const logs = sorted.map((x) => Math.log(x));
  const lm = logs.reduce((s, x) => s + x, 0) / n;
  const lsd = Math.sqrt(logs.reduce((s, x) => s + (x - lm) ** 2, 0) / n);
  const pts = tailPoints(sorted);
  const lnS = pts.map((p) => Math.log(p.survive));
  return {
    meanOverMedian: mean / quantile(sorted, 0.5),
    logSkew: logs.reduce((s, x) => s + ((x - lm) / lsd) ** 3, 0) / n,
    r2LogLog: lineFit(pts.map((p) => Math.log(p.x)), lnS).r2,
    r2LogY: lineFit(pts.map((p) => p.x), lnS).r2,
  };
}
