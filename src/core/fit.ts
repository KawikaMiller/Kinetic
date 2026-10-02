/**
 * Model fitting for the ML lessons (gradient-descent, linear-logistic-regression,
 * supervised-learning, usability-laws): least squares by the normal equations, the
 * logistic link, the two losses, their gradients and one gradient-descent step.
 * Every curve a lesson draws comes from these numbers, never from a hand-drawn line.
 */
import { conditionNumber, matMul, solve, transpose, type Vec } from './vec';

/** Above this κ₁ the normal equations lose most of their digits: the fit is flagged. */
export const ILL_CONDITIONED = 1e10;

export interface PolyFit {
  /** c[0] + c[1]·x + c[2]·x² + …: constant term first. */
  coeffs: number[];
  /** κ₁ of the (regularised) normal matrix XᵀX + λI. */
  condition: number;
  /** condition > ILL_CONDITIONED: the coefficients can't be trusted to many digits. */
  illConditioned: boolean;
}

/** Evaluates a polynomial given constant-term-first coefficients (Horner). */
export function polyEval(coeffs: readonly number[], x: number): number {
  let y = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) y = y * x + coeffs[i];
  return y;
}

/**
 * Least-squares polynomial fit of the given degree, by the normal equations
 * (XᵀX + λI′)c = Xᵀy. `lambda` > 0 is ridge regression; the intercept isn't penalised.
 * Null when the system is singular (e.g. fewer distinct xs than coefficients and λ = 0).
 */
export function leastSquares(xs: readonly number[], ys: readonly number[], degree: number, opts: { lambda?: number } = {}): PolyFit | null {
  if (xs.length !== ys.length) throw new RangeError('xs and ys differ in length');
  if (!Number.isInteger(degree) || degree < 0) throw new RangeError('degree must be a non-negative integer');
  const lambda = opts.lambda ?? 0;
  const X = xs.map((x) => Array.from({ length: degree + 1 }, (_, p) => x ** p));
  const Xt = transpose(X);
  const XtX = matMul(Xt, X).map((row, i) => row.map((v, j) => (i === j && i > 0 ? v + lambda : v)));
  const Xty = Xt.map((row) => row.reduce((s, v, k) => s + v * ys[k], 0));
  const coeffs = solve(XtX, Xty);
  if (!coeffs) return null;
  const condition = conditionNumber(XtX);
  return { coeffs, condition, illConditioned: condition > ILL_CONDITIONED };
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Mean squared error between predictions and targets. */
export function mse(predicted: readonly number[], actual: readonly number[]): number {
  if (predicted.length !== actual.length) throw new RangeError('lengths differ');
  if (!predicted.length) return NaN;
  return predicted.reduce((s, p, i) => s + (p - actual[i]) ** 2, 0) / predicted.length;
}

/** Probabilities are clamped this far from 0 and 1 so a confident mistake costs a lot, not Infinity. */
export const LOG_LOSS_EPS = 1e-12;

/** Mean binary cross-entropy of probabilities against 0/1 labels. */
export function logLoss(probs: readonly number[], labels: readonly number[]): number {
  if (probs.length !== labels.length) throw new RangeError('lengths differ');
  if (!probs.length) return NaN;
  let s = 0;
  probs.forEach((p, i) => {
    const q = Math.min(1 - LOG_LOSS_EPS, Math.max(LOG_LOSS_EPS, p));
    s -= labels[i] * Math.log(q) + (1 - labels[i]) * Math.log(1 - q);
  });
  return s / probs.length;
}

/** The prediction b + w·x of a linear model whose params are `[b, ...w]`. */
export const linearPredict = (params: Vec, x: Vec) => params.reduce((s, p, i) => s + p * (i === 0 ? 1 : x[i - 1]), 0);

/** ∂MSE/∂params for the linear model `[b, ...w]` on feature rows `xs` and targets `ys`. */
export function mseGradient(params: Vec, xs: readonly Vec[], ys: readonly number[]): number[] {
  const g = params.map(() => 0);
  xs.forEach((x, k) => {
    const err = linearPredict(params, x) - ys[k];
    g[0] += err;
    x.forEach((v, i) => (g[i + 1] += err * v));
  });
  return g.map((v) => (2 * v) / xs.length);
}

/** ∂logLoss/∂params for logistic regression p = σ(b + w·x), params `[b, ...w]`. */
export function logLossGradient(params: Vec, xs: readonly Vec[], labels: readonly number[]): number[] {
  const g = params.map(() => 0);
  xs.forEach((x, k) => {
    const err = sigmoid(linearPredict(params, x)) - labels[k];
    g[0] += err;
    x.forEach((v, i) => (g[i + 1] += err * v));
  });
  return g.map((v) => v / xs.length);
}

/** One gradient-descent step: params − rate·gradient. */
export function gradientStep(params: Vec, gradient: Vec, rate: number): number[] {
  if (params.length !== gradient.length) throw new RangeError('params and gradient differ in length');
  return params.map((p, i) => p - rate * gradient[i]);
}

/** Central-difference gradient of `f` at `params`: the check that an analytic gradient is right. */
export function numericGradient(f: (params: number[]) => number, params: Vec, h = 1e-6): number[] {
  return params.map((_, i) => {
    const up = [...params];
    const down = [...params];
    up[i] += h;
    down[i] -= h;
    return (f(up) - f(down)) / (2 * h);
  });
}
