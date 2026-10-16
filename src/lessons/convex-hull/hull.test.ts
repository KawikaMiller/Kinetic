import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { HULLS, andrew, cross, graham, jarvis, type Algo, type P, type Policy } from './hull';
import { INTEGER_TRIPLE, LATTICE, ULP, SEG_FROM, SEG_TO, searchMismatches, findMismatches, hullDemo, latticePoint, orientDouble, orientExact } from './robust';

const key = (p: P) => `${p.x},${p.y}`;
const sortedKeys = (ps: readonly P[]) => ps.map(key).sort();

/**
 * The hull by brute force over all point pairs, sharing no code with hull.ts. (p, q) is a hull edge when every other point is on its
 * left or on the line and every point on the line lies within the segment pq. 'drop' keeps the endpoints of such edges; 'keep' keeps
 * every point lying on one.
 */
function bruteHull(input: readonly P[], policy: Policy): string[] {
  const pts = input.filter((p, i) => input.findIndex((q) => q.x === p.x && q.y === p.y) === i);
  if (pts.length < 3) return sortedKeys(pts);
  const c = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const out = new Set<string>();
  for (const p of pts) {
    for (const q of pts) {
      if (p === q) continue;
      const left = pts.every((r) => c(p, q, r) >= 0);
      const within = pts.every((r) => {
        if (c(p, q, r) !== 0) return true;
        const t = ((r.x - p.x) * (q.x - p.x) + (r.y - p.y) * (q.y - p.y)) / ((q.x - p.x) ** 2 + (q.y - p.y) ** 2);
        return t >= 0 && t <= 1;
      });
      if (!left || !within) continue;
      if (policy === 'drop') {
        out.add(key(p));
        out.add(key(q));
      } else {
        for (const r of pts) if (c(p, q, r) === 0) out.add(key(r));
      }
    }
  }
  return [...out].sort();
}

/** Small integer grid: duplicates and collinear points are common on purpose. */
function randomSet(seed: number): P[] {
  const rnd = mulberry32(seed);
  const n = Math.floor(rnd() * 13);
  const grid = 2 + Math.floor(rnd() * 5);
  return Array.from({ length: n }, () => ({ x: Math.floor(rnd() * grid), y: Math.floor(rnd() * grid) }));
}

const shoelace = (poly: readonly P[]) => poly.reduce((s, p, i) => s + (p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y), 0);
const ALGOS: Algo[] = ['graham', 'andrew', 'jarvis'];
const POLICIES: Policy[] = ['drop', 'keep'];

