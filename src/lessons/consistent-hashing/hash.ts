// FNV-1a with a murmur3 finaliser: cheap, deterministic and well spread.
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

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
