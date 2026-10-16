/** time-series-data: the numbers the try-this entries and captions quote, each computed from the model at the scene's default. */
import { bytes } from '../../core/format';
import { encode, bitsPerPoint, encodedBytes, ratioAgainstRaw } from './gorilla';
import { DEFAULT_LABELS, DEFAULT_POLICY, USER_IDS, bytesPerDay, seriesCount, spikeAfter, storage } from './retention';
import {
  DEFAULT_NOISE, DEFAULT_SEED, DEFAULT_SPIKE, HOUR, MINUTE, POINTS_PER_DAY, SPIKE_START, STEP_SECONDS, SERIES_START, averageOfAverages, buildSeries, exactAverage, patternSeries, rollup,
  spikePeak, valueOf, withGap, type Aggregate,
} from './series';

export const defaultSeries = () => buildSeries({ seed: DEFAULT_SEED, noise: DEFAULT_NOISE, spike: DEFAULT_SPIKE });
export const RAW_STORAGE = (n: number): string => bytes(n * 16);

/** The spike's bucket under each aggregate, at one-hour buckets, and the raw peak. */
export function spikeFacts(bucketSeconds: number = HOUR) {
  const s = defaultSeries();
  const start = SERIES_START + SPIKE_START * STEP_SECONDS;
  const b = rollup(s, bucketSeconds).find((x) => x.start <= start && start < x.start + bucketSeconds)!;
  const peak = spikePeak(s);
  const shown = (a: Aggregate) => valueOf(b, a);
  return { peak, avg: shown('avg'), max: shown('max'), min: shown('min'), count: shown('count') };
}

/** The gap preset at one-minute buckets: the true average, the average of averages, and their difference. */
export function gapFacts() {
  const gapped = withGap(defaultSeries(), 60, 100);
  const minutes = rollup(gapped, MINUTE);
  const exact = exactAverage(minutes);
  const naive = averageOfAverages(minutes);
  return { exact, naive, diff: Math.abs(naive - exact), points: gapped.length };
}

export function encoderFacts() {
  const regular = encode(patternSeries('regular', 'constant'));
  const noisy = encode(patternSeries('regular', 'noisy'));
  const jitter = encode(patternSeries('jittery', 'constant'));
  return { regular: bitsPerPoint(regular), noisy: bitsPerPoint(noisy), jitter: bitsPerPoint(jitter), regularRatio: ratioAgainstRaw(regular), noisyRatio: ratioAgainstRaw(noisy), regularBytes: encodedBytes(regular), points: regular.perPoint.length };
}

export function retentionFacts() {
  const s = storage(DEFAULT_POLICY);
  const full = storage({ ...DEFAULT_POLICY, keeps: 'full' });
  return { total: s.total, fullTotal: full.total, spikeAvg: spikeAfter(DEFAULT_POLICY, 30), spikeFull: spikeAfter({ ...DEFAULT_POLICY, keeps: 'full' }, 30) };
}

export function cardinalityFacts() {
  const base = seriesCount(DEFAULT_LABELS, false);
  const withUser = seriesCount(DEFAULT_LABELS, true);
  return { base, withUser, baseDay: bytesPerDay(base), userDay: bytesPerDay(withUser), users: USER_IDS, perDay: POINTS_PER_DAY };
}
