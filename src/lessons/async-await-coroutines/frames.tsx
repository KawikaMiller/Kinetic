import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { DURATION, MACHINE, REQS, predict, shapeRun, type Combinator, type MachineStep, type Pitfall, type ReqId, type ReqSetting, type Settled, type Shape } from './model';

const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

export interface ShapeFrame extends Frame {
  now: number;
}

/** One frame per moment a request starts or ends, captioned from the run. */
export function shapeFrames(shape: Shape): ShapeFrame[] {
  const run = shapeRun(shape);
  const times = [...new Set([0, ...run.requests.flatMap((r) => [r.start, r.end])])].sort((a, b) => a - b);
  const frames: ShapeFrame[] = times.map((t) => {
    const started = run.requests.filter((r) => r.start === t).map((r) => `${r.id}()`);
    const ended = run.requests.filter((r) => r.end === t).map((r) => `${r.id}()`);
    const wait = run.waits.find((w) => w.start <= t && t < w.end);
    const parts: string[] = [];
    if (ended.length) parts.push(`${list(ended)} ${ended.length > 1 ? 'finish' : 'finishes'}`);
    if (started.length) parts.push(`${list(started)} ${started.length > 1 ? 'start' : 'starts'}`);
    if (wait) parts.push(`load() is suspended at ${wait.on === 'Promise.all' ? 'await Promise.all' : `await ${wait.on}`}, so the thread is free for other work`);
    return { now: t, say: <>At {t} ms: {parts.join('; ')}.</>, hold: 1.3 };
  });
  const sum = REQS.map((id) => DURATION[id]);
  frames.push({
    now: run.total,
    hold: 2.5,
    say:
      shape === 'sequential' ? (
        <>load() returns at {run.total} ms: each await waited for one request before the next one even started, so the times add up ({sum.join(' + ')} = {run.total}).</>
      ) : (
        <>load() returns at {run.total} ms: all three ran at the same time, so it takes as long as the slowest one, max({sum.join(', ')}) = {run.total}.{shape === 'startFirst' && ' Awaiting them one by one is fine once they have all started.'}</>
      ),
  });
  return frames;
}

/* ---------- combinators ---------- */

/** A rejection reason as code: Error("b failed"), or the AggregateError's list. */
export const reasonText = (reason: string) => (reason.startsWith('AggregateError: ') ? `AggregateError [${reason.slice('AggregateError: '.length)}]` : `Error("${reason}")`);
export const fmtSettled = (s: Settled) => (s.status === 'fulfilled' ? `fulfils at ${s.at} ms with ${s.value}` : `rejects at ${s.at} ms with ${reasonText(s.reason)}`);

export function combinatorCaption(c: Combinator, s: Record<ReqId, ReqSetting>): ReactNode {
  const r = predict(c, s);
  const stillRunning = REQS.filter((id) => s[id].at > r.at);
  return (
    <>
      <code>Promise.{c}</code> {fmtSettled(r)}.
      {stillRunning.length > 0 && <> {list(stillRunning.map((id) => `${id}()`))} {stillRunning.length > 1 ? 'keep' : 'keeps'} running anyway: a combinator doesn&apos;t cancel anything.</>}
    </>
  );
}

/* ---------- the state machine ---------- */

export interface MachineFrame extends Frame {
  step: MachineStep;
  printed: string[];
}

export function machineFrames(): MachineFrame[] {
  const printed: string[] = [];
  return MACHINE.map((step) => {
    if (step.printed) printed.push(step.printed);
    return { step, printed: [...printed], say: step.say, hold: 1.4 };
  });
}

/* ---------- pitfalls ---------- */

export function pitfallCaption(p: Pitfall, fixed: boolean): ReactNode {
  if (fixed) return <>Fixed: the output is {p.fixedOut.map((l) => `"${l}"`).join(', then ')}.</>;
  switch (p.id) {
    case 'noAwait':
      return <>save() runs and rejects, but nobody awaits its promise: main prints &quot;done&quot; and the error escapes as an unhandled rejection.</>;
    case 'forEach':
      return <>forEach ignores the promises its callback returns, so &quot;all sent&quot; prints first and the sends finish later, in timer order.</>;
    case 'returnNoAwait':
      return <>return load() hands the promise back before it rejects, so the try/catch is already over: the error escapes as an unhandled rejection and &quot;main finished&quot; never prints.</>;
  }
}