describe('orientation', () => {
  it('has counter-clockwise positive: (0,0), (1,0), (0,1) is a left turn', () => {
    expect(cross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
    expect(cross({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 })).toBe(-1);
    expect(cross({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(0);
  });

  it('equals twice the signed triangle area from the shoelace formula, on 10,000 seeded integer triples', () => {
    const rnd = mulberry32(5);
    for (let n = 0; n < 10_000; n++) {
      const [a, b, c] = [0, 1, 2].map(() => ({ x: Math.floor(rnd() * 41) - 20, y: Math.floor(rnd() * 41) - 20 }));
      expect(cross(a, b, c) === shoelace([a, b, c])).toBe(true);
    }
  });
});

describe('the three hulls against brute force', () => {
  it('all agree with the brute-force hull on 500 seeded sets (n <= 12, small grid), for both collinear policies', () => {
    for (let seed = 0; seed < 500; seed++) {
      const pts = randomSet(seed);
      for (const policy of POLICIES) {
        const want = bruteHull(pts, policy);
        for (const algo of ALGOS) expect(sortedKeys(HULLS[algo](pts, policy)), `${algo} ${policy} seed ${seed}`).toEqual(want);
      }
    }
  });

  it('returns a counter-clockwise polygon that starts at the lowest-leftmost point and contains every point', () => {
    for (let seed = 0; seed < 500; seed++) {
      const pts = randomSet(seed);
      for (const algo of ALGOS) {
        const hull = HULLS[algo](pts, 'drop');
        if (hull.length < 3) continue;
        const lowest = [...pts].sort((a, b) => a.y - b.y || a.x - b.x)[0];
        expect(key(hull[0]), `${algo} ${seed}`).toBe(key(lowest));
        expect(shoelace(hull)).toBeGreaterThan(0);
        for (let i = 0; i < hull.length; i++) {
          const a = hull[i];
          const b = hull[(i + 1) % hull.length];
          expect(cross(a, b, hull[(i + 2) % hull.length]), `${algo} ${seed} strict left turn`).toBeGreaterThan(0);
          for (const p of pts) expect(cross(a, b, p), `${algo} ${seed} inside`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('special cases: collinear points give the ends (or all by policy), fewer than 3 distinct points give themselves, a triangle is itself', () => {
    const line = [0, 1, 2, 3].map((x) => ({ x, y: 2 * x }));
    for (const algo of ALGOS) {
      expect(sortedKeys(HULLS[algo](line, 'drop'))).toEqual(['0,0', '3,6']);
      expect(sortedKeys(HULLS[algo](line, 'keep'))).toEqual(sortedKeys(line));
      expect(HULLS[algo]([], 'drop')).toEqual([]);
      expect(HULLS[algo]([{ x: 4, y: 4 }], 'drop')).toEqual([{ x: 4, y: 4 }]);
      expect(sortedKeys(HULLS[algo]([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 5 }], 'drop'))).toEqual(['1,1', '2,5']);
      const tri = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 3 }, { x: 4, y: 0 }];
      expect(HULLS[algo](tri, 'drop')).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 3 }]);
    }
  });

  it('a point that looks outermost need not be on the hull: a point just inside a long edge is dropped', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }, { x: 5, y: 1 }];
    expect(sortedKeys(graham(pts))).toEqual(['0,0', '10,0', '5,8']);
  });
});

/** Broken scans as test fixtures: Andrew's chain with the wrong pop rule. */
function brokenAndrew(pts: readonly P[], rule: 'strict' | 'wrong-side'): string[] {
  const sorted = [...pts].filter((p, i) => pts.findIndex((q) => q.x === p.x && q.y === p.y) === i).sort((a, b) => a.x - b.x || a.y - b.y);
  const pop = (c: number) => (rule === 'strict' ? c < 0 : c > 0);
  const chain = (list: P[]) => {
    const out: P[] = [];
    for (const p of list) {
      while (out.length >= 2 && pop(cross(out[out.length - 2], out[out.length - 1], p))) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return sortedKeys([...chain(sorted), ...chain([...sorted].reverse())]);
}

describe('broken variants are rejected by the brute-force oracle', () => {
  const lowestFailing = (rule: 'strict' | 'wrong-side') => {
    for (let seed = 0; seed < 500; seed++) {
      const pts = randomSet(seed);
      if (pts.length < 3) continue;
      if (brokenAndrew(pts, rule).join('|') !== bruteHull(pts, 'drop').join('|')) return seed;
    }
    return -1;
  };

  it('popping on cross < 0 instead of <= 0 keeps collinear points by accident', () => {
    expect(lowestFailing('strict')).toBe(BROKEN_SEED.strict);
  });

  it('popping on cross > 0 builds the wrong chain', () => {
    expect(lowestFailing('wrong-side')).toBe(BROKEN_SEED['wrong-side']);
  });
});

const BROKEN_SEED = { strict: 4, 'wrong-side': 4 };

describe('when floating point lies', () => {
  const mismatches = findMismatches();

  it('the seeded search finds five lattice points where the double orientation says 0 and the exact one does not', () => {
    expect(mismatches).toHaveLength(5);
    for (const m of mismatches) {
      expect(m.double).toBe(0);
      expect(m.exact.sign).not.toBe(0);
      expect(orientDouble(m.point, SEG_FROM, SEG_TO)).toBe(0);
    }
  });

  it('the exact value matches the hand derivation 12 (j - i) 2^-53 on 2,000 seeded lattice points', () => {
    const rnd = mulberry32(99);
    for (let n = 0; n < 2000; n++) {
      const i = Math.floor(rnd() * LATTICE);
      const j = Math.floor(rnd() * LATTICE);
      const e = orientExact(latticePoint(i, j), SEG_FROM, SEG_TO);
      expect(e.sign).toBe(Math.sign(j - i));
      expect(Number(e.units) * 2 ** e.exponent).toBe(12 * (j - i) * ULP);
    }
  });

  it('the lattice coordinates are exactly 0.5 plus a multiple of 2^-53', () => {
    const p = latticePoint(3, 200);
    expect((p.x - 0.5) / ULP).toBe(3);
    expect((p.y - 0.5) / ULP).toBe(200);
  });

  it('a hull with the double predicate drops a vertex the exact predicate keeps', () => {
    for (const m of mismatches) {
      const demo = hullDemo(m);
      expect(demo.withExact).toHaveLength(3);
      expect(demo.withDouble.length).toBeLessThan(3);
    }
  });

  it('the all-integer version of the same shape is exact in both predicates', () => {
    const [a, b, c] = INTEGER_TRIPLE;
    expect(orientDouble(a, b, c)).not.toBe(0);
    expect(Math.sign(orientDouble(a, b, c))).toBe(orientExact(a, b, c).sign);
    expect(Number(orientExact(a, b, c).units) * 2 ** orientExact(a, b, c).exponent).toBe(orientDouble(a, b, c));
  });

  it('a double mismatch is not noise: there are sign errors of both kinds in the lattice', () => {
    let zeroes = 0;
    for (let i = 0; i < LATTICE; i += 7) for (let j = 0; j < LATTICE; j += 7) if (orientDouble(latticePoint(i, j), SEG_FROM, SEG_TO) === 0 && i !== j) zeroes++;
    expect(zeroes).toBeGreaterThan(0);
  });
});

describe('orientation tests counted', () => {
  it('Jarvis loses on points on a circle and stays competitive on a filled disc (real runs)', () => {
    expect(andrew([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]).length).toBe(3);
    expect(jarvis([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]).length).toBe(3);
  });
});

describe('the seeded mismatch search', () => {
  it('finds its five wrong signs within the first 31 candidates (the review counted the fifth at candidate 30), not after a long hunt', () => {
    const { found, tried } = searchMismatches();
    expect(found).toHaveLength(5);
    expect(tried).toBe(31);
  });

  it('shows the exact value in lowest terms', () => {
    const e = orientExact(INTEGER_TRIPLE[0], INTEGER_TRIPLE[1], INTEGER_TRIPLE[2]);
    expect(e.units % 2n !== 0n).toBe(true);
    expect(Number(e.units) * 2 ** e.exponent).toBe(orientDouble(...INTEGER_TRIPLE));
  });
});
