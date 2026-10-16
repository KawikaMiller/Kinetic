import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { compareStructures, makeWorkload } from './compare';
import { DOMAIN, makePoints, normaliseRect, parseCount, scanNearest, scanRange, type Pt } from './data';
import {
  BASE32, KM_PER_DEGREE, bitSteps, cellSize, decodeBounds, decodeCentre, encode, inBounds, isNear, neighbours, nearRadiusDeg,
  parseLatitude, parseLongitude, searchCells, type GeoPoint,
} from './geohash';
import { HD_MAX_DIM, HD_MIN_DIM, dimensionCurve, uniformPoints, visitedFraction } from './highDim';
import { buildKd, kdInvariantViolations, kdRange, knn, splitSegments } from './kdtree';
import { MAX_DEPTH, buildQuad, createQuadTree, insertPoint, leaves, pointCount, quadInvariantViolations, quadKnn, quadRange, treeDepth } from './quadtree';

/** The lowest seed where the wrong-axis search returns a wrong neighbour (found by the BROKEN test below). */
const BROKEN_KD_SEED = 10;
const BOUNDS ={ x0: 0, y0: 0, x1: DOMAIN, y1: DOMAIN };

/** Small integer-grid point sets: duplicates and collinear runs are common on purpose. */
function degenerateSet(seed: number): Pt[] {
  const rnd = mulberry32(seed);
  const n = Math.floor(rnd() * 60);
  const grid = 2 + Math.floor(rnd() * 6);
  const mode = seed % 3;
  return Array.from({ length: n }, () => {
    const x = Math.floor(rnd() * grid);
    const y = Math.floor(rnd() * grid);
    return mode === 0 ? [x, 7] : mode === 1 ? [x, x] : [x, y];
  });
}
const sortedByXY = (ps: Pt[]) => [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((p) => p.join(','));

describe('k-d tree against a linear scan', () => {
  it('k nearest distances equal the scan on 500 seeded sets with duplicates and collinear points, k = 1..5', () => {
    for (let seed = 0; seed < 500; seed++) {
      const pts = degenerateSet(seed);
      const tree = buildKd(pts);
      const rnd = mulberry32(seed + 9000);
      const q: Pt = [rnd() * 8 - 1, rnd() * 8 - 1];
      const k = 1 + (seed % 5);
      const got = knn(tree, q, k).found.map((f) => f.distance);
      expect(got, `seed ${seed}`).toEqual(scanNearest(pts, q, k));
    }
  });

  it('range hits equal the scan on 500 seeded sets, and a rectangle dragged inside-out is normalised first', () => {
    for (let seed = 0; seed < 500; seed++) {
      const pts = degenerateSet(seed);
      const tree = buildKd(pts);
      const rnd = mulberry32(seed + 4000);
      const r = normaliseRect([rnd() * 8, rnd() * 8], [rnd() * 8, rnd() * 8]);
      expect(sortedByXY(kdRange(tree, r).hits), `seed ${seed}`).toEqual(sortedByXY(scanRange(pts, r)));
    }
    expect(normaliseRect([9, 1], [2, 7])).toEqual({ x0: 2, y0: 1, x1: 9, y1: 7 });
  });

  it('visited-node counts equal an instrumented reference that walks with an explicit stack', () => {
    for (let seed = 0; seed < 200; seed++) {
      const pts = makePoints(seed, 5 + (seed % 60));
      const tree = buildKd(pts);
      const q: Pt = [(seed * 7.3) % DOMAIN, (seed * 3.1) % DOMAIN];
      const k = 1 + (seed % 5);
      type Item = { type: 'node'; id: number } | { type: 'far'; id: number; plane: number };
      const stack: Item[] = tree.root === null ? [] : [{ type: 'node', id: tree.root }];
      const best: number[] = [];
      let visited = 0;
      while (stack.length) {
        const it = stack.pop()!;
        if (it.type === 'far') {
          if (best.length < k || it.plane < best[best.length - 1]) stack.push({ type: 'node', id: it.id });
          continue;
        }
        const n = tree.nodes[it.id];
        visited++;
        const d = Math.hypot(n.point[0] - q[0], n.point[1] - q[1]);
        best.push(d);
        best.sort((a, b) => a - b);
        if (best.length > k) best.pop();
        const diff = q[n.axis] - n.point[n.axis];
        const near = diff < 0 ? n.left : n.right;
        const far = diff < 0 ? n.right : n.left;
        if (far !== null) stack.push({ type: 'far', id: far, plane: Math.abs(diff) });
        if (near !== null) stack.push({ type: 'node', id: near });
      }
      expect(knn(tree, q, k).visited.length, `seed ${seed}`).toBe(visited);
    }
  });

  it('every point is on the correct side of every ancestor split, with the axes alternating', () => {
    for (let seed = 0; seed < 200; seed++) {
      const tree = buildKd(degenerateSet(seed));
      expect(kdInvariantViolations(tree), `seed ${seed}`).toEqual([]);
    }
    const t = buildKd(makePoints(3, 300));
    expect(kdInvariantViolations(t)).toEqual([]);
    expect(t.nodes).toHaveLength(300);
    expect(t.nodes[t.root!].axis).toBe(0);
  });

  it('an empty set gives no points, not NaN', () => {
    const t = buildKd([]);
    expect(t.root).toBeNull();
    expect(knn(t, [1, 1], 3).found).toEqual([]);
    expect(kdRange(t, BOUNDS).hits).toEqual([]);
    expect(scanNearest([], [1, 1], 3)).toEqual([]);
  });

  it('draws one splitting segment per node, each on its own axis, inside the map', () => {
    const t = buildKd(makePoints(4, 40));
    const segs = splitSegments(t, BOUNDS);
    expect(segs).toHaveLength(40);
    for (const s of segs) for (const v of [...s.from, ...s.to]) expect(v >= 0 && v <= DOMAIN).toBe(true);
  });

  it('BROKEN: a search that measures the plane distance on the wrong axis returns a wrong neighbour on a seed the scan rejects', () => {
    let lowest = -1;
    for (let seed = 0; seed < 300 && lowest < 0; seed++) {
      const pts = makePoints(seed, 60);
      const tree = buildKd(pts);
      const q: Pt = [(seed * 13.7) % DOMAIN, (seed * 29.3) % DOMAIN];
      const bad = knn(tree, q, 1, 'wrong-axis').found.map((f) => f.distance);
      if (bad[0] !== scanNearest(pts, q, 1)[0]) lowest = seed;
    }
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(lowest).toBe(BROKEN_KD_SEED);
    const pts = makePoints(lowest, 60);
    const q: Pt = [(lowest * 13.7) % DOMAIN, (lowest * 29.3) % DOMAIN];
    expect(knn(buildKd(pts), q, 1).found[0].distance).toBe(scanNearest(pts, q, 1)[0]);
  });
});

describe('quadtree against a linear scan', () => {
  it('k nearest and range equal the scan for 500 seeded sets (duplicates, collinear), capacity 1..8', () => {
    for (let seed = 0; seed < 500; seed++) {
      const pts = degenerateSet(seed);
      const tree = buildQuad(pts.map((p) => [p[0] * 12, p[1] * 12]), 1 + (seed % 8));
      const scaled = pts.map((p) => [p[0] * 12, p[1] * 12]);
      const rnd = mulberry32(seed + 77);
      const q: Pt = [rnd() * DOMAIN, rnd() * DOMAIN];
      const k = 1 + (seed % 5);
      expect(quadKnn(tree, q, k).found, `seed ${seed}`).toEqual(scanNearest(scaled, q, k));
      const r = normaliseRect([rnd() * DOMAIN, rnd() * DOMAIN], [rnd() * DOMAIN, rnd() * DOMAIN]);
      expect(sortedByXY(quadRange(tree, r).hits), `seed ${seed}`).toEqual(sortedByXY(scanRange(scaled, r)));
    }
  });

  it('invariants hold after every insert: buckets hold at most c points unless at the depth cap, no point is lost', () => {
    for (const c of [1, 2, 3, 5, 8]) {
      const t = createQuadTree(c);
      const pts = makePoints(c, 120);
      pts.forEach((p, i) => {
        insertPoint(t, p);
        expect(quadInvariantViolations(t, i + 1), `c=${c} after ${i + 1}`).toEqual([]);
      });
    }
  });

  it('coincident points stop splitting at the named depth cap, with the whole pile in one bucket', () => {
    const t = createQuadTree(2);
    for (let i = 0; i < 6; i++) insertPoint(t, [33.3, 66.6]);
    expect(MAX_DEPTH).toBe(12);
    expect(treeDepth(t)).toBe(MAX_DEPTH);
    expect(Math.max(...leaves(t).map((n) => n.points.length))).toBe(6);
    expect(pointCount(t)).toBe(6);
    expect(quadInvariantViolations(t, 6)).toEqual([]);
  });

  it('clustered data makes the tree deeper than the same number of uniform points', () => {
    const uniform = Array.from({ length: 200 }, (_, i) => [((i * 37) % 100) + 0.5, ((i * 61) % 100) + 0.5]);
    const clustered = Array.from({ length: 200 }, (_, i) => [50 + (i % 14) * 0.05, 50 + Math.floor(i / 14) * 0.05]);
    expect(treeDepth(buildQuad(clustered, 4))).toBeGreaterThan(treeDepth(buildQuad(uniform, 4)));
  });
});

describe('geohash', () => {
  it('matches the commonly published vectors, which were also hand-bisected here', () => {
    expect(encode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encode(42.6, -5.6, 5)).toBe('ezs42');
    // hand-bisect 'ezs42': e=01101 z=11111 s=11000 4=00100 2=00010; longitude takes the even bits
    expect([...'ezs42'].map((c) => BASE32.indexOf(c).toString(2).padStart(5, '0')).join('')).toBe(
      bitSteps(42.6, -5.6, 5).map((s) => s.bit).join(''),
    );
  });

  it('the equator and prime meridian pair shares no prefix: s00000 and 7zzzzz', () => {
    expect(encode(0.0001, 0.0001, 6)).toBe('s00000');
    expect(encode(-0.0001, -0.0001, 6)).toBe('7zzzzz');
    expect('s00000'[0]).not.toBe('7zzzzz'[0]);
  });

  it('decode(encode(p)) lies inside the cell and within half a cell of p, for 500 seeded points at every precision', () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const lat = rnd() * 180 - 90;
      const lon = rnd() * 360 - 180;
      for (let p = 1; p <= 9; p++) {
        const h = encode(lat, lon, p);
        const b = decodeBounds(h);
        expect(inBounds(b, lat, lon)).toBe(true);
        const c = decodeCentre(h);
        const s = cellSize(p);
        expect(Math.abs(c.lat - lat)).toBeLessThanOrEqual(s.heightDeg / 2 + 1e-12);
        expect(Math.abs(c.lon - lon)).toBeLessThanOrEqual(s.widthDeg / 2 + 1e-12);
      }
    }
  });

  it('a shared prefix means the same enclosing cell: the code of a longer hash starts with the shorter hash', () => {
    const rnd = mulberry32(2);
    for (let i = 0; i < 300; i++) {
      const lat = rnd() * 180 - 90;
      const lon = rnd() * 360 - 180;
      for (let p = 1; p < 9; p++) expect(encode(lat, lon, 9).startsWith(encode(lat, lon, p))).toBe(true);
    }
  });

  it('cell sizes from bit counts match the published table (equator, 111.32 km per degree) for p = 1..9', () => {
    // [width km, height km] as published in the commonly cited geohash cell-size table, to the digits it prints.
    const published: [number, number][] = [[5009.4, 4992.6], [1252.3, 624.1], [156.5, 156], [39.1, 19.5], [4.9, 4.9], [1.2, 0.61], [0.153, 0.153], [0.038, 0.019], [0.0048, 0.0048]];
    for (let p = 1; p <= 9; p++) {
      const s = cellSize(p);
      const [w, h] = published[p - 1];
      expect(Math.abs(s.widthKm - w) / w, `width p=${p}`).toBeLessThan(0.03);
      expect(Math.abs(s.heightKm - h) / h, `height p=${p}`).toBeLessThan(0.03);
    }
    const bitsOf = (p: number) => 5 * p;
    for (let p = 1; p <= 9; p++) {
      expect(Math.ceil(bitsOf(p) / 2) + Math.floor(bitsOf(p) / 2)).toBe(bitsOf(p));
      expect(360 / 2 ** Math.ceil(bitsOf(p) / 2)).toBe(cellSize(p).widthDeg);
    }
    expect(KM_PER_DEGREE).toBeCloseTo(111.32, 2);
  });

  it('neighbours: eight distinct cells away from the poles, the right cells across the equator and meridian, none at a missing latitude', () => {
    const h = encode(0.0001, 0.0001, 6);
    const ns = neighbours(h);
    expect(ns).toHaveLength(8);
    expect(ns).toContain('7zzzzz');
    expect(new Set(ns).size).toBe(8);
    expect(neighbours(encode(89.9999, 10, 4))).toHaveLength(5);
    // wrap across the antimeridian
    const east = encode(10, 179.99, 5);
    expect(neighbours(east).some((n) => decodeCentre(n).lon < 0)).toBe(true);
  });

  it('the neighbour-cell search finds every point within the radius for 200 seeded boundary queries; the single-cell search misses some', () => {
    let singleMisses = 0;
    for (let seed = 0; seed < 200; seed++) {
      const rnd = mulberry32(seed);
      const precision = 3 + (seed % 5);
      const radius = nearRadiusDeg(precision);
      // queries hug the equator, the prime meridian or both
      const query: GeoPoint = { lat: (rnd() - 0.5) * radius * 0.4, lon: (rnd() - 0.5) * radius * 0.4 };
      const others: GeoPoint[] = Array.from({ length: 60 }, () => ({ lat: (rnd() - 0.5) * radius * 3, lon: (rnd() - 0.5) * radius * 3 }));
      const truth = others.filter((p) => isNear(p, query, radius));
      const withN = searchCells(others, query, precision, true);
      for (const t of truth) expect(withN, `seed ${seed}`).toContain(t);
      const single = searchCells(others, query, precision, false);
      if (truth.some((t) => !single.includes(t))) singleMisses++;
    }
    expect(singleMisses).toBeGreaterThan(0);
  });

  it('hostile coordinates: out of range is refused, not wrapped', () => {
    expect(parseLatitude('91').ok).toBe(false);
    expect(parseLatitude('-90.0001').ok).toBe(false);
    expect(parseLongitude('180.5').ok).toBe(false);
    expect(parseLongitude('abc').ok).toBe(false);
    expect(parseLatitude('')).toMatchObject({ ok: false });
    expect(parseLatitude('90')).toEqual({ ok: true, value: 90 });
    expect(parseLongitude('−180')).toEqual({ ok: true, value: -180 });
    expect(encode(90, 180, 5)).toBe(encode(90, 180, 5));
  });
});

