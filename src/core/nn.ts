/**
 * Tiny seeded neural nets for the ML lessons (neural-networks-backprop, cnns-convolution,
 * attention-transformers, training-vs-inference, recommender-systems). Every curve, boundary,
 * kernel and attention weight those lessons draw comes from here, trained for real in the browser.
 *
 * Everything is a `Trainable`: a flat `params` array plus `loss(batch)` and an analytic
 * `gradient(batch)`. That one shape is what `createSgd` steps and what `gradCheck` verifies
 * against central differences, so a new model gets both for free.
 *
 * Models: `createMlp` (up to two hidden layers of up to 16 units, sigmoid or linear output),
 * `createConvNet` (kernels, ReLU, global max pool, logistic output), `createAttentionHead`
 * (trainable W_q, W_k, W_v around `attention`) and `createFactorisation` (matrix factorisation).
 *
 * The `fault` options exist so a lesson can offer a "break the backward pass" toggle and so the
 * tests can prove `gradCheck` catches each kind of wrong gradient. Float64 throughout, nothing
 * here touches the DOM or Math.random: pass a seed.
 */
import { conv2d, matMul, softmax, transpose } from './linalg';
import { mulberry32 } from './random';
import type { Mat, Vec } from './vec';

// ── The shared shape ────────────────────────────────────────────────

export interface Trainable<B> {
  /** Flat, mutable parameters: SGD and gradCheck write into it. */
  readonly params: number[];
  loss(batch: B): number;
  /** d loss / d params, same length and order as `params`. */
  gradient(batch: B): number[];
}

export const MAX_HIDDEN_LAYERS = 2;
export const MAX_HIDDEN_UNITS = 16;

const uniform = (rnd: () => number, count: number, limit: number): number[] =>
  Array.from({ length: count }, () => (rnd() * 2 - 1) * limit);

const dotRow = (a: Vec, b: Vec): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** Binary cross-entropy of a logit z against y in {0, 1}, without overflow for large |z|. */
const logitCrossEntropy = (z: number, y: number): number => Math.max(z, 0) - y * z + Math.log1p(Math.exp(-Math.abs(z)));

// ── Optimiser ───────────────────────────────────────────────────────

export interface SgdOptions {
  learningRate: number;
  /** 0 is plain SGD; the velocity is v = momentum·v − learningRate·gradient. */
  momentum?: number;
}

export interface Sgd {
  /** One full-batch update on `batch`; returns the loss before the update. */
  step<B>(model: Trainable<B>, batch: B): number;
  /** Forget the velocity (a fresh run). */
  reset(): void;
}

export function createSgd({ learningRate, momentum = 0 }: SgdOptions): Sgd {
  if (!(learningRate > 0)) throw new RangeError('learningRate must be positive');
  if (!(momentum >= 0 && momentum < 1)) throw new RangeError('momentum must be in [0, 1)');
  let velocity: number[] = [];
  return {
    step(model, batch) {
      const before = model.loss(batch);
      const grad = model.gradient(batch);
      if (velocity.length !== grad.length) velocity = new Array<number>(grad.length).fill(0);
      for (let i = 0; i < grad.length; i++) {
        velocity[i] = momentum * velocity[i] - learningRate * grad[i];
        model.params[i] += velocity[i];
      }
      return before;
    },
    reset() {
      velocity = [];
    },
  };
}

// ── gradCheck ───────────────────────────────────────────────────────

export interface GradCheckOptions {
  /** Central-difference step. */
  epsilon?: number;
  /**
   * Floor under the relative-error denominator, so two gradients that are both essentially zero
   * (a dead unit) do not report noise as error.
   */
  floor?: number;
  /** A parameter is skipped as a kink when |f(p+e) − 2f(p) + f(p−e)| / e exceeds this. */
  kinkTolerance?: number;
}

