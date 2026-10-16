/**
 * Pure model of the neural-networks-backprop lesson. Every number on screen comes from here or
 * from core/nn: the single neuron, the hand-built XOR network, the chain-rule lines, the training
 * run and the seed sweep. Nothing reads the clock or Math.random.
 */
import { createMlp, createSgd, gradCheck, type Activation, type Mlp, type MlpBatch, type MlpFault, type Trainable } from '../../core/nn';
import { blobs, gaussian, moons, type LabeledPoint } from '../../core/fixtures/datasets';
import { mulberry32 } from '../../core/random';
import type { Tone } from '../../core/tone';

// ── Datasets ────────────────────────────────────────────────────────────────

export type DatasetId = 'blobs' | 'moons' | 'xor' | 'circles';
export type Sample = LabeledPoint & { label: 0 | 1 };

/** Both axes of every plane in this lesson run over this range. */
export const DOMAIN: readonly [number, number] = [-3, 3];
/** The data is fixed per dataset; the learner's seed is the network's start, not the data. */
export const DATA_SEED = 7;
/** Class 0 and class 1 are two plain categories, never the verdict colours. */
export const CLASS_TONE: readonly [Tone, Tone] = ['orange', 'sky'];
export const CLASS_NAME = ['class 0', 'class 1'] as const;
export const MAX_POINTS = 200;

const BLOB_CENTRES = [[-1.2, -0.8], [1.2, 0.8]] as const;
const XOR_CENTRES = [[-1, -1], [1, 1], [-1, 1], [1, -1]] as const;
const MOON_SCALE = 1.6;
const MOON_SHIFT = { x: 0.5, y: 0.25 } as const;
const RING = { inner: 0.8, outer: 2, noise: 0.12 } as const;

/** XOR on the four corners of the square: class 1 where exactly one coordinate is positive. */
export const XOR_CORNERS: readonly Sample[] = XOR_CENTRES.map(([x, y]) => ({ x, y, label: (x > 0) !== (y > 0) ? 1 : 0 }));

const asSamples = (points: LabeledPoint[]): Sample[] => points.map((p) => ({ x: p.x, y: p.y, label: p.label === 1 ? 1 : 0 }));

/** Concentric rings: class 0 inside, class 1 outside. */
function circles(seed: number, n: number): Sample[] {
  const rnd = mulberry32(seed);
  return ([0, 1] as const).flatMap((label) =>
    Array.from({ length: n }, () => {
      const angle = rnd() * 2 * Math.PI;
      const radius = (label === 0 ? RING.inner : RING.outer) + gaussian(rnd) * RING.noise;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), label };
    }),
  );
}

export interface DatasetInfo {
  id: DatasetId;
  label: string;
  make: () => Sample[];
}

export const DATASETS: readonly DatasetInfo[] = [
  { id: 'blobs', label: 'Two blobs', make: () => asSamples(blobs({ seed: DATA_SEED, centers: BLOB_CENTRES, n: 20, spread: 0.55 })) },
  {
    id: 'moons',
    label: 'Two moons',
    make: () =>
      asSamples(moons({ seed: DATA_SEED, n: 40, noise: 0.1 })).map((p) => ({
        ...p,
        x: (p.x - MOON_SHIFT.x) * MOON_SCALE,
        y: (p.y - MOON_SHIFT.y) * MOON_SCALE,
      })),
  },
  { id: 'xor', label: 'XOR', make: () => asSamples(blobs({ seed: DATA_SEED, centers: XOR_CENTRES, n: 10, spread: 0.35 })).map(xorLabel) },
  { id: 'circles', label: 'Circles', make: () => circles(DATA_SEED, 40) },
];

/** blobs() labels the four centres 0..3; XOR wants the parity of the quadrant. */
function xorLabel(p: Sample): Sample {
  return { ...p, label: (p.x > 0) !== (p.y > 0) ? 1 : 0 };
}

const datasetCache = new Map<DatasetId, readonly Sample[]>();

/** The dataset's points, built once. */
export function datasetPoints(id: DatasetId): readonly Sample[] {
  let cached = datasetCache.get(id);
  if (!cached) {
    cached = DATASETS.find((d) => d.id === id)!.make();
    datasetCache.set(id, cached);
  }
  return cached;
}

