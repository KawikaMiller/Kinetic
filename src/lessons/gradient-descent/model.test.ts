import { describe, expect, it } from 'vitest';
import { leastSquares, numericGradient } from '../../core/fit';
import { mulberry32 } from '../../core/random';
import {
  BATCH_SIZE, DEFAULT_START, QUADRATIC, REGRESSION_BEST, RIDGE_START, REGRESSION_DATA, SURFACES, SURFACE_IDS, batchGradient, batchSchedule, hessianEigen,
  lossKeepsRising, presetRate, runDescent, stabilityLimit, steepAxis, zigzagShare, type SurfaceId, type W,
} from './model';

const rnd = mulberry32(44);
const plain = (id: SurfaceId, rate: number, start: W = DEFAULT_START[id], momentum = 0) =>
  runDescent(id, { start, rate, momentum, batchSeed: null });

describe('analytic gradients', () => {
  it('match central finite differences within 1e-6 at 200 seeded points on every surface', () => {
    for (const id of SURFACE_IDS) {
      const s = SURFACES[id];
      const [lo, hi] = s.domain;
      for (let i = 0; i < 200; i++) {
        const w: W = [lo + rnd() * (hi - lo), lo + rnd() * (hi - lo)];
        const numeric = numericGradient((p) => s.loss([p[0], p[1]]), w);
        const analytic = s.gradient(w);
        expect(Math.abs(analytic[0] - numeric[0])).toBeLessThan(1e-6);
        expect(Math.abs(analytic[1] - numeric[1])).toBeLessThan(1e-6);
      }
    }
  });

  it('a "batch" holding every point gives exactly the full gradient; a real batch gives its own', () => {
    const w: W = [0.3, -1.1];
    const all = REGRESSION_DATA.map((_, i) => i);
    const full = SURFACES.regression.gradient(w);
    batchGradient(w, all).forEach((g, i) => expect(g).toBeCloseTo(full[i], 12));
    const batch = batchSchedule(1, 1)[0];
    const numeric = numericGradient((p) => {
      const xs = batch.map((i) => REGRESSION_DATA[i]);
      return xs.reduce((s, pt) => s + (p[0] + p[1] * pt.x - pt.y) ** 2, 0) / xs.length;
    }, w);
    batchGradient(w, batch).forEach((g, i) => expect(g).toBeCloseTo(numeric[i], 6));
  });
});

describe('surface facts the lesson states', () => {
  it('each floor is the lowest loss: never beaten on a fine grid, and nearly reached on it', () => {
    for (const id of SURFACE_IDS) {
      const s = SURFACES[id];
      const [lo, hi] = s.domain;
      let best = Infinity;
      for (let i = 0; i <= 200; i++) for (let j = 0; j <= 200; j++) best = Math.min(best, s.loss([lo + ((hi - lo) * i) / 200, lo + ((hi - lo) * j) / 200]));
      expect(best).toBeGreaterThanOrEqual(s.floor - 1e-9);
      expect(best - s.floor).toBeLessThan(1e-3);
    }
  });

  it('the regression floor sits at the closed-form least-squares line', () => {
    const fit = leastSquares(REGRESSION_DATA.map((p) => p.x), REGRESSION_DATA.map((p) => p.y), 1)!;
    expect([...REGRESSION_BEST]).toEqual(fit.coeffs);
    expect(Math.hypot(...SURFACES.regression.gradient(REGRESSION_BEST))).toBeLessThan(1e-12);
  });

  it('λmax is the steepest curvature at the (deepest) minimum', () => {
    const deep = runDescent('twoMinima', { start: [-1, 0.2], rate: 0.02, momentum: 0, batchSeed: null }).outcome.at;
    const at: Record<SurfaceId, W> = { bowl: [0, 0], ravine: [0, 0], twoMinima: deep, saddle: [0, Math.SQRT2], regression: REGRESSION_BEST };
    for (const id of SURFACE_IDS) expect(hessianEigen(SURFACES[id], at[id])[1]).toBeCloseTo(SURFACES[id].lambdaMax, 4);
  });

  it('the saddle point (0, 0) is flat but curves down in w₂; its true minima are at w₂ = ±√2', () => {
    const s = SURFACES.saddle;
    expect(s.gradient([0, 0])).toEqual([0, 0]);
    const [low, high] = hessianEigen(s, [0, 0]);
    expect(low).toBeCloseTo(-2, 6);
    expect(high).toBeCloseTo(2, 6);
    expect(s.loss([0, Math.SQRT2])).toBeCloseTo(0, 12);
  });
});

