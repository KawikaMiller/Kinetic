/**
 * gradient-descent: two-parameter loss surfaces, their analytic gradients, and the
 * descent runs the lesson draws. Every position, arrow and loss on screen comes from
 * runDescent(); nothing is scripted.
 */
import { lineWithNoise } from '../../core/fixtures/datasets';
import { gradientStep, leastSquares, mse, mseGradient } from '../../core/fit';
import { mulberry32, shuffle } from '../../core/random';

export type W = readonly [number, number];

export type SurfaceId = 'bowl' | 'ravine' | 'twoMinima' | 'saddle' | 'regression';

export interface Surface {
  id: SurfaceId;
  label: string;
  /** Both parameters range over this, and so does the map. */
  domain: readonly [number, number];
  loss: (w: W) => number;
  gradient: (w: W) => [number, number];
  /** The lowest loss anywhere, so the loss plot can show "loss above the lowest". */
  floor: number;
  /** Largest Hessian eigenvalue at the (deepest) minimum: η above 2/λ makes plain GD blow up there. */
  lambdaMax: number;
  /** True for a convex surface: any minimum GD finds is the minimum. */
  convex: boolean;
  axes: [string, string];
}

const SQRT1_2 = Math.SQRT1_2;

/** Ravine curvatures along its two axes (rotated 45°): condition number 20. */
const RAVINE_SLOW = 0.2;
const RAVINE_STEEP = 4;

const TILT = 0.3;

// ── The regression data: a seeded noisy line, synthetic like every ML lesson's data ──

export const REGRESSION_DATA = lineWithNoise({ seed: 8, n: 40, slope: 1.2, intercept: -0.5, noise: 0.5, xRange: [-1, 2] });
const RX = REGRESSION_DATA.map((p) => [p.x] as const);
const RY = REGRESSION_DATA.map((p) => p.y);
/** The closed-form least-squares answer [intercept, slope]. */
export const REGRESSION_BEST = leastSquares(REGRESSION_DATA.map((p) => p.x), RY, 1)!.coeffs as unknown as W;

const regressionLoss = (w: W) => mse(RX.map(([x]) => w[0] + w[1] * x), RY);

/** Eigenvalues of the symmetric 2×2 [[p, q], [q, r]]. */
function symEigen(p: number, q: number, r: number): [number, number] {
  const mid = (p + r) / 2;
  const rad = Math.hypot((p - r) / 2, q);
  return [mid - rad, mid + rad];
}

/** MSE's Hessian is constant: (2/n)·XᵀX with X = [1, x]. */
const REGRESSION_HESSIAN = (() => {
  const n = RX.length;
  const sx = RX.reduce((s, [x]) => s + x, 0);
  const sxx = RX.reduce((s, [x]) => s + x * x, 0);
  return symEigen((2 * n) / n, (2 * sx) / n, (2 * sxx) / n);
})();

/** w₁ of the two-minima surface's deeper minimum: Newton's method on ∂L/∂w₁ = 4w₁(w₁² − 1) + TILT. */
function deeperMinimumX(): number {
  let x = -1;
  for (let i = 0; i < 50; i++) x -= (4 * x * (x * x - 1) + TILT) / (12 * x * x - 4);
  return x;
}
const TWO_MIN_X = deeperMinimumX();

