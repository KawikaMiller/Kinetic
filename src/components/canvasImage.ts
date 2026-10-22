import { parseHex } from '../core/contrast';
import { TOKENS, type TokenName } from '../core/palette';

/**
 * Paint on an offscreen canvas and return it as a data URL for an SVG `<image>`, so a
 * layer with thousands of cells (a 1,000-person CellGrid, Plot2D's Heat) costs one
 * element instead of thousands. Drawn at 2× for high-DPI screens; null without a DOM.
 */
export function paintImage(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, scale = 2): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  draw(ctx);
  return canvas.toDataURL();
}

/** A colour as red, green, blue, each in 0..1. */
export type Rgb = readonly [number, number, number];
export const CHANNEL_MAX = 255;

/** A palette token as a colour in 0..1, for pixel data. */
export const tokenRgb = (token: TokenName): Rgb => {
  const [r, g, b] = parseHex(TOKENS[token]);
  return [r / CHANNEL_MAX, g / CHANNEL_MAX, b / CHANNEL_MAX];
};

/** An image from per-pixel colours in 0..1 (row-major, `colourAt(i)`), drawn one rectangle per pixel. */
export function paintPixels(w: number, h: number, colourAt: (i: number) => Rgb, scale: number): string | null {
  return paintImage(w, h, (ctx) => {
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = colourAt(i);
      ctx.fillStyle = `rgb(${Math.round(r * CHANNEL_MAX)} ${Math.round(g * CHANNEL_MAX)} ${Math.round(b * CHANNEL_MAX)})`; // allow-color: pixel data computed by the lesson, not a theme colour
      ctx.fillRect(i % w, Math.floor(i / w), 1, 1);
    }
  }, scale);
}

/** A colour as 0..255 integers for on-screen numbers: (255, 128, 0). */
export const rgbText = (c: Rgb) => `(${c.map((v) => Math.round(v * CHANNEL_MAX)).join(', ')})`;
