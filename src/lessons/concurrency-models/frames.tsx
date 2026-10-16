import type { ReactNode } from 'react';
import { ms, plural } from '../../core/format';
import { timeFrames, type TimedFrame } from '../../core/frames';
import { CPU_MS, FAULT_REQUEST, HOG_MS, IO_MS, QUANTUM_MS, outcomeOf, type Params, type Run } from './model';

/** The rule behind the context-switch number, shown beside it (a toy count, not an OS measurement). */
export function switchRule(p: Params): string {
  if (p.runtime === 'threads') return `one per block and per wake of a thread, one per ${QUANTUM_MS} ms slice handed on`;
  if (p.runtime === 'csp') return 'one per block and per wake of a worker; none for a slice';
  if (p.runtime === 'events') return 'none: a callback is a plain call on the one running thread';
  return 'none: a message handler is a plain call on a scheduler thread';
}

const faultClause = (p: Params): ReactNode => {
  if (p.fault === 'hog') return <> Request {FAULT_REQUEST} will spend {HOG_MS} ms of CPU inside its handler.</>;
  if (p.fault === 'crash') return <> Request {FAULT_REQUEST} will crash after its first step{p.net ? ', with the safety net on' : ', with no safety net'}.</>;
  return null;
};

export function runIntro(run: Run): ReactNode {
  const p = run.params;
  const R = p.requests;
  const work = (
    <>
      {plural(R, 'request')}, each needing {CPU_MS} ms of CPU, then a {IO_MS} ms I/O wait, then {CPU_MS} ms of CPU.
    </>
  );
  if (p.runtime === 'threads') {
    return (
      <>
        {work} A pool of {plural(run.osThreads, 'OS thread')} shares {plural(p.cores, 'core')}: a thread waits out its I/O and a core runs another thread meanwhile.{faultClause(p)}
      </>
    );
  }
  if (p.runtime === 'events') {
    return (
      <>
        {work} One thread runs every callback in turn; an I/O wait is a callback scheduled for later, not a thread, so only one of the {plural(p.cores, 'core')} is ever busy.{faultClause(p)}
      </>
    );
  }
  if (p.runtime === 'actors') {
    return (
      <>
        {work} {plural(run.peakConcurrent, 'actor')} each hold a mailbox and handle one message at a time; request n goes to actor n mod {run.peakConcurrent}, and an I/O reply is another message to the same actor.
        {faultClause(p)}
      </>
    );
  }
  return (
    <>
      {work} {plural(Math.min(p.workers, R), 'worker')} pull requests from a channel with a buffer of {p.buffer}
      {p.buffer === 0 ? ': a rendezvous, so the sender waits until a worker is free' : `: the sender waits when ${p.buffer} requests are already waiting`}.{faultClause(p)}
    </>
  );
}

const firstTime = (run: Run, pick: (s: Run['segs'][number]) => boolean): number | null => {
  const times = run.segs.filter(pick).map((s) => s.start);
  return times.length ? Math.min(...times) : null;
};

export function runSummary(run: Run, baseline: Run): ReactNode {
  const p = run.params;
  const fastest = run.bystanderFinish === null ? null : (
    <>
      The fastest request besides number {FAULT_REQUEST} finished at <span className="hl info">{ms(run.bystanderFinish)}</span>
      {baseline.bystanderFinish === null || p.fault === 'none' ? '' : `, against ${ms(baseline.bystanderFinish)} with no fault`}.
    </>
  );
  return (
    <>
      <span className={`hl ${run.failed > 0 ? 'bad' : 'ok'}`}>{run.finished} of {plural(p.requests, 'request')} finished</span> by {ms(run.makespan)}
      {run.failed > 0 ? `, and ${run.failed} failed` : ''}. {fastest}
    </>
  );
}

export interface RunFrame extends TimedFrame {
  now: number;
}

/** Plays the run on a clock: a captioned frame where the fault starts and ends, where the first request finishes, and at the end. */
export function runFrames(run: Run, baseline: Run): RunFrame[] {
  const p = run.params;
  const outcome = outcomeOf(p);
  const milestones: { t: number; say: ReactNode }[] = [];
  if (p.fault === 'hog') {
    const start = firstTime(run, (s) => !!s.hog);
    const end = Math.max(0, ...run.segs.filter((s) => s.hog).map((s) => s.end));
    if (start !== null) milestones.push({ t: start, say: <>Request {FAULT_REQUEST} starts its {HOG_MS} ms of CPU. Here <span className="hl bad wrap">{outcome.text}</span>.</> });
    if (start !== null && end > start) milestones.push({ t: end, say: <>Request {FAULT_REQUEST} has used {HOG_MS} ms of CPU by {ms(end)}.</> });
  }
  if (p.fault === 'crash') {
    const crash = run.marks.find((m) => m.kind === 'crash');
    if (crash) milestones.push({ t: crash.at, say: <>Request {FAULT_REQUEST} crashes at {ms(crash.at)}: <span className="hl bad wrap">{outcome.text}</span>.</> });
  }
  const first = run.marks.filter((m) => m.kind === 'finish').map((m) => m.at);
  if (first.length) milestones.push({ t: Math.min(...first), say: <>The first request finishes at {ms(Math.min(...first))}.</> });
  return timeFrames({ end: run.makespan, steps: 40, milestones, intro: runIntro(run), summary: runSummary(run, baseline), hold: 2.5 });
}
