/**
 * Geometry for GanttLanes: where a bar or a cursor sits on its track, as percentages of
 * the track width. Pure, so the component stays a thin renderer and the maths is tested.
 */
import { linearScale } from './scale';

export type Domain = readonly [number, number];

/** Share of the domain covered up to `t`, in [0, 1]. */
export function domainFraction(t: number, [d0, d1]: Domain): number {
  const f = (t - d0) / (d1 - d0);
  return Math.min(1, Math.max(0, f));
}

export interface BarGeometry {
  /** Left edge, % of the track. */
  left: number;
  /** Width of the whole planned bar, %. */
  full: number;
  /** Width actually drawn: full × progress, %. */
  shown: number;
}

/**
 * A bar from `start` to `end` on a track spanning `domain`. `progress` (0..1, default 1)
 * draws only that share of it, for a job still running.
 */
export function barGeometry(start: number, end: number, [d0, d1]: Domain, progress = 1): BarGeometry {
  const span = d1 - d0;
  const left = ((start - d0) / span) * 100;
  const full = ((end - start) / span) * 100;
  return { left, full, shown: full * progress };
}

/** Axis tick positions: nice values inside the domain and where they sit, in % of the track. */
export function ganttTicks(domain: Domain, count = 5): { value: number; at: number }[] {
  const s = linearScale(domain[0], domain[1], 0, 100);
  return s.ticks(count).map((value) => ({ value, at: s.map(value) }));
}

/** A label to place: its wanted centre and its width, in px. */
export interface LabelSpan {
  x: number;
  w: number;
}

/**
 * Nudge centred labels apart so none overlap (with `gap` px between), moving each as little
 * as possible: overlapping neighbours merge into a run centred on their wanted centres.
 * Returns each label's shift in px, in input order; labels that already fit get 0.
 */
export function spreadLabels(labels: readonly LabelSpan[], gap = 4): number[] {
  const order = labels.map((_, i) => i).sort((a, b) => labels[a].x - labels[b].x);
  type Run = { members: number[]; width: number; left: number };
  const runs: Run[] = [];
  const wanted = (r: Run) => r.members.reduce((s, i) => s + labels[i].x, 0) / r.members.length;
  for (const i of order) {
    let run: Run = { members: [i], width: labels[i].w, left: labels[i].x - labels[i].w / 2 };
    for (let prev = runs.at(-1); prev && prev.left + prev.width + gap > run.left; prev = runs.at(-1)) {
      runs.pop();
      const members = [...prev.members, ...run.members];
      const width = prev.width + gap + run.width;
      run = { members, width, left: 0 };
      run.left = wanted(run) - width / 2;
    }
    runs.push(run);
  }
  const shift = labels.map(() => 0);
  for (const r of runs) {
    if (r.members.length === 1) continue;
    let left = r.left;
    for (const i of r.members) {
      shift[i] = left + labels[i].w / 2 - labels[i].x;
      left += labels[i].w + gap;
    }
  }
  return shift;
}

/** A bar label's glyph advance (600 10.5px mono) and its side padding, as kit.css draws it. */
export const GANTT_LABEL = { CHAR_PX: 6.3, PAD_PX: 5 } as const;

/** How wide a bar must be, in px, to show `text` unclipped: a value for GanttLanes' `labelMinPx`. */
export const barLabelPx = (text: string) => Math.ceil(text.length * GANTT_LABEL.CHAR_PX + 2 * GANTT_LABEL.PAD_PX);

/** What `barAt` needs of a bar: GanttLanes' `GanttBar` fits. */
export interface TimedBar {
  start: number;
  end: number;
  progress?: number;
}

/**
 * A bar as it looks at time `now`, for replaying a timeline: null before it starts, the bar
 * with `progress` = the elapsed share (0 at its start, so only the dashed plan shows) while it
 * runs, and the bar untouched once `now` reaches its end (a zero-length bar is done at its start).
 * Replaces the per-lesson clipping loops. Any `progress` the bar carried is replaced while it runs.
 */
export function barAt<B extends TimedBar>(bar: B, now: number): B | null {
  if (now < bar.start) return null;
  if (now >= bar.end) return bar;
  return { ...bar, progress: (now - bar.start) / (bar.end - bar.start) };
}

/** `barAt` over a list: the bars that have started by `now`, in their original order. */
export function barsAt<B extends TimedBar>(bars: readonly B[], now: number): B[] {
  return bars.flatMap((b) => barAt(b, now) ?? []);
}
