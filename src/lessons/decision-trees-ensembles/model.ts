/**
 * Decision trees (CART-style, axis-aligned, two classes), bagged random forests and AdaBoost
 * with stumps, all computed from the points on screen. Pure: no React, no randomness except
 * the seeded mulberry32 streams passed in, so every result is reproducible per seed.
 */
import { blobs, moons, type LabeledPoint } from '../../core/fixtures/datasets';
import { mulberry32, shuffle, type Rnd } from '../../core/random';

export type Cls = 0 | 1;
export interface Sample {
  x: number;
  y: number;
  label: Cls;
}
/** 0 = the x feature, 1 = the y feature. */
export type Feature = 0 | 1;
export type Criterion = 'gini' | 'entropy';
export type Counts = readonly [number, number];

export const FEATURES: readonly Feature[] = [0, 1];
export const FEATURE_NAME: Record<Feature, string> = { 0: 'x', 1: 'y' };
export const valueOf = (p: { x: number; y: number }, f: Feature) => (f === 0 ? p.x : p.y);

/** The plotting domain every preset lives in. */
export const DOMAIN = { x: [-1.6, 2.6] as const, y: [-1.2, 1.6] as const };

// ── Impurity ─────────────────────────────────────────────────────────

/** Gini impurity 1 − Σ pᵢ², or entropy −Σ pᵢ log₂ pᵢ, of a node's class counts (0 for an empty node). */
export function impurity([n0, n1]: Counts, criterion: Criterion): number {
  const n = n0 + n1;
  if (n === 0) return 0;
  const ps = [n0 / n, n1 / n];
  if (criterion === 'gini') return 1 - ps.reduce((s, p) => s + p * p, 0);
  return ps.reduce((s, p) => (p > 0 ? s - p * Math.log2(p) : s), 0);
}

export const countsOf = (samples: readonly Sample[]): [number, number] => {
  const c: [number, number] = [0, 0];
  for (const s of samples) c[s.label]++;
  return c;
};

/** The majority class. A tie goes to class 0 (blue), so every leaf has one answer. */
export const majority = ([n0, n1]: Counts): Cls => (n1 > n0 ? 1 : 0);

// ── Splits ───────────────────────────────────────────────────────────

/** One candidate question "feature ≤ threshold?" and how good it is. */
export interface Candidate {
  feature: Feature;
  threshold: number;
  left: Counts;
  right: Counts;
  /** (n_left · I(left) + n_right · I(right)) / n: lower is better. */
  weighted: number;
}

/**
 * Every threshold on one feature: the midpoints between consecutive sorted distinct
 * values, scored by a running sweep of the class counts.
 */
export function candidates(samples: readonly Sample[], feature: Feature, criterion: Criterion): Candidate[] {
  const sorted = [...samples].sort((a, b) => valueOf(a, feature) - valueOf(b, feature));
  const total = countsOf(sorted);
  const n = sorted.length;
  const left: [number, number] = [0, 0];
  const out: Candidate[] = [];
  for (let i = 0; i < n - 1; i++) {
    left[sorted[i].label]++;
    const v = valueOf(sorted[i], feature);
    const next = valueOf(sorted[i + 1], feature);
    if (next === v) continue;
    const right: Counts = [total[0] - left[0], total[1] - left[1]];
    const nl = i + 1;
    const weighted = (nl * impurity(left, criterion) + (n - nl) * impurity(right, criterion)) / n;
    out.push({ feature, threshold: (v + next) / 2, left: [left[0], left[1]], right, weighted });
  }
  return out;
}

/**
 * The greedy best split over the given features: the lowest weighted impurity. Ties keep
 * the first one found (x before y, then the lower threshold), so the result is deterministic.
 */
export function bestSplit(samples: readonly Sample[], criterion: Criterion, features: readonly Feature[] = FEATURES): Candidate | null {
  let best: Candidate | null = null;
  for (const f of features) {
    for (const c of candidates(samples, f, criterion)) if (!best || c.weighted < best.weighted) best = c;
  }
  return best;
}

