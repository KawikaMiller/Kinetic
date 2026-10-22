import type { ReactNode } from 'react';
import { plural, sig, joinList } from '../../core/format';
import { type BrooksParams, type BrooksReading } from './brooks';
import { type Plan, type Schedule } from './cpm';
import { type Placement } from './schedule';
import { gapSplit, type Uncertainty } from './uncertainty';

const labelOf = (plan: Plan, id: string) => plan.tasks.find((t) => t.id === id)!.label;
const days = (n: number) => plural(n, 'day');

/** Scene 1: the longest chain, how many tasks have no slack, and what the selected task can absorb. */
export function pathCaption(plan: Plan, s: Schedule, selected: string | null, note: string | null): ReactNode {
  const chain = [...s.critical].sort((a, b) => s.es[a] - s.es[b]).map((id) => labelOf(plan, id));
  return (
    <>
      The longest chain takes {days(s.length)}: {joinList(chain)}. {s.critical.length} of {plan.tasks.length} tasks have zero slack, so a slip in any of them moves the end.{' '}
      {selected
        ? s.slack[selected] > 0
          ? <>{labelOf(plan, selected)} has {days(s.slack[selected])} of slack: it can start up to {days(s.slack[selected])} late (day {s.es[selected]} to day {s.ls[selected]}) without moving the end. </>
          : <>{labelOf(plan, selected)} has no slack: it is on the longest chain. </>
        : <>Click a task to see its slack. </>}
      {note ? <>{note}</> : null}
    </>
  );
}

export interface Crash {
  taskId: string;
  delta: number;
  before: Schedule;
  after: Schedule;
  newlyCritical: string[];
}

/** Scene 2: what a change to one task did to the end date, with the reason from the numbers. */
export function crashCaption(plan: Plan, c: Crash): ReactNode {
  const name = labelOf(plan, c.taskId);
  const slack = c.before.slack[c.taskId];
  const moved = c.after.length - c.before.length;
  if (c.delta === 0) return <>No change applied: {name} takes {days(plan.tasks.find((t) => t.id === c.taskId)!.days)} and the project takes {days(c.before.length)}. Move the slider to change its duration (a task keeps at least one day).</>;
  const lead = c.delta < 0 ? <>Cutting {name} by {days(-c.delta)}</> : <>Slipping {name} by {days(c.delta)}</>;
  if (moved === 0) {
    return (
      <>
        {lead} leaves the end at day {c.after.length}.{' '}
        {c.delta > 0 ? <>It has {days(slack)} of slack and used {days(c.delta)} of it.</> : slack > 0 ? <>It was off the longest chain (slack {days(slack)}), so shortening it saves nothing.</> : <>Another chain is as long, so the date holds.</>}
        {c.newlyCritical.length > 0 ? <> {joinList(c.newlyCritical.map((id) => labelOf(plan, id)))} became critical.</> : null}
      </>
    );
  }
  const change = moved < 0 ? <>moves the end {days(-moved)} earlier, to day {c.after.length}</> : <>moves the end {days(moved)} later, to day {c.after.length}</>;
  return (
    <>
      {lead} {change}
      {c.delta < 0 && -moved < -c.delta ? <>, not the {days(-c.delta)} you cut: a second chain ({c.newlyCritical.length ? joinList(c.newlyCritical.map((id) => labelOf(plan, id))) : "another path"}) took over as the longest</> : null}
      {c.delta > 0 && slack > 0 ? <>: its {days(slack)} of slack absorbed part of the slip, and the other {days(c.delta - slack)} reached the end</> : null}.
    </>
  );
}

/** Scene 3: the list schedule against the bounds. */
export function peopleCaption(engineers: number, placed: Placement, bounds: { criticalPath: number; workShare: number; best: number }, optimum: number | null): ReactNode {
  return (
    <>
      With {plural(engineers, 'engineer')}, one task each at a time, the list schedule finishes on day {placed.makespan}. No schedule can beat the critical path ({days(bounds.criticalPath)}) or the work
      shared out evenly ({days(bounds.workShare)}), so day {bounds.best} is the lower bound.{' '}
      {optimum === null
        ? <>Too many tasks to brute-force: only the bounds are shown.</>
        : placed.makespan === optimum
          ? <>Brute force over every task order finds {days(optimum)} as the best, so this schedule is optimal.</>
          : <>Brute force over every task order finds {days(optimum)}, so the list rule is {days(placed.makespan - optimum)} behind the best.</>}
    </>
  );
}

/** Scene 4: the curve in words, from its readings. */
export function brooksCaption(p: BrooksParams, r: BrooksReading): ReactNode {
  const one = r.days[0];
  return (
    <>
      One person finishes in {sig(one, 3)} days. The earliest finish is with {plural(r.best, 'person', 'people')}: {sig(r.days[r.best - 1], 3)} days.{' '}
      {r.laterAt === null ? <>Within {r.days.length} people, adding anyone never finishes later than one person.</> : <>From {r.laterAt} people the date is later than with one person ({sig(r.days[r.laterAt - 1], 3)} days).</>}{' '}
      {p.serial >= 1 ? <>Nothing can be split here, so extra people only add cost.</> : null}
    </>
  );
}

/** Scene 5: the simulated length and the most critical task. */
export function riskCaption(plan: Plan, planned: number, planSlack: Record<string, number>, u: Uncertainty, sigma: number): ReactNode {
  const withSlack = plan.tasks.filter((t) => planSlack[t.id] > 0).sort((a, b) => u.criticality[b.id] - u.criticality[a.id])[0];
  const p90 = u.lengths[Math.floor(0.9 * u.lengths.length)];
  const gap = gapSplit(plan, planned, u.meanLength, sigma);
  return (
    <>
      The plan says {days(planned)}; with each duration spread by {sigma} (log-normal around the plan), the simulated project averages {sig(u.meanLength, 3)} days and 9 runs in 10 finish by day {sig(p90, 3)}.{' '}
      {withSlack ? <>{withSlack.label} has {days(planSlack[withSlack.id])} of slack in the plan yet is on a longest chain in {Math.round(u.criticality[withSlack.id] * 100)}% of runs. </> : null}The gap to the plan has two parts: about {gap.skew.toFixed(1)} days of skew (each duration&apos;s mean sits above its median, so the critical chain alone averages {(planned + gap.skew).toFixed(1)}) and about {gap.merge.toFixed(1)} days of merge bias, where two chains meet and the later one counts.
    </>
  );
}
