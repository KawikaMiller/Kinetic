/** time-series-data: the seeded series every scene draws, its rollups, and the patterns the encoder is shown. Nothing reads the clock. */
import { normal } from '../../core/distributions';
import { mulberry32, type Rnd } from '../../core/random';
import type { Point } from './gorilla';

export const STEP_SECONDS = 10;
export const DAY_SECONDS = 86_400;
export const POINTS_PER_DAY = DAY_SECONDS / STEP_SECONDS;
/** Seconds since the epoch of the series' first point (2026-01-01 00:00 UTC): a fixed number, not today's date. */
export const SERIES_START = 1_767_225_600;
export const SPIKE_START = 5_000;
export const SPIKE_POINTS = 12;
export const BASELINE = 5;
export const WAVE = 3;
export const DEFAULT_SEED = 7;
export const DEFAULT_NOISE = 0.3;
export const DEFAULT_SPIKE = 4.5;
export const NOISE_MAX = 2;
export const SPIKE_MAX = 10;

export interface SeriesOptions {
  seed: number;
  noise: number;
  spike: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 24 hours at 10 s: a daily wave, seeded noise and one two-minute spike. */
export function buildSeries(o: SeriesOptions): Point[] {
  const rnd: Rnd = mulberry32(o.seed);
  return Array.from({ length: POINTS_PER_DAY }, (_, i) => {
    const wave = BASELINE + WAVE * Math.sin((2 * Math.PI * i) / POINTS_PER_DAY);
    const spike = i >= SPIKE_START && i < SPIKE_START + SPIKE_POINTS ? o.spike : 0;
    return { t: SERIES_START + i * STEP_SECONDS, v: round2(wave + normal(rnd) * o.noise + spike) };
  });
}

export const spikeRange = (): [number, number] => [SERIES_START + SPIKE_START * STEP_SECONDS, SERIES_START + (SPIKE_START + SPIKE_POINTS) * STEP_SECONDS];

export interface Bucket {
  /** The bucket's start, in seconds. */
  start: number;
  sum: number;
  count: number;
  min: number;
  max: number;
}

/** Group points by `floor(t / seconds)` into (sum, count, min, max). Buckets with no points do not exist. */
export function rollup(points: readonly Point[], seconds: number): Bucket[] {
  const map = new Map<number, Bucket>();
  for (const p of points) {
    const key = Math.floor(p.t / seconds);
    const b = map.get(key);
    if (b) {
      b.sum += p.v;
      b.count++;
      b.min = Math.min(b.min, p.v);
      b.max = Math.max(b.max, p.v);
    } else map.set(key, { start: key * seconds, sum: p.v, count: 1, min: p.v, max: p.v });
  }
  return [...map.values()].sort((a, b) => a.start - b.start);
}

/** Roll buckets up again: add the sums and counts, take the min of mins and the max of maxes. */
export function rollupBuckets(buckets: readonly Bucket[], seconds: number): Bucket[] {
  const map = new Map<number, Bucket>();
  for (const b of buckets) {
    const key = Math.floor(b.start / seconds);
    const g = map.get(key);
    if (g) {
      g.sum += b.sum;
      g.count += b.count;
      g.min = Math.min(g.min, b.min);
      g.max = Math.max(g.max, b.max);
    } else map.set(key, { start: key * seconds, sum: b.sum, count: b.count, min: b.min, max: b.max });
  }
  return [...map.values()].sort((a, b) => a.start - b.start);
}

export type Aggregate = 'avg' | 'min' | 'max' | 'count';
export const AGGREGATES: { value: Aggregate; label: string }[] = [
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
];
export const valueOf = (b: Bucket, a: Aggregate): number => (a === 'avg' ? b.sum / b.count : a === 'min' ? b.min : a === 'max' ? b.max : b.count);

/** The average of the buckets' averages: wrong when their counts differ. */
export const averageOfAverages = (buckets: readonly Bucket[]): number => buckets.reduce((s, b) => s + b.sum / b.count, 0) / buckets.length;
/** The exact average from (sum, count) pairs. */
export const exactAverage = (buckets: readonly Bucket[]): number => buckets.reduce((s, b) => s + b.sum, 0) / buckets.reduce((n, b) => n + b.count, 0);

/** The highest value among the points of the spike itself (not the day's highest, which can be the wave or noise elsewhere). */
export function spikePeak(points: readonly Point[]): number {
  const [lo, hi] = spikeRange();
  return Math.max(...points.filter((p) => p.t >= lo && p.t < hi).map((p) => p.v));
}

export const MINUTE = 60;
export const HOUR = 3_600;

/** The series with a stretch of points missing: `fromMinute` to `toMinute` of the day, except every `keepEvery`-th point. */
export const GAP_KEEP_EVERY = 6;
export function withGap(points: readonly Point[], fromMinute: number, toMinute: number, keepEvery = GAP_KEEP_EVERY): Point[] {
  const lo = SERIES_START + fromMinute * MINUTE;
  const hi = SERIES_START + toMinute * MINUTE;
  return points.filter((p, i) => p.t < lo || p.t >= hi || i % keepEvery === 0);
}

/** One point per pixel column, each the largest value under it, so a spike is not lost by drawing (the data keeps every point). */
export function decimate(points: readonly Point[], columns: number): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const size = Math.max(1, Math.ceil(points.length / columns));
  const out: { x: number; y: number }[] = [];
  for (let from = 0; from < points.length; from += size) {
    const chunk = points.slice(from, from + size);
    out.push({ x: chunk[0].t, y: Math.max(...chunk.map((p) => p.v)) });
  }
  return out;
}

export type TimestampPattern = 'regular' | 'jittery' | 'gap';
export type ValuePattern = 'constant' | 'drifting' | 'noisy';
export const PATTERN_POINTS = 360;
export const GAP_AT = 200;
export const GAP_SECONDS = 4_000;

/** An encoder demo series: the timestamp and value patterns the learner picks, seeded. */
export function patternSeries(ts: TimestampPattern, vs: ValuePattern, seed = DEFAULT_SEED, n = PATTERN_POINTS): Point[] {
  const rnd = mulberry32(seed);
  let t = SERIES_START;
  let drift = 20;
  return Array.from({ length: n }, (_, i) => {
    if (i > 0) t += STEP_SECONDS + (ts === 'jittery' ? Math.floor(rnd() * 5) - 2 : 0) + (ts === 'gap' && i === GAP_AT ? GAP_SECONDS : 0);
    drift += (rnd() - 0.5) * 0.02;
    const v = vs === 'constant' ? 20 : vs === 'drifting' ? Math.round(drift * 100) / 100 : 20 + rnd() * 5;
    return { t, v };
  });
}
