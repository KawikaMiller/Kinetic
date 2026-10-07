import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  CURVE_PRESETS, PRESETS, bernstein, bernsteinPoint, clampEasing, cssValue, deCasteljau, derivative, dxAt, ease, evenT, lerpAngleNaive,
  lerpAngleShortest, lerpHex, pointAt, shortestDelta, solveT, xAt, xGaps, yAt, type Cubic, type Easing, type P,
} from './model';

const rnd = mulberry32(42);
const randomCubic = (): Cubic => [0, 1, 2, 3].map(() => [rnd() * 10 - 5, rnd() * 10 - 5] as P) as unknown as Cubic;

describe('De Casteljau and Bernstein', () => {
  it('give the same point for 101 values of t on 200 seeded random curves, within 1e-12', () => {
    for (let n = 0; n < 200; n++) {
      const c = randomCubic();
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const a = pointAt(c, t);
        const b = bernsteinPoint(c, t);
        expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-12);
        expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-12);
      }
    }
  });

  it('De Casteljau has levels of 4, 3, 2 and 1 points', () => {
    expect(deCasteljau(randomCubic(), 0.3).map((l) => l.length)).toEqual([4, 3, 2, 1]);
  });

  it('the Bernstein weights are non-negative on [0, 1] and sum to 1', () => {
    for (let i = 0; i <= 1000; i++) {
      const w = bernstein(i / 1000);
      expect(w.every((x) => x >= 0)).toBe(true);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
    }
  });

  it('starts at P0, ends at P3, and leaves along P0 → P1 and arrives along P2 → P3 (tangent 3·(P1 − P0), 3·(P3 − P2))', () => {
    for (let n = 0; n < 50; n++) {
      const c = randomCubic();
      expect(pointAt(c, 0)).toEqual(c[0]);
      const end = pointAt(c, 1);
      expect(end[0]).toBeCloseTo(c[3][0], 12);
      expect(end[1]).toBeCloseTo(c[3][1], 12);
      const d0 = derivative(c, 0);
      const d1 = derivative(c, 1);
      expect(d0[0]).toBeCloseTo(3 * (c[1][0] - c[0][0]), 12);
      expect(d1[1]).toBeCloseTo(3 * (c[3][1] - c[2][1]), 12);
      // and the derivative formula agrees with a central difference everywhere
      for (const t of [0.1, 0.37, 0.5, 0.9]) {
        const h = 1e-6;
        const fd = [0, 1].map((k) => (pointAt(c, t + h)[k] - pointAt(c, t - h)[k]) / (2 * h));
        expect(derivative(c, t)[0]).toBeCloseTo(fd[0], 5);
        expect(derivative(c, t)[1]).toBeCloseTo(fd[1], 5);
      }
    }
  });

  it('stays inside the convex hull of its control points', () => {
    const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    /** Andrew's monotone chain: hull counter-clockwise. */
    const hull = (pts: P[]): P[] => {
      const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const lower: P[] = [];
      for (const p of s) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
      }
      const upper: P[] = [];
      for (const p of [...s].reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
      }
      return [...lower.slice(0, -1), ...upper.slice(0, -1)];
    };
    for (let n = 0; n < 200; n++) {
      const c = randomCubic();
      const h = hull([...c]);
      for (let i = 0; i <= 50; i++) {
        const p = pointAt(c, i / 50);
        for (let k = 0; k < h.length; k++) expect(cross(h[k], h[(k + 1) % h.length], p)).toBeGreaterThan(-1e-9);
      }
    }
  });
});

describe('curve presets', () => {
  /** Proper crossings between non-neighbouring chords of a dense polyline. */
  function selfCrossings(c: Cubic): number {
    const pts = Array.from({ length: 401 }, (_, i) => pointAt(c, i / 400));
    const cr = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    let n = 0;
    for (let i = 0; i < 400; i++) {
      for (let j = i + 2; j < 400; j++) {
        if (cr(pts[i], pts[i + 1], pts[j]) * cr(pts[i], pts[i + 1], pts[j + 1]) < 0 && cr(pts[j], pts[j + 1], pts[i]) * cr(pts[j], pts[j + 1], pts[i + 1]) < 0) n++;
      }
    }
    return n;
  }
  it('the loop crosses itself once; the arch and the S-curve never do', () => {
    const by = Object.fromEntries(CURVE_PRESETS.map((p) => [p.id, p.ctrl]));
    expect(selfCrossings(by.loop)).toBe(1);
    expect(selfCrossings(by.arch)).toBe(0);
    expect(selfCrossings(by.s)).toBe(0);
  });
  it('fit the 0-10 plot', () => {
    for (const p of CURVE_PRESETS) for (const [x, y] of p.ctrl) for (const v of [x, y]) expect(v >= 0 && v <= 10).toBe(true);
  });
});