export interface GradCheckResult {
  /** max over checked parameters of |analytic − numeric| / max(|analytic| + |numeric|, floor). */
  maxRelError: number;
  /** Index of the parameter with that error, or -1 when nothing was checked. */
  worstIndex: number;
  checked: number;
  /** Parameters within epsilon of a ReLU/max-pool kink, where a numeric slope is meaningless. */
  skipped: number;
  /** Cost of the numeric way: two forward passes per checked parameter. */
  numericForwardPasses: number;
  /** Cost of backprop: one forward and one backward pass, whatever the parameter count. */
  backpropPasses: 2;
}

/** Compare `model.gradient(batch)` with central differences of `model.loss(batch)`, parameter by parameter. */
export function gradCheck<B>(
  model: Trainable<B>,
  batch: B,
  { epsilon = 1e-5, floor = 1e-4, kinkTolerance = 1e-3 }: GradCheckOptions = {},
): GradCheckResult {
  const analytic = model.gradient(batch);
  const centre = model.loss(batch);
  let maxRelError = 0;
  let worstIndex = -1;
  let checked = 0;
  let skipped = 0;
  for (let i = 0; i < model.params.length; i++) {
    const original = model.params[i];
    model.params[i] = original + epsilon;
    const up = model.loss(batch);
    model.params[i] = original - epsilon;
    const down = model.loss(batch);
    model.params[i] = original;
    if (Math.abs(up - 2 * centre + down) / epsilon > kinkTolerance) {
      skipped++;
      continue;
    }
    const numeric = (up - down) / (2 * epsilon);
    const error = Math.abs(analytic[i] - numeric) / Math.max(Math.abs(analytic[i]) + Math.abs(numeric), floor);
    checked++;
    if (worstIndex < 0 || error > maxRelError) {
      maxRelError = error;
      worstIndex = i;
    }
  }
  return { maxRelError, worstIndex, checked, skipped, numericForwardPasses: 2 * checked, backpropPasses: 2 };
}

// ── MLP ─────────────────────────────────────────────────────────────

export type Activation = 'tanh' | 'sigmoid' | 'relu';

/**
 * Ways to get the backward pass wrong on purpose. `dropDerivative` omits f'(z) from the hidden
 * errors; `transposeWeights` multiplies by W instead of Wᵀ (only a square layer can be fooled
 * this way, other layers stay correct); `flipSign` ascends instead of descends.
 */
export type MlpFault = 'none' | 'dropDerivative' | 'transposeWeights' | 'flipSign';

export interface MlpOptions {
  inputs: number;
  /** One or two hidden layer widths, each 1 to 16. */
  hidden: readonly number[];
  activation: Activation;
  /** sigmoid + cross-entropy for labels in {0, 1}; linear + half squared error for a number. */
  output?: 'sigmoid' | 'linear';
  seed: number;
  /** Weight decay: adds 0.5 · l2 · sum(W²) to the loss (biases are not decayed). */
  l2?: number;
  fault?: MlpFault;
}

export interface MlpBatch {
  xs: readonly Vec[];
  ys: readonly number[];
}

export interface MlpTrace {
  /** Pre-activations per layer: z[l] has sizes[l + 1] entries. */
  z: number[][];
  /** a[0] is the input, a[l + 1] the activations of layer l; the last entry is the output [p]. */
  a: number[][];
}

export interface LayerRange {
  /** Parameters [start, end) of one layer: its weights (row per output unit), then its biases. */
  start: number;
  end: number;
}

export interface Mlp extends Trainable<MlpBatch> {
  /** Layer widths from input to the single output. */
  readonly sizes: readonly number[];
  readonly layers: readonly LayerRange[];
  readonly activation: Activation;
  /** Everything a lesson shows in a forward pass: every z and every a. */
  trace(x: Vec): MlpTrace;
  /** The network's output for x: a probability for a sigmoid output, a number for a linear one. */
  predict(x: Vec): number;
  /** Hidden units whose pre-activation is negative on every x (the dead ReLUs). Zero for other activations. */
  deadUnits(xs: readonly Vec[]): number;
  /** Euclidean norm of the gradient inside each layer, input side first. */
  layerGradientNorms(grad: readonly number[]): number[];
}