describe('runs', () => {
  it('on the bowl, the step count to reach ε matches the closed-form contraction |1 − 2η|ᵏ', () => {
    const start: W = [-2.4, 1.6];
    const r0 = Math.hypot(...start);
    for (const eta of [0.05, 0.2, 0.35, 0.7, 0.9]) {
      const run = plain('bowl', eta, start);
      for (const eps of [1e-1, 1e-3, 1e-5]) {
        const predicted = Math.ceil(Math.log(eps / r0) / Math.log(Math.abs(1 - 2 * eta)));
        expect(run.points.findIndex((p) => Math.hypot(...p) <= eps)).toBe(predicted);
      }
    }
  });

  it('"just right" converges on every surface; "divergent" raises the loss every step until it stops, on the convex ones', () => {
    for (const id of SURFACE_IDS) expect(plain(id, presetRate(id, 'justRight')).outcome.kind).toBe('minimum');
    for (const id of ['bowl', 'ravine', 'regression'] as const) {
      const run = plain(id, presetRate(id, 'divergent'));
      expect(run.outcome.kind).toBe('diverged');
      expect(lossKeepsRising(run)).toBe(true);
    }
  });

  it('"too big" zig-zags across the minimum and still converges on the bowl and the line fit, but slower', () => {
    for (const id of ['bowl', 'regression'] as const) {
      const run = plain(id, presetRate(id, 'tooBig'));
      expect(run.outcome.kind).toBe('minimum');
      expect(zigzagShare(run)).toBeGreaterThan(0.9);
      expect(run.steps.length).toBeGreaterThan(plain(id, presetRate(id, 'justRight')).steps.length);
    }
  });

  it('"too small" crawls: it runs out of steps before converging, everywhere', () => {
    for (const id of SURFACE_IDS) expect(plain(id, presetRate(id, 'tooSmall')).outcome.kind).toBe('budget');
  });

  it('a bigger rate is not always faster: past 1/λ on the bowl the step count rises again, and past 2/λ it diverges', () => {
    const steps = (eta: number) => plain('bowl', eta).steps.length;
    expect(steps(0.45)).toBeLessThan(steps(0.2));
    expect(steps(0.8)).toBeGreaterThan(steps(0.45));
    expect(plain('bowl', stabilityLimit('bowl') * 1.01).outcome.kind).toBe('diverged');
  });

  it('momentum cuts the ravine step count at the "just right" rate by more than half', () => {
    const eta = presetRate('ravine', 'justRight');
    const without = plain('ravine', eta);
    const withMomentum = plain('ravine', eta, DEFAULT_START.ravine, 0.8);
    expect(without.outcome.kind).toBe('minimum');
    expect(withMomentum.outcome.kind).toBe('minimum');
    expect(withMomentum.steps.length).toBeLessThan(without.steps.length / 2);
  });

  it('momentum also widens the stable range: the "divergent" bowl rate converges with β = 0.8 (heavy ball is stable for η < 2(1 + β)/λ)', () => {
    expect(plain('bowl', presetRate('bowl', 'divergent'), DEFAULT_START.bowl, 0.8).outcome.kind).toBe('minimum');
  });

  it('two minima: the start decides which one you find', () => {
    const eta = presetRate('twoMinima', 'justRight');
    const left = plain('twoMinima', eta, [-0.5, 1]).outcome;
    const right = plain('twoMinima', eta, [0.5, 1]).outcome;
    expect(left.kind).toBe('minimum');
    expect(right.kind).toBe('minimum');
    expect(left.at[0]).toBeLessThan(-1);
    expect(right.at[0]).toBeGreaterThan(0.9);
    if (left.kind === 'minimum' && right.kind === 'minimum') expect(left.loss).toBeLessThan(right.loss);
  });

  it('started exactly on the ridge w₂ = 0, plain GD stops at the saddle and calls it a saddle; a nudge off it escapes', () => {
    expect(plain('saddle', presetRate('saddle', 'justRight'), [-1.8, 0]).outcome.kind).toBe('saddle');
    expect(plain('saddle', presetRate('saddle', 'justRight'), [-1.8, 0.05]).outcome.kind).toBe('minimum');
  });
});

