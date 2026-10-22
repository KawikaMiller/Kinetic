import { describe, expect, it } from 'vitest';
import {
  DETOUR_MARGIN, EDGE_HIT_WIDTH, circlePositions, crossings, curveHits, detourBend, edgeHitArea, layeredLayout, layeredPositions, outlineDistance, routeEdge, spatialNext, type LayoutEdge,
} from './graphLayout';
import { mulberry32 } from './random';

/** The ci-pipelines DAG with two unit-test shards. */
const CI_IDS = ['install', 'lint', 'typecheck', 'build', 'unit-1', 'unit-2', 'integration', 'e2e', 'package', 'deploy'];
const CI_EDGES: LayoutEdge<string>[] = [
  ['install', 'lint'], ['install', 'typecheck'], ['install', 'build'], ['build', 'unit-1'], ['build', 'unit-2'],
  ['build', 'integration'], ['unit-1', 'e2e'], ['unit-2', 'e2e'], ['integration', 'e2e'], ['e2e', 'package'],
  ['lint', 'package'], ['typecheck', 'package'], ['package', 'deploy'],
].map(([from, to]) => ({ from, to }));

function randomDag(seed: number, n: number, p: number) {
  const rnd = mulberry32(seed);
  // A random order of ids, edges only "forward" in a hidden topological order.
  const ids = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);
  const edges: LayoutEdge<number>[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < p) edges.push({ from: ids[i], to: ids[j] });
  return { ids: [...ids].sort((a, b) => a - b), edges };
}

describe('layeredLayout', () => {
  it('layers the CI pipeline by longest path and keeps its crossing-free order', () => {
    const { layers } = layeredLayout(CI_IDS, CI_EDGES);
    expect(layers).toEqual([
      ['install'], ['lint', 'typecheck', 'build'], ['unit-1', 'unit-2', 'integration'], ['e2e'], ['package'], ['deploy'],
    ]);
  });

  it('never points an edge of a DAG up or sideways, and each layer is the longest path to it', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { ids, edges } = randomDag(seed, 12, 0.25);
      const { layerOf } = layeredLayout(ids, edges);
      for (const e of edges) expect(layerOf.get(e.to)!).toBeGreaterThan(layerOf.get(e.from)!);
      for (const id of ids) {
        const preds = edges.filter((e) => e.to === id).map((e) => layerOf.get(e.from)!);
        expect(layerOf.get(id)).toBe(preds.length ? Math.max(...preds) + 1 : 0);
      }
    }
  });

  it('reorders only to remove crossings, and never adds any', () => {
    // a→d, b→c drawn in input order cross; swapping c and d uncrosses them.
    const edges = [{ from: 'a', to: 'd' }, { from: 'b', to: 'c' }];
    const { layers } = layeredLayout<string>(['a', 'b', 'c', 'd'], edges);
    expect(layers).toEqual([['a', 'b'], ['d', 'c']]);
    for (let seed = 1; seed <= 40; seed++) {
      const { ids, edges: es } = randomDag(seed, 14, 0.2);
      const l = layeredLayout(ids, es);
      const input = layeredLayout(ids, es, 0);
      const adjacent = es.filter((e) => Math.abs(l.layerOf.get(e.from)! - l.layerOf.get(e.to)!) === 1);
      expect(crossings(l.layers, adjacent, l.layerOf)).toBeLessThanOrEqual(crossings(input.layers, adjacent, input.layerOf));
    }
  });

  it('is stable: the same input gives the same output', () => {
    const { ids, edges } = randomDag(9, 15, 0.2);
    expect(layeredLayout(ids, edges)).toEqual(layeredLayout([...ids], [...edges]));
  });

  it('still places every node when there are cycles and self-loops', () => {
    const edges = [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 1 }, { from: 3, to: 3 }, { from: 3, to: 4 }];
    const { layers, layerOf } = layeredLayout([1, 2, 3, 4], edges);
    expect(layers.flat().sort()).toEqual([1, 2, 3, 4]);
    expect([layerOf.get(1), layerOf.get(2), layerOf.get(3), layerOf.get(4)]).toEqual([0, 1, 2, 3]);
  });

  it('handles an empty graph', () => {
    expect(layeredLayout([], [])).toEqual({ layers: [], layerOf: new Map() });
  });
});