/** Network input and label arrays for a dataset (the batch core/nn trains on). */
export const toBatch = (points: readonly Sample[]): MlpBatch => ({ xs: points.map((p) => [p.x, p.y]), ys: points.map((p) => p.label) });

// ── Scene 1: one neuron ─────────────────────────────────────────────────────

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export interface NeuronWeights {
  w1: number;
  w2: number;
  b: number;
}

/** p = sigma(w1 x1 + w2 x2 + b). */
export const neuronOutput = ({ w1, w2, b }: NeuronWeights, x: number, y: number): number => sigmoid(w1 * x + w2 * y + b);

/** Binary cross-entropy of a logit against a label, stable for large |z|. */
const logitLoss = (z: number, label: number): number => Math.max(z, 0) - label * z + Math.log1p(Math.exp(-Math.abs(z)));

export function neuronLoss(weights: NeuronWeights, points: readonly Sample[]): number {
  const total = points.reduce((sum, p) => sum + logitLoss(weights.w1 * p.x + weights.w2 * p.y + weights.b, p.label), 0);
  return total / points.length;
}

export function neuronAccuracy(weights: NeuronWeights, points: readonly Sample[]): number {
  return points.filter((p) => (neuronOutput(weights, p.x, p.y) > 0.5 ? 1 : 0) === p.label).length / points.length;
}

/** The neuron as a core/nn Trainable over [w1, w2, b], so createSgd steps it and gradCheck verifies it. */
export function createNeuron(start: NeuronWeights): Trainable<readonly Sample[]> {
  const params = [start.w1, start.w2, start.b];
  const weights = (): NeuronWeights => ({ w1: params[0], w2: params[1], b: params[2] });
  return {
    params,
    loss: (points) => neuronLoss(weights(), points),
    gradient(points) {
      const grad = [0, 0, 0];
      for (const p of points) {
        const delta = neuronOutput(weights(), p.x, p.y) - p.label;
        grad[0] += delta * p.x;
        grad[1] += delta * p.y;
        grad[2] += delta;
      }
      return grad.map((g) => g / points.length);
    },
  };
}

export const NEURON_RATE = 0.5;
export const FIT_STEPS = 100;

/** The slider ranges: a weight or bias outside them cannot be set by hand. */
export const WEIGHT_RANGE = { min: -5, max: 5, step: 0.1 } as const;

const clampToSliders = (v: number): number => Math.min(WEIGHT_RANGE.max, Math.max(WEIGHT_RANGE.min, v));

/** `steps` plain gradient-descent steps from `start`; the result is held inside the sliders' range so it can be shown on them. */
export function fitNeuron(start: NeuronWeights, points: readonly Sample[], steps: number): NeuronWeights {
  const neuron = createNeuron(start);
  const sgd = createSgd({ learningRate: NEURON_RATE });
  for (let i = 0; i < steps; i++) sgd.step(neuron, points);
  return { w1: clampToSliders(neuron.params[0]), w2: clampToSliders(neuron.params[1]), b: clampToSliders(neuron.params[2]) };
}
export const NEURON_DEFAULT: NeuronWeights = { w1: 0.3, w2: -0.8, b: 0 };
export const NEURON_DEFAULT_DATASET: DatasetId = 'blobs';

/** Where the line p = 0.5 (w1 x + w2 y + b = 0) crosses the plane's box, or null when both weights are 0. */
export function decisionLine({ w1, w2, b }: NeuronWeights, [lo, hi]: readonly [number, number] = DOMAIN): [[number, number], [number, number]] | null {
  if (w1 === 0 && w2 === 0) return null;
  if (Math.abs(w2) >= Math.abs(w1)) return [[lo, -(b + w1 * lo) / w2], [hi, -(b + w1 * hi) / w2]];
  return [[-(b + w2 * lo) / w1, lo], [-(b + w2 * hi) / w1, hi]];
}

/**
 * The best accuracy any straight line can reach on these points, by brute force: for each of many
 * directions, sort the points along it and try every cut between neighbours, on both sides.
 */
export function bestLineAccuracy(points: readonly Sample[], directions = 720): number {
  let best = 0;
  for (let d = 0; d < directions; d++) {
    const angle = (Math.PI * d) / directions;
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
    const sorted = points.map((p) => ({ t: p.x * ux + p.y * uy, label: p.label })).sort((a, b) => a.t - b.t);
    const ones = sorted.reduce((n, p) => n + p.label, 0);
    // Cut after index i: points up to i are predicted 0, the rest 1.
    let zerosBelow = 0;
    let onesBelow = 0;
    for (let i = -1; i < sorted.length; i++) {
      if (i >= 0) {
        if (sorted[i].label === 0) zerosBelow++;
        else onesBelow++;
      }
      const correct = zerosBelow + (ones - onesBelow);
      best = Math.max(best, correct, points.length - correct);
    }
  }
  return best / points.length;
}

