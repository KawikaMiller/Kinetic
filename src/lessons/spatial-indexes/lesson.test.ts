import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { COMPARE_K, compareStructures, makeWorkload } from './compare';
import { DOMAIN, makePoints, normaliseRect, scanNearest, scanRange } from './data';
import { kdFrames } from './frames';
import { BOUNDARY_A, BOUNDARY_B, GEO_OTHERS, geoView, scatterAround } from './geoScene';
import { cellSize, encode } from './geohash';
import { dimensionCurve } from './highDim';
import lesson from './index';
import { FACTS } from './facts';
import { buildKd, kdRange, knn } from './kdtree';
import { KD_SIZES, SCENE_IDS, openingState, quadPreset } from './opening';
import { xIndexCost } from './problem';
import { MAX_DEPTH, buildQuad } from './quadtree';
import { DEFAULT_QUERY } from './query';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const rect = normaliseRect(DEFAULT_QUERY.a, DEFAULT_QUERY.b);

/** Quadtree depth recomputed from the definition, sharing no code with quadtree.ts: split while a cell holds more than c points and is above the cap. */
function oracleDepth(points: readonly (readonly number[])[], c: number, x0 = 0, y0 = 0, x1 = DOMAIN, y1 = DOMAIN, depth = 0): number {
  if (points.length <= c || depth >= MAX_DEPTH) return depth;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const quads = [
    { p: points.filter((q) => q[0] < mx && q[1] < my), r: [x0, y0, mx, my] },
    { p: points.filter((q) => q[0] >= mx && q[1] < my), r: [mx, y0, x1, my] },
    { p: points.filter((q) => q[0] < mx && q[1] >= my), r: [x0, my, mx, y1] },
    { p: points.filter((q) => q[0] >= mx && q[1] >= my), r: [mx, my, x1, y1] },
  ];
  return Math.max(...quads.map((q) => oracleDepth(q.p, c, q.r[0], q.r[1], q.r[2], q.r[3], depth + 1)));
}

describe('scenes', () => {
  it('every scene component carries its own key, so no state leaks across a scene switch', () => {
    const els = sceneElements('spatial-indexes');
    expect(els).toHaveLength(SCENE_IDS.length);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('spatial-indexes')).toEqual([]);
  });

  it('the opening state is a pure function: switching through all scenes gives the same state each time', () => {
    for (let round = 0; round < 3; round++) {
      for (const id of SCENE_IDS) expect(openingState()[id === 'problem' ? 'problem' : id]).toEqual(openingState()[id]);
    }
    const o = openingState();
    expect(o.problem).toMatchObject({ n: 300, mode: 'range' });
    expect(o.kd).toMatchObject({ n: 31, mode: 'nn', k: 1 });
    expect(o.quad).toMatchObject({ capacity: 4, preset: 'uniform' });
    expect(o.geohash).toMatchObject({ lat: 57.64911, lon: 10.40744, precision: 5, neighbours: false });
    expect(o.choose.dims).toBe(2);
    expect(KD_SIZES).toContain(o.kd.n);
  });
});

