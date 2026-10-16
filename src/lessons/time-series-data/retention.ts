/**
 * time-series-data: retention tiers and series cardinality. Storage is always points x bytes per point, tier by tier, with the layouts
 * stated on screen: a raw point is a timestamp and a value (16 B); a rollup bucket is a timestamp and an average (16 B), or a timestamp with
 * sum, count, min and max (40 B) when the tier keeps them.
 */
import { HOUR, MINUTE, POINTS_PER_DAY, STEP_SECONDS, BASELINE, DEFAULT_SPIKE, rollup, type Aggregate } from './series';

export const MINUTE_BUCKETS_PER_DAY = 1_440;
export const HOUR_BUCKETS_PER_DAY = 24;
export const RAW_BYTES = 16;
export const BUCKET_BYTES: Record<Keeps, number> = { average: 16, full: 40 };
export type Keeps = 'average' | 'full';
export type Tier = 'raw' | 'minute' | 'hour';
export const TIERS: Tier[] = ['raw', 'minute', 'hour'];
export const TIER_LABELS: Record<Tier, string> = { raw: 'raw (10 s)', minute: '1-minute rollups', hour: '1-hour rollups' };

export interface Policy {
  /** Days each tier is kept. */
  days: Record<Tier, number>;
  keeps: Keeps;
}
export const DEFAULT_POLICY: Policy = { days: { raw: 2, minute: 14, hour: 365 }, keeps: 'average' };
export const DAY_LIMITS: Record<Tier, [number, number]> = { raw: [1, 30], minute: [1, 90], hour: [1, 730] };
export const NOW_DAY = 800;
export const SPIKE_AGE_DAYS = 30;

const perDay = (t: Tier) => (t === 'raw' ? POINTS_PER_DAY : t === 'minute' ? MINUTE_BUCKETS_PER_DAY : HOUR_BUCKETS_PER_DAY);
const bytesPer = (t: Tier, keeps: Keeps) => (t === 'raw' ? RAW_BYTES : BUCKET_BYTES[keeps]);

export function storage(p: Policy): Record<Tier | 'total', number> {
  const part = (t: Tier) => p.days[t] * perDay(t) * bytesPer(t, p.keeps);
  const out = { raw: part('raw'), minute: part('minute'), hour: part('hour'), total: 0 };
  out.total = out.raw + out.minute + out.hour;
  return out;
}

export const WINDOWS: { id: 'hour' | 'week' | 'year'; label: string; days: number }[] = [
  { id: 'hour', label: 'Last hour', days: 1 / 24 },
  { id: 'week', label: 'Last week', days: 7 },
  { id: 'year', label: 'Last year', days: 365 },
];

/** The finest tier whose retention covers `days` back from now, or null when no tier reaches that far. */
export function tierCovering(p: Policy, days: number): Tier | null {
  return TIERS.find((t) => p.days[t] >= days) ?? null;
}

/** The value a query sees for a one-minute spike after it has been stored at a tier, under an aggregate. */
export function spikeShown(tier: Tier, aggregate: Aggregate): number {
  const points = Array.from({ length: HOUR / STEP_SECONDS }, (_, i) => ({ t: i * STEP_SECONDS, v: i < MINUTE / STEP_SECONDS ? BASELINE + DEFAULT_SPIKE : BASELINE }));
  if (tier === 'raw') return BASELINE + DEFAULT_SPIKE;
  const seconds = tier === 'minute' ? MINUTE : HOUR;
  const b = rollup(points, seconds)[0];
  return aggregate === 'avg' ? b.sum / b.count : aggregate === 'max' ? b.max : aggregate === 'min' ? b.min : b.count;
}

/** The spike counts as visible when what the query sees is at least halfway from the baseline to its peak. */
export const spikeVisible = (shown: number): boolean => shown >= BASELINE + DEFAULT_SPIKE / 2;

export interface SpikeView {
  tier: Tier | null;
  shown: number | null;
  visible: boolean;
}

/** What a spike `ageDays` old looks like under a policy: held by the finest tier that still has it, seen through the aggregate that tier keeps. */
export function spikeAfter(p: Policy, ageDays: number): SpikeView {
  const tier = tierCovering(p, ageDays);
  if (tier === null) return { tier, shown: null, visible: false };
  const shown = spikeShown(tier, p.keeps === 'full' ? 'max' : 'avg');
  return { tier, shown, visible: spikeVisible(shown) };
}

export interface Labels {
  service: number;
  endpoint: number;
  status: number;
  host: number;
}
export const DEFAULT_LABELS: Labels = { service: 8, endpoint: 25, status: 5, host: 40 };
export const LABEL_MAX: Labels = { service: 50, endpoint: 100, status: 10, host: 200 };
export const USER_IDS = 10_000;

/** Series count: one series per combination of label values. */
export function seriesCount(l: Labels, withUser: boolean): number {
  return l.service * l.endpoint * l.status * l.host * (withUser ? USER_IDS : 1);
}
export const bytesPerDay = (series: number): number => series * POINTS_PER_DAY * RAW_BYTES;
