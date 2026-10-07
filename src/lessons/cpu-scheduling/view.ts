import type { GanttBar, GanttLane } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import { type Job, type Policy, type Schedule } from './model';

/**
 * Job colours: categorical hues only. The semantic roles are taken (--hi = the slice running
 * now, --info = ready queue, --violet = a context switch, --dim = idle CPU, --ok / --bad =
 * best / starving), so jobs never wear them. Amber is left out too: next to the --hi ring
 * it reads as "running now". Past four jobs the colours repeat; every bar on the CPU lane
 * carries its job's name.
 */
export const JOB_TONES: readonly Tone[] = ['sky', 'pink', 'orange', 'muted'];
export const jobTone = (i: number): Tone => JOB_TONES[i % JOB_TONES.length];

export const CPU_LANE = 'cpu';

export function ganttLanes(jobs: readonly Job[], policy: Policy, levels: readonly number[]): GanttLane[] {
  return [
    { id: CPU_LANE, label: 'CPU' },
    ...jobs.map((j, i) => ({ id: `job-${i}`, label: policy === 'mlfq' ? `${j.name} · Q${levels[i]}` : j.name })),
  ];
}

type Cell = { key: string; tone: Tone; kind: GanttBar['kind']; label?: string } | null;

/** Merge equal neighbouring ticks into bars. `cells[t]` is what the lane shows during [t, t + 1). */
function merge(lane: string, cells: Cell[], ringAt: number | null): GanttBar[] {
  const bars: GanttBar[] = [];
  let start = 0;
  for (let t = 1; t <= cells.length; t++) {
    const a = cells[start];
    const b = cells[t];
    if (t < cells.length && b?.key === a?.key) continue;
    if (a) {
      const ring = ringAt !== null && ringAt >= start && ringAt < t && a.kind === 'work';
      bars.push({ id: `${lane}-${start}`, lane, start, end: t, tone: a.tone, kind: a.kind, label: a.label, ...(ring && { ring: 'hi' as const }) });
    }
    start = t;
  }
  return bars;
}

/**
 * The Gantt at moment `now`: everything up to and including the tick in progress
 * [now, now + 1). The run bar holding that tick gets the --hi ring.
 */
export function ganttBars(jobs: readonly Job[], s: Schedule, now: number): GanttBar[] {
  const ticks = s.moments.slice(0, now + 1).filter((m) => m.cpu !== null);
  const ringAt = s.moments[now]?.cpu?.kind === 'run' ? now : null;
  const cpu: Cell[] = ticks.map((m) => {
    const c = m.cpu!;
    if (c.kind === 'run') return { key: `run-${c.job}`, tone: jobTone(c.job), kind: 'work', label: jobs[c.job].name };
    if (c.kind === 'switch') return { key: 'switch', tone: 'violet', kind: 'work' };
    return { key: 'idle', tone: 'dim', kind: 'work' };
  });
  const lanes = jobs.map((_, j) =>
    merge(
      `job-${j}`,
      ticks.map((m): Cell => {
        if (m.cpu?.kind === 'run' && m.cpu.job === j) return { key: 'run', tone: jobTone(j), kind: 'work' };
        if (m.states[j] === 'ready') return { key: 'wait', tone: jobTone(j), kind: 'wait' };
        if (m.states[j] === 'blocked') return { key: 'io', tone: jobTone(j), kind: 'blocked' };
        return null;
      }),
      ringAt,
    ),
  );
  return [...merge(CPU_LANE, cpu, ringAt), ...lanes.flat()];
}