// ── Trees ────────────────────────────────────────────────────────────

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export type StopReason = 'pure' | 'depth' | 'min-samples' | 'no-threshold';

export interface TreeNode {
  id: number;
  depth: number;
  counts: Counts;
  impurity: number;
  prediction: Cls;
  /** The part of the plane this node is responsible for. */
  bounds: Rect;
  split: Candidate | null;
  left: number | null;
  right: number | null;
  /** Why it stays a leaf (null for a node that splits). */
  stop: StopReason | null;
  /** Its place in the growing order (breadth first): split number `order + 1`. Null for a leaf. */
  order: number | null;
  /** The samples that reached it, for the candidate table. */
  samples: readonly Sample[];
}

export interface Tree {
  nodes: TreeNode[];
  /** Number of splits in the fully grown tree. */
  splits: number;
}

export interface TreeOptions {
  maxDepth: number;
  /** A node with fewer samples than this stays a leaf (scikit-learn's min_samples_split). */
  minSamples: number;
  criterion: Criterion;
}

export const FULL_BOUNDS: Rect = { x0: DOMAIN.x[0], x1: DOMAIN.x[1], y0: DOMAIN.y[0], y1: DOMAIN.y[1] };

/**
 * Grows a tree breadth first. With `rnd`, each split looks at one feature picked at random
 * (a random forest's per-split feature sampling, max_features = 1 of 2), falling back to the
 * other feature only when the picked one has no threshold.
 */
export function growTree(samples: readonly Sample[], opts: TreeOptions, rnd?: Rnd): Tree {
  const nodes: TreeNode[] = [];
  const make = (s: readonly Sample[], depth: number, bounds: Rect): number => {
    const counts = countsOf(s);
    const id = nodes.length;
    nodes.push({
      id, depth, counts, impurity: impurity(counts, opts.criterion), prediction: majority(counts),
      bounds, split: null, left: null, right: null, stop: null, order: null, samples: s,
    });
    return id;
  };
  const queue = [make(samples, 0, FULL_BOUNDS)];
  let splits = 0;
  while (queue.length) {
    const node = nodes[queue.shift()!];
    const [n0, n1] = node.counts;
    if (n0 === 0 || n1 === 0) { node.stop = 'pure'; continue; }
    if (node.depth >= opts.maxDepth) { node.stop = 'depth'; continue; }
    if (n0 + n1 < opts.minSamples) { node.stop = 'min-samples'; continue; }
    const split = pickSplit(node.samples, opts.criterion, rnd);
    if (!split) { node.stop = 'no-threshold'; continue; }
    const goesLeft = (p: Sample) => valueOf(p, split.feature) <= split.threshold;
    const [lb, rb] = cut(node.bounds, split.feature, split.threshold);
    node.split = split;
    node.order = splits++;
    node.left = make(node.samples.filter(goesLeft), node.depth + 1, lb);
    node.right = make(node.samples.filter((p) => !goesLeft(p)), node.depth + 1, rb);
    queue.push(node.left, node.right);
  }
  return { nodes, splits };
}

function pickSplit(samples: readonly Sample[], criterion: Criterion, rnd?: Rnd): Candidate | null {
  if (!rnd) return bestSplit(samples, criterion);
  const first: Feature = rnd() < 0.5 ? 0 : 1;
  return bestSplit(samples, criterion, [first]) ?? bestSplit(samples, criterion, [first === 0 ? 1 : 0]);
}

function cut(b: Rect, f: Feature, t: number): [Rect, Rect] {
  return f === 0 ? [{ ...b, x1: t }, { ...b, x0: t }] : [{ ...b, y1: t }, { ...b, y0: t }];
}

/** Is this node split in the tree as grown so far (`steps` splits made)? */
export const isSplitAt = (n: TreeNode, steps: number) => n.order !== null && n.order < steps;

