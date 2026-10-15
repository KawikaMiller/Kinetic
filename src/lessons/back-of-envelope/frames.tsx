import type { ReactNode } from 'react';
import {
  LATENCY_TARGET_MS, NIC_GBIT, ROUND_SECONDS_PER_DAY, SECONDS_PER_DAY, SHORTCUT_ERROR, TIB_BINARY, TB_DECIMAL, bigText, orderError, withinTenfold,
  type Bandwidth, type PathResult, type Servers, type Storage, type Traffic,
} from './model';
import { pctText, sig } from '../../core/format';

const perSecond = (x: number) => `${bigText(x)} req/s`;

export function trafficCaption(t: Traffic, peakFactor: number, round: boolean): ReactNode {
  const exact = t.average.value * (t.secondsPerDay / SECONDS_PER_DAY);
  return (
    <>
      On average that is <span className="hl info">{perSecond(t.average.value)}</span>; at a peak factor of {peakFactor} it is{' '}
      <span className="hl">{perSecond(t.peak.value)}</span>, of which {perSecond(t.reads.value)} reads and {perSecond(t.writes.value)} writes.{' '}
      {round
        ? <>Dividing by the round {ROUND_SECONDS_PER_DAY.toLocaleString('en-US')} s/day gives a rate {pctText(1 - SECONDS_PER_DAY / ROUND_SECONDS_PER_DAY)} below the exact {perSecond(exact)}.</>
        : <>The round shortcut of {ROUND_SECONDS_PER_DAY.toLocaleString('en-US')} s/day would be {pctText(1 - SECONDS_PER_DAY / ROUND_SECONDS_PER_DAY)} low: the exact figure is {pctText(SHORTCUT_ERROR)} above it.</>}
    </>
  );
}

export function storageCaption(s: Storage, b: Bandwidth): ReactNode {
  return (
    <>
      Stored: <span className="hl">{bigText(s.total.value)} B</span> = {bigText(s.inUnit)} {s.unitName}. A TiB ({bigText(TIB_BINARY)} B) is {pctText(s.unitGap - 1)} bigger than a TB (
      {bigText(TB_DECIMAL)} B). Traffic: {bigText(b.bytesPerSecond.value / 1e6)} MB/s = {bigText(b.megabitsPerSecond)} Mbit/s, {pctText(b.nicShare)} of a {NIC_GBIT} Gbit/s link.
    </>
  );
}

export function serverCaption(s: Servers): ReactNode {
  return (
    <>
      One server does {bigText(s.perServerAtFull)} req/s flat out and {bigText(s.perServerAtTarget)} at the target utilisation, so the peak needs{' '}
      <span className="hl">{s.base}</span> servers{s.extra > 0 ? <>, plus <span className="hl violet">{s.extra}</span> for redundancy: {s.total}</> : ''}.
    </>
  );
}

export function ladderCaption(p: PathResult): ReactNode {
  return (
    <>
      The path adds up to <span className={`hl ${p.inBudget ? 'ok' : 'bad'}`}>{sig(p.totalMs)} ms</span>, {p.inBudget ? 'inside' : 'over'} the {LATENCY_TARGET_MS} ms budget
      {p.inBudget ? '' : ` by ${sig(p.totalMs - LATENCY_TARGET_MS)} ms`}. Each step is an order of magnitude, not a measurement.
    </>
  );
}

export function guessCaption(exponent: number | null, truth: number): ReactNode {
  if (exponent === null) return <>Pick a power of ten for the average requests per second before any answer is shown.</>;
  const err = orderError(exponent, truth);
  const ok = withinTenfold(exponent, truth);
  return (
    <>
      The answer is {bigText(truth)} req/s, about 10^{sig(Math.log10(truth), 3)}. Your guess of 10^{exponent} is{' '}
      <span className={`hl ${ok ? 'ok' : 'bad'}`}>{sig(Math.abs(err), 2)} orders of magnitude {err < 0 ? 'low' : 'high'}</span>: {ok ? 'within 10×' : 'more than 10× off'}.
    </>
  );
}
