import type { Pt } from './geometry';

export interface SparkOpts {
  /** Number of sample slots across the width (the history length). */
  cap: number;
  /** Fixed y-axis maximum. Defaults to the largest value. */
  max?: number;
  /** Lower bound for the automatic maximum, so a quiet series doesn't fill the chart. */
  minMax?: number;
  /** 'right': the newest sample sits at the right edge and history grows leftwards. */
  align?: 'left' | 'right';
  /** Vertical inset in px, so strokes at 0 and max don't touch the edges. */
  pad?: { top?: number; bottom?: number };
}

/** The y-axis maximum a spark chart uses for `values`. */
export function sparkMax(values: readonly number[], o: Pick<SparkOpts, 'max' | 'minMax'>): number {
  return o.max ?? Math.max(o.minMax ?? 0, ...values);
}

/** y (from the top of a box `h` tall) for value `v` against `max`, honouring `pad`. */
export function sparkY(v: number, max: number, h: number, pad: SparkOpts['pad'] = {}): number {
  const top = pad.top ?? 0;
  const bottom = pad.bottom ?? 0;
  return h - bottom - (v / (max || 1)) * (h - top - bottom);
}

/** Points of a sparkline in a w×h box (origin top-left). Pure, shared by SVG and canvas. */
export function sparkPoints(values: readonly number[], w: number, h: number, o: SparkOpts): Pt[] {
  const max = sparkMax(values, o);
  const offset = o.align === 'left' ? 0 : o.cap - values.length;
  const step = o.cap > 1 ? w / (o.cap - 1) : 0;
  return values.map((v, i) => ({ x: (i + offset) * step, y: sparkY(v, max, h, o.pad) }));
}
