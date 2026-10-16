/**
 * The cost of a threshold on a stream with no drift at all: over many seeded clean streams, how often a
 * monitor alerts on a day when nothing changed. Measured, never assumed.
 */
import { gaussian } from '../../core/fixtures/datasets';
import { mulberry32 } from '../../core/random';
import { makeBaseline, readDay, ksCritical2, type MonitorReading } from './monitors';
import { BATCH, DAYS, MU, SPREAD, TRAIN_PER_CLASS, dayBatch } from './world';

export const CLEAN_STREAMS = 200;
export type Metric = 'ks' | 'psi';

export interface CleanReadings {
  streams: number;
  /** Every day's reading of every clean stream. */
  readings: MonitorReading[];
  baselineSize: number;
}

/** A baseline sample of the first feature of 2 x TRAIN_PER_CLASS training points of a stream. */
function baselineSample(seed: number): number[] {
  const rnd = mulberry32(seed * 31 + 7);
  return Array.from({ length: 2 * TRAIN_PER_CLASS }, () => (rnd() < 0.5 ? -MU : MU) + SPREAD * gaussian(rnd));
}

const cache = new Map<number, CleanReadings>();

/** The readings already computed for `streams` clean streams, or null: lets a scene skip its "computing" state on a revisit. */
export const peekCleanReadings = (streams = CLEAN_STREAMS): CleanReadings | null => cache.get(streams) ?? null;

/** Readings of `streams` clean streams (each with its own training sample and 40 days), no shift anywhere. */
export function cleanReadings(streams = CLEAN_STREAMS): CleanReadings {
  const hit = cache.get(streams);
  if (hit) return hit;
  const readings: MonitorReading[] = [];
  for (let s = 0; s < streams; s++) {
    const sample = baselineSample(s);
    const baseline = makeBaseline(sample);
    for (let day = 1; day <= DAYS; day++) {
      readings.push(readDay(baseline, dayBatch(1000 + s, day, null).map((e) => e.x[0])));
    }
  }
  const out = { streams, readings, baselineSize: 2 * TRAIN_PER_CLASS };
  cache.set(streams, out);
  return out;
}

/** Share of clean days on which the metric exceeds `threshold`. */
export const falseAlarmRate = (c: CleanReadings, metric: Metric, threshold: number): number =>
  c.readings.filter((r) => r[metric] > threshold).length / c.readings.length;

export interface StreamSpread {
  streams: number;
  /** Streams with no alerting day at all. */
  zero: number;
  median: number;
  max: number;
}

/** How the alerting days spread over streams: every stream shares one baseline, so the spread is far wider than the mean suggests. */
export function streamSpread(c: CleanReadings, metric: Metric, threshold: number): StreamSpread {
  const counts = Array.from({ length: c.streams }, (_, s) => c.readings.slice(s * DAYS, (s + 1) * DAYS).filter((r) => r[metric] > threshold).length);
  const sorted = [...counts].sort((a, b) => a - b);
  return { streams: c.streams, zero: counts.filter((n) => n === 0).length, median: sorted[Math.floor(c.streams / 2)], max: sorted[sorted.length - 1] };
}

export const THRESHOLDS: Record<Metric, { min: number; max: number; step: number; start: number }> = {
  ks: { min: 0.04, max: 0.2, step: 0.01, start: 0.08 },
  psi: { min: 0.02, max: 0.3, step: 0.01, start: 0.1 },
};

/** The KS threshold that a 5% two-sample test would use with these sample sizes. */
export const ksFivePercent = (baselineSize: number): number => ksCritical2(BATCH, baselineSize);
