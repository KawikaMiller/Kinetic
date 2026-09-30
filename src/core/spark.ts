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
}

/** The y-axis maximum a spark chart uses for `values`. */
export function sparkMax(values: readonly number[], o: Pick<SparkOpts, 'max' | 'minMax'>): number {
  return o.max ?? Math.max(o.minMax ?? 0, ...values);
}

/** Points of a sparkline in a w×h box (origin top-left). Pure, shared by SVG and canvas. */
export function sparkPoints(values: readonly number[], w: number, h: number, o: SparkOpts): Pt[] {
  const max = sparkMax(values, o) || 1;
  const offset = o.align === 'left' ? 0 : o.cap - values.length;
  const step = o.cap > 1 ? w / (o.cap - 1) : 0;
  return values.map((v, i) => ({ x: (i + offset) * step, y: h - (v / max) * h }));
}