describe('layeredPositions', () => {
  it('puts layers in columns and centres each column (the CI drawing)', () => {
    const l = layeredLayout(CI_IDS, CI_EDGES);
    const { at, width, height } = layeredPositions(l, { layerGap: 150, nodeGap: 64, padMain: 70, padCross: 44 });
    expect(width).toBe(70 * 2 + 150 * 5);
    expect(height).toBe(44 * 2 + 64 * 2);
    expect(at.get('install')).toEqual({ x: 70, y: 108 });
    expect([at.get('lint'), at.get('typecheck'), at.get('build')]).toEqual([{ x: 220, y: 44 }, { x: 220, y: 108 }, { x: 220, y: 172 }]);
    expect(at.get('deploy')).toEqual({ x: 820, y: 108 });
  });

  it('turns layers into rows when the direction is down', () => {
    const l = layeredLayout(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }]);
    const { at, width, height } = layeredPositions(l, { direction: 'down', layerGap: 80, nodeGap: 60, padMain: 30, padCross: 30 });
    expect([width, height]).toEqual([120, 140]);
    expect(at.get('a')).toEqual({ x: 60, y: 30 });
    expect([at.get('b'), at.get('c')]).toEqual([{ x: 30, y: 110 }, { x: 90, y: 110 }]);
  });
});

describe('circlePositions', () => {
  it('starts at the top and goes clockwise', () => {
    const at = circlePositions<string>(['a', 'b', 'c', 'd'], 200, 200, 20);
    const r = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });
    expect(['a', 'b', 'c', 'd'].map((k) => r(at.get(k)!))).toEqual([{ x: 100, y: 20 }, { x: 180, y: 100 }, { x: 100, y: 180 }, { x: 20, y: 100 }]);
  });

  it('places them round an ellipse with radii', () => {
    const at = circlePositions<string>(['a', 'b', 'c', 'd'], 640, 400, 0, { rx: 260, ry: 138 });
    const r = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });
    expect(['a', 'b', 'c', 'd'].map((k) => r(at.get(k)!))).toEqual([{ x: 320, y: 62 }, { x: 580, y: 200 }, { x: 320, y: 338 }, { x: 60, y: 200 }]);
  });
});