const ACTIVATIONS: Record<Activation, { f: (z: number) => number; slope: (z: number, a: number) => number }> = {
  tanh: { f: Math.tanh, slope: (_z, a) => 1 - a * a },
  sigmoid: { f: sigmoid, slope: (_z, a) => a * (1 - a) },
  relu: { f: (z) => (z > 0 ? z : 0), slope: (z) => (z > 0 ? 1 : 0) },
};

export function createMlp({
  inputs,
  hidden,
  activation,
  output = 'sigmoid',
  seed,
  l2 = 0,
  fault = 'none',
}: MlpOptions): Mlp {
  if (!Number.isInteger(inputs) || inputs < 1) throw new RangeError('inputs must be a whole number of at least 1');
  if (hidden.length < 1 || hidden.length > MAX_HIDDEN_LAYERS) {
    throw new RangeError(`use 1 to ${MAX_HIDDEN_LAYERS} hidden layers`);
  }
  if (hidden.some((h) => !Number.isInteger(h) || h < 1 || h > MAX_HIDDEN_UNITS)) {
    throw new RangeError(`each hidden layer needs 1 to ${MAX_HIDDEN_UNITS} units`);
  }
  if (!(l2 >= 0)) throw new RangeError('l2 must not be negative');

  const sizes = [inputs, ...hidden, 1];
  const layerCount = sizes.length - 1;
  const rnd = mulberry32(seed);
  const params: number[] = [];
  const layers: LayerRange[] = [];
  /** Where layer l's weights start; its biases follow the weights. */
  const weightStart: number[] = [];
  for (let l = 0; l < layerCount; l++) {
    const [fanIn, fanOut] = [sizes[l], sizes[l + 1]];
    const start = params.length;
    weightStart.push(start);
    params.push(...uniform(rnd, fanIn * fanOut, Math.sqrt(6 / (fanIn + fanOut))), ...new Array<number>(fanOut).fill(0));
    layers.push({ start, end: params.length });
  }
  const act = ACTIVATIONS[activation];

  const weight = (l: number, j: number, i: number) => params[weightStart[l] + j * sizes[l] + i];
  const bias = (l: number, j: number) => params[weightStart[l] + sizes[l + 1] * sizes[l] + j];

  function trace(x: Vec): MlpTrace {
    if (x.length !== inputs) throw new RangeError(`expected ${inputs} inputs, got ${x.length}`);
    const z: number[][] = [];
    const a: number[][] = [x.slice()];
    for (let l = 0; l < layerCount; l++) {
      const zl = Array.from({ length: sizes[l + 1] }, (_, j) => {
        let sum = bias(l, j);
        for (let i = 0; i < sizes[l]; i++) sum += weight(l, j, i) * a[l][i];
        return sum;
      });
      z.push(zl);
      const last = l === layerCount - 1;
      a.push(last ? (output === 'sigmoid' ? zl.map(sigmoid) : zl) : zl.map(act.f));
    }
    return { z, a };
  }

  function decay(): number {
    let sum = 0;
    for (let l = 0; l < layerCount; l++) {
      for (let k = weightStart[l]; k < weightStart[l] + sizes[l] * sizes[l + 1]; k++) sum += params[k] * params[k];
    }
    return 0.5 * l2 * sum;
  }

  function sampleLoss(x: Vec, y: number): number {
    const { z, a } = trace(x);
    return output === 'sigmoid' ? logitCrossEntropy(z[layerCount - 1][0], y) : 0.5 * (a[layerCount][0] - y) ** 2;
  }

  function backward(grad: number[], x: Vec, y: number): void {
    const { z, a } = trace(x);
    let delta = [a[layerCount][0] - y];
    if (fault === 'flipSign') delta = [-delta[0]];
    for (let l = layerCount - 1; l >= 0; l--) {
      const [fanIn, fanOut] = [sizes[l], sizes[l + 1]];
      const biasStart = weightStart[l] + fanOut * fanIn;
      for (let j = 0; j < fanOut; j++) {
        for (let i = 0; i < fanIn; i++) grad[weightStart[l] + j * fanIn + i] += delta[j] * a[l][i];
        grad[biasStart + j] += delta[j];
      }
      if (l === 0) break;
      const confusable = fault === 'transposeWeights' && fanIn === fanOut;
      delta = Array.from({ length: fanIn }, (_, i) => {
        let incoming = 0;
        for (let j = 0; j < fanOut; j++) incoming += (confusable ? weight(l, i, j) : weight(l, j, i)) * delta[j];
        return fault === 'dropDerivative' ? incoming : incoming * act.slope(z[l - 1][i], a[l][i]);
      });
    }
  }

  return {
    params,
    sizes,
    layers,
    activation,
    trace,
    predict: (x) => trace(x).a[layerCount][0],
    loss({ xs, ys }) {
      let total = 0;
      xs.forEach((x, n) => (total += sampleLoss(x, ys[n])));
      return total / xs.length + decay();
    },
    gradient({ xs, ys }) {
      const grad = new Array<number>(params.length).fill(0);
      xs.forEach((x, n) => backward(grad, x, ys[n]));
      for (let k = 0; k < grad.length; k++) grad[k] /= xs.length;
      for (let l = 0; l < layerCount; l++) {
        for (let k = weightStart[l]; k < weightStart[l] + sizes[l] * sizes[l + 1]; k++) grad[k] += l2 * params[k];
      }
      return grad;
    },
    deadUnits(xs) {
      if (activation !== 'relu') return 0;
      const traces = xs.map(trace);
      let dead = 0;
      for (let l = 0; l < layerCount - 1; l++) {
        for (let j = 0; j < sizes[l + 1]; j++) if (traces.every(({ z }) => z[l][j] < 0)) dead++;
      }
      return dead;
    },
    layerGradientNorms: (grad) => layers.map(({ start, end }) => Math.hypot(...grad.slice(start, end))),
  };
}

