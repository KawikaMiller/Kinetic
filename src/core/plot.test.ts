import { describe, expect, it } from 'vitest';
import { barsFromHistogram, clampPoint, formatTick, nudgePoint, plotFrame, sampleCurve, sampleHeat } from './plot';
import { histogram } from './stats';

const M = { top: 10, right: 10, bottom: 30, left: 40 };

describe('plotFrame', () => {
  it('maps the domain corners onto the inner box, y pointing up', () => {
    const f = plotFrame(400, 240, M, { domain: [0, 10] }, { domain: [-1, 1] });
    expect(f.box).toEqual({ x: 40, y: 10, width: 350, height: 200 });
    expect(f.xs.map(0)).toBe(40);
    expect(f.xs.map(10)).toBe(390);
    expect(f.ys.map(-1)).toBe(210);
    expect(f.ys.map(1)).toBe(10);
  });

  it('round-trips data → drawing → data on linear and log axes', () => {
    const f = plotFrame(356, 240, M, { domain: [1, 1e6], log: true }, { domain: [0, 1] });
    for (const x of [1, 3.7, 100, 54321, 1e6]) expect(f.xs.invert(f.xs.map(x))).toBeCloseTo(x, 6);
    for (const y of [0, 0.25, 0.999]) expect(f.ys.invert(f.ys.map(y))).toBeCloseTo(y, 12);
    expect(f.xs.map(1e3)).toBeCloseTo(f.box.x + f.box.width / 2, 9);
  });
});

describe('clampPoint and nudgePoint', () => {
  const f = plotFrame(400, 240, M, { domain: [0, 10] }, { domain: [0, 5] });

  it('clamps a dragged point into the domain', () => {
    expect(clampPoint([-3, 9], f.xs, f.ys)).toEqual([0, 5]);
    expect(clampPoint([4, 2], f.xs, f.ys)).toEqual([4, 2]);
  });

  it('moves a few drawing units per arrow key and clamps at the edges', () => {
    const p = nudgePoint([5, 2.5], 'ArrowRight', f.xs, f.ys)!;
    expect(f.xs.map(p[0]) - f.xs.map(5)).toBeCloseTo(4, 9);
    expect(p[1]).toBe(2.5);
    const up = nudgePoint([5, 2.5], 'ArrowUp', f.xs, f.ys, true)!;
    expect(f.ys.map(2.5) - f.ys.map(up[1])).toBeCloseTo(20, 9);
    expect(nudgePoint([10, 5], 'ArrowRight', f.xs, f.ys)).toEqual([10, 5]);
    expect(nudgePoint([0, 0], 'ArrowDown', f.xs, f.ys)).toEqual([0, 0]);
    expect(nudgePoint([1, 1], 'Enter', f.xs, f.ys)).toBeNull();
  });
});

describe('sampleCurve', () => {
  it('spans the whole x domain', () => {
    const f = plotFrame(400, 240, M, { domain: [0, 2] }, { domain: [0, 4] });
    const [run] = sampleCurve((x) => x * x, f.xs, 100);
    expect(run).toHaveLength(101);
    expect(run[0][0]).toBeCloseTo(0, 12);
    expect(run[100][0]).toBeCloseTo(2, 12);
    expect(run[50][1]).toBeCloseTo(1, 9);
  });

  it('breaks at non-finite values instead of drawing through them', () => {
    const f = plotFrame(400, 240, M, { domain: [-1, 1] }, { domain: [-10, 10] });
    const runs = sampleCurve((x) => 1 / x, f.xs, 100); // x = 0 is sample 50
    expect(runs).toHaveLength(2);
    expect(runs[0].length + runs[1].length).toBe(100);
  });

  it('samples a log axis evenly on screen', () => {
    const f = plotFrame(400, 240, M, { domain: [1, 1e4], log: true }, { domain: [0, 1] });
    const [run] = sampleCurve(() => 0.5, f.xs, 4);
    expect(run.map(([x]) => x).map((x) => Math.round(x))).toEqual([1, 10, 100, 1000, 10000]);
  });
});

describe('sampleHeat', () => {
  it('covers the domain: one sample per cell centre, half a cell in from each edge', () => {
    const f = plotFrame(400, 240, M, { domain: [0, 10] }, { domain: [0, 4] });
    const s = sampleHeat((x, y) => x + y, f, 10, 4);
    expect(s).toHaveLength(40);
    const xs = [...new Set(s.map((c) => c.x.toFixed(9)))].map(Number);
    const ys = [...new Set(s.map((c) => c.y.toFixed(9)))].map(Number);
    expect(xs).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5]);
    expect(ys).toEqual([3.5, 2.5, 1.5, 0.5]); // row 0 is the top of the box
    expect(s.every((c) => c.value === c.x + c.y)).toBe(true);
    expect(new Set(s.map((c) => `${c.col},${c.row}`)).size).toBe(40);
  });
});

describe('barsFromHistogram', () => {
  it('turns a core/stats histogram into one bar per bin', () => {
    const bars = barsFromHistogram(histogram([0.1, 0.2, 0.6, 0.9, 0.95], { bins: 2, min: 0, max: 1 }));
    expect(bars).toEqual([
      { x0: 0, x1: 0.5, y: 2 },
      { x0: 0.5, x1: 1, y: 3 },
    ]);
  });
});

describe('formatTick', () => {
  it('writes compact linear labels', () => {
    expect([0, 0.25, 1, 2.5, 1500, 20000, 3e6, 4e9, -5].map((v) => formatTick(v))).toEqual(['0', '0.25', '1', '2.5', '1500', '20k', '3M', '4B', '−5']);
  });

  it('writes large and small powers of ten as superscripts on log axes', () => {
    expect([1, 10, 100, 1000, 1e6, 1e-3, 1e-9].map((v) => formatTick(v, true))).toEqual(['1', '10', '100', '10³', '10⁶', '10⁻³', '10⁻⁹']);
  });
});