describe('CSS easing', () => {
  it('uses the CSS Easing keyword values', () => {
    const by = Object.fromEntries(PRESETS.map((p) => [p.id, p.e]));
    expect(by.ease).toEqual({ x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 });
    expect(by['ease-in']).toEqual({ x1: 0.42, y1: 0, x2: 1, y2: 1 });
    expect(by['ease-out']).toEqual({ x1: 0, y1: 0, x2: 0.58, y2: 1 });
    expect(by['ease-in-out']).toEqual({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
    expect(by.linear).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(by.overshoot.y1).toBeGreaterThan(1);
    expect(cssValue(by.ease)).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });

  const hard: Easing[] = [
    { x1: 1, y1: 0, x2: 0, y2: 1 }, // x′(½) = 0: Newton meets a flat slope
    { x1: 1, y1: 1, x2: 1, y2: 0 }, // x′(1) = 0
    { x1: 0, y1: 1, x2: 0, y2: 1 }, // x′(0) = 0
    { x1: 0.99, y1: 0.2, x2: 0.01, y2: 0.8 },
  ];
  /** Outside CSS's legal range: x goes backwards for a while. The solver must still find some t. */
  const nonMonotonic: Easing[] = [{ x1: 1.6, y1: 0, x2: -0.6, y2: 1 }, { x1: -0.5, y1: 0.3, x2: 1.5, y2: 0.7 }];

  it('the solver inverts x within 1e-6 for every preset, the flat-slope curves and non-monotonic ones', () => {
    let bisections = 0;
    for (const e of [...PRESETS.map((p) => p.e), ...hard, ...nonMonotonic]) {
      for (let i = 0; i <= 1000; i++) {
        const x = i / 1000;
        const s = solveT(e, x);
        expect(Math.abs(xAt(e, s.t) - x), `${cssValue(e)} at ${x}`).toBeLessThan(1e-6);
        expect(s.t).toBeGreaterThanOrEqual(0);
        expect(s.t).toBeLessThanOrEqual(1);
        if (s.method === 'bisection') bisections++;
      }
    }
    expect(bisections).toBeGreaterThan(0); // the fallback really runs
    // the non-monotonic curves really do go backwards
    for (const e of nonMonotonic) expect(Array.from({ length: 101 }, (_, i) => dxAt(e, i / 100)).some((d) => d < 0)).toBe(true);
  });

  it('with x1, x2 in [0, 1] (all CSS allows), x(t) never goes backwards: one t per time', () => {
    for (let a = 0; a <= 20; a++) {
      for (let b = 0; b <= 20; b++) {
        const e = { x1: a / 20, y1: 0, x2: b / 20, y2: 1 };
        for (let i = 0; i <= 200; i++) expect(dxAt(e, i / 200)).toBeGreaterThanOrEqual(-1e-12);
      }
    }
  });

  it('eased values match a brute-force reference (dense t sampling, interpolated)', () => {
    const N = 200_000;
    for (const p of PRESETS) {
      const xs = new Float64Array(N + 1);
      const ys = new Float64Array(N + 1);
      for (let i = 0; i <= N; i++) {
        xs[i] = xAt(p.e, i / N);
        ys[i] = yAt(p.e, i / N);
      }
      let j = 0; // x only grows with k, so the scan carries on from the last bracket
      for (let k = 0; k <= 100; k++) {
        const x = k / 100;
        while (j < N && xs[j + 1] < x) j++;
        const f = xs[j + 1] === xs[j] ? 0 : (x - xs[j]) / (xs[j + 1] - xs[j]);
        const ref = ys[j] + f * (ys[j + 1] - ys[j]);
        expect(Math.abs(ease(p.e, x) - ref), `${p.id} at ${x}`).toBeLessThan(1e-6);
      }
    }
  });

  it('linear is the identity, and every curve starts at 0 and ends at 1', () => {
    const linear = PRESETS.find((p) => p.id === 'linear')!.e;
    for (let i = 0; i <= 20; i++) expect(ease(linear, i / 20)).toBeCloseTo(i / 20, 6);
    for (const p of PRESETS) {
      expect(ease(p.e, 0)).toBeCloseTo(0, 6);
      expect(ease(p.e, 1)).toBeCloseTo(1, 6);
    }
  });

  it('the overshoot preset really goes past 1', () => {
    const e = PRESETS.find((p) => p.id === 'overshoot')!.e;
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => ease(e, i / 100)))).toBeGreaterThan(1.05);
  });

  it('clamps x to [0, 1] and leaves a legal y alone', () => {
    expect(clampEasing({ x1: -0.2, y1: 1.2, x2: 1.4, y2: -0.3 })).toEqual({ x1: 0, y1: 1.2, x2: 1, y2: -0.3 });
  });

  it('even steps of t land on uneven x, even for linear: only (⅓, ⅓, ⅔, ⅔) makes x = t', () => {
    const g = xGaps(PRESETS[0].e);
    expect(g.max / g.min).toBeGreaterThan(2);
    // cubic-bezier(0, 0, 1, 1): x(t) = 3t² − 2t³, bunched at both ends, though y = x makes its output a straight line.
    const linear = PRESETS.find((p) => p.id === 'linear')!.e;
    const lin = xGaps(linear);
    expect(lin.max / lin.min).toBeGreaterThan(5);
    for (let i = 0; i <= 10; i++) expect(xAt(linear, i / 10)).toBeCloseTo(3 * (i / 10) ** 2 - 2 * (i / 10) ** 3, 12);
    const uniform = xGaps({ x1: 1 / 3, y1: 1 / 3, x2: 2 / 3, y2: 2 / 3 });
    expect(uniform.max - uniform.min).toBeLessThan(1e-12);
    expect(evenT(PRESETS[0].e)).toHaveLength(11);
  });
});

