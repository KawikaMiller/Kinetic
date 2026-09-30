import { hash32 } from '../../core/hash';

export const RING = 2 ** 32;

export interface Point {
  server: string;
  pos: number; // 0..1 around the ring
}

export function ringPoints(servers: string[], vnodes: number): Point[] {
  return servers
    .flatMap((server) => Array.from({ length: vnodes }, (_, k) => ({ server, pos: hash32(`${server}#${k}`) / RING })))
    .sort((a, b) => a.pos - b.pos);
}

/** First point clockwise from pos (wrapping round). */
export function ringOwner(points: Point[], pos: number): Point {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].pos < pos) lo = mid + 1;
    else hi = mid;
  }
  return points[lo % points.length];
}

export const modOwner = (servers: string[], h: number) => servers[h % servers.length];
