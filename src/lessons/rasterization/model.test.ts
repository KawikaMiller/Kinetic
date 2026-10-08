import { describe, expect, it } from 'vitest';
import { mulberry32, type Rnd } from '../../core/random';
import { solve } from '../../core/vec';
import {
  COVERAGE_PRESET, DEPTH_PRESET, GRID_H, GRID_W, SHARED_PRESET, SLIVER_PRESET, TINY_PRESET, barycentric, boundingBox,
  TIE, coverage, depthAt, drawDepth, inBox, pixelKey, rasterize, sampleOffsets, sharedEdge, testPoint, wind, wrongPixels,
  type FillRule, type Tri, type Vertex,
} from './model';

// ── Independent references ──────────────────────────────────────────

/** Point exactly on the closed segment a–b (cross product zero, within its ends). */
function onSegment(a: Vertex, b: Vertex, px: number, py: number): boolean {
  const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
  if (cross !== 0) return false;
  return px >= Math.min(a.x, b.x) && px <= Math.max(a.x, b.x) && py >= Math.min(a.y, b.y) && py <= Math.max(a.y, b.y);
}

/** Crossing-number (ray casting) point-in-polygon: right for any point not on the boundary. */
function rayCast(poly: readonly Vertex[], px: number, py: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The top-left rule from its geometric definition, not from edge-function signs: a top edge is
 * horizontal with the third vertex below it; a left edge isn't horizontal and has the third vertex
 * to its right.
 */
function topOrLeftByGeometry(a: Vertex, b: Vertex, c: Vertex): boolean {
  if (a.y === b.y) return c.y > a.y;
  const xOnLine = a.x + ((c.y - a.y) * (b.x - a.x)) / (b.y - a.y);
  return c.x > xOnLine;
}

/** Reference coverage of one point under a rule, from ray casting and the geometric definition. */
function referenceCovers(t: Tri, px: number, py: number, rule: FillRule): boolean {
  const edges = [[0, 1, 2], [1, 2, 0], [2, 0, 1]] as const;
  const on = edges.filter(([i, j]) => onSegment(t[i], t[j], px, py));
  if (on.length === 0) return rayCast(t, px, py);
  if (rule === 'inclusive') return true;
  if (rule === 'exclusive') return false;
  return on.every(([i, j, k]) => topOrLeftByGeometry(t[i], t[j], t[k]));
}

const quarter = (rnd: Rnd, max: number) => Math.round(rnd() * max * 4) / 4;
const half = (rnd: Rnd, max: number) => Math.round(rnd() * max * 2) / 2;
const randomTri = (rnd: Rnd, coord = quarter): Tri => [
  { x: coord(rnd, GRID_W), y: coord(rnd, GRID_H) },
  { x: coord(rnd, GRID_W), y: coord(rnd, GRID_H) },
  { x: coord(rnd, GRID_W), y: coord(rnd, GRID_H) },
];

const PRESETS: Tri[] = [COVERAGE_PRESET, SLIVER_PRESET, TINY_PRESET, ...DEPTH_PRESET,
  [SHARED_PRESET.s0, SHARED_PRESET.s1, SHARED_PRESET.pa], [SHARED_PRESET.s1, SHARED_PRESET.s0, SHARED_PRESET.pb]];

// ── Coverage ────────────────────────────────────────────────────────

describe('edge-function coverage', () => {
  it('matches the reference point-in-triangle test for every pixel of every preset, under all three rules', () => {
    for (const input of PRESETS) {
      const t = wind(input)!;
      for (const rule of ['inclusive', 'exclusive', 'topLeft'] as const) {
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            expect(testPoint(t, x + 0.5, y + 0.5, rule).inside, `${rule} (${x}, ${y})`).toBe(referenceCovers(t, x + 0.5, y + 0.5, rule));
          }
        }
      }
    }
  });

  it('matches the reference on 300 seeded random triangles, including ones with centres on their edges', () => {
    const rnd = mulberry32(7);
    let onEdge = 0;
    for (let n = 0; n < 300; n++) {
      const t = wind(randomTri(rnd, n % 2 ? quarter : half));
      if (!t) continue;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const got = testPoint(t, x + 0.5, y + 0.5, 'topLeft');
          if (got.w.includes(0)) onEdge++;
          expect(got.inside).toBe(referenceCovers(t, x + 0.5, y + 0.5, 'topLeft'));
        }
      }
    }
    expect(onEdge).toBeGreaterThan(100); // the boundary cases really were exercised
  });

  it('gives the same pixels whichever way round the vertices are listed', () => {
    const rnd = mulberry32(11);
    for (let n = 0; n < 100; n++) {
      const [a, b, c] = randomTri(rnd);
      const keys = (t: Tri) => rasterize(t).tested.filter((p) => p.cover).map((p) => pixelKey(p.x, p.y)).join();
      expect(keys([a, c, b])).toBe(keys([a, b, c]));
      expect(keys([b, c, a])).toBe(keys([a, b, c]));
    }
  });

  it('never covers a pixel outside the bounding box, and tests only the box', () => {
    const rnd = mulberry32(3);
    for (let n = 0; n < 200; n++) {
      const input = randomTri(rnd);
      const t = wind(input);
      for (const samples of [1, 2, 4]) {
        const r = rasterize(input, samples);
        const box = t ? boundingBox(t, samples) : null;
        expect(r.tested.every((p) => inBox(box, p.x, p.y))).toBe(true);
        if (box) expect(r.tested).toHaveLength((box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1));
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            if (inBox(box, x, y) || !t) continue;
            expect(coverage(t, x, y, samples), `pixel (${x}, ${y}) outside the box`).toBe(0);
          }
        }
      }
    }
  });

  it('a zero-area triangle covers nothing and tests nothing', () => {
    const r = rasterize([{ x: 2, y: 2 }, { x: 6, y: 6 }, { x: 10, y: 10 }]);
    expect(r.tri).toBeNull();
    expect(r.tested).toHaveLength(0);
  });

  it('the tiny preset touches four pixels but covers no centre, and its box is empty', () => {
    const t = wind(TINY_PRESET)!;
    expect(rasterize(TINY_PRESET).tested).toHaveLength(0);
    // Geometric overlap, from a fine 64 × 64 ray-cast sampling of each pixel square.
    const fine = sampleOffsets(64);
    const overlaps = (x: number, y: number) => fine.some((oy) => fine.some((ox) => rayCast(t, x + ox, y + oy)));
    expect([[10, 6], [11, 6], [10, 7], [11, 7]].every(([x, y]) => overlaps(x, y))).toBe(true);
    // 4 × 4 samples per pixel catch only the two upper pixels: the lower tip is too thin for them.
    expect([[10, 6], [11, 6], [10, 7], [11, 7]].map(([x, y]) => coverage(t, x, y, 4) > 0)).toEqual([true, true, false, false]);
  });
});

