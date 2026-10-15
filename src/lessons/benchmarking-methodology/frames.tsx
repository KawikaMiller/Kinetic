import type { ReactNode } from 'react';
import { timeFrames, type TimedFrame } from '../../core/frames';
import {
  GENERATOR_NAME, LOOP_OVERHEAD_US, SERVER_MS, SLO_P99_MS, STEADY_WINDOW, WINDOW_NAME, exactWindowMean, hidesStall, timelineRange,
  type GeneratorParams, type GeneratorReading, type NoiseReading, type NoiseSettings, type WarmupReading, type WindowMode,
} from './model';
import { pctText, sig } from '../../core/format';

export const us = (x: number): string => `${sig(x)} µs`;
export const msText = (x: number): string => `${sig(x)} ms`;

const windowText = (mode: WindowMode, w: readonly [number, number]): string =>
  mode === 'first100' ? WINDOW_NAME[mode] : `iterations ${w[0].toLocaleString('en-US')} to ${(w[1] - 1).toLocaleString('en-US')}`;

export function warmupCaption(r: WarmupReading, mode: WindowMode, useResult: boolean): ReactNode {
  if (!useResult) {
    return (
      <>
        Nothing reads the result, so the model&apos;s optimiser removes the work: both read about <span className="hl bad">{us(LOOP_OVERHEAD_US)}</span>, the empty loop, and the verdict
        is gone. Real compilers can do this to pure code, which is why benchmark harnesses keep results alive.
      </>
    );
  }
  const steadyA = exactWindowMean('A', STEADY_WINDOW);
  const steadyB = exactWindowMean('B', STEADY_WINDOW);
  const other = r.faster === 'A' ? 'B' : 'A';
  return (
    <>
      Averaged over {windowText(mode, r.window)}, A takes <b>{us(r.meanA)}</b> and B <b>{us(r.meanB)}</b>, so{' '}
      <span className="hl">{r.faster} looks {sig(r.ratio, 3)}× faster than {other}</span>. In steady state A takes {us(steadyA)} and B {us(steadyB)}, so{' '}
      {steadyA < steadyB ? 'A' : 'B'} is the faster one: the window decides the conclusion.
    </>
  );
}

export function noiseCaption(r: NoiseReading, s: NoiseSettings): ReactNode {
  const d = r.difference;
  const verdict =
    r.verdict === 'distinguishable'
      ? <><span className="hl ok">distinguishable</span>: {r.faster} is faster, since the interval for B − A ({sig(d.lo, 2)} to {sig(d.hi, 2)} µs) excludes 0</>
      : <><span className="hl">cannot tell</span>: the interval for B − A ({sig(d.lo, 2)} to {sig(d.hi, 2)} µs) includes 0</>;
  return (
    <>
      {s.runs} runs each. A&apos;s median is {us(r.A.median)} (95% interval {sig(r.A.interval.lo)} to {sig(r.A.interval.hi)}), B&apos;s {us(r.B.median)} ({sig(r.B.interval.lo)} to {sig(r.B.interval.hi)}). {verdict}.
      {r.bimodal && <> The runs fall in two humps, so the mean ({us(r.A.mean)}) sits where few runs lie: the histogram is the honest view, not a mean and an interval.</>}
    </>
  );
}

const sec = (ms: number): string => `${sig(ms / 1000)} s`;

export function generatorIntro(kind: GeneratorReading['kind'], p: GeneratorParams): ReactNode {
  return (
    <>
      A {GENERATOR_NAME[kind]} generator aims for a request every {msText(1000 / p.rate)} against a server that replies in {SERVER_MS} ms, except that{' '}
      {p.stallMs > SERVER_MS ? <>one request stalls for {msText(p.stallMs)}</> : <>there is no stall this time</>}. Press play.
    </>
  );
}

export function generatorSummary(r: GeneratorReading): ReactNode {
  const lies = hidesStall(r);
  return (
    <>
      The {GENERATOR_NAME[r.kind]} tool reports a p99 of <span className={`hl ${lies ? 'bad' : r.kind === 'corrected' ? 'ok' : 'info'}`}>{msText(r.reportedP99)}</span>. Measured from when each request was due, users saw a p99 of{' '}
      <span className="hl ok">{msText(r.trueP99)}</span>, with {pctText(r.overSlo, 0)} of requests over {SLO_P99_MS} ms.
      {r.kind === 'corrected' && <> The correction added {(r.recorded.length - r.schedule.intended.length).toLocaleString('en-US')} synthetic samples.</>}
    </>
  );
}

export interface GeneratorFrame extends TimedFrame {
  now: number;
}

/** Where the timeline starts, ms: a little before the first request drawn. */
export function timelineStart(r: GeneratorReading): number {
  const [first] = timelineRange(r.schedule);
  return r.schedule.intended[first];
}

export function timelineEnd(r: GeneratorReading): number {
  const [first, last] = timelineRange(r.schedule);
  let end = 0;
  for (let k = first; k <= last; k++) end = Math.max(end, r.schedule.done[k]);
  return Math.ceil((end - timelineStart(r)) / 10) * 10 + 10;
}

const FRAME_STEPS = 24;

/** The walk-through of the requests around the stall, in times relative to the start of the timeline. */
export function generatorFrames(r: GeneratorReading, p: GeneratorParams): GeneratorFrame[] {
  const s = r.schedule;
  const t0 = timelineStart(r);
  const rel = (t: number) => t - t0;
  const milestones: { t: number; say: ReactNode }[] = [];
  const k = s.stalled;
  if (k !== null && k + 1 < s.intended.length) {
    milestones.push({
      t: rel(s.intended[k]),
      say: <>Request {k} is due at {sec(s.intended[k])} and goes out on schedule. The server will take {msText(p.stallMs)} to reply to it.</>,
    });
    milestones.push({
      t: rel(s.intended[k + 1]),
      say: r.kind === 'open'
        ? <>Request {k + 1} is due now, and the open-loop generator sends it on schedule: it queues behind the stalled one.</>
        : <>Request {k + 1} is due now, but the closed-loop generator is still waiting for request {k}&apos;s reply, so it does not send it. Nothing is recorded for the wait.</>,
    });
    milestones.push({
      t: rel(s.done[k]),
      say: r.kind === 'open'
        ? <>Request {k} replies at {sec(s.done[k])}. Every request sent during the stall now waits its turn behind it, and each is measured from its own send time.</>
        : <>Request {k} replies at {sec(s.done[k])}, and the tool records {msText(s.done[k] - s.sent[k])} for it. Request {k + 1}, due {msText(s.sent[k + 1] - s.intended[k + 1])} ago, goes out now, and is recorded as {msText(s.done[k + 1] - s.sent[k + 1])}.</>,
    });
  }
  return timeFrames({ end: timelineEnd(r), steps: FRAME_STEPS, milestones, intro: generatorIntro(r.kind, p), summary: generatorSummary(r), hold: 2.5 });
}