// ── Convolution ─────────────────────────────────────────────────────

/** `noFlip` builds the input gradient from the kernel as it is instead of the 180-degree flip. */
export type ConvFault = 'none' | 'noFlip';

export interface ConvBackward {
  dKernel: number[][];
  dImage: number[][];
}

/**
 * Gradients of a `conv2d(image, kernel, { stride, pad })` layer given the loss gradient at its
 * output. The kernel gradient is the correlation of the input with `dOut`; the input gradient
 * scatters `dOut` through the kernel (a full convolution with the flipped kernel).
 */
export function convBackward(
  image: Mat,
  kernel: Mat,
  dOut: Mat,
  { stride = 1, pad = 0, fault = 'none' }: { stride?: number; pad?: number; fault?: ConvFault } = {},
): ConvBackward {
  const [h, w] = [image.length, image[0].length];
  const [kh, kw] = [kernel.length, kernel[0].length];
  const dKernel = kernel.map((row) => row.map(() => 0));
  const dImage = image.map((row) => row.map(() => 0));
  dOut.forEach((row, oy) =>
    row.forEach((g, ox) => {
      for (let ky = 0; ky < kh; ky++) {
        for (let kx = 0; kx < kw; kx++) {
          const y = oy * stride + ky - pad;
          const x = ox * stride + kx - pad;
          if (y < 0 || y >= h || x < 0 || x >= w) continue;
          dKernel[ky][kx] += g * image[y][x];
          dImage[y][x] += g * (fault === 'noFlip' ? kernel[kh - 1 - ky][kw - 1 - kx] : kernel[ky][kx]);
        }
      }
    }),
  );
  return { dKernel, dImage };
}

export interface ConvNetOptions {
  /** Images are size x size. */
  size: number;
  kernelSize?: number;
  /** One or two kernels. */
  kernels: number;
  seed: number;
}

export interface ConvBatch {
  images: readonly Mat[];
  ys: readonly number[];
}