const bestLineCache = new Map<DatasetId, number>();

/** `bestLineAccuracy` of a dataset, computed once. */
export function bestLineOf(id: DatasetId): number {
  let cached = bestLineCache.get(id);
  if (cached === undefined) {
    cached = bestLineAccuracy(datasetPoints(id));
    bestLineCache.set(id, cached);
  }
  return cached;
}

export interface NeuronStats {
  loss: number;
  accuracy: number;
  /** The best accuracy any line reaches on this dataset. */
  best: number;
}

export function neuronStats(weights: NeuronWeights, dataset: DatasetId): NeuronStats {
  const points = datasetPoints(dataset);
  return { loss: neuronLoss(weights, points), accuracy: neuronAccuracy(weights, points), best: bestLineOf(dataset) };
}

/**
 * Gradient descent on the four XOR corner points from a fixed start, for the claim that no setting
 * of one neuron beats ln 2 there. Returns the loss it settles at.
 */
export const XOR_FLOOR_START: NeuronWeights = { w1: 1.5, w2: -1, b: 0.5 };
export const XOR_FLOOR_STEPS = 4000;
export const XOR_FLOOR_RATE = 1;

export function xorCornerLoss(): number {
  const neuron = createNeuron(XOR_FLOOR_START);
  const sgd = createSgd({ learningRate: XOR_FLOOR_RATE });
  for (let i = 0; i < XOR_FLOOR_STEPS; i++) sgd.step(neuron, XOR_CORNERS);
  return neuron.loss(XOR_CORNERS);
}

/** The probability heat as a grid for `Heat`: class tone by side of 0.5, intensity by confidence. */
export function neuronHeat(weights: NeuronWeights) {
  return (x: number, y: number) => {
    const p = neuronOutput(weights, x, y);
    return { tone: CLASS_TONE[p > 0.5 ? 1 : 0], intensity: Math.abs(p - 0.5) * 2 };
  };
}

// ── Scene 2: the forward pass ───────────────────────────────────────────────

export type ForwardPreset = 'xor' | 'random';

/**
 * The hand-built ReLU XOR network (Goodfellow, Bengio and Courville, Deep Learning, ch. 6): hidden
 * weights all 1, hidden biases 0 and -1, output weights 1 and -2, output bias 0, linear output.
 * Layout is core/nn's: hidden weight rows (one per unit), hidden biases, output weights, output bias.
 */
export const XOR_NETWORK_PARAMS: readonly number[] = [1, 1, 1, 1, 0, -1, 1, -2, 0];

export const FORWARD_SEED_DEFAULT = 3;

/** A 2-2-1 ReLU network with a linear output: the hand-built XOR weights or a seeded random start. */
export function forwardNet(preset: ForwardPreset, seed: number): Mlp {
  const net = createMlp({ inputs: 2, hidden: [2], activation: 'relu', output: 'linear', seed });
  if (preset === 'xor') XOR_NETWORK_PARAMS.forEach((v, i) => (net.params[i] = v));
  return net;
}

/** Which of the nine parameters each of the diagram's six edges is: x1-h1, x2-h1, x1-h2, x2-h2, h1-out, h2-out. */
export const EDGE_PARAM: readonly number[] = [0, 1, 2, 3, 6, 7];

export interface ForwardArithmetic {
  hidden: { terms: [number, number]; bias: number; z: number; h: number }[];
  out: { terms: [number, number]; bias: number; value: number };
}

/** The forward pass by hand from the nine parameters (no trace): each product, each sum, the ReLU. */
export function forwardArithmetic(params: readonly number[], x: readonly [number, number]): ForwardArithmetic {
  const hidden = [0, 1].map((j) => {
    const terms: [number, number] = [params[2 * j] * x[0], params[2 * j + 1] * x[1]];
    const bias = params[4 + j];
    const z = terms[0] + terms[1] + bias;
    return { terms, bias, z, h: Math.max(z, 0) };
  });
  const terms: [number, number] = [params[6] * hidden[0].h, params[7] * hidden[1].h];
  return { hidden, out: { terms, bias: params[8], value: terms[0] + terms[1] + params[8] } };
}

