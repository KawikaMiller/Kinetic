import { describe, expect, it } from 'vitest';
import { convexHull, cross, orient, startAtLowestLeft, type CollinearPolicy, type Pt } from './geometry';
import { mulberry32 } from './random';

describe('cross and orient', () => {
  it('are positive for a left turn, negative for a right turn, zero on a line (hand-worked)', () => {
    const o = { x: 0, y: 0 };
    expect(cross(o, { x: 4, y: 0 }, { x: 4, y: 3 })).toBe(12);
    expect(cross(o, { x: 4, y: 0 }, { x: 4, y: -3 })).toBe(-12);
    expect(orient(o, { x: 1, y: 1 }, { x: 3, y: 3 })).toBe(0);
    expect(orient(o, { x: 4, y: 0 }, { x: 4, y: 3 })).toBe(1);
    expect(orient(o, { x: 4, y: 0 }, { x: 4, y: -3 })).toBe(-1);
  });
});

const keyOf = (p: Pt) => `${p.x},${p.y}`;

/** The hull's points by brute force over all pairs, sharing no code with convexHull: (p, q) is an edge when every point is left of it or on its line within the segment. */
function bruteHull(input: readonly Pt[], policy: CollinearPolicy): string[] {
  const pts = input.filter((p, i) => input.findIndex((q) => q.x === p.x && q.y === p.y) === i);
  if (pts.length < 3) return pts.map(keyOf).sort();
  const c = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const out = new Set<string>();
  for (const p of pts) {
    for (const q of pts) {
      if (p === q) continue;
      const within = pts.every((r) => {
        if (c(p, q, r) !== 0) return true;
        const t = ((r.x - p.x) * (q.x - p.x) + (r.y - p.y) * (q.y - p.y)) / ((q.x - p.x) ** 2 + (q.y - p.y) ** 2);
        return t >= 0 && t <= 1;
      });
      if (!pts.every((r) => c(p, q, r) >= 0) || !within) continue;
      if (policy === 'drop') {
        out.add(keyOf(p));
        out.add(keyOf(q));
      } else {
        for (const r of pts) if (c(p, q, r) === 0) out.add(keyOf(r));
      }
    }
  }
  return [...out].sort();
}

describe('convexHull', () => {
  const randomSet = (seed: number): Pt[] => {
    const rnd = mulberry32(seed);
    const grid = 2 + Math.floor(rnd() * 5);
    return Array.from({ length: Math.floor(rnd() * 13) }, () => ({ x: Math.floor(rnd() * grid), y: Math.floor(rnd() * grid) }));
  };

  it('matches the brute-force hull on 500 seeded small-grid sets, for both collinear policies', () => {
    for (let seed = 0; seed < 500; seed++) {
      const pts = randomSet(seed);
      for (const policy of ['drop', 'keep'] as const) {
        expect(convexHull(pts, { policy }).map(keyOf).sort(), `${policy} seed ${seed}`).toEqual(bruteHull(pts, policy));
      }
    }
  });

  it('is counter-clockwise (y up) and starts at the lowest, leftmost point', () => {
    const square = [{ x: 4, y: 4 }, { x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
    expect(convexHull(square).map(keyOf)).toEqual(['0,0', '4,0', '4,4', '0,4']);
  });

  it('keeps edge points under keep and returns the ends of a line under drop', () => {
    const line = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }];
    expect(convexHull(line).map(keyOf)).toEqual(['0,0', '2,0']);
    expect(convexHull(line, { policy: 'keep' }).map(keyOf)).toEqual(['0,0', '1,0', '2,0']);
    expect(convexHull([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
  });

  it('keeps extra fields on the points, and startAtLowestLeft rotates', () => {
    const tagged = [{ x: 0, y: 0, id: 'a' }, { x: 3, y: 0, id: 'b' }, { x: 0, y: 3, id: 'c' }];
    expect(convexHull(tagged).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(startAtLowestLeft([{ x: 1, y: 2 }, { x: 0, y: 1 }, { x: 5, y: 1 }]).map(keyOf)).toEqual(['0,1', '5,1', '1,2']);
  });
});
