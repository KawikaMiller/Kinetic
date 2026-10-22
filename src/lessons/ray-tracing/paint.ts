import { paintImage } from '../../components/canvasImage';
import { parseHex } from '../../core/contrast';
import { lerp } from '../../core/math';
import { TOKENS, type TokenName } from '../../core/palette';

export type Rgb = readonly [number, number, number];
const CHANNEL_MAX = 255;

/** A palette token as a colour in 0..1, for pixel data. */
export const tokenRgb = (token: TokenName): Rgb => {
  const [r, g, b] = parseHex(TOKENS[token]);
  return [r / CHANNEL_MAX, g / CHANNEL_MAX, b / CHANNEL_MAX];
};

/** An image from per-pixel colours in 0..1, drawn one rectangle per pixel on a data-URL canvas. */
export function paintPixels(w: number, h: number, colourAt: (i: number) => Rgb, scale: number): string | null {
  return paintImage(w, h, (ctx) => {
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = colourAt(i);
      ctx.fillStyle = `rgb(${Math.round(r * CHANNEL_MAX)} ${Math.round(g * CHANNEL_MAX)} ${Math.round(b * CHANNEL_MAX)})`; // allow-color: pixel data computed by the lesson's renderer, not a theme colour
      ctx.fillRect(i % w, Math.floor(i / w), 1, 1);
    }
  }, scale);
}

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

/** A colour as 0..255 integers for on-screen numbers. */
export const rgbText = (c: Rgb) => `(${c.map((v) => Math.round(v * CHANNEL_MAX)).join(', ')})`;

/** Linear mix of two colours, for a heat scale. */
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
