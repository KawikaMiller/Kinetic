import { describe, expect, it } from 'vitest';
import {
  DETOUR_MARGIN, circlePositions, crossings, curveHits, detourBend, layeredLayout, layeredPositions, outlineDistance, routeEdge, spatialNext, type LayoutEdge,
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
