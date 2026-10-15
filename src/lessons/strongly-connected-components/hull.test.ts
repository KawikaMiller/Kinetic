import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { convexHull } from './hull';

const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

describe('convexHull', () => {
  it('returns every point of a triangle and a square, dropping the one inside', () => {
    expect(convexHull([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }])).toHaveLength(3);
    const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 2, y: 2 }];
    expect(convexHull(square)).toHaveLength(4);
  });

  it('keeps one and two points as they are, and drops duplicates and collinear middles', () => {
    expect(convexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
    expect(convexHull([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toHaveLength(1);
    expect(convexHull([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }])).toHaveLength(2);
  });

  it('on 500 random point sets every input point lies inside or on the hull', () => {
    const rnd = mulberry32(1);
    for (let t = 0; t < 500; t++) {
      const pts = Array.from({ length: 3 + Math.floor(rnd() * 7) }, () => ({ x: Math.floor(rnd() * 20), y: Math.floor(rnd() * 20) }));
      const hull = convexHull(pts);
      if (hull.length < 3) continue;
      for (const p of pts) {
        for (let i = 0; i < hull.length; i++) expect(cross(hull[i], hull[(i + 1) % hull.length], p)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