describe('routeEdge', () => {
  const circle = { shape: 'circle' as const, r: 20, w: 40, h: 40 };
  const box = { shape: 'box' as const, r: 0, w: 112, h: 46 };

  it('trims a directed straight edge at the target outline plus the arrow gap', () => {
    const r = routeEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, circle, circle, { directed: true, arrowGap: 3 });
    expect(r).toMatchObject({ kind: 'line', x1: 0, y1: 0, x2: 77, y2: 0 });
    const u = routeEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, circle, circle, { directed: false, arrowGap: 3 });
    expect(u).toMatchObject({ kind: 'line', x2: 100 });
  });

  it('finds the outline of a box from any direction', () => {
    expect(outlineDistance(box, 1, 0)).toBe(56);
    expect(outlineDistance(box, 0, 1)).toBe(23);
    expect(outlineDistance(box, Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(23 * Math.SQRT2, 9);
  });

  it('draws the CI S-curve from side to side', () => {
    const r = routeEdge({ x: 70, y: 108 }, { x: 220, y: 44 }, box, box, { directed: true, arrowGap: 4, curve: 'right' });
    expect(r).toMatchObject({ kind: 'path', d: 'M 126 108 C 143 108, 143 44, 160 44' });
  });

  it('bends a→b and b→a to opposite sides so both stay visible', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const ab = routeEdge(a, b, circle, circle, { directed: true, arrowGap: 3, parallel: true });
    const ba = routeEdge(b, a, circle, circle, { directed: true, arrowGap: 3, parallel: true });
    expect(ab.kind).toBe('path');
    expect(ab.label.y).toBeGreaterThan(0);
    expect(ba.label.y).toBeLessThan(0);
  });

  it('draws a self-loop above the node', () => {
    const p = { x: 50, y: 50 };
    const r = routeEdge(p, p, circle, circle, { directed: true, arrowGap: 3 });
    expect(r.kind).toBe('path');
    expect(r.label.y).toBeLessThan(50 - 20);
    // the same path as before loopSide existed
    expect(r).toEqual(routeEdge(p, p, circle, circle, { directed: true, arrowGap: 3, loopSide: 'top' }));
    expect(r.kind === 'path' && r.d).toBe('M 38 34 C 26 -4, 74 -4, 62 32');
  });

  it('draws a self-loop on the side it is given, label beyond it', () => {
    const p = { x: 50, y: 50 };
    const side = (loopSide: 'right' | 'bottom' | 'left') => routeEdge(p, p, circle, circle, { directed: true, arrowGap: 3, loopSide });
    expect(side('right').label.x).toBeGreaterThan(50 + 20);
    expect(side('right').label.y).toBe(50);
    expect(side('bottom').label.y).toBeGreaterThan(50 + 20);
    expect(side('left').label.x).toBeLessThan(50 - 20);
    // a loop on the right is the top loop turned a quarter clockwise round the centre
    const right = side('right');
    expect(right.kind === 'path' && right.d).toBe('M 66 38 C 104 26, 104 74, 68 62');
  });

  it('slides a label along the edge with labelAt', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const mid = routeEdge(a, b, circle, circle, { directed: true, arrowGap: 3 });
    expect(routeEdge(a, b, circle, circle, { directed: true, arrowGap: 3, labelAt: 0.5 }).label).toEqual(mid.label);
    const far = routeEdge(a, b, circle, circle, { directed: true, arrowGap: 3, labelAt: 0.75 });
    expect(far.label).toEqual({ x: 75, y: mid.label.y });
    // bent and curved edges too: the label follows the curve toward b
    const bent = (t?: number) => routeEdge(a, b, circle, circle, { directed: true, arrowGap: 3, parallel: true, labelAt: t });
    expect(bent(0.5).label.x).toBeCloseTo(bent().label.x, 9);
    expect(bent(0.5).label.y).toBeCloseTo(bent().label.y, 9);
    expect(bent(0.8).label.x).toBeGreaterThan(bent().label.x);
    const curve = (t?: number) => routeEdge({ x: 70, y: 108 }, { x: 220, y: 44 }, box, box, { directed: true, arrowGap: 4, curve: 'right', labelAt: t });
    expect(curve(0.5).label).toEqual(curve().label);
    expect(curve(0.9).label.x).toBeGreaterThan(curve().label.x);
  });
});

describe('spatialNext', () => {
  // A plus shape: c in the middle.
  const items = [
    { key: 'c', x: 100, y: 100 }, { key: 'n', x: 100, y: 20 }, { key: 'e', x: 180, y: 110 },
    { key: 's', x: 95, y: 190 }, { key: 'w', x: 20, y: 100 }, { key: 'far-e', x: 300, y: 100 },
  ];

  it('moves to the nearest item in the arrow direction', () => {
    expect(spatialNext(items, 'c', 'ArrowUp')).toBe('n');
    expect(spatialNext(items, 'c', 'ArrowRight')).toBe('e');
    expect(spatialNext(items, 'c', 'ArrowDown')).toBe('s');
    expect(spatialNext(items, 'c', 'ArrowLeft')).toBe('w');
    expect(spatialNext(items, 'e', 'ArrowRight')).toBe('far-e');
  });

  it('returns null at an edge, and Home/End go to the ends', () => {
    expect(spatialNext(items, 'n', 'ArrowUp')).toBeNull();
    expect(spatialNext(items, 'far-e', 'ArrowRight')).toBeNull();
    expect(spatialNext(items, 's', 'Home')).toBe('c');
    expect(spatialNext(items, 'c', 'End')).toBe('far-e');
    expect(spatialNext(items, 'c', 'Enter')).toBeNull();
  });
});