export interface UnitNumbers {
  /** Inputs, hidden pre-activations and activations, output. */
  x: readonly number[];
  z: readonly number[];
  h: readonly number[];
  out: number;
}

export function forwardNumbers(net: Mlp, x: readonly [number, number]): UnitNumbers {
  const { z, a } = net.trace([...x]);
  return { x, z: z[0], h: a[1], out: a[2][0] };
}

/** The four corners of the unit square with XOR labels, in reading order. */
export const CORNERS: readonly Sample[] = [
  { x: 0, y: 0, label: 0 },
  { x: 0, y: 1, label: 1 },
  { x: 1, y: 0, label: 1 },
  { x: 1, y: 1, label: 0 },
];

/** Output above this reads as class 1 in the forward-pass scene (a linear output has no natural 0.5). */
export const FORWARD_CUT = 0.5;
export const INPUT_RANGE = { min: -0.5, max: 1.5, step: 0.25 } as const;
export const FORWARD_DEFAULT_INPUT: readonly [number, number] = [1, 1];

/** The XOR label of an input that is one of the four corners, else null. */
export function cornerLabel(x: readonly [number, number]): 0 | 1 | null {
  return CORNERS.find((c) => c.x === x[0] && c.y === x[1])?.label ?? null;
}

export interface CornerRow {
  corner: Sample;
  out: number;
  reading: 0 | 1;
  right: boolean;
}

/** What the network says on each corner, read at FORWARD_CUT. */
export function cornerReport(net: Mlp): { rows: CornerRow[]; right: number } {
  const rows = CORNERS.map((corner) => {
    const out = net.predict([corner.x, corner.y]);
    const reading: 0 | 1 = out > FORWARD_CUT ? 1 : 0;
    return { corner, out, reading, right: reading === corner.label };
  });
  return { rows, right: rows.filter((r) => r.right).length };
}

/**
 * The hidden-space plot's range: wide enough for the four corners and for any input the
 * sliders can reach, so dragging an input never rescales the plot.
 */
export function hiddenDomain(net: Mlp): [number, number] {
  const ends = [INPUT_RANGE.min, 0, 1, INPUT_RANGE.max];
  const values = ends.flatMap((a) => ends.flatMap((b) => net.trace([a, b]).a[1]));
  return [Math.floor(Math.min(...values, 0) - 0.5), Math.ceil(Math.max(...values, 1) + 0.5)];
}

/** The line out = FORWARD_CUT in hidden space: h2 as a function of h1, or null when the output ignores h2. */
export function hiddenCut(net: Mlp): ((h1: number) => number) | null {
  const [w1, w2] = [net.params[6], net.params[7]];
  const bias = net.params[8];
  if (w2 === 0) return null;
  return (h1) => (FORWARD_CUT - bias - w1 * h1) / w2;
}

// ── Scene 3: the backward pass ──────────────────────────────────────────────

export const BACKWARD_SEED_DEFAULT = 1;
export const BACKWARD_RATE = 0.5;
export const BACKWARD_EPOCHS = 300;

/** The 2-2-1 tanh network with a sigmoid output that scene 3 differentiates. */
export function backwardNet(seed: number, fault: MlpFault = 'none'): Mlp {
  return createMlp({ inputs: 2, hidden: [2], activation: 'tanh', output: 'sigmoid', seed, fault });
}

export interface ChainRule {
  x: readonly [number, number];
  y: number;
  /** Hidden activations and the output probability. */
  h: readonly [number, number];
  p: number;
  loss: number;
  /** delta_out = p - y for sigmoid + cross-entropy. */
  deltaOut: number;
  /** W2 weights (hidden -> output), as used by the hidden errors. */
  w2: readonly [number, number];
  /** f'(z) of each hidden unit (1 - h^2 for tanh), or 1 when the derivative is dropped. */
  slope: readonly [number, number];
  /** delta_hidden = (W2 delta_out) * f'(z). */
  deltaHidden: readonly [number, number];
  /** Gradients in core/nn's parameter order. */
  gradient: readonly number[];
}

