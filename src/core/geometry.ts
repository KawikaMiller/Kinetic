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
