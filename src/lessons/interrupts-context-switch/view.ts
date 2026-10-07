import type { GanttBar } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import { segmentsUntil, type SandboxSeg, type Segment } from './model';

/**
 * Timeline colours: a thread running is --hi, kernel time is --violet. Ready (hatched) and
 * blocked (dashed) are plain grey, because waiting is normal and not a failure.
 */
const STYLE: Record<Segment['kind'], { tone: Tone; kind: GanttBar['kind'] }> = {
  run: { tone: 'hi', kind: 'work' },
  kernel: { tone: 'violet', kind: 'work' },
  ready: { tone: 'muted', kind: 'wait' },
  blocked: { tone: 'muted', kind: 'blocked' },
};

const LABEL: Record<Segment['kind'], string> = { run: 'running', kernel: 'kernel', ready: 'ready', blocked: 'blocked' };

/**
 * Gantt bars up to `now`. `labels: false` leaves the text out of the bars (dense timelines
 * whose bars are too thin to label); they keep a tooltip via `title` only when labelled.
 */
export function toBars(segs: readonly (Segment | SandboxSeg)[], now: number, { labels = true } = {}): GanttBar[] {
  return segmentsUntil(segs, now).map((s, i) => ({
    id: `${s.lane}-${i}`,
    lane: s.lane,
    start: s.start,
    end: s.end,
    ...STYLE[s.kind],
    ...(labels && { label: LABEL[s.kind] }),
  }));
}

/** The cost scene: `cycles` repeats of a slice of work (--hi) then a switch (--violet), to scale. */
export function costBars(sliceUs: number, costUs: number, cycles: number): GanttBar[] {
  const bars: GanttBar[] = [];
  for (let k = 0; k < cycles; k++) {
    const t = k * (sliceUs + costUs);
    bars.push({ id: `w${k}`, lane: 'cpu', start: t, end: t + sliceUs, tone: 'hi', kind: 'work', label: k % 2 === 0 ? 'A' : 'B' });
    bars.push({ id: `s${k}`, lane: 'cpu', start: t + sliceUs, end: t + sliceUs + costUs, tone: 'violet', kind: 'work' });
  }
  return bars;
}