/** The chain rule by hand on one example, written out the way the lesson shows it. */
export function chainRule(net: Mlp, x: readonly [number, number], y: number, dropDerivative = false): ChainRule {
  const { z, a } = net.trace([...x]);
  const h = [a[1][0], a[1][1]] as const;
  const p = a[2][0];
  const w2 = [net.params[6], net.params[7]] as const;
  const deltaOut = p - y;
  const slope = [dropDerivative ? 1 : 1 - h[0] * h[0], dropDerivative ? 1 : 1 - h[1] * h[1]] as const;
  const deltaHidden = [w2[0] * deltaOut * slope[0], w2[1] * deltaOut * slope[1]] as const;
  const gradient = [
    deltaHidden[0] * x[0], deltaHidden[0] * x[1], deltaHidden[1] * x[0], deltaHidden[1] * x[1],
    deltaHidden[0], deltaHidden[1],
    deltaOut * h[0], deltaOut * h[1], deltaOut,
  ];
  const loss = logitLoss(z[1][0], y);
  return { x, y, h, p, loss, deltaOut, w2, slope, deltaHidden, gradient };
}

/** Names for the nine parameters of the 2-2-1 network, in core/nn's order. */
export const PARAM_NAMES: readonly string[] = [
  'w: x1 to h1', 'w: x2 to h1', 'w: x1 to h2', 'w: x2 to h2', 'b: h1', 'b: h2', 'w: h1 to out', 'w: h2 to out', 'b: out',
];

export interface Nudge {
  /** Loss change actually measured, and its slope per unit weight. */
  actualChange: number;
  finiteDifference: number;
  /** The analytic gradient and the change it predicts for this epsilon. */
  analytic: number;
  predictedChange: number;
}

/** Add epsilon to one weight and compare the real change in the loss on one example with the gradient's prediction. */
export function nudge(net: Mlp, x: readonly [number, number], y: number, index: number, epsilon: number): Nudge {
  const batch: MlpBatch = { xs: [[...x]], ys: [y] };
  const before = net.loss(batch);
  const analytic = net.gradient(batch)[index];
  const original = net.params[index];
  net.params[index] = original + epsilon;
  const after = net.loss(batch);
  net.params[index] = original;
  return { actualChange: after - before, finiteDifference: (after - before) / epsilon, analytic, predictedChange: analytic * epsilon };
}

export interface CheckPanel {
  maxRelError: number;
  checked: number;
  skipped: number;
  numericForwardPasses: number;
  parameters: number;
}

/** gradCheck over the four corner examples, plus the cost of the numeric way for this network. */
export function checkPanel(net: Mlp): CheckPanel {
  const result = gradCheck(net, toBatch(XOR_CORNERS));
  return {
    maxRelError: result.maxRelError,
    checked: result.checked,
    skipped: result.skipped,
    numericForwardPasses: result.numericForwardPasses,
    parameters: net.params.length,
  };
}

export interface TrainOutcome {
  epochs: number;
  startLoss: number;
  endLoss: number;
  accuracy: number;
}

/** Full-batch gradient descent on the four XOR corners, with the correct or a broken backward pass. */
export function trainCorners(seed: number, fault: MlpFault, epochs = BACKWARD_EPOCHS, learningRate = BACKWARD_RATE): TrainOutcome {
  const net = backwardNet(seed, fault);
  const batch = toBatch(XOR_CORNERS);
  const sgd = createSgd({ learningRate });
  const startLoss = net.loss(batch);
  for (let i = 0; i < epochs; i++) sgd.step(net, batch);
  const correct = batch.xs.filter((x, i) => (net.predict(x) > 0.5 ? 1 : 0) === batch.ys[i]).length;
  return { epochs, startLoss, endLoss: net.loss(batch), accuracy: correct / batch.xs.length };
}

// ── Scene 4: train it ───────────────────────────────────────────────────────

export interface TrainConfig {
  dataset: DatasetId;
  /** Units in each hidden layer (one or two layers). */
  hidden: readonly number[];
  activation: Activation;
  learningRate: number;
  momentum: number;
  l2: number;
  seed: number;
}

