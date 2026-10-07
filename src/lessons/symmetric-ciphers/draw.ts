// Paint 48×48 byte pictures onto a canvas, one byte per pixel, colours from TOKENS.
import { lerp } from '../../core/math';
import { TOKENS } from '../../core/palette';
import { FG, SIDE } from './model';

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

const SKY = rgb(TOKENS.sky);
const AMBER = rgb(TOKENS.amber);
const DARK = rgb(TOKENS.bg2);
const VIOLET = rgb(TOKENS.violet);

/** The plaintext picture: its two tones, a categorical pair. */
export const plainColour = (b: number): Rgb => (b === FG ? AMBER : SKY);

/** A ciphertext byte as a shade of violet: 0 is near the background, 255 full violet. */
export const cipherColour = (b: number): Rgb => {
  const t = b / 255;
  return [0, 1, 2].map((k) => Math.round(lerp(DARK[k], VIOLET[k], t))) as Rgb;
};

export function paintBytes(ctx: CanvasRenderingContext2D, bytes: Uint8Array, colour: (b: number) => Rgb) {
  const img = ctx.createImageData(SIDE, SIDE);
  for (let i = 0; i < SIDE * SIDE; i++) {
    const [r, g, b] = colour(bytes[i]);
    img.data.set([r, g, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
}
