import { TOKENS } from '../../core/palette';
import type { Tri } from './model';

/**
 * The same triangle filled by the browser's own CanvasRenderingContext2D, onto a canvas that is
 * exactly one canvas pixel per grid pixel. CSS scales it up with `image-rendering: pixelated`, so
 * the shades are the browser's real antialiasing, not ours.
 */
export function drawRealCanvas(ctx: CanvasRenderingContext2D, tris: readonly { tri: Tri; color: string }[], w: number, h: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = TOKENS.cell;
  ctx.fillRect(0, 0, w, h);
  for (const { tri, color } of tris) {
    ctx.beginPath();
    ctx.moveTo(tri[0].x, tri[0].y);
    ctx.lineTo(tri[1].x, tri[1].y);
    ctx.lineTo(tri[2].x, tri[2].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}
