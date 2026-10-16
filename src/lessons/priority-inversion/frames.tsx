import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { timeFrames, type TimedFrame } from '../../core/frames';
import { NAMES, type Variant } from './openings';
import { BASE, L_BEFORE, inversionWindow, verdictOf, type Protocol, type Schedule, type TaskId, type Verdict } from './sched';

export const PROTOCOL_LABEL: Record<Protocol, string> = { none: 'no protocol', inheritance: 'priority inheritance', ceiling: 'priority ceiling' };

export interface SchedFrame extends TimedFrame {
  now: number;
}

const tickEnd = (sch: Schedule) => Math.max(1, sch.ticks.length);

function introOf(sch: Schedule, v: Variant): ReactNode {
  const n = NAMES[v];
  const s = sch.scenario;
  return (
    <>
      One core runs the highest-priority task that can run: {n.H} (3), {n.M} (2), {n.L} (1). {n.H} and {n.L} share one lock, R. {n.L} locks R after {plural(L_BEFORE, 'tick')} and holds it for {plural(s.csL, 'tick')}; {n.H} arrives at {s.arrivalH}, {n.M} at {s.arrivalM}
      and needs {plural(s.lenM, 'tick')}. The rule in force: <span className="hl info">{PROTOCOL_LABEL[sch.options.protocol]}</span>. Ticks are abstract, not milliseconds.
    </>
  );
}

/** The captioned moments, each read off the schedule's own events. */
export function milestonesOf(sch: Schedule, v: Variant): { t: number; say: ReactNode }[] {
  const n = NAMES[v];
  const out: { t: number; say: ReactNode }[] = [];
  const first = (pred: (e: Schedule['ticks'][number]['events'][number]) => boolean) => {
    for (const rec of sch.ticks) {
      const e = rec.events.find(pred);
      if (e) return { rec, e };
    }
    return null;
  };
  const block = first((e) => e.kind === 'block');
  if (block) {
    out.push({ t: block.rec.t, say: <>At tick {block.rec.t} {n.H} tries to lock R, but {n[block.e.detail as TaskId]} holds it: <span className="hl orange">{n.H} is blocked</span>.</> });
  } else {
    const arrive = first((e) => e.kind === 'arrive' && e.task === 'H');
    if (arrive) out.push({ t: arrive.rec.t, say: <>{n.H} arrives at tick {arrive.rec.t} and is never blocked on R: no inversion here.</> });
  }
  const inherit = first((e) => e.kind === 'inherit');
  if (inherit) out.push({ t: inherit.rec.t, say: <>{n[inherit.e.task]} runs at priority <span className="hl info">{inherit.e.detail}</span>, {n.H}&apos;s, while it holds R, so {n.M} cannot cut in.</> });
  if (sch.options.protocol === 'ceiling') {
    const lock = first((e) => e.kind === 'lock' && e.task === 'L');
    if (lock) out.push({ t: lock.rec.t, say: <>{n.L} locks R and runs at R&apos;s ceiling, {BASE.H}, the highest priority of any task that uses R, until it unlocks.</> });
  }
  const cut = first((e) => e.kind === 'preempt' && e.task === 'L' && e.detail === 'M');
  if (cut && sch.ticks.some((r) => r.status.H === 'blocked' && r.t >= cut.rec.t)) {
    out.push({ t: cut.rec.t, say: <>{n.M} (2) outranks {n.L} (1) and takes the CPU while {n.L} holds R and {n.H} waits: <span className="hl bad">the inversion</span>.</> });
  }
  const unlock = first((e) => e.kind === 'unlock' && e.task === 'L');
  if (unlock) out.push({ t: unlock.rec.t, say: <>{n.L} unlocks R at tick {unlock.rec.t}{sch.options.protocol === 'none' ? '' : ` and drops back to its own priority, ${BASE.L}`}.</> });
  const reset = first((e) => e.kind === 'reset');
  if (reset) out.push({ t: reset.rec.t + 1, say: <>{n.H} has been unable to run for more than {sch.options.watchdog} ticks: <span className="hl bad">the watchdog resets the system</span> at tick {reset.rec.t + 1}.</> });
  const done = sch.finish.H;
  if (done !== null) out.push({ t: done, say: <>{n.H} finishes at tick {done}.</> });
  return out;
}

export function summaryOf(sch: Schedule, v: Variant, verdict: Verdict, withDeadline: boolean): ReactNode {
  const n = NAMES[v];
  if (verdict.resetAt !== null) {
    return <><span className="hl bad">The watchdog reset the system at tick {verdict.resetAt}</span>: {n.H} had been unable to run for more than {plural(sch.options.watchdog ?? 0, 'tick')}. In {plural(inversionWindow(sch).length, 'tick')} of that waiting the CPU ran something that was not holding the lock.</>;
  }
  if (verdict.noInversion) return <><span className="hl ok">No inversion in this scenario</span>: {n.H} never had to wait, and finished at tick {verdict.finishH}.</>;
  const slack = verdict.slack;
  const deadline = !withDeadline || slack === null ? null : slack >= 0 ? <>, {plural(slack, 'tick')} before its deadline: <span className="hl ok">met</span></> : <>, {plural(-slack, 'tick')} after its deadline: <span className="hl bad">missed</span></>;
  return (
    <>
      {n.H} waited {plural(verdict.blocking ?? 0, 'tick')} and finished at tick {verdict.finishH}
      {deadline}. {verdict.window > 0 ? <>{plural(verdict.window, 'tick')} of the wait were in the inversion window, a task with no claim on R running while {n.H} waited.</> : <>No tick of the wait was spent on a task outside the lock.</>}
    </>
  );
}

export function schedFrames(sch: Schedule, v: Variant, withDeadline: boolean): SchedFrame[] {
  const end = tickEnd(sch);
  return timeFrames({
    end,
    steps: Math.min(end, 40),
    milestones: milestonesOf(sch, v),
    intro: introOf(sch, v),
    summary: summaryOf(sch, v, verdictOf(sch), withDeadline),
    hold: 2.5,
  });
}