export interface ConvNet extends Trainable<ConvBatch> {
  readonly kernelSize: number;
  readonly kernelCount: number;
  /** Kernel k as a kernelSize x kernelSize matrix. */
  kernel(k: number): number[][];
  /** The ReLU feature map of kernel k on an image (what the lesson shows beside the loss). */
  featureMap(image: Mat, k: number): number[][];
  /** Probability that the image is class 1. */
  predict(image: Mat): number;
}

/** Valid convolution (stride 1) with `kernels` kernels, ReLU, global max pool per kernel, then a logistic output. */
export function createConvNet({ size, kernelSize = 3, kernels, seed }: ConvNetOptions): ConvNet {
  if (!Number.isInteger(kernels) || kernels < 1 || kernels > 2) throw new RangeError('use 1 or 2 kernels');
  if (!Number.isInteger(kernelSize) || kernelSize < 1 || kernelSize > size) throw new RangeError('the kernel must fit the image');
  const rnd = mulberry32(seed);
  const taps = kernelSize * kernelSize;
  // Layout: all kernels (row-major), kernel biases, output weights (one per kernel), output bias.
  const biasStart = kernels * taps;
  const outStart = biasStart + kernels;
  const params = [...uniform(rnd, kernels * taps, Math.sqrt(6 / taps)), ...new Array<number>(kernels).fill(0), ...uniform(rnd, kernels, 1), 0];

  const kernelOf = (k: number): number[][] =>
    Array.from({ length: kernelSize }, (_, y) => params.slice(k * taps + y * kernelSize, k * taps + (y + 1) * kernelSize));

  interface Pooled {
    /** Max of the ReLU map and where it sits (ties: first). */
    value: number;
    y: number;
    x: number;
    /** The pre-ReLU value at that position. */
    pre: number;
  }

  function pool(image: Mat, k: number): Pooled {
    const map = conv2d(image, kernelOf(k));
    let best: Pooled = { value: -Infinity, y: 0, x: 0, pre: 0 };
    map.forEach((row, y) =>
      row.forEach((v, x) => {
        const pre = v + params[biasStart + k];
        const value = pre > 0 ? pre : 0;
        if (value > best.value) best = { value, y, x, pre };
      }),
    );
    return best;
  }

  const logit = (pooled: readonly Pooled[]): number =>
    pooled.reduce((sum, p, k) => sum + params[outStart + k] * p.value, params[outStart + kernels]);

  const pooledAll = (image: Mat): Pooled[] => Array.from({ length: kernels }, (_, k) => pool(image, k));

  return {
    params,
    kernelSize,
    kernelCount: kernels,
    kernel: kernelOf,
    featureMap: (image, k) => conv2d(image, kernelOf(k)).map((row) => row.map((v) => Math.max(v + params[biasStart + k], 0))),
    predict: (image) => sigmoid(logit(pooledAll(image))),
    loss({ images, ys }) {
      let total = 0;
      images.forEach((image, n) => (total += logitCrossEntropy(logit(pooledAll(image)), ys[n])));
      return total / images.length;
    },
    gradient({ images, ys }) {
      const grad = new Array<number>(params.length).fill(0);
      images.forEach((image, n) => {
        const pooled = pooledAll(image);
        const delta = sigmoid(logit(pooled)) - ys[n];
        grad[outStart + kernels] += delta;
        pooled.forEach((p, k) => {
          grad[outStart + k] += delta * p.value;
          if (p.pre <= 0) return;
          const through = delta * params[outStart + k];
          grad[biasStart + k] += through;
          for (let ky = 0; ky < kernelSize; ky++) {
            for (let kx = 0; kx < kernelSize; kx++) grad[k * taps + ky * kernelSize + kx] += through * image[p.y + ky][p.x + kx];
          }
        });
      });
      return grad.map((g) => g / images.length);
    },
  };
}

// ── Attention ───────────────────────────────────────────────────────

/** `'causal'` lets row i see columns 0..i; a matrix has true where row i may attend to column j. */
export type AttentionMask = 'causal' | readonly (readonly boolean[])[];

