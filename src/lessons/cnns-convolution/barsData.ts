import { gaussian } from '../../core/fixtures/datasets';
import { mulberry32 } from '../../core/random';

export const SIZE = 8;
export type Image = number[][];

/** Class 1 is a vertical bar, class 0 a horizontal one. */
export const CLASS_NAME = ['horizontal bar', 'vertical bar'] as const;

export interface BarsSet {
  images: Image[];
  ys: number[];
}

/**
 * Seeded noisy images of one-pixel bars at a random position: half vertical (label 1), half
 * horizontal (label 0). Pixels are the bar (1) or background (0) plus normal noise of s.d. `noise`.
 */
export function barsSet(seed: number, count: number, noise: number): BarsSet {
  const rnd = mulberry32(seed);
  const images: Image[] = [];
  const ys: number[] = [];
  for (let n = 0; n < count; n++) {
    const label = n % 2;
    // Bars stay off the outermost rows and columns, where a valid 3 x 3 window sees them only by its edge.
    const at = 1 + Math.floor(rnd() * (SIZE - 2));
    images.push(
      Array.from({ length: SIZE }, (_, y) =>
        Array.from({ length: SIZE }, (_, x) => ((label === 1 ? x : y) === at ? 1 : 0) + gaussian(rnd) * noise),
      ),
    );
    ys.push(label);
  }
  return { images, ys };
}