export const HIDDEN_RANGE = { min: 1, max: 8 } as const;
/** The learning-rate slider walks these stops: 1, 1.5, 2, 3, 5 and 7 in every decade from 0.01 to 10, so a rate is always exactly what the slider shows. */
export const RATE_STOPS: readonly number[] = [...[0.01, 0.1, 1].flatMap((decade) => [1, 1.5, 2, 3, 5, 7].map((m) => Number((m * decade).toPrecision(2)))), 10];
export const MOMENTUM_RANGE = { min: 0, max: 0.95, step: 0.05 } as const;
export const L2_OPTIONS = [0, 0.001, 0.01] as const;
export const EPOCHS_PER_FRAME = 8;
export const STEP_EPOCHS = 100;
export const MAX_RECORDED_EPOCHS = 20_000;
/** A loss above this, or one that is not a number, ends the run as diverged. */
export const DIVERGED_LOSS = 20;
export const BOUNDARY_RESOLUTION = 40;
export const SWEEP_SEEDS = 20;
export const SWEEP_EPOCHS = 1500;

export const TRAIN_DEFAULT: TrainConfig = {
  dataset: 'xor',
  hidden: [3],
  activation: 'tanh',
  learningRate: 0.5,
  momentum: 0,
  l2: 0,
  seed: 1,
};


export interface TrainRun {
  readonly config: TrainConfig;
  readonly net: Mlp;
  readonly batch: MlpBatch;
  readonly points: readonly Sample[];
  /** Loss and accuracy after each epoch; entry 0 is the untrained network. */
  readonly lossHistory: number[];
  readonly accuracyHistory: number[];
  epoch: number;
  /** The epoch at which the run diverged, or null. */
  divergedAt: number | null;
  advance(epochs: number): void;
}

const accuracyOf = (net: Mlp, batch: MlpBatch): number =>
  batch.xs.filter((x, i) => (net.predict(x) > 0.5 ? 1 : 0) === batch.ys[i]).length / batch.xs.length;

export function createTrainRun(config: TrainConfig): TrainRun {
  const points = datasetPoints(config.dataset);
  const batch = toBatch(points);
  const net = createMlp({ inputs: 2, hidden: config.hidden, activation: config.activation, seed: config.seed, l2: config.l2 });
  const sgd = createSgd({ learningRate: config.learningRate, momentum: config.momentum });
  const run: TrainRun = {
    config,
    net,
    batch,
    points,
    lossHistory: [net.loss(batch)],
    accuracyHistory: [accuracyOf(net, batch)],
    epoch: 0,
    divergedAt: null,
    advance(epochs) {
      for (let i = 0; i < epochs && run.divergedAt === null && run.epoch < MAX_RECORDED_EPOCHS; i++) {
        sgd.step(net, batch);
        run.epoch++;
        const loss = net.loss(batch);
        if (!Number.isFinite(loss) || loss > DIVERGED_LOSS) {
          run.divergedAt = run.epoch;
          return;
        }
        run.lossHistory.push(loss);
        run.accuracyHistory.push(accuracyOf(net, batch));
      }
    },
  };
  return run;
}

export const lastLoss = (run: TrainRun): number => run.lossHistory[run.lossHistory.length - 1];
export const lastAccuracy = (run: TrainRun): number => run.accuracyHistory[run.accuracyHistory.length - 1];

/** Gradient norm of each layer, input side first, on the whole training set. */
export const layerNorms = (run: TrainRun): number[] => run.net.layerGradientNorms(run.net.gradient(run.batch));

/** The decision boundary as a grid for Heat (row 0 is the top of the plane). */
export function boundaryGrid(net: Mlp, resolution = BOUNDARY_RESOLUTION) {
  const [lo, hi] = DOMAIN;
  const step = (hi - lo) / resolution;
  return Array.from({ length: resolution }, (_, row) =>
    Array.from({ length: resolution }, (_, col) => {
      const p = net.predict([lo + (col + 0.5) * step, hi - (row + 0.5) * step]);
      return { tone: CLASS_TONE[p > 0.5 ? 1 : 0], intensity: Math.abs(p - 0.5) * 2 };
    }),
  );
}

export interface SweepResult {
  seeds: number;
  epochs: number;
  /** Runs that ended at 100% training accuracy without diverging. */
  solved: number;
  diverged: number;
}

/** A seed sweep that can be advanced a slice of epochs at a time, so the page never freezes for a whole sweep. */
export interface Sweep extends SweepResult {
  /** Runs finished so far. */
  finished: number;
  done: boolean;
  advance(epochBudget: number): void;
}