describe('lerps', () => {
  /** Reference: try both directions round the circle and keep the shorter one. */
  function shortestRef(a: number, b: number): number {
    const ccw = (((b - a) % 360) + 360) % 360;
    const cw = ccw - 360;
    return Math.abs(cw) < Math.abs(ccw) ? cw : ccw;
  }

  it('shortest-arc lerp crosses the 0/360 wrap instead of going round', () => {
    expect(lerpAngleShortest(350, 10, 0.5)).toBeCloseTo(0, 12);
    expect(lerpAngleShortest(10, 350, 0.5)).toBeCloseTo(0, 12);
    expect(lerpAngleShortest(350, 10, 0.25)).toBeCloseTo(355, 12);
    expect(lerpAngleNaive(350, 10, 0.5)).toBe(180);
  });

  it('matches the both-ways reference on 2,000 seeded pairs, and hits both ends', () => {
    for (let n = 0; n < 2000; n++) {
      const a = Math.round(rnd() * 720 - 360);
      const b = Math.round(rnd() * 720 - 360);
      const ref = shortestRef(a, b);
      if (Math.abs(ref) !== 180) expect(shortestDelta(a, b)).toBe(ref);
      expect(Math.abs(shortestDelta(a, b))).toBeLessThanOrEqual(180);
      const norm = (x: number) => ((x % 360) + 360) % 360;
      expect(lerpAngleShortest(a, b, 0)).toBeCloseTo(norm(a), 9);
      const end = lerpAngleShortest(a, b, 1);
      expect(Math.min(Math.abs(end - norm(b)), 360 - Math.abs(end - norm(b)))).toBeLessThan(1e-9);
    }
  });

  it('exactly 180° apart turns +180, and the turn is never longer than half a circle', () => {
    expect(shortestDelta(0, 180)).toBe(180);
    expect(shortestDelta(90, 270)).toBe(180);
    expect(shortestDelta(270, 90)).toBe(180);
  });

  it('colour lerp mixes each channel and rounds', () => {
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080'); // allow-color: test vectors for the channel lerp
    expect(lerpHex('#ff0000', '#0000ff', 0)).toBe('#ff0000'); // allow-color: test vectors for the channel lerp
    expect(lerpHex('#ff0000', '#0000ff', 1)).toBe('#0000ff'); // allow-color: test vectors for the channel lerp
  });
});
