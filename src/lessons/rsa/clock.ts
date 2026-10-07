// Geometry of the modular clock: value v of n sits at angle 2π·v/n, clockwise from the top.

export const CLOCK = { size: 280, r: 104, labelR: 126 } as const;

export function clockPoint(v: bigint, n: bigint, radius: number = CLOCK.r) {
  const t = Number(v) / Number(n);
  const angle = t * 2 * Math.PI - Math.PI / 2;
  const c = CLOCK.size / 2;
  return { x: c + radius * Math.cos(angle), y: c + radius * Math.sin(angle) };
}
