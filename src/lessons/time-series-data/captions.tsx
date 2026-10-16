/** time-series-data: every caption, built from the model on screen. No number here is typed. */
import type { ReactNode } from 'react';
import { bytes, decimal, plural } from '../../core/format';
import { TIER_LABELS, type Policy, type SpikeView, type Tier } from './retention';
import { POINTS_PER_DAY, type Aggregate, type TimestampPattern, type ValuePattern } from './series';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const num = (n: number) => n.toLocaleString('en-US');

export function rawCaption(inView: number, total: number, storedBytes: number, peak: number): ReactNode {
  return (
    <>
      {hl('', num(inView))} of {num(total)} points in view, {bytes(storedBytes)} at 16 bytes a point. The line is drawn one value per pixel column, the largest under it, and the data keeps every point. The spike peaks at {hl('hi', decimal(peak, 2))}.
    </>
  );
}

export const AGG_NAMES: Record<Aggregate, string> = { avg: 'average', min: 'min', max: 'max', count: 'count' };

/** `typical` is the middle of the raw points in the spike's bucket: a shown value below the halfway mark to the peak has lost the spike. */
export function rollupCaption(bucket: string, aggregate: Aggregate, shown: number, peak: number, typical: number, naive: number, exact: number): ReactNode {
  const erased = aggregate !== 'count' && shown < (peak + typical) / 2;
  return (
    <>
      {bucket} buckets by {AGG_NAMES[aggregate]}: the bucket holding the spike shows {hl(aggregate === 'count' ? '' : erased ? 'bad' : 'ok', decimal(shown, 2))} against a raw peak of {decimal(peak, 2)}.
      {' '}The average of the buckets&rsquo; averages is {hl(Math.abs(naive - exact) > 1e-9 ? 'bad' : 'ok', decimal(naive, 3))} and the exact average from (sum, count) is {hl('ok', decimal(exact, 3))}.
    </>
  );
}

export function encoderCaption(ts: TimestampPattern, vs: ValuePattern, bitsEach: number, ratio: number, points: number, roundTrips: boolean): ReactNode {
  return (
    <>
      {ts} timestamps, {vs} values: {hl(bitsEach < 8 ? 'ok' : bitsEach > 40 ? 'bad' : '', `${decimal(bitsEach, 1)} bits a point`)} over {num(points)} points, {decimal(ratio, 1)} times smaller than 16 bytes a point. Decoding it gives the same series, bit for bit: {roundTrips ? hl('ok', 'yes') : hl('bad', 'no')}.
    </>
  );
}

export function retentionCaption(p: Policy, windowLabel: string, answers: Tier | null, total: number, spike: SpikeView): ReactNode {
  return (
    <>
      Keeping raw for {plural(p.days.raw, 'day')}, minute rollups for {p.days.minute} and hour rollups for {p.days.hour}: {hl('', bytes(total))} stored per series. {windowLabel} is answered from{' '}
      {answers === null ? hl('bad', 'no tier: it reaches back further than any is kept') : hl('', TIER_LABELS[answers])}. A one-minute spike from last month is{' '}
      {spike.tier === null ? hl('bad', 'gone') : spike.visible ? hl('ok', `still visible (${decimal(spike.shown!, 2)} at ${TIER_LABELS[spike.tier]})`) : hl('bad wrap', `erased (${decimal(spike.shown!, 2)} at ${TIER_LABELS[spike.tier]})`)}.
    </>
  );
}

export function cardinalityCaption(series: number, withUser: boolean, perDay: number): ReactNode {
  return (
    <>
      {hl('', num(series))} series{withUser ? ', after a user id label multiplied the count' : ''}: {bytes(perDay)} of raw points a day, one series being {num(POINTS_PER_DAY)} points. Each label multiplies the count of series by the number of values it takes.
    </>
  );
}
