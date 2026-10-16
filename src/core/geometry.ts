export interface Pt {
  x: number;
  y: number;
}

/** The point a fraction `t` of the way from a to b. */
export const pointAlong = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const midpoint = (a: Pt, b: Pt) => pointAlong(a, b, 0.5);

/** Width of a mono-text pill in SVG user units: label length × char width + padding. */
export const pillWidth = (label: string, charW = 6.5, pad = 20) => label.length * charW + pad;

/** SVG path for an arch from x1 to x2 that rises `lift` above baseY (pointer and dependency arcs). */
export function archPath(x1: number, x2: number, baseY: number, lift: number): string {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${baseY} Q ${mid} ${baseY - lift} ${x2} ${baseY}`;
}

/** Map a laid-out tree node (slot x in [0, count), depth) to pixels. */
export function treeToPixels(
  p: { x: number; depth: number },
  o: { count: number; width: number; pad: number; top: number; levelGap: number },
): Pt {
  const span = o.width - o.pad * 2;
  const x = o.count <= 1 ? o.width / 2 : o.pad + (span * p.x) / (o.count - 1);
  return { x, y: o.top + p.depth * o.levelGap };
}

/**
 * The (dx, dy) an arrow key moves something by `step` (screen axes: ArrowDown is +y), or null
 * for any other key. Shared by draggable handles that nudge with the keyboard.
 */
export function arrowStep(key: string, step: number): [number, number] | null {
  switch (key) {
    case 'ArrowLeft':
      return [-step, 0];
    case 'ArrowRight':
      return [step, 0];
    case 'ArrowUp':
      return [0, -step];
    case 'ArrowDown':
      return [0, step];
    default:
      return null;
  }
}

/** Does segment a→b pass through the box centred on c (Liang–Barsky clipping)? */
export function segmentHitsBox(a: Pt, b: Pt, c: Pt, halfW: number, halfH: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x - (c.x - halfW)],
    [dx, c.x + halfW - a.x],
    [-dy, a.y - (c.y - halfH)],
    [dy, c.y + halfH - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Twice the signed area of the triangle o, a, b: positive when o -> a -> b turns left, zero when collinear.
 * "Left" is counter-clockwise with y pointing up; in screen coordinates (y down) the same number is positive
 * for a turn that LOOKS clockwise, so a hull built from it winds the other way on screen.
 */
export const cross = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** The sign of `cross`: 1 left, -1 right, 0 collinear. */
export const orient = (o: Pt, a: Pt, b: Pt): number => Math.sign(cross(o, a, b));

const samePoint = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;
/** Order by y, then x: the "lowest, leftmost first" order (lowest = smallest y). */
export const lowestLeft = (a: Pt, b: Pt) => a.y - b.y || a.x - b.x;
/** Order by x, then y: the sweep order of the monotone chain. */
export const leftLow = (a: Pt, b: Pt) => a.x - b.x || a.y - b.y;

/** Distinct points only, in first-seen order. */
export const dedupePoints = <T extends Pt>(pts: readonly T[]): T[] => pts.filter((p, i) => pts.findIndex((q) => samePoint(p, q)) === i);

/** Rotate a polygon so it starts at its lowest point (smallest y), leftmost among ties. */
export function startAtLowestLeft<T extends Pt>(poly: readonly T[]): T[] {
  if (poly.length === 0) return [];
  let at = 0;
  poly.forEach((p, i) => {
    if (lowestLeft(p, poly[at]) < 0) at = i;
  });
  return [...poly.slice(at), ...poly.slice(0, at)];
}

/** How a hull treats points lying on an edge: 'drop' keeps only the corners, 'keep' keeps every point on the outline. */
export type CollinearPolicy = 'drop' | 'keep';

/**
 * Convex hull by Andrew's monotone chain (duplicates removed). It runs in the sign convention of `cross`, so with y up
 * the polygon is counter-clockwise starting at the lowest, leftmost point (`startAtLowestLeft`); with y down (SVG) it
 * is the same polygon wound the other way on screen. Fewer than three distinct points, or all on one line, come back
 * as the points themselves (the two ends, or all of them under 'keep').
 */
export function convexHull<T extends Pt>(points: readonly T[], { policy = 'drop' }: { policy?: CollinearPolicy } = {}): T[] {
  const pts = dedupePoints(points);
  if (pts.length < 3) return [...pts].sort(lowestLeft);
  const sorted = [...pts].sort(leftLow);
  if (sorted.every((p) => cross(sorted[0], sorted[1], p) === 0)) return policy === 'keep' ? sorted : [sorted[0], sorted[sorted.length - 1]];
  const chain = (list: readonly T[]) => {
    const out: T[] = [];
    for (const p of list) {
      while (out.length >= 2) {
        const c = cross(out[out.length - 2], out[out.length - 1], p);
        if (policy === 'drop' ? c <= 0 : c < 0) out.pop();
        else break;
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  return startAtLowestLeft([...chain(sorted), ...chain([...sorted].reverse())]);
}
