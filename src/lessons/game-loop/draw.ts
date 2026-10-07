import { dot, FONT, rect, text } from '../../core/canvas';
import { alpha, TOKENS } from '../../core/palette';
import { WORLD, type Ball } from './sim';

export interface BoxScene {
  /** Where the ball is drawn. */
  render: Ball;
  /** A dim outline at another position (the physics state the interpolated ball trails), or null. */
  ghost: Ball | null;
  /** 0..1: how strongly the tunnelling flash shows. */
  flash: number;
  trail?: readonly { x: number; y: number }[];
  label?: string;
}

const PAD = 8;

/** The box, the thin wall, the ball and its extras, scaled to fit w × h with the world's aspect. */
export function drawBox(ctx: CanvasRenderingContext2D, w: number, h: number, s: BoxScene): void {
  const k = Math.min((w - 2 * PAD) / WORLD.w, (h - 2 * PAD) / WORLD.h);
  const ox = (w - WORLD.w * k) / 2;
  const oy = (h - WORLD.h * k) / 2;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy + y * k;

  rect(ctx, ox, oy, WORLD.w * k, WORLD.h * k, { fill: TOKENS.bg2, stroke: TOKENS.line2, lineWidth: 1.5, radius: 6 });
  if (s.flash > 0) rect(ctx, ox, oy, WORLD.w * k, WORLD.h * k, { fill: alpha(TOKENS.bad, 0.25 * s.flash), stroke: alpha(TOKENS.bad, s.flash), lineWidth: 3, radius: 6 });

  const wallW = Math.max(2, 2 * WORLD.wallHalf * k);
  rect(ctx, X(WORLD.wallX) - wallW / 2, oy, wallW, WORLD.h * k, { fill: TOKENS.violet });

  if (s.trail && s.trail.length > 1) {
    ctx.beginPath();
    s.trail.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.strokeStyle = alpha(TOKENS.info, 0.35);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const r = Math.max(3, WORLD.r * k);
  if (s.ghost) {
    ctx.beginPath();
    ctx.arc(X(s.ghost.x), Y(s.ghost.y), r, 0, Math.PI * 2);
    ctx.strokeStyle = TOKENS.dim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  dot(ctx, X(s.render.x), Y(s.render.y), r, TOKENS.info, { glow: 8 });

  if (s.label) text(ctx, s.label, ox + 10, oy + 16, { color: TOKENS.muted, font: FONT.mono(11) });
  if (s.flash > 0) text(ctx, 'tunnelled through the wall', ox + 10, oy + (s.label ? 34 : 18), { color: alpha(TOKENS.bad, s.flash), font: FONT.sans(12, 700) });
}