describe('dimension curve', () => {
  it('searches in 2-D and 16-D agree with a scan, and the share of nodes visited at d = 16 is far above d = 2', () => {
    for (const d of [2, 8, 16]) {
      const pts = uniformPoints(3, 300, d);
      const tree = buildKd(pts, d);
      const qs = uniformPoints(4, 20, d);
      for (const q of qs) expect(knn(tree, q, 2).found.map((f) => f.distance)).toEqual(scanNearest(pts, q, 2));
    }
    const low = visitedFraction(HD_MIN_DIM);
    const high = visitedFraction(HD_MAX_DIM);
    expect(low.fraction).toBeLessThan(0.05);
    expect(high.fraction).toBeGreaterThan(0.5);
    expect(high.fraction).toBeLessThanOrEqual(1);
    expect(dimensionCurve()).toHaveLength(HD_MAX_DIM - HD_MIN_DIM + 1);
  });
});

describe('comparison table', () => {
  it('uses one unit per column and the scan row is the full count', () => {
    const pts = makePoints(7, 300);
    const rows = compareStructures(pts, 4, makeWorkload());
    const [scan, kd, quad] = rows;
    expect(scan.nnChecks).toBe(300);
    expect(scan.rangeChecks).toBe(300);
    expect(kd.treeNodes).toBe(300);
    expect(kd.build).toBeGreaterThan(300);
    expect(quad.build).toBeGreaterThan(0);
    for (const r of [kd, quad]) {
      expect(r.nnChecks).toBeLessThan(300);
      expect(r.rangeChecks).toBeLessThan(300);
    }
    expect(parseCount('500')).toEqual({ ok: true, value: 500 });
    expect(parseCount('501').ok).toBe(false);
    expect(parseCount('-1').ok).toBe(false);
    expect(parseCount('0')).toEqual({ ok: true, value: 0 });
  });
});