describe('mini-batches', () => {
  it('are deterministic per seed, different across seeds, and cover every point once per epoch', () => {
    expect(batchSchedule(3, 20)).toEqual(batchSchedule(3, 20));
    expect(batchSchedule(3, 20)).not.toEqual(batchSchedule(4, 20));
    const epoch = batchSchedule(9, REGRESSION_DATA.length / BATCH_SIZE).flat().sort((a, b) => a - b);
    expect(epoch).toEqual(REGRESSION_DATA.map((_, i) => i));
  });

  it('a mini-batch run is reproducible, noisier than the full gradient, and ends near the least-squares answer', () => {
    const opts = { start: DEFAULT_START.regression, rate: presetRate('regression', 'justRight'), momentum: 0 };
    const a = runDescent('regression', { ...opts, batchSeed: 5 });
    const b = runDescent('regression', { ...opts, batchSeed: 5 });
    expect(a.points).toEqual(b.points);
    const full = SURFACES.regression.gradient;
    expect(a.steps.slice(0, 20).some((st) => Math.abs(st.grad[0] - full(st.w)[0]) > 1e-3)).toBe(true);
    expect(a.outcome.kind).toBe('budget');
    expect(Math.hypot(a.outcome.at[0] - REGRESSION_BEST[0], a.outcome.at[1] - REGRESSION_BEST[1])).toBeLessThan(0.1);
  });
});

describe('review B8: the momentum and saddle stories match the runs', () => {
  const travel = (r: ReturnType<typeof plain>) => {
    const axis = steepAxis(SURFACES.ravine, [0, 0]);
    return r.steps.reduce((s, st) => s + Math.abs((st.next[0] - st.w[0]) * axis[0] + (st.next[1] - st.w[1]) * axis[1]), 0);
  };

  it('ravine at "Too big": every step flips across the steep axis; β = 0.5 cuts 136 steps to 44 and the side-to-side travel', () => {
    const eta = presetRate('ravine', 'tooBig');
    const without = plain('ravine', eta);
    const withMomentum = plain('ravine', eta, DEFAULT_START.ravine, 0.5);
    expect(zigzagShare(without)).toBe(1);
    expect(without.steps.length).toBe(136);
    expect(withMomentum.steps.length).toBe(44);
    expect(zigzagShare(withMomentum)).toBeLessThan(zigzagShare(without));
    expect(travel(withMomentum)).toBeLessThan(travel(without));
  });

  it('ravine at "Just right": no zig-zag to damp, yet β = 0.8 still cuts the steps: acceleration along the floor', () => {
    const eta = presetRate('ravine', 'justRight');
    expect(zigzagShare(plain('ravine', eta))).toBe(0);
    expect(plain('ravine', eta, DEFAULT_START.ravine, 0.8).steps.length).toBeLessThan(plain('ravine', eta).steps.length / 2);
  });

  it('the "Start exactly on the ridge" preset reaches the saddle', () => {
    expect(plain('saddle', presetRate('saddle', 'justRight'), RIDGE_START).outcome.kind).toBe('saddle');
    expect(RIDGE_START[1]).toBe(0);
  });

  it('rate presets keep their names only on the quadratic surfaces, where they behave as named', () => {
    for (const id of SURFACE_IDS.filter((s) => QUADRATIC[s])) {
      expect(plain(id, presetRate(id, 'divergent')).outcome.kind).toBe('diverged');
      expect(plain(id, presetRate(id, 'justRight')).outcome.kind).toBe('minimum');
      expect(plain(id, presetRate(id, 'tooSmall')).outcome.kind).toBe('budget');
    }
    expect(QUADRATIC.twoMinima || QUADRATIC.saddle).toBe(false);
  });
});
