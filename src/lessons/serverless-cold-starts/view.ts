/** What the pool scene draws at a moment in the run: Gantt bars, the window they sit in, and the instance boxes. */
import type { GanttBar } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import { stateAt, type Instance, type Run, type SegmentKind } from './model';

/** Seconds the timeline shows, and how many of them lie ahead of the cursor. */
export const WINDOW_S = 8;
export const LEAD_S = 1.5;
/** How long a 429 stub is drawn on the throttled lane. */
const STUB_S = 0.15;

export const THROTTLE_LANE = 'throttled';

export function windowAt(now: number): [number, number] {
  const lo = Math.max(0, now - (WINDOW_S - LEAD_S));
  return [lo, lo + WINDOW_S];
}

export const SEGMENT_TONE: Record<SegmentKind, Tone> = { provision: 'hi', runtime: 'amber', init: 'violet', handler: 'info', idle: 'ok' };
export const SEGMENT_LABEL: Record<SegmentKind, string> = { provision: 'provision', runtime: 'runtime', init: 'init', handler: 'handler', idle: 'warm' };

export const slotLane = (slot: number) => `slot-${slot}`;

/** Rows of the timeline: one per slot the run ever uses, plus the throttled lane. */
export function laneCount(run: Run): number {
  return run.instances.reduce((n, i) => Math.max(n, i.slot + 1), 0);
}

/** The bars that fall inside the window and have started by `now`, cut off at `now`. */
export function poolBars(run: Run, now: number): GanttBar[] {
  const [lo, hi] = windowAt(now);
  const bars: GanttBar[] = [];
  for (const inst of run.instances) {
    inst.segments.forEach((seg, k) => {
      const start = Math.max(seg.start, lo);
      const end = Math.min(seg.end, now, hi);
      if (end <= start) return;
      bars.push({
        id: `i${inst.id}-${k}`,
        lane: slotLane(inst.slot),
        start,
        end,
        tone: SEGMENT_TONE[seg.kind],
        kind: seg.kind === 'idle' ? 'wait' : 'work',
        label: SEGMENT_LABEL[seg.kind],
      });
    });
  }
  for (const r of run.requests) {
    if (r.outcome !== 'throttled' || r.at > now) continue;
    const end = Math.min(r.at + STUB_S, now);
    if (end <= lo || r.at >= hi) continue;
    bars.push({ id: `t${r.id}`, lane: THROTTLE_LANE, start: Math.max(r.at, lo), end, tone: 'bad' });
  }
  return bars;
}

export interface SlotView {
  slot: number;
  /** The instance in this slot at `now`, with what it is doing (null: an empty slot). */
  instance: Instance | null;
  state: SegmentKind | 'reaped' | null;
}

/** For each slot, the instance occupying it (or fading out of it) at `now`. */
export function slotsAt(run: Run, now: number, slots: number): SlotView[] {
  return Array.from({ length: slots }, (_, slot) => {
    const here = run.instances
      .filter((instance) => instance.slot === slot)
      .map((instance) => ({ slot, instance, state: stateAt(instance, now) }));
    // A new instance in a slot takes over from the one still fading out of it.
    return here.find((v) => v.state && v.state !== 'reaped') ?? here.find((v) => v.state) ?? { slot, instance: null, state: null };
  });
}