// ── Shared edges ────────────────────────────────────────────────────

describe('shared edges and the fill rule', () => {
  /** Random pairs with half-pixel vertices, so shared edges run through pixel centres often. */
  function* pairs(count: number) {
    const rnd = mulberry32(2024);
    let made = 0;
    while (made < count) {
      const [s0, s1, pa] = randomTri(rnd, half);
      const pb = { x: half(rnd, GRID_W), y: half(rnd, GRID_H) };
      const side = (p: Vertex) => Math.sign((s1.x - s0.x) * (p.y - s0.y) - (s1.y - s0.y) * (p.x - s0.x));
      if (side(pa) === 0 || side(pb) === 0 || side(pa) === side(pb)) continue;
      made++;
      yield { s0, s1, pa, pb };
    }
  }

  it('the top-left rule gives zero overdraw and zero gaps across 500 seeded pairs', () => {
    let centresOnSharedEdges = 0;
    for (const { s0, s1, pa, pb } of pairs(500)) {
      const r = sharedEdge(s0, s1, pa, pb, 'topLeft');
      expect(r.proper).toBe(true);
      expect(r.overdraw).toHaveLength(0);
      expect(r.gaps).toHaveLength(0);
      // Independently: every centre strictly inside the union, or on the open shared edge, is covered exactly once.
      const a: Tri = [s0, s1, pa];
      const b: Tri = [s1, s0, pb];
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const k = pixelKey(x, y);
          const count = Number(r.a.has(k)) + Number(r.b.has(k));
          const onShared = onSegment(s0, s1, px, py) && !(px === s0.x && py === s0.y) && !(px === s1.x && py === s1.y);
          const onOuter = [[s0, pa], [s1, pa], [s0, pb], [s1, pb]].some(([p, q]) => onSegment(p, q, px, py));
          if (onShared) centresOnSharedEdges++;
          if (onShared && !onOuter) expect(count).toBe(1);
          else if (!onOuter && (rayCast(a, px, py) || rayCast(b, px, py))) expect(count).toBe(1);
          else expect(count).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(centresOnSharedEdges).toBeGreaterThan(200);
  });

  it('without the rule, w ≥ 0 double-covers and w > 0 leaves gaps on the preset', () => {
    const { s0, s1, pa, pb } = SHARED_PRESET;
    const inclusive = sharedEdge(s0, s1, pa, pb, 'inclusive');
    const exclusive = sharedEdge(s0, s1, pa, pb, 'exclusive');
    const fair = sharedEdge(s0, s1, pa, pb, 'topLeft');
    // Seven centres sit on the shared edge: (2.5, 13.5), (5.5, 11.5) … (20.5, 1.5). Two are its ends.
    expect(inclusive.overdraw.length).toBeGreaterThanOrEqual(5);
    expect(exclusive.gaps).toHaveLength(5);
    expect(exclusive.overdraw).toHaveLength(0);
    expect(fair.overdraw).toHaveLength(0);
    expect(fair.gaps).toHaveLength(0);
  });
});

// ── Barycentric, supersampling, depth ───────────────────────────────

describe('barycentric weights and depth', () => {
  it('sum to 1 everywhere and reproduce the point', () => {
    const rnd = mulberry32(5);
    for (let n = 0; n < 200; n++) {
      const t = wind(randomTri(rnd));
      if (!t) continue;
      const px = rnd() * GRID_W;
      const py = rnd() * GRID_H;
      const [l0, l1, l2] = barycentric(t, px, py);
      expect(l0 + l1 + l2).toBeCloseTo(1, 12);
      expect(l0 * t[0].x + l1 * t[1].x + l2 * t[2].x).toBeCloseTo(px, 9);
      expect(l0 * t[0].y + l1 * t[1].y + l2 * t[2].y).toBeCloseTo(py, 9);
    }
  });

  it('interpolated depth equals each vertex z at that vertex, and the mean at the centroid', () => {
    const t = wind(DEPTH_PRESET[0])!;
    for (const vx of t) expect(depthAt(t, vx.x, vx.y)).toBeCloseTo(vx.z!, 12);
    const cx = (t[0].x + t[1].x + t[2].x) / 3;
    const cy = (t[0].y + t[1].y + t[2].y) / 3;
    expect(depthAt(t, cx, cy)).toBeCloseTo((t[0].z! + t[1].z! + t[2].z!) / 3, 12);
  });
});

describe('supersampled coverage', () => {
  it('equals the share of sample points the reference test puts inside', () => {
    const rnd = mulberry32(9);
    for (let n = 0; n < 60; n++) {
      const t = wind(randomTri(rnd));
      if (!t) continue;
      for (const samples of [2, 4]) {
        const offs = sampleOffsets(samples);
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            let hits = 0;
            for (const oy of offs) for (const ox of offs) if (referenceCovers(t, x + ox, y + oy, 'topLeft')) hits++;
            expect(coverage(t, x, y, samples)).toBe(hits / (samples * samples));
          }
        }
      }
    }
  });

  it('one sample per pixel is the centre test', () => {
    expect(sampleOffsets(1)).toEqual([0.5]);
    expect(sampleOffsets(4)).toEqual([0.125, 0.375, 0.625, 0.875]);
  });
});

