import { describe, expect, it } from 'vitest';
import { areaPath, bandPath, defaultBase, sampleXs, stepsPath } from './plotAreas';
import { linearScale, logScale } from './scale';
import { barsFromHistogram } from './plot';

// A 100 x 100 box: x data 0..10, y data 0..1, y flipped as on screen.
const xs = linearScale(0, 10, 0, 100);
const ys = linearScale(0, 1, 100, 0);

const coords = (d: string) => [...d.matchAll(/(-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('sampleXs', () => {
  it('spans from..to inclusive, clamped to the axis, in ascending order', () => {
    const s = sampleXs(xs, 2, 6, 8);
    expect(s[0]).toBe(2);
    expect(s[s.length - 1]).toBe(6);
    expect(s).toHaveLength(9);
    expect([...s].sort((a, b) => a - b)).toEqual(s);
    expect(sampleXs(xs, -5, 99, 4)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(sampleXs(xs, undefined, 4, 2)).toEqual([0, 2, 4]);
  });

  it('is empty for an empty or off-axis range, and even on screen for a log axis', () => {
    expect(sampleXs(xs, 5, 5)).toEqual([]);
    expect(sampleXs(xs, 20, 30)).toEqual([]);
    const lx = logScale(1, 100, 0, 100);
    const s = sampleXs(lx, undefined, undefined, 2);
    expect(s[0]).toBe(1);
    expect(s[1]).toBeCloseTo(10, 9);
    expect(s[2]).toBe(100);
  });
});

describe('areaPath', () => {
  it('closes down to the base: a constant fn gives a rectangle', () => {
    const d = areaPath(() => 0.5, xs, ys, { from: 2, to: 6 });
    const pts = coords(d);
    expect(pts[0]).toEqual([20, 50]);
    expect(pts.at(-3)).toEqual([60, 50]);
    expect(pts.at(-2)).toEqual([60, 100]);
    expect(pts.at(-1)).toEqual([20, 100]);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('rests on an explicit base, and on the axis bottom when 0 is off the axis', () => {
    expect(coords(areaPath(() => 0.5, xs, ys, { base: 0.25 })).at(-1)![1]).toBe(75);
    const high = linearScale(5, 6, 100, 0);
    expect(defaultBase(high)).toBe(5);
    expect(defaultBase(ys)).toBe(0);
  });

  it('skips non-finite samples and returns nothing when there is nothing to draw', () => {
    expect(areaPath((x) => (x < 5 ? NaN : 0.5), xs, ys)).toContain('M');
    expect(areaPath(() => NaN, xs, ys)).toBe('');
    expect(areaPath(() => 1, xs, ys, { from: 3, to: 3 })).toBe('');
  });
});

describe('stepsPath', () => {
  it('holds each level until the next point and runs the last to the right edge', () => {
    const d = stepsPath([[2, 0.25], [5, 0.75]], xs, ys, 0);
    expect(d).toBe('M20.00 100.00L20.00 75.00H50.00V25.00H100.00');
  });

  it('starts at the first point without a startY, and draws nothing for no data', () => {
    expect(stepsPath([[2, 0.25]], xs, ys)).toBe('M20.00 75.00H100.00');
    expect(stepsPath([], xs, ys)).toBe('');
  });

  it('does not extend past a last point already on the edge', () => {
    expect(stepsPath([[0, 0], [10, 1]], xs, ys)).toBe('M0.00 100.00H100.00V0.00');
  });
});

describe('bandPath', () => {
  it('a flat band is a rectangle between its two levels', () => {
    const pts = coords(bandPath(0.2, 0.6, xs, ys, { from: 1, to: 3 }));
    const top = pts.filter(([, y]) => y === 40);
    const bottom = pts.filter(([, y]) => y === 80);
    expect(top.length).toBeGreaterThan(1);
    expect(bottom.length).toBe(top.length);
    expect(Math.min(...pts.map(([x]) => x))).toBe(10);
    expect(Math.max(...pts.map(([x]) => x))).toBe(30);
  });

  it('takes functions for either edge and is empty when an edge is never finite', () => {
    expect(bandPath((x) => x / 20, (x) => x / 10, xs, ys)).toMatch(/^M0\.00 100\.00/);
    expect(bandPath(() => NaN, 1, xs, ys)).toBe('');
  });
});

describe('barsFromHistogram tone', () => {
  const h = { edges: [0, 1, 2, 3], counts: [4, 5, 6] };

  it('is unchanged without a tone function', () => {
    expect(barsFromHistogram(h)).toEqual([{ x0: 0, x1: 1, y: 4 }, { x0: 1, x1: 2, y: 5 }, { x0: 2, x1: 3, y: 6 }]);
  });

  it('gives each bar the tone for its bin (index, edges, count)', () => {
    const bars = barsFromHistogram(h, (bin) => (bin.x0 >= 2 ? 'bad' : 'info'));
    expect(bars.map((b) => b.tone)).toEqual(['info', 'info', 'bad']);
    expect(barsFromHistogram(h, (bin) => (bin.index === 1 ? 'hi' : undefined)).map((b) => b.tone)).toEqual([undefined, 'hi', undefined]);
    expect(barsFromHistogram(h, (bin) => (bin.count > 4 ? 'ok' : 'dim'))[0].tone).toBe('dim');
  });
});
