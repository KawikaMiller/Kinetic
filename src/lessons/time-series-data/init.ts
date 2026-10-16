/** time-series-data: each scene's opening state as a pure function, so a test can switch through all five scenes and pin it. */
import type { Aggregate, TimestampPattern, ValuePattern } from './series';
import { DEFAULT_NOISE, DEFAULT_SEED, DEFAULT_SPIKE } from './series';
import { DEFAULT_LABELS, DEFAULT_POLICY, type Keeps, type Labels, type Policy } from './retention';

export const initialRawScene = (): { seed: number; noise: number; spike: number; from: number; to: number } => ({ seed: DEFAULT_SEED, noise: DEFAULT_NOISE, spike: DEFAULT_SPIKE, from: 0, to: 24 });
export type BucketChoice = 'minute' | 'hour';
export const initialRollupScene = (): { bucket: BucketChoice; aggregate: Aggregate; gap: boolean } => ({ bucket: 'hour', aggregate: 'avg', gap: false });
export const initialEncoderScene = (): { ts: TimestampPattern; vs: ValuePattern } => ({ ts: 'regular', vs: 'constant' });
export const initialRetentionScene = (): { policy: Policy; window: 'hour' | 'week' | 'year' } => ({ policy: { days: { ...DEFAULT_POLICY.days }, keeps: DEFAULT_POLICY.keeps as Keeps }, window: 'week' });
export const initialCardinalityScene = (): { labels: Labels; withUser: boolean } => ({ labels: { ...DEFAULT_LABELS }, withUser: false });