describe('z-buffer', () => {
  /**
   * Independent reference: which triangles cover the centre (ray casting + the geometric top-left
   * rule) and each one's depth from the plane z = a·x + b·y + c through its corners (solved with
   * core/vec), not from edge functions. Returns the nearest index, -1 for none, or null for a tie.
   */
  function referenceNearest(tris: readonly Tri[], px: number, py: number): number | null {
    const hits = tris.flatMap((t, i) => {
      const w = wind(t);
      if (!w || !referenceCovers(w, px, py, 'topLeft')) return [];
      const [a, b, c] = solve(t.map((v) => [v.x, v.y, 1]), t.map((v) => v.z ?? 0))!;
      return [{ i, z: a * px + b * py + c }];
    });
    if (!hits.length) return -1;
    const zMin = Math.min(...hits.map((h) => h.z));
    const at = hits.filter((h) => Math.abs(h.z - zMin) < 1e-9);
    return at.length > 1 ? null : at[0].i;
  }

  it('with the z-buffer, every draw order shows the reference nearest triangle (150 random triples)', () => {
    const rnd = mulberry32(17);
    const z = () => Math.round(rnd() * 1000) / 1000;
    let checked = 0;
    let painterWrong = 0;
    for (let n = 0; n < 150; n++) {
      const tris = [0, 1, 2].map(() => randomTri(rnd).map((p) => ({ ...p, z: z() })) as unknown as Tri);
      const pics = [[0, 1, 2], [2, 1, 0], [1, 2, 0]].map((o) => drawDepth(tris, o, true));
      const painter = drawDepth(tris, [0, 1, 2], false);
      for (let k = 0; k < GRID_W * GRID_H; k++) {
        const ref = referenceNearest(tris, (k % GRID_W) + 0.5, Math.floor(k / GRID_W) + 0.5);
        if (ref === null) continue; // exact ties are order-dependent in a real z-buffer too (z-fighting)
        for (const pic of pics) expect(pic[k].shown).toBe(ref);
        expect(pics[0][k].nearest).toBe(ref); // the model's own "right answer" agrees with the reference
        if (painter[k].shown !== ref) painterWrong++;
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10000);
    expect(painterWrong).toBeGreaterThan(0); // the reference can tell a wrong picture apart
  });

  it('the depth preset has no ties, each triangle is nearer over part of the overlap, and only the z-buffer gets it all right', () => {
    const refs = Array.from({ length: GRID_W * GRID_H }, (_, k) => referenceNearest(DEPTH_PRESET, (k % GRID_W) + 0.5, Math.floor(k / GRID_W) + 0.5));
    expect(refs.includes(null)).toBe(false);
    const both = (k: number) => DEPTH_PRESET.every((t) => referenceCovers(wind(t)!, (k % GRID_W) + 0.5, Math.floor(k / GRID_W) + 0.5, 'topLeft'));
    expect(new Set(refs.filter((_, k) => both(k)))).toEqual(new Set([0, 1]));
    const wrongVsRef = (o: number[], zb: boolean) => drawDepth(DEPTH_PRESET, o, zb).filter((p, k) => p.shown !== refs[k]).length;
    expect(wrongVsRef([0, 1], false)).toBeGreaterThan(0);
    expect(wrongVsRef([1, 0], false)).toBeGreaterThan(0);
    expect(wrongVsRef([0, 1], true)).toBe(0);
    expect(wrongVsRef([1, 0], true)).toBe(0);
    // and the model's own count agrees with the reference count
    expect(wrongPixels(drawDepth(DEPTH_PRESET, [0, 1], false))).toBe(wrongVsRef([0, 1], false));
  });

  it('exact ties are not counted as wrong', () => {
    const a: Tri = [{ x: 2, y: 2, z: 0.5 }, { x: 20, y: 2, z: 0.5 }, { x: 2, y: 14, z: 0.5 }];
    const px = drawDepth([a, a], [0, 1], false);
    expect(px.some((p) => p.nearest === TIE)).toBe(true);
    expect(wrongPixels(px)).toBe(0);
  });
});