export interface AttentionResult {
  /** Q Kᵀ / sqrt(d_k) before masking; masked entries are -Infinity in `masked`. */
  scores: number[][];
  masked: number[][];
  /** Row-wise softmax of `masked`: each row sums to 1 (a fully masked row is all zeros). */
  weights: number[][];
  output: number[][];
}

const allowed = (mask: AttentionMask | undefined, i: number, j: number): boolean =>
  mask === undefined ? true : mask === 'causal' ? j <= i : mask[i][j];

/** Scaled dot-product attention: softmax(Q Kᵀ / sqrt(d_k) with the mask applied) V. */
export function attention(Q: Mat, K: Mat, V: Mat, { mask }: { mask?: AttentionMask } = {}): AttentionResult {
  const dk = Q[0].length;
  const scores = matMul(Q, transpose(K)).map((row) => row.map((s) => s / Math.sqrt(dk)));
  const masked = scores.map((row, i) => row.map((s, j) => (allowed(mask, i, j) ? s : -Infinity)));
  const weights = masked.map((row) => (row.every((s) => s === -Infinity) ? row.map(() => 0) : softmax(row)));
  return { scores, masked, weights, output: matMul(weights, V) };
}

/** `dropScale` forgets the 1 / sqrt(d_k) in the score gradients. */
export type AttentionFault = 'none' | 'dropScale';

export interface AttentionBackward {
  dQ: number[][];
  dK: number[][];
  dV: number[][];
}

/** Gradients of `attention(Q, K, V, ...)` given the loss gradient at its output. */
export function attentionBackward(
  Q: Mat,
  K: Mat,
  V: Mat,
  weights: Mat,
  dOutput: Mat,
  fault: AttentionFault = 'none',
): AttentionBackward {
  const scale = fault === 'dropScale' ? 1 : 1 / Math.sqrt(Q[0].length);
  const dWeights = matMul(dOutput, transpose(V));
  const dScores = weights.map((row, i) => {
    const inner = dotRow(row, dWeights[i]);
    return row.map((w, j) => w * (dWeights[i][j] - inner) * scale);
  });
  return { dQ: matMul(dScores, K), dK: matMul(transpose(dScores), Q), dV: matMul(transpose(weights), dOutput) };
}

export interface AttentionHeadOptions {
  /** Width of the token vectors going in. */
  inputs: number;
  /** Width of queries and keys. */
  keyDim: number;
  /** Width of values and of the output. */
  valueDim: number;
  seed: number;
  fault?: AttentionFault;
}

export interface AttentionBatch {
  /** Rows that ask (Q = queries · W_q). */
  queries: Mat;
  /** Rows that are looked up (K = keys · W_k, V = keys · W_v). Pass the same matrix for self-attention. */
  keys: Mat;
  /** Use these rows as V instead of keys · W_v (W_v then gets a zero gradient): a lookup into fixed values. */
  values?: Mat;
  /** Wanted output, one row per query row. */
  targets: Mat;
  mask?: AttentionMask;
}

export interface AttentionHead extends Trainable<AttentionBatch> {
  matrices(): { wq: number[][]; wk: number[][]; wv: number[][] };
  /** The full forward pass, including the attention weights a lesson draws. */
  forward(batch: Pick<AttentionBatch, 'queries' | 'keys' | 'values' | 'mask'>): AttentionResult;
}

