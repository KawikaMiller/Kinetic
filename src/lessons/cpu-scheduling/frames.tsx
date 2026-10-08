import { Fragment, type ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { MLFQ_QUANTA, metricsOf, policyLabel, STARVE_TICKS, type Job, type Moment, type Policy, type Schedule, type ScheduleOpts, type SchedEvent } from './model';

export interface SchedFrame extends Frame {
  /** Index into schedule.moments. */
  at: number;
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

function eventText(e: SchedEvent, jobs: readonly Job[], policy: Policy, opts: ScheduleOpts, m: Moment): ReactNode {
  const n = (j: number) => <b>{jobs[j].name}</b>;
  const left = (j: number) => m.bursts[j];
  switch (e.kind) {
    case 'arrive':
      return <>{n(e.job)} arrives and joins the ready queue.</>;
    case 'wake':
      return <>{n(e.job)}'s I/O is done, so it's ready again.</>;
    case 'boost':
      return <>Boost (every {opts.boostEvery} ticks): every job goes back to the top queue, Q0.</>;
    case 'finish':
      return <>{n(e.job)} finishes.</>;
    case 'block':
      return <>{n(e.job)} starts I/O and blocks until t = {e.until}; blocking is normal, it gives the CPU away.</>;
    case 'renew':
      return <>{n(e.job)}'s quantum is up, but nobody else is ready, so it keeps the CPU for another one.</>;
    case 'demote':
      return <>{n(e.job)} used its whole quantum, so it drops to Q{e.level}.</>;
    case 'preempt':
      if (e.reason === 'shorter') {
        return <>{n(e.by!)} needs only {left(e.by!)} ticks, fewer than {n(e.job)}'s {left(e.job)}, so SRTF preempts {n(e.job)}.</>;
      }
      if (e.reason === 'higher') return <>A higher queue has work, so {n(e.job)} (in Q{m.levels[e.job]}) is preempted.</>;
      return policy === 'mlfq'
        ? <>{n(e.job)} goes to the back of Q{m.levels[e.job]}.</>
        : <>{n(e.job)} used its quantum (q = {opts.quantum}) and goes to the back of the queue.</>;
    case 'dispatch': {
      const why =
        policy === 'sjf' || policy === 'srtf'
          ? <> (shortest next burst: {left(e.job)})</>
          : policy === 'mlfq'
            ? <> (front of Q{m.levels[e.job]}, quantum {MLFQ_QUANTA[m.levels[e.job]]})</>
            : null;
      return (
        <>
          {n(e.job)} gets the CPU{why}.{e.cost > 0 && <> Switching to it costs {plural(e.cost, 'tick')} first.</>}
        </>
      );
    }
  }
}

function momentCaption(jobs: readonly Job[], s: Schedule, at: number, policy: Policy, opts: ScheduleOpts): ReactNode {
  const m = s.moments[at];
  const parts = m.events.map((e, i) => <span key={i}>{eventText(e, jobs, policy, opts, m)} </span>);
  if (!m.events.some((e) => e.kind === 'dispatch') && m.cpu) {
    if (m.cpu.kind === 'run') {
      const prev = s.moments[at - 1]?.cpu;
      const name = <b>{jobs[m.cpu.job].name}</b>;
      const left = plural(m.remaining[m.cpu.job], 'tick');
      parts.push(
        prev?.kind === 'switch' && prev.job === m.cpu.job
          ? <span key="cont">The switch is done: {name} runs now ({left} of work left). </span>
          : <span key="cont">{name} keeps running ({left} of work left). </span>,
      );
    } else if (m.cpu.kind === 'switch') {
      parts.push(<span key="sw">Still switching to <b>{jobs[m.cpu.job].name}</b>: the CPU does no useful work. </span>);
    } else {
      parts.push(<span key="idle">Nothing is ready, so the CPU idles. </span>);
    }
  }
  const starving = jobs.map((_, j) => j).filter((j) => m.streak[j] >= STARVE_TICKS);
  starving.forEach((j, k) => {
    // A space between two starving notes, outside the highlight (the other parts end with their own).
    parts.push(
      <Fragment key={`st-${j}`}>
        {k > 0 && ' '}
        <span className="hl bad">
          {jobs[j].name} has waited {m.streak[j]} ticks in a row: it's starving.
        </span>
      </Fragment>,
    );
  });
  return (
    <>
      <b>t = {m.t}:</b> {parts}
    </>
  );
}

export function scheduleFrames(jobs: readonly Job[], s: Schedule, policy: Policy, opts: ScheduleOpts): SchedFrame[] {
  const rec = createRecorder<SchedFrame>({ at: 0 });
  s.moments.forEach((m, i) => {
    if (m.cpu === null) {
      rec.snap(
        <>
          <b>t = {m.t}:</b> {m.events.map((e, k) => <span key={k}>{eventText(e, jobs, policy, opts, m)} </span>)} Every job is done.
        </>,
        undefined,
        { at: i },
      );
    } else {
      rec.snap(momentCaption(jobs, s, i, policy, opts), undefined, { at: i });
    }
  });
  const x = metricsOf(s);
  rec.close(
    <>
      {policyLabel(policy)} finished {plural(jobs.length, 'job')} at t = {s.end}: average waiting <b>{fmt(x.waiting)}</b>, average turnaround <b>{fmt(x.turnaround)}</b>, average response{' '}
      <b>{fmt(x.response)}</b> ticks.
      {s.switchTicks > 0 && <> {plural(s.switchTicks, 'tick')} of {s.end} went on switching.</>} Try another policy on the same jobs, or "Compare all".
    </>,
    2,
  );
  return rec.frames;
}