/** The node a point ends up in, after the first `steps` splits. */
export function leafFor(tree: Tree, p: { x: number; y: number }, steps = Infinity): TreeNode {
  let n = tree.nodes[0];
  while (isSplitAt(n, steps)) n = tree.nodes[valueOf(p, n.split!.feature) <= n.split!.threshold ? n.left! : n.right!];
  return n;
}

export const predictTree = (tree: Tree, p: { x: number; y: number }, steps = Infinity): Cls => leafFor(tree, p, steps).prediction;

/** The nodes visible after `steps` splits: the root and every child of a split node. */
export function visibleNodes(tree: Tree, steps: number): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (id: number) => {
    const n = tree.nodes[id];
    out.push(n);
    if (isSplitAt(n, steps)) { walk(n.left!); walk(n.right!); }
  };
  walk(0);
  return out;
}

export const depthAt = (tree: Tree, steps: number) => Math.max(...visibleNodes(tree, steps).map((n) => n.depth));
export const leavesAt = (tree: Tree, steps: number) => visibleNodes(tree, steps).filter((n) => !isSplitAt(n, steps));

/** The split lines drawn on the plot: each split node's threshold, across its own rectangle. */
export function splitLines(tree: Tree, steps: number): { node: TreeNode; from: [number, number]; to: [number, number] }[] {
  return visibleNodes(tree, steps)
    .filter((n) => isSplitAt(n, steps))
    .map((n) => {
      const { feature, threshold } = n.split!;
      const b = n.bounds;
      return feature === 0
        ? { node: n, from: [threshold, b.y0] as [number, number], to: [threshold, b.y1] as [number, number] }
        : { node: n, from: [b.x0, threshold] as [number, number], to: [b.x1, threshold] as [number, number] };
    });
}

export function accuracy(predict: (p: Sample) => Cls, samples: readonly Sample[]): number {
  if (!samples.length) return NaN;
  return samples.filter((s) => predict(s) === s.label).length / samples.length;
}

/** Confusion counts with class 1 (violet) as the "positive" class. */
export function confusion(predict: (p: Sample) => Cls, samples: readonly Sample[]) {
  const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const s of samples) {
    const p = predict(s);
    if (p === 1 && s.label === 1) c.tp++;
    else if (p === 1) c.fp++;
    else if (s.label === 1) c.fn++;
    else c.tn++;
  }
  return c;
}

// ── Random forest ────────────────────────────────────────────────────

/** Forest trees grow until pure (or 2 samples): bagging is there to tame exactly those deep, jumpy trees. */
export const FOREST_TREE: TreeOptions = { maxDepth: 12, minSamples: 2, criterion: 'gini' };
export const MAX_TREES = 25;

/** Tree t of a forest: its bootstrap sample (n draws with replacement) and its per-split feature picks. */
export function forestTree(train: readonly Sample[], seed: number, t: number): { tree: Tree; bootstrap: Sample[] } {
  const rnd = mulberry32(seed * 7919 + t * 104729 + 1);
  const bootstrap = Array.from({ length: train.length }, () => train[Math.floor(rnd() * train.length)]);
  return { tree: growTree(bootstrap, FOREST_TREE, rnd), bootstrap };
}

export function growForest(train: readonly Sample[], n: number, seed: number): Tree[] {
  return Array.from({ length: n }, (_, t) => forestTree(train, seed, t).tree);
}

/** How many trees vote violet (class 1). */
export const votesFor = (trees: readonly Tree[], p: { x: number; y: number }) => trees.filter((t) => predictTree(t, p) === 1).length;

/** Majority vote. The tree count is always odd, so with two classes there is never a tie. */
export const predictForest = (trees: readonly Tree[], p: { x: number; y: number }): Cls => (votesFor(trees, p) * 2 > trees.length ? 1 : 0);

/** Seeds compared by the variance readout. */
export const VARIANCE_SEEDS = 8;
const GRID = 40;

/** Points on an even grid over the domain, for "how much of the plane do two models disagree on". */
export const planeGrid = (() => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      pts.push({ x: DOMAIN.x[0] + ((i + 0.5) / GRID) * (DOMAIN.x[1] - DOMAIN.x[0]), y: DOMAIN.y[0] + ((j + 0.5) / GRID) * (DOMAIN.y[1] - DOMAIN.y[0]) });
    }
  }
  return pts;
})();