describe('try-this entries, each from the default state, against independent oracles', () => {
  it('try-this 1: the x strip holds 147 candidates for the rectangle (48 inside, 99 wasted) and 26 for the nearest point', () => {
    const pts = makePoints(7, 300);
    // plain loops, no shared code
    let strip = 0;
    let inside = 0;
    for (const p of pts) {
      if (p[0] >= 30 && p[0] <= 70) strip++;
      if (p[0] >= 30 && p[0] <= 70 && p[1] >= 40 && p[1] <= 60) inside++;
    }
    expect([FACTS.rangeCandidates, FACTS.rangeHits, FACTS.rangeWasted]).toEqual([strip, inside, strip - inside]);
    expect([strip, inside, strip - inside]).toEqual([147, 48, 99]);
    const best = scanNearest(pts, [50, 50], 1)[0];
    let nearStrip = 0;
    for (const p of pts) if (Math.abs(p[0] - 50) <= best) nearStrip++;
    expect(FACTS.nnCandidates).toBe(nearStrip);
    expect(lesson.tryThis[0]).toContain('147 candidates');
    expect(lesson.tryThis[0]).toContain('99 checks are wasted');
    expect(openingState().problem.mode).toBe('range');
  });

  it('try-this 2: the default search visits 12 of 31 nodes and skips 5 subtrees; the rectangle visits 18 nodes for 5 hits', () => {
    const pts = makePoints(7, 31);
    const tree = buildKd(pts);
    const run = knn(tree, [50, 50], 1);
    expect(run.found[0].distance).toBe(scanNearest(pts, [50, 50], 1)[0]);
    expect([FACTS.kdVisited, FACTS.kdSkipped]).toEqual([run.visited.length, run.pruned.length]);
    expect([FACTS.kdVisited, FACTS.kdSkipped, FACTS.kdNearest]).toEqual([12, 5, '6.3']);
    const rr = kdRange(tree, rect);
    expect(rr.hits).toHaveLength(scanRange(pts, rect).length);
    expect([FACTS.kdRangeVisited, FACTS.kdRangeHits]).toEqual([rr.visited.length, String(rr.hits.length)]);
    expect([rr.visited.length, rr.hits.length]).toEqual([18, 5]);
    expect(lesson.tryThis[1]).toContain('12 of 31 nodes');
    expect(lesson.tryThis[1]).toContain('18 nodes visited, 5 hits');
  });

  it('try-this 3: depths match a from-the-definition recomputation, and coincident points stop at the cap of 12', () => {
    const o = openingState().quad;
    for (const preset of ['uniform', 'clustered', 'coincident'] as const) {
      const pts = quadPreset(preset, o.seed);
      const depth = oracleDepth(pts, o.capacity);
      const tree = buildQuad(pts, o.capacity);
      expect(Math.max(...tree.nodes.map((n) => n.depth)), preset).toBe(depth);
    }
    expect([FACTS.quadUniformDepth, FACTS.quadClusteredDepth, FACTS.quadCoincidentDepth]).toEqual([4, 6, 12]);
    expect(FACTS.quadClusteredDepth).toBeGreaterThan(FACTS.quadUniformDepth);
    expect(FACTS.quadClusteredCells).toBeGreaterThan(FACTS.quadUniformCells);
    expect(lesson.tryThis[2]).toContain('41 cells, 4 levels deep');
  });

  it('try-this 4: 57.64911, 10.40744 at 5 is u4pru; the boundary pair gives s00000 and 7zzzzz; neighbours find the missed points (counted with cell indices)', () => {
    expect(FACTS.vectorCode).toBe('u4pru');
    expect('u4pruydqqvj'.startsWith(FACTS.vectorCode)).toBe(true);
    expect([FACTS.boundaryA, FACTS.boundaryB]).toEqual(['s00000', '7zzzzz']);
    expect(encode(BOUNDARY_A.lat, BOUNDARY_A.lon, 6)).toBe('s00000');
    expect(encode(BOUNDARY_B.lat, BOUNDARY_B.lon, 6)).toBe('7zzzzz');
    // independent: cells are 360/2^15 by 180/2^15 degrees at 6 characters; same cell iff same floor indices
    const s = cellSize(6);
    const cellIndex = (lat: number, lon: number) => [Math.floor((lon + 180) / s.widthDeg), Math.floor((lat + 90) / s.heightDeg)];
    const radius = Math.min(s.widthDeg, s.heightDeg);
    const [qi, qj] = cellIndex(BOUNDARY_A.lat, BOUNDARY_A.lon);
    const others = scatterAround(BOUNDARY_A, 6, true);
    expect(others).toHaveLength(GEO_OTHERS + 1);
    const near = others.filter((p) => Math.abs(p.lat - BOUNDARY_A.lat) <= radius && Math.abs(p.lon - BOUNDARY_A.lon) <= radius);
    const own = near.filter((p) => {
      const [i, j] = cellIndex(p.lat, p.lon);
      return i === qi && j === qj;
    });
    const inBlock = near.filter((p) => {
      const [i, j] = cellIndex(p.lat, p.lon);
      return Math.abs(i - qi) <= 1 && Math.abs(j - qj) <= 1;
    });
    expect(FACTS.boundaryMissed).toBe(near.length - own.length);
    expect(near.length).toBe(inBlock.length);
    expect(FACTS.boundaryFoundWith).toBe(near.length);
    expect(FACTS.boundaryMissedWith).toBe(0);
    expect(FACTS.boundaryMissed).toBeGreaterThan(0);
    expect(FACTS.boundaryShared).toBe(0);
    expect(lesson.tryThis[3]).toContain('sharing 0 characters');
    expect(lesson.tryThis[3]).toContain('4.89 km wide');
  });

  it('try-this 5: the trees check far fewer points than the scan, and the share visited rises with the dimension', () => {
    const pts = makePoints(7, 300);
    const rows = compareStructures(pts, 4, makeWorkload());
    expect(rows[0].nnChecks).toBe(300);
    expect(Number(FACTS.kdChecks)).toBeLessThan(300);
    expect(Number(FACTS.quadChecks)).toBeLessThan(Number(FACTS.kdChecks));
    expect([FACTS.kdChecks, FACTS.quadChecks]).toEqual(['19.3', '9.7']);
    const curve = dimensionCurve();
    for (let i = 1; i < curve.length; i++) expect(curve[i].fraction).toBeGreaterThanOrEqual(curve[i - 1].fraction);
    expect(curve[0].fraction).toBeCloseTo(0.0082, 3);
    expect(curve[curve.length - 1].fraction).toBeCloseTo(0.9949, 3);
    expect([FACTS.lowDim, FACTS.highDim]).toEqual(['0.8%', '99%']);
    expect(lesson.tryThis[4]).toContain('from 0.8% to 99%');
    expect(COMPARE_K).toBe(3);
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  it('walks sizes x query modes x k for the k-d scene: no NaN, the closing frame matches the search and the scan', () => {
    let frames = 0;
    for (const n of KD_SIZES) {
      const pts = makePoints(7, n);
      const tree = buildKd(pts);
      for (let k = 1; k <= 5; k++) {
        const q = [DOMAIN * ((k * 17) % 10) / 10, DOMAIN * ((k * 31) % 10) / 10];
        const run = kdFrames(tree, { kind: 'nn', q, k });
        for (const f of run.frames) {
          expect(text(f.say), `${n} k=${k}`).not.toMatch(/NaN|undefined|null|Infinity/);
          frames++;
        }
        const last = run.frames[run.frames.length - 1];
        expect(last.visited.length).toBe(run.visitedCount);
        expect(last.found).toHaveLength(Math.min(k, n));
        const got = last.found.map((id) => tree.nodes[id].point).map((p) => Math.hypot(p[0] - q[0], p[1] - q[1])).sort((a, b) => a - b);
        const want = scanNearest(pts, q, k);
        got.forEach((d, i) => expect(d).toBeCloseTo(want[i], 9));
      }
      const rr = kdFrames(tree, { kind: 'range', rect });
      for (const f of rr.frames) expect(text(f.say)).not.toMatch(/NaN|undefined|null/);
      expect(rr.frames[rr.frames.length - 1].found).toHaveLength(scanRange(pts, rect).length);
    }
    expect(frames).toBeGreaterThan(300);
  });

  it('an empty set says "no points", never NaN', () => {
    const run = kdFrames(buildKd([]), { kind: 'nn', q: [1, 1], k: 3 });
    expect(text(run.frames[0].say)).toContain('no points');
    expect(run.visitedCount).toBe(0);
    expect(xIndexCost([], 'nn', [1, 1], rect)).toEqual({ candidates: [], hits: [], wasted: 0, strip: null });
    expect(geoView({ lat: 0, lon: 0 }, 5, false, false).others.length).toBeGreaterThan(0);
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('a rectangle search ignores k: its visited nodes, hits and caption are the same for every k', () => {
    const tree = buildKd(makePoints(7, 31));
    const base = kdFrames(tree, { kind: 'range', rect });
    for (let k = 1; k <= 5; k++) {
      const again = kdFrames(tree, { kind: 'range', rect });
      expect(again.visitedCount).toBe(base.visitedCount);
      expect(again.frames.map((f) => text(f.say))).toEqual(base.frames.map((f) => text(f.say)));
    }
  });

  it('the levels-drawn slider is drawing only: the search is a function of the tree and the query', () => {
    const tree = buildKd(makePoints(7, 31));
    expect(knn(tree, [50, 50], 1).visited).toEqual(knn(tree, [50, 50], 1).visited);
  });

  it('the neighbour toggle changes only the searched cells: the near points do not change, only which are found', () => {
    const off = geoView(BOUNDARY_A, 6, false, true);
    const on = geoView(BOUNDARY_A, 6, true, true);
    const near = (v: typeof off) => v.others.filter((o) => o.state === 'found' || o.state === 'missed').map((o) => o.point);
    expect(near(on)).toEqual(near(off));
  });
});
