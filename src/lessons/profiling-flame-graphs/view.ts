// Pure helpers for what the profiling stage draws.
import type { GanttBar } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import type { Segment } from './model';

/** A fixed hue per function, chosen so stacked neighbours always differ. Never --bad: width isn't an error. */
export const FN_TONE: Record<string, Tone> = {
  handleRequest: 'amber',
  loadUser: 'sky',
  logLine: 'pink',
  parseJson: 'orange',
  renderPage: 'sky',
  'db.query': 'amber',
  formatPrice: 'amber',
  'Intl.NumberFormat': 'pink',
  format: 'orange',
};

export type Mode = 'graph' | 'chart';

/** One lane per function: solid while it's on the stack, dashed while it is itself waiting off the CPU. */
export function laneBars(segs: readonly Segment[], names: readonly string[]): GanttBar[] {
  const bars: GanttBar[] = [];
  for (const name of names) {
    let run: { start: number; end: number; kind: 'work' | 'blocked' } | null = null;
    for (const s of segs) {
      const kind = !s.stack.includes(name) ? null : !s.onCpu && s.stack[s.stack.length - 1] === name ? 'blocked' : 'work';
      if (run && kind === run.kind) {
        run.end = s.end;
        continue;
      }
      if (run) bars.push({ id: `${name}-${run.start}`, lane: name, start: run.start, end: run.end, tone: FN_TONE[name], kind: run.kind });
      run = kind ? { start: s.start, end: s.end, kind } : null;
    }
    if (run) bars.push({ id: `${name}-${run.start}`, lane: name, start: run.start, end: run.end, tone: FN_TONE[name], kind: run.kind });
  }
  return bars;
}