export const SURFACES: Record<SurfaceId, Surface> = {
  bowl: {
    id: 'bowl',
    label: 'Round bowl',
    domain: [-3, 3],
    loss: ([a, b]) => a * a + b * b,
    gradient: ([a, b]) => [2 * a, 2 * b],
    floor: 0,
    lambdaMax: 2,
    convex: true,
    axes: ['w₁', 'w₂'],
  },
  ravine: {
    id: 'ravine',
    label: 'Narrow ravine',
    domain: [-3, 3],
    loss: ([a, b]) => {
      const u = (a + b) * SQRT1_2;
      const v = (a - b) * SQRT1_2;
      return 0.5 * (RAVINE_SLOW * u * u + RAVINE_STEEP * v * v);
    },
    gradient: ([a, b]) => {
      const u = (a + b) * SQRT1_2;
      const v = (a - b) * SQRT1_2;
      return [(RAVINE_SLOW * u + RAVINE_STEEP * v) * SQRT1_2, (RAVINE_SLOW * u - RAVINE_STEEP * v) * SQRT1_2];
    },
    floor: 0,
    lambdaMax: RAVINE_STEEP,
    convex: true,
    axes: ['w₁', 'w₂'],
  },
  twoMinima: {
    id: 'twoMinima',
    label: 'Two minima',
    domain: [-2, 2],
    loss: ([a, b]) => (a * a - 1) ** 2 + TILT * a + 0.5 * b * b,
    gradient: ([a, b]) => [4 * a * (a * a - 1) + TILT, b],
    floor: (TWO_MIN_X * TWO_MIN_X - 1) ** 2 + TILT * TWO_MIN_X,
    // ∂²L/∂w₁² = 12w₁² − 4 at the deeper minimum (∂²L/∂w₂² = 1 is smaller).
    lambdaMax: 12 * TWO_MIN_X * TWO_MIN_X - 4,
    convex: false,
    axes: ['w₁', 'w₂'],
  },
  saddle: {
    id: 'saddle',
    label: 'Saddle',
    domain: [-2.5, 2.5],
    // Flat point at (0, 0) curving up in w₁ and down in w₂; true minima at w₂ = ±√2.
    loss: ([a, b]) => a * a + 0.25 * b ** 4 - b * b + 1,
    gradient: ([a, b]) => [2 * a, b ** 3 - 2 * b],
    floor: 0,
    lambdaMax: 4,
    convex: false,
    axes: ['w₁', 'w₂'],
  },
  regression: {
    id: 'regression',
    label: 'Line fit (MSE)',
    domain: [-3, 3],
    loss: regressionLoss,
    gradient: (w) => mseGradient(w, RX, RY) as [number, number],
    floor: regressionLoss(REGRESSION_BEST),
    lambdaMax: REGRESSION_HESSIAN[1],
    convex: true,
    axes: ['intercept b', 'slope m'],
  },
};
export const SURFACE_IDS: SurfaceId[] = ['bowl', 'ravine', 'twoMinima', 'saddle', 'regression'];

/** Hessian by central differences of the analytic gradient (2×2, symmetrised). */
export function hessian(s: Surface, w: W, h = 1e-5): [[number, number], [number, number]] {
  const col = (i: 0 | 1) => {
    const up: [number, number] = [w[0], w[1]];
    const down: [number, number] = [w[0], w[1]];
    up[i] += h;
    down[i] -= h;
    const gu = s.gradient(up);
    const gd = s.gradient(down);
    return [(gu[0] - gd[0]) / (2 * h), (gu[1] - gd[1]) / (2 * h)];
  };
  const [c0, c1] = [col(0), col(1)];
  const off = (c0[1] + c1[0]) / 2;
  return [[c0[0], off], [off, c1[1]]];
}

export const hessianEigen = (s: Surface, w: W) => {
  const [[p, q], [, r]] = hessian(s, w);
  return symEigen(p, q, r);
};

// ── Mini-batches ─────────────────────────────────────────────────────

export const BATCH_SIZE = 8;

/**
 * Seeded mini-batches over the regression data: each epoch is a fresh shuffle cut into
 * batches of BATCH_SIZE. The same seed always gives the same batches.
 */
export function batchSchedule(seed: number, steps: number): number[][] {
  const rnd = mulberry32(seed);
  const all = REGRESSION_DATA.map((_, i) => i);
  const out: number[][] = [];
  while (out.length < steps) {
    const order = shuffle([...all], rnd);
    for (let i = 0; i + BATCH_SIZE <= order.length && out.length < steps; i += BATCH_SIZE) out.push(order.slice(i, i + BATCH_SIZE));
  }
  return out;
}

export const batchGradient = (w: W, batch: readonly number[]) =>
  mseGradient(w, batch.map((i) => RX[i]), batch.map((i) => RY[i])) as [number, number];

// ── A run ────────────────────────────────────────────────────────────

export const MAX_STEPS = 400;
/** A run whose loss passes this, or whose position leaves ±DIVERGE_RADIUS, has diverged. */
export const DIVERGE_LOSS = 1e6;
export const DIVERGE_RADIUS = 1e3;
/** Stopped: the gradient and the last move are both this small. */
export const GRAD_TOL = 1e-6;

export interface RunOptions {
  start: W;
  rate: number;
  momentum: number;
  /** Mini-batch seed (regression only); null = full gradient. */
  batchSeed: number | null;
}

export interface Step {
  /** Position before the step. */
  w: W;
  loss: number;
  /** The gradient this step used (a mini-batch's on mini-batch runs). */
  grad: W;
  /** Where the step went. */
  next: W;
}

export type Outcome =
  | { kind: 'minimum'; at: W; loss: number }
  | { kind: 'saddle'; at: W; loss: number }
  | { kind: 'diverged'; at: W }
  | { kind: 'budget'; at: W; loss: number };

export interface Run {
  surface: SurfaceId;
  options: RunOptions;
  /** points[0] is the start; points[k] is the position after k steps. */
  points: W[];
  losses: number[];
  steps: Step[];
  outcome: Outcome;
}

