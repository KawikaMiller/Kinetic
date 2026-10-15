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

// ── Lanes and instants ───────────────────────────────────────────────────

/** A zero-length bar is drawn as a marker with its label beside it. */
export const isInstant = (b: { start: number; end: number }) => b.start === b.end;

/** From an instant's centre to its label, px. */
export const INSTANT_GAP_PX = 8;
/** The diamond's drawn width and height, px (an 8px square turned 45°, so a little over 11px; kit.css). */
export const INSTANT_SIZE_PX = 12;

/** Where an instant at `fraction` (0..1) of a track `trackPx` wide sits, px: its centre, kept so the whole diamond stays inside the track. */
export const instantX = (fraction: number, trackPx: number) => {
  const half = INSTANT_SIZE_PX / 2;
  return Math.min(Math.max(fraction * trackPx, half), Math.max(half, trackPx - half));
};

export interface InstantLabelPlace {
  /** Which side of its marker the label sits on. */
  side: 'right' | 'left';
  /** Extra shift in px so it clears its neighbours and stays inside the track. */
  dx: number;
}

/**
 * Where the labels of the instants on one lane go. Each label starts to the right of its marker
 * (to the left when it wouldn't fit before the track's end or would sit on another diamond, if
 * the left is clear), then labels that overlap are
 * nudged apart the way marker labels are (spreadLabels), and finally every label is pulled back
 * inside the track. `marks` are the markers' x in px and their labels' widths.
 */
export function placeInstantLabels(marks: readonly LabelSpan[], trackPx: number, gap = 4): InstantLabelPlace[] {
  const half = INSTANT_SIZE_PX / 2;
  /** A side is free when the label fits inside the track and no other diamond sits under it. */
  const free = (m: LabelSpan, i: number, side: 1 | -1) => {
    const from = side === 1 ? m.x + INSTANT_GAP_PX : m.x - INSTANT_GAP_PX - m.w;
    const to = from + m.w;
    return from >= 0 && to <= trackPx && marks.every((o, j) => j === i || o.x + half <= from || o.x - half >= to);
  };
  const sides = marks.map((m, i): 'right' | 'left' => (free(m, i, 1) || !free(m, i, -1) ? 'right' : 'left'));
  const centre = marks.map((m, i) => m.x + (sides[i] === 'right' ? 1 : -1) * (INSTANT_GAP_PX + m.w / 2));
  const spread = spreadLabels(marks.map((m, i) => ({ x: centre[i], w: m.w })), gap);
  return marks.map((m, i) => {
    const wanted = centre[i] + spread[i];
    const inside = Math.min(Math.max(wanted, m.w / 2), Math.max(m.w / 2, trackPx - m.w / 2));
    return { side: sides[i], dx: inside - centre[i] };
  });
}
