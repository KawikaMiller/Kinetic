import { paintImage, type Rgb } from '../../components/canvasImage';
import { lerp } from '../../core/math';
import { TOKENS } from '../../core/palette';

/** A ring around each flagged pixel, in the --bad token, on a transparent image the size of the render. */
export function paintRings(w: number, h: number, flagged: readonly boolean[], scale: number): string | null {
  const inset = 0.12;
  return paintImage(w, h, (ctx) => {
    ctx.strokeStyle = TOKENS.bad;
    ctx.lineWidth = 0.22;
    flagged.forEach((on, i) => {
      if (on) ctx.strokeRect((i % w) + inset, Math.floor(i / w) + inset, 1 - 2 * inset, 1 - 2 * inset);
    });
  }, scale);
}

/** Linear mix of two colours, for a heat scale. */
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