const finite = (w: W) => Number.isFinite(w[0]) && Number.isFinite(w[1]);
const far = (w: W) => Math.hypot(w[0], w[1]) > DIVERGE_RADIUS;

/** Heavy-ball gradient descent: v ← β·v − η·∇L, w ← w + v (β = 0 is plain GD). */
export function runDescent(surfaceId: SurfaceId, options: RunOptions): Run {
  const s = SURFACES[surfaceId];
  const batches = options.batchSeed !== null && surfaceId === 'regression' ? batchSchedule(options.batchSeed, MAX_STEPS) : null;
  const points: W[] = [options.start];
  const losses = [s.loss(options.start)];
  const steps: Step[] = [];
  let v: W = [0, 0];
  let w = options.start;
  let outcome: Outcome | null = null;
  for (let k = 0; k < MAX_STEPS; k++) {
    const grad = batches ? batchGradient(w, batches[k]) : s.gradient(w);
    const fullGrad = s.gradient(w);
    if (!batches && Math.hypot(...fullGrad) < GRAD_TOL && Math.hypot(...v) < GRAD_TOL) {
      outcome = classify(s, w);
      break;
    }
    const pushed = gradientStep([0, 0], grad, options.rate); // −η·∇L
    v = [options.momentum * v[0] + pushed[0], options.momentum * v[1] + pushed[1]];
    const next: W = [w[0] + v[0], w[1] + v[1]];
    steps.push({ w, loss: losses[k], grad, next });
    const nextLoss = s.loss(next);
    points.push(next);
    losses.push(nextLoss);
    w = next;
    if (!finite(next) || !Number.isFinite(nextLoss) || nextLoss > DIVERGE_LOSS || far(next)) {
      outcome = { kind: 'diverged', at: next };
      break;
    }
  }
  return { surface: surfaceId, options, points, losses, steps, outcome: outcome ?? { kind: 'budget', at: w, loss: s.loss(w) } };
}

/** A flat point is a minimum only if the surface curves up in every direction there. */
function classify(s: Surface, w: W): Outcome {
  const [low] = hessianEigen(s, w);
  return low > 0 ? { kind: 'minimum', at: w, loss: s.loss(w) } : { kind: 'saddle', at: w, loss: s.loss(w) };
}

/** Share of consecutive moves that reverse direction (negative dot product): the zig-zag. */
export function zigzagShare(run: Run): number {
  const moves = run.steps.map((st) => [st.next[0] - st.w[0], st.next[1] - st.w[1]]);
  let pairs = 0;
  let reversed = 0;
  for (let i = 1; i < moves.length; i++) {
    const d = moves[i][0] * moves[i - 1][0] + moves[i][1] * moves[i - 1][1];
    if (Math.hypot(...moves[i]) < 1e-9) continue;
    pairs++;
    if (d < 0) reversed++;
  }
  return pairs ? reversed / pairs : 0;
}

/** True when every recorded loss is higher than the one before. */
export const lossKeepsRising = (run: Run) => run.losses.every((l, i) => i === 0 || l > run.losses[i - 1]);

// ── Presets ──────────────────────────────────────────────────────────

export type RatePreset = 'tooSmall' | 'justRight' | 'tooBig' | 'divergent';

/** Each preset is a fraction of the surface's stability limit 2/λmax, so it means the same on every surface. */
export const RATE_FACTORS: Record<RatePreset, number> = { tooSmall: 0.01, justRight: 0.35, tooBig: 0.92, divergent: 1.08 };
export const RATE_LABELS: Record<RatePreset, string> = { tooSmall: 'Too small', justRight: 'Just right', tooBig: 'Too big', divergent: 'Divergent' };
export const RATE_PRESETS: RatePreset[] = ['tooSmall', 'justRight', 'tooBig', 'divergent'];

export const stabilityLimit = (id: SurfaceId) => 2 / SURFACES[id].lambdaMax;
export const presetRate = (id: SurfaceId, p: RatePreset) => RATE_FACTORS[p] * stabilityLimit(id);

/** Where each surface's run starts until the learner drops the ball somewhere else. */
export const DEFAULT_START: Record<SurfaceId, W> = {
  bowl: [-2.4, 1.6],
  ravine: [-2.2, -1.2],
  twoMinima: [0.4, 1.5],
  saddle: [-1.8, 0.05],
  regression: [-2.5, -2.5],
};

/** The η slider is logarithmic: it moves the exponent. */
export const RATE_EXP_MIN = -3;
export const RATE_EXP_MAX = 0.5;
