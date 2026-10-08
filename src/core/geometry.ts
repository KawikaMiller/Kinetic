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
