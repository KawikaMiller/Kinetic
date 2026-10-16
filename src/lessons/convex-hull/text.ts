import type { P } from './hull';

const n = (v: number) => (v < 0 ? `(${v})` : String(v));

/** The cross product with the numbers substituted: (bx - ax)(cy - ay) - (by - ay)(cx - ax) = ... = value. */
export function crossText(a: P, b: P, c: P): string {
  const [d1x, d1y, d2x, d2y] = [b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y];
  const value = d1x * d2y - d1y * d2x;
  return `(${b.x} - ${a.x})(${c.y} - ${a.y}) - (${b.y} - ${a.y})(${c.x} - ${a.x}) = ${n(d1x)} × ${n(d2y)} - ${n(d1y)} × ${n(d2x)} = ${value}`;
}

export type Turn = 'left' | 'right' | 'collinear';

/** The turn a cross product value means, with the convention (y up, counter-clockwise positive). */
export const turnOf = (value: number): Turn => (value > 0 ? 'left' : value < 0 ? 'right' : 'collinear');

export const TURN_WORDS: Record<Turn, string> = {
  left: 'left turn (counter-clockwise)',
  right: 'right turn (clockwise)',
  collinear: 'collinear (on one line)',
};

export const pt = (p: P) => `(${p.x}, ${p.y})`;