/** One attention head with trainable W_q, W_k, W_v and a half-squared-error loss on its output. */
export function createAttentionHead({ inputs, keyDim, valueDim, seed, fault = 'none' }: AttentionHeadOptions): AttentionHead {
  const rnd = mulberry32(seed);
  const limit = 1 / Math.sqrt(inputs);
  const params = uniform(rnd, inputs * (2 * keyDim + valueDim), limit);
  const slice = (from: number, cols: number): number[][] =>
    Array.from({ length: inputs }, (_, i) => params.slice(from + i * cols, from + (i + 1) * cols));
  const matrices = () => ({
    wq: slice(0, keyDim),
    wk: slice(inputs * keyDim, keyDim),
    wv: slice(2 * inputs * keyDim, valueDim),
  });

  function project({ queries, keys, values }: Pick<AttentionBatch, 'queries' | 'keys' | 'values'>) {
    const { wq, wk, wv } = matrices();
    return { Q: matMul(queries, wq), K: matMul(keys, wk), V: values ?? matMul(keys, wv) };
  }

  const forward = (batch: Pick<AttentionBatch, 'queries' | 'keys' | 'values' | 'mask'>): AttentionResult => {
    const { Q, K, V } = project(batch);
    return attention(Q, K, V, { mask: batch.mask });
  };

  return {
    params,
    matrices,
    forward,
    loss(batch) {
      const { output } = forward(batch);
      let total = 0;
      output.forEach((row, i) => row.forEach((o, j) => (total += 0.5 * (o - batch.targets[i][j]) ** 2)));
      return total / output.length;
    },
    gradient(batch) {
      const { Q, K, V } = project(batch);
      const { weights, output } = attention(Q, K, V, { mask: batch.mask });
      const dOutput = output.map((row, i) => row.map((o, j) => (o - batch.targets[i][j]) / output.length));
      const { dQ, dK, dV } = attentionBackward(Q, K, V, weights, dOutput, fault);
      return [
        ...matMul(transpose(batch.queries), dQ).flat(),
        ...matMul(transpose(batch.keys), dK).flat(),
        ...(batch.values ? new Array<number>(inputs * valueDim).fill(0) : matMul(transpose(batch.keys), dV).flat()),
      ];
    },
  };
}

// ── Matrix factorisation ────────────────────────────────────────────

export interface Rating {
  user: number;
  item: number;
  rating: number;
}

export interface FactorisationOptions {
  users: number;
  items: number;
  /** Latent factors per user and per item. */
  factors: number;
  seed: number;
  /** L2 penalty on every factor: adds 0.5 · lambda · (|P|² + |Q|²) to the loss. */
  lambda?: number;
}

export interface Factorisation extends Trainable<readonly Rating[]> {
  /** r̂ = p_user · q_item. */
  predict(user: number, item: number): number;
  /** Root-mean-square error over `ratings`, with no penalty term. */
  rmse(ratings: readonly Rating[]): number;
}

/** r̂ᵤᵢ = pᵤ · qᵢ fitted to the observed ratings; params are P (users x k) then Q (items x k). */
export function createFactorisation({ users, items, factors, seed, lambda = 0 }: FactorisationOptions): Factorisation {
  if (!(lambda >= 0)) throw new RangeError('lambda must not be negative');
  const rnd = mulberry32(seed);
  const params = uniform(rnd, (users + items) * factors, 0.1);
  const itemBase = users * factors;
  const predict = (user: number, item: number): number => {
    let sum = 0;
    for (let f = 0; f < factors; f++) sum += params[user * factors + f] * params[itemBase + item * factors + f];
    return sum;
  };
  return {
    params,
    predict,
    rmse: (ratings) => Math.sqrt(ratings.reduce((sum, r) => sum + (predict(r.user, r.item) - r.rating) ** 2, 0) / ratings.length),
    loss(ratings) {
      const fit = ratings.reduce((sum, r) => sum + 0.5 * (predict(r.user, r.item) - r.rating) ** 2, 0);
      return fit / ratings.length + 0.5 * lambda * params.reduce((sum, p) => sum + p * p, 0);
    },
    gradient(ratings) {
      const grad = params.map((p) => lambda * p);
      for (const { user, item, rating } of ratings) {
        const err = (predict(user, item) - rating) / ratings.length;
        for (let f = 0; f < factors; f++) {
          grad[user * factors + f] += err * params[itemBase + item * factors + f];
          grad[itemBase + item * factors + f] += err * params[user * factors + f];
        }
      }
      return grad;
    },
  };
}
