import type { GanttBar, GanttLane, GanttMarker } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import { NAMES, type Variant } from './openings';
import { BASE, TASKS, inversionWindow, runsOf, type Schedule, type TaskId } from './sched';

/** A task's own colour: a plain category, never a status colour. */
export const TASK_TONE: Record<TaskId, Tone> = { H: 'pink', M: 'amber', L: 'sky' };

export const WINDOW_LANE = 'window';

export function lanesOf(variant: Variant): GanttLane[] {
  return [
    ...TASKS.map((k) => ({ id: k, label: `${NAMES[variant][k]} (${BASE[k]})` })),
    { id: WINDOW_LANE, label: 'inversion window' },
  ];
}

interface Piece {
  task: TaskId;
  kind: 'work' | 'wait' | 'blocked';
  eff: number;
  holds: boolean;
  start: number;
}

/**
 * The timeline: running bars in the task's colour (labelled "L as 3" while its priority is raised), time spent
 * waiting (H's in orange, dashed when blocked on the lock and hatched when held back, the others' in dim hatching),
 * a violet ring while a task holds R, a diamond where a priority is raised or the watchdog resets, and the inversion
 * window as red bars on its own lane.
 */
export function barsOf(sch: Schedule, variant: Variant): GanttBar[] {
  const bars: GanttBar[] = [];
  const names = NAMES[variant];
  for (const task of TASKS) {
    let open: Piece | null = null;
    const close = (end: number) => {
      if (!open) return;
      const { kind, eff, holds, start } = open;
      const raised = eff !== BASE[task];
      const tone: Tone = kind === 'work' ? TASK_TONE[task] : task === 'H' ? 'orange' : 'dim';
      const what = kind === 'work' ? `${names[task]}${raised ? ` as ${eff}` : ''}` : kind === 'blocked' ? 'blocked on R' : 'waiting';
      bars.push({ id: `${task}-${start}`, lane: task, start, end, tone, kind, ring: holds ? 'violet' : undefined, label: what });
      open = null;
    };
    for (const rec of sch.ticks) {
      const status = rec.status[task];
      const kind = status === 'running' ? 'work' : status === 'ready' ? 'wait' : status === 'blocked' ? 'blocked' : null;
      if (kind === null) {
        close(rec.t);
        continue;
      }
      const holds = rec.holder === task;
      const eff = rec.eff[task];
      const same = open && open.kind === kind && open.eff === eff && open.holds === holds;
      if (!same) {
        close(rec.t);
        open = { task, kind, eff, holds, start: rec.t };
      }
    }
    close(sch.ticks.length);
  }
  for (const [start, end] of runsOf(inversionWindow(sch))) bars.push({ id: `window-${start}`, lane: WINDOW_LANE, start, end, tone: 'bad', kind: 'work', label: 'inversion window' });
  for (const rec of sch.ticks) {
    for (const e of rec.events) {
      if (e.kind === 'inherit') bars.push({ id: `inherit-${rec.t}`, lane: e.task, start: rec.t, end: rec.t, tone: 'info', label: `${names[e.task]} as ${e.detail}` });
      if (e.kind === 'reset') bars.push({ id: 'reset', lane: 'H', start: rec.t + 1, end: rec.t + 1, tone: 'bad', label: 'reset' });
    }
  }
  return bars;
}

export function markersOf(sch: Schedule, withDeadline: boolean): GanttMarker[] {
  if (!withDeadline) return [];
  const finish = sch.finish.H;
  const met = finish !== null && finish <= sch.scenario.deadline && sch.resetAt === null;
  return [{ at: sch.scenario.deadline, label: 'H deadline', tone: met ? 'ok' : 'bad' }];
}
