/** etl-orchestration: a world as Gantt bars on the calendar axis, and a readable label for an hour. Pure, so the tests can check what is drawn. */
import type { GanttBar } from '../../components/GanttLanes';
import { CALENDAR_START, TASKS, type Task, type World } from './engine';

export const MIN_BAR_PX = 5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "Mar 3 13:00" for an hour since `startIso`, in UTC. */
export function hourLabel(startIso: string, hour: number): string {
  const d = new Date(Date.parse(startIso) + hour * 3_600_000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${pad(d.getUTCHours())}:00`;
}

/** The ISO date of day index d of the first week (the week starts 1 March 2026, UTC). */
export const weekDate = (d: number): string => new Date(Date.parse(CALENDAR_START) + d * 86_400_000).toISOString().slice(0, 10);

export const dayLabel = (d: number, startIso: string): string => hourLabel(startIso, 24 * d).slice(0, -6);

/** Every attempt as a bar on its task's lane (green if it succeeded, red if it failed), an in-flight one in `hi`, and a one-hour hatched bar where a task did not run. */
export function barsOf(w: World): GanttBar[] {
  const bars: GanttBar[] = [];
  for (const run of w.runs) {
    for (const t of TASKS) {
      const tr = run.tasks[t];
      tr.spans.forEach((s, i) => bars.push({ id: `a${run.day}:${t}:${i}`, lane: t, start: s.start, end: s.end, tone: s.ok ? 'ok' : 'bad', label: String(run.day + 1), minPx: MIN_BAR_PX }));
      if (tr.status === 'running' && tr.start !== null && tr.end !== null) bars.push({ id: `r${run.day}:${t}`, lane: t, start: tr.start, end: tr.end, tone: 'hi', label: String(run.day + 1), minPx: MIN_BAR_PX });
      if (tr.status === 'retry' && tr.readyAt !== null && tr.spans.length > 0) bars.push({ id: `w${run.day}:${t}`, lane: t, start: tr.spans.at(-1)!.end, end: tr.readyAt, tone: 'info', kind: 'blocked', minPx: MIN_BAR_PX });
      if (tr.status === 'upstream_failed' && tr.blockedAt !== null) bars.push({ id: `u${run.day}:${t}`, lane: t, start: tr.blockedAt, end: tr.blockedAt + 1, tone: 'orange', kind: 'wait', label: String(run.day + 1), minPx: MIN_BAR_PX });
    }
  }
  return bars;
}

export const lanesOf = (): { id: Task; label: string }[] => TASKS.map((t) => ({ id: t, label: t }));

/** The task-run a bar belongs to, from its id (`a2:clean:0` is day index 2, task clean). */
export function barTarget(id: string): { day: number; task: Task } | null {
  const m = /^[arwu](\d+):(\w+)/.exec(id);
  return m && (TASKS as readonly string[]).includes(m[2]) ? { day: Number(m[1]), task: m[2] as Task } : null;
}