describe('detours round nodes', () => {
  const box = { shape: 'box' as const, r: 0, w: 98, h: 38 };
  // A back edge from the bottom of a column to its top, with a node in between.
  const a = { x: 100, y: 300 };
  const b = { x: 100, y: 0 };
  const blocker = { at: { x: 100, y: 150 }, box };

  it('spots a straight line through a node and clears a curve that goes round it', () => {
    expect(curveHits(a, b, [blocker])).toBe(true);
    const bend = detourBend(a, b, [blocker])!;
    expect(bend).not.toBeNull();
    expect(curveHits(a, b, [blocker], bend)).toBe(false);
    // The nearest lane that clears: its peak (3/4 of the control offset) passes the box's side plus the margin.
    expect((Math.abs(bend.c1.x - 100) * 3) / 4).toBeGreaterThanOrEqual(49 + DETOUR_MARGIN);
    expect(bend.c1.x - 100).toBe(bend.c2.x - 100);
  });

  it('leaves a clear line alone', () => {
    expect(detourBend(a, b, [{ at: { x: 300, y: 150 }, box }])).toBeNull();
    expect(detourBend(a, b, [])).toBeNull();
  });

  it('routes a blocked edge as a curve trimmed at both boxes, and a clear one as a line', () => {
    const r = routeEdge(a, b, box, box, { directed: true, arrowGap: 4, obstacles: [blocker] });
    expect(r.kind).toBe('path');
    const clear = routeEdge(a, b, box, box, { directed: true, arrowGap: 4, obstacles: [] });
    expect(clear).toMatchObject({ kind: 'line', x2: 100, y2: 19 + 4 });
  });

  it('stays straight when no bend within reach clears (a wall of nodes)', () => {
    const wall = Array.from({ length: 21 }, (_, i) => ({ at: { x: 100 + (i - 10) * 30, y: 150 }, box }));
    expect(detourBend(a, b, wall)).toBeNull();
  });
});

describe('edgeHitArea', () => {
  const corners = (points: string) => points.split(' ').map((p) => p.split(',').map(Number));
  /** Shoelace area of the quad. */
  const area = (points: string) => {
    const q = corners(points);
    return Math.abs(q.reduce((sum, [x, y], i) => sum + x * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * y, 0)) / 2;
  };

  it('gives a horizontal edge a box EDGE_HIT_WIDTH tall, centred on the edge', () => {
    expect(corners(edgeHitArea({ x: 10, y: 50 }, { x: 110, y: 50 }))).toEqual([[10, 57], [110, 57], [110, 43], [10, 43]]);
  });

  it('gives a vertical edge a box EDGE_HIT_WIDTH wide', () => {
    const xs = corners(edgeHitArea({ x: 40, y: 10 }, { x: 40, y: 90 })).map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(EDGE_HIT_WIDTH);
  });

  it('has the same area, length x width, at any angle, and honours a custom width', () => {
    for (const [dx, dy] of [[100, 0], [0, 80], [60, 80], [-30, 40]]) {
      expect(area(edgeHitArea({ x: 5, y: 5 }, { x: 5 + dx, y: 5 + dy }))).toBeCloseTo(Math.hypot(dx, dy) * EDGE_HIT_WIDTH, 6);
    }
    expect(area(edgeHitArea({ x: 0, y: 0 }, { x: 50, y: 0 }, 20))).toBe(1000);
  });

  it('is an area, not a line, for a zero-length edge (a width square)', () => {
    expect(area(edgeHitArea({ x: 30, y: 30 }, { x: 30, y: 30 }))).toBe(EDGE_HIT_WIDTH ** 2);
  });
});