export interface SeedSpread {
  /** Validation accuracy per seed. */
  accuracies: number[];
  /** Mean share of the plane where two consecutive seeds' models disagree. */
  disagreement: number;
}

/** Retrain the same kind of model on `VARIANCE_SEEDS` seeds and measure how much it moves. */
export function seedSpread(train: readonly Sample[], val: readonly Sample[], size: number, firstSeed: number): SeedSpread {
  const models = Array.from({ length: VARIANCE_SEEDS }, (_, s) => growForest(train, size, firstSeed + s));
  const preds = models.map((m) => planeGrid.map((p) => predictForest(m, p)));
  let differ = 0;
  for (let s = 1; s < preds.length; s++) differ += preds[s].filter((v, i) => v !== preds[s - 1][i]).length / planeGrid.length;
  return {
    accuracies: models.map((m) => accuracy((p) => predictForest(m, p), val)),
    disagreement: differ / (preds.length - 1),
  };
}

// ── AdaBoost with stumps ─────────────────────────────────────────────

export const MAX_ROUNDS = 30;
/** Error floor for a perfect stump, so its α stays finite (and boosting stops after it). */
export const PERFECT_EPS = 1e-10;

export interface Stump {
  feature: Feature;
  threshold: number;
  /** The class predicted on the "≤ threshold" side. */
  below: Cls;
}

export const stumpPredict = (s: Stump, p: { x: number; y: number }): Cls => (valueOf(p, s.feature) <= s.threshold ? s.below : ((1 - s.below) as Cls));

/** The stump with the lowest weighted error (both directions, every midpoint threshold, both features). */
export function bestStump(samples: readonly Sample[], weights: readonly number[]): { stump: Stump; error: number } | null {
  let best: { stump: Stump; error: number } | null = null;
  for (const feature of FEATURES) {
    const order = samples.map((_, i) => i).sort((a, b) => valueOf(samples[a], feature) - valueOf(samples[b], feature));
    // Weight of class 1 and class 0 at or below the cut, swept left to right.
    let w1Below = 0;
    let w0Below = 0;
    const w1Total = samples.reduce((s, p, i) => s + (p.label === 1 ? weights[i] : 0), 0);
    const w0Total = samples.reduce((s, p, i) => s + (p.label === 0 ? weights[i] : 0), 0);
    for (let k = 0; k < order.length - 1; k++) {
      const i = order[k];
      if (samples[i].label === 1) w1Below += weights[i];
      else w0Below += weights[i];
      const v = valueOf(samples[i], feature);
      const next = valueOf(samples[order[k + 1]], feature);
      if (next === v) continue;
      const threshold = (v + next) / 2;
      // below = 0: wrong are the class-1 points below and the class-0 points above.
      const err0 = w1Below + (w0Total - w0Below);
      const err1 = w0Below + (w1Total - w1Below);
      if (!best || err0 < best.error) best = { stump: { feature, threshold, below: 0 }, error: err0 };
      if (err1 < best.error) best = { stump: { feature, threshold, below: 1 }, error: err1 };
    }
  }
  return best;
}

export interface BoostRound {
  stump: Stump;
  /** εₜ: the stump's weighted error under the weights it was trained on. */
  error: number;
  /** αₜ = ½ ln((1 − εₜ) / εₜ). */
  alpha: number;
  /** The weights this round's stump was fitted to (summing to 1). */
  weights: number[];
  /** The weights after this round's update, normalised: the next stump's. */
  nextWeights: number[];
  /** Training error of the combined model after this round. */
  trainError: number;
  /** Mean exponential loss (1/n) Σ exp(−yᵢ Fₜ(xᵢ)): AdaBoost's objective. */
  expLoss: number;
}

