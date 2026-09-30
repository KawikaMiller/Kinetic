// Canvas drawing helpers for live simulations. Everything takes the context first
// and defaults its colours to the design tokens (palette.ts). None of them leave
// changed state behind except the fill/stroke styles they set.
import type { Pt } from './geometry';
import { clamp01 } from './math';
import { TOKENS } from './palette';
import { sparkPoints, type SparkOpts } from './spark';

type Ctx = CanvasRenderingContext2D;

export const FONT = {
  mono: (px: number, weight = 600) => `${weight} ${px}px "JetBrains Mono", monospace`,
  sans: (px: number, weight = 600) => `${weight} ${px}px Inter, system-ui, sans-serif`,
};

/**
 * Fill text. Defaults: muted colour, 11px mono. `align`/`baseline` are applied only
 * when given, and restored afterwards; otherwise the context's current ones are used.
 */
export function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  o: { color?: string; font?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline } = {},
): void {
  const { textAlign, textBaseline } = ctx;
  if (o.align) ctx.textAlign = o.align;
  if (o.baseline) ctx.textBaseline = o.baseline;
  ctx.fillStyle = o.color ?? TOKENS.muted;
  ctx.font = o.font ?? FONT.mono(11);
  ctx.fillText(s, x, y);
  ctx.textAlign = textAlign;
  ctx.textBaseline = textBaseline;
}

interface BoxOpts {
  stroke?: string;
  fill?: string;
  radius?: number;
  lineWidth?: number;
}

/** A rounded box centred on (cx, cy). Defaults: cell fill, muted 2px stroke, radius 10. */
export function box(ctx: Ctx, cx: number, cy: number, w: number, h: number, o: BoxOpts = {}): void {
  rect(ctx, cx - w / 2, cy - h / 2, w, h, { stroke: TOKENS.muted, lineWidth: 2, radius: 10, fill: TOKENS.cell, ...o });
}

/** A rounded box from its top-left corner. Only draws the fill and/or stroke you pass. */
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, o: BoxOpts): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, o.radius ?? 0);
  if (o.fill) {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.lineWidth ?? 1;
    ctx.stroke();
  }
}

/** A filled circle, optionally with a soft glow of `glow` px. */
export function dot(ctx: Ctx, x: number, y: number, r: number, color: string, o: { glow?: number } = {}): void {
  if (o.glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = o.glow;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (o.glow) ctx.shadowBlur = 0;
}

/** Line segments stroked in one pass. Defaults: line-2 colour, 2px, dashed 4/6. Pass dash: [] for solid. */
export function wire(ctx: Ctx, segments: readonly (readonly [Pt, Pt])[], o: { color?: string; dash?: number[]; width?: number } = {}): void {
  ctx.strokeStyle = o.color ?? TOKENS.line2;
  ctx.lineWidth = o.width ?? 2;
  ctx.setLineDash(o.dash ?? [4, 6]);
  ctx.beginPath();
  for (const [a, b] of segments) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/** A horizontal meter: a `track` bar with `ratio` (0..1, clamped) of it filled in `color`. */
export function bar(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
  o: { track?: string; radius?: number } = {},
): void {
  const radius = o.radius ?? 0;
  rect(ctx, x, y, w, h, { fill: o.track ?? TOKENS.dim, radius });
  const filled = w * clamp01(ratio);
  if (filled > 0) rect(ctx, x, y, filled, h, { fill: color, radius });
}

/** A tinted, outlined box (reject bins, dead-letter queues, drop zones) with an optional label on top. */
export function tintBox(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  o: { label?: string; fillAlpha?: number; strokeAlpha?: number; radius?: number; labelFont?: string } = {},
): void {
  ctx.globalAlpha = o.fillAlpha ?? 0.1;
  rect(ctx, x, y, w, h, { fill: color, radius: o.radius ?? 8 });
  ctx.globalAlpha = o.strokeAlpha ?? 0.6;
  rect(ctx, x, y, w, h, { stroke: color, lineWidth: 1, radius: o.radius ?? 8 });
  ctx.globalAlpha = 1;
  if (o.label) text(ctx, o.label, x + w / 2, y - 8, { color, font: o.labelFont, align: 'center' });
}

/** A sparkline inside the rectangle r. `color` may depend on each segment's end value. */
export function drawSpark(
  ctx: Ctx,
  r: { x: number; y: number; w: number; h: number },
  values: readonly number[],
  o: SparkOpts & { color: string; width?: number },
): void {
  if (values.length < 2) return;
  const pts = sparkPoints(values, r.w, r.h, o);
  ctx.strokeStyle = o.color;
  ctx.lineWidth = o.width ?? 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(r.x + p.x, r.y + p.y) : ctx.moveTo(r.x + p.x, r.y + p.y)));
  ctx.stroke();
}