/** Train the same configuration from `seeds` consecutive seeds (the learner's first) and count the runs that reach 100%. */
export function createSweep(config: TrainConfig, seeds = SWEEP_SEEDS, epochs = SWEEP_EPOCHS): Sweep {
  let run: TrainRun | null = null;
  const sweep: Sweep = {
    seeds,
    epochs,
    solved: 0,
    diverged: 0,
    finished: 0,
    done: false,
    advance(epochBudget) {
      let budget = epochBudget;
      while (budget > 0 && !sweep.done) {
        run ??= createTrainRun({ ...config, seed: config.seed + sweep.finished });
        const slice = Math.min(budget, epochs - run.epoch);
        run.advance(slice);
        budget -= Math.max(slice, 1);
        if (run.epoch >= epochs || run.divergedAt !== null) {
          if (run.divergedAt !== null) sweep.diverged++;
          else if (lastAccuracy(run) === 1) sweep.solved++;
          run = null;
          sweep.finished++;
          sweep.done = sweep.finished >= seeds;
        }
      }
    },
  };
  return sweep;
}

/** The whole sweep at once (tests, and anything that does not need to stay responsive). */
export function seedSweep(config: TrainConfig, seeds = SWEEP_SEEDS, epochs = SWEEP_EPOCHS): SweepResult {
  const sweep = createSweep(config, seeds, epochs);
  sweep.advance(Number.MAX_SAFE_INTEGER);
  return { seeds, epochs, solved: sweep.solved, diverged: sweep.diverged };
}

// ── What scene 4 shows of a run ─────────────────────────────────────────────

/** A layer whose gradient is below this share of the output layer's is reported as vanishing. */
export const VANISH_BELOW = 0.2;
/** The most curve points drawn; longer histories are thinned evenly (the last point is always kept). */
export const MAX_CURVE_POINTS = 400;

export interface TrainSnapshot {
  epoch: number;
  loss: number;
  accuracy: number;
  startLoss: number;
  divergedAt: number | null;
  dead: number;
  /** Gradient norm per layer, input side first. */
  norms: number[];
  /** Input-side layer's gradient norm as a multiple of the output layer's. */
  inputToOutput: number;
  grid: ReturnType<typeof boundaryGrid>;
  wrong: boolean[];
  lossHistory: number[];
  accuracyHistory: number[];
  parameters: number;
  hiddenUnits: number;
}

export function trainSnapshot(run: TrainRun): TrainSnapshot {
  const norms = layerNorms(run);
  return {
    epoch: run.epoch,
    loss: lastLoss(run),
    accuracy: lastAccuracy(run),
    startLoss: run.lossHistory[0],
    divergedAt: run.divergedAt,
    dead: run.net.deadUnits(run.batch.xs),
    norms,
    inputToOutput: norms[0] / norms[norms.length - 1],
    grid: boundaryGrid(run.net),
    wrong: run.points.map((p) => (run.net.predict([p.x, p.y]) > 0.5 ? 1 : 0) !== p.label),
    lossHistory: run.lossHistory.slice(),
    accuracyHistory: run.accuracyHistory.slice(),
    parameters: run.net.params.length,
    hiddenUnits: run.config.hidden.reduce((a, b) => a + b, 0),
  };
}

/** `values` as curve points (x is the epoch), thinned to at most `MAX_CURVE_POINTS`. */
export function curvePoints(values: readonly number[]): [number, number][] {
  const stride = Math.max(1, Math.ceil(values.length / MAX_CURVE_POINTS));
  const points: [number, number][] = [];
  for (let i = 0; i < values.length; i += stride) points.push([i, values[i]]);
  const last = values.length - 1;
  if (last % stride !== 0) points.push([last, values[last]]);
  return points;
}

// ── Each scene's opening state: a pure function of nothing, so a test can switch through all of them ──

export const neuronOpening = () => ({ dataset: NEURON_DEFAULT_DATASET, weights: { ...NEURON_DEFAULT } });
export const forwardOpening = () => ({ preset: 'xor' as ForwardPreset, seed: FORWARD_SEED_DEFAULT, x: [...FORWARD_DEFAULT_INPUT] as [number, number] });
export const backwardOpening = () => ({ seed: BACKWARD_SEED_DEFAULT, example: 1, broken: false, nudgeIndex: 6, epsilon: 0.001 });
export const trainOpening = () => ({ config: { ...TRAIN_DEFAULT }, units: TRAIN_DEFAULT.hidden[0], layers: TRAIN_DEFAULT.hidden.length });