export interface Boosting {
  rounds: BoostRound[];
  /** Why it ended before MAX_ROUNDS: a perfect stump, or no stump better than a coin flip. */
  stopped: 'perfect' | 'chance' | null;
}

const sign = (c: Cls) => (c === 1 ? 1 : -1);

export const boostScore = (rounds: readonly BoostRound[], p: { x: number; y: number }) =>
  rounds.reduce((s, r) => s + r.alpha * sign(stumpPredict(r.stump, p)), 0);

/** The combined vote: sign of Σ αₜ hₜ(x); a score of exactly 0 goes to class 0. */
export const predictBoost = (rounds: readonly BoostRound[], p: { x: number; y: number }): Cls => (boostScore(rounds, p) > 0 ? 1 : 0);

export function adaboost(train: readonly Sample[], maxRounds = MAX_ROUNDS): Boosting {
  const n = train.length;
  let w = Array.from({ length: n }, () => 1 / n);
  const rounds: BoostRound[] = [];
  let stopped: Boosting['stopped'] = null;
  for (let t = 0; t < maxRounds && n > 0; t++) {
    const found = bestStump(train, w);
    if (!found || found.error >= 0.5) { stopped = 'chance'; break; }
    const error = Math.max(found.error, PERFECT_EPS);
    const alpha = 0.5 * Math.log((1 - error) / error);
    const raw = w.map((wi, i) => wi * Math.exp(-alpha * sign(train[i].label) * sign(stumpPredict(found.stump, train[i]))));
    const z = raw.reduce((s, v) => s + v, 0);
    const nextWeights = raw.map((v) => v / z);
    const done = [...rounds, { stump: found.stump, alpha } as BoostRound];
    rounds.push({
      stump: found.stump, error: found.error, alpha, weights: w, nextWeights,
      trainError: 1 - accuracy((p) => predictBoost(done, p), train),
      expLoss: train.reduce((s, p) => s + Math.exp(-sign(p.label) * boostScore(done, p)), 0) / n,
    });
    w = nextWeights;
    if (found.error <= PERFECT_EPS) { stopped = 'perfect'; break; }
  }
  return { rounds, stopped };
}

// ── Data ─────────────────────────────────────────────────────────────

export type PresetId = 'moons' | 'blobs' | 'noisy';
export const PRESET_IDS: readonly PresetId[] = ['moons', 'blobs', 'noisy'];
export const PRESET_LABELS: Record<PresetId, string> = {
  moons: 'Moons',
  blobs: 'Overlapping blobs',
  noisy: 'One noisy point',
};

export interface Dataset {
  train: Sample[];
  val: Sample[];
}

/** Share of the points used for training; the rest are validation. */
export const TRAIN_SHARE = 2 / 3;
const DATA_SEED = 12;

const asSample = (p: LabeledPoint): Sample => ({ x: p.x, y: p.y, label: p.label === 1 ? 1 : 0 });

function splitData(points: readonly LabeledPoint[], seed: number): Dataset {
  const mixed = shuffle(points.map(asSample), mulberry32(seed));
  const cut = Math.round(mixed.length * TRAIN_SHARE);
  return { train: mixed.slice(0, cut), val: mixed.slice(cut) };
}

/** The mislabelled training point of the "One noisy point" preset: violet, deep inside the blue blob. */
export const NOISY_POINT: Sample = { x: -0.45, y: 0.2, label: 1 };
const NOISY_SEED = 5;

export function presetData(id: PresetId): Dataset {
  if (id === 'moons') return splitData(moons({ seed: DATA_SEED, n: 45, noise: 0.22 }), DATA_SEED);
  if (id === 'blobs') return splitData(blobs({ seed: DATA_SEED, centers: [[-0.2, 0.55], [1.2, -0.1]], n: 45, spread: 0.5 }), DATA_SEED);
  const clean = splitData(blobs({ seed: NOISY_SEED, centers: [[-0.5, 0.2], [1.5, 0.2]], n: 36, spread: 0.32 }), NOISY_SEED);
  return { train: [...clean.train, NOISY_POINT], val: clean.val };
}
