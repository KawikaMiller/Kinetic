import { describe, expect, it } from 'vitest';
import { blobs, moons } from '../../core/fixtures/datasets';
import {
  FEATURES, MAX_ROUNDS, NOISY_POINT, PRESET_IDS, accuracy, adaboost, bestSplit, bestStump, boostScore, candidates, confusion, depthAt,
  forestTree, growForest, growTree, impurity, leafFor, planeGrid, predictBoost, predictForest, predictTree, presetData, seedSpread,
  splitLines, stumpPredict, valueOf, visibleNodes,
  type Cls, type Criterion, type Feature, type Sample, type TreeOptions,
} from './model';

const CRITERIA: Criterion[] = ['gini', 'entropy'];

/** 50 seeded datasets of different shapes and sizes, plus the presets' training sets. */
const DATASETS: Sample[][] = [
  ...PRESET_IDS.map((id) => presetData(id).train),
  ...Array.from({ length: 50 }, (_, s) => {
    const pts = s % 2
      ? moons({ seed: 100 + s, n: 6 + (s % 9) * 3, noise: 0.1 + (s % 5) * 0.08 })
      : blobs({ seed: 100 + s, centers: [[0, 0], [1, 0.5]], n: 5 + (s % 7) * 4, spread: 0.3 + (s % 4) * 0.2 });
    return pts.map((p) => ({ x: p.x, y: p.y, label: (p.label === 1 ? 1 : 0) as Cls }));
  }),
];

/** Independent reference: impurity straight from the definition, with explicit probabilities. */
function refImpurity(samples: readonly Sample[], c: Criterion): number {
  if (!samples.length) return 0;
  const p1 = samples.filter((s) => s.label === 1).length / samples.length;
  const p0 = 1 - p1;
  if (c === 'gini') return 2 * p0 * p1;
  const h = (p: number) => (p === 0 ? 0 : -p * Math.log2(p));
  return h(p0) + h(p1);
}

/** Brute force: try "f ≤ v" for every feature and every value present, partition by filtering, score. */
function bruteBest(samples: readonly Sample[], c: Criterion, features: readonly Feature[] = FEATURES): number | null {
  let best: number | null = null;
  for (const f of features) {
    for (const v of new Set(samples.map((s) => valueOf(s, f)))) {
      const left = samples.filter((s) => valueOf(s, f) <= v);
      const right = samples.filter((s) => valueOf(s, f) > v);
      if (!left.length || !right.length) continue;
      const w = (left.length * refImpurity(left, c) + right.length * refImpurity(right, c)) / samples.length;
      if (best === null || w < best) best = w;
    }
  }
  return best;
}

describe('impurity', () => {
  it('matches hand-worked values', () => {
    expect(impurity([5, 5], 'gini')).toBeCloseTo(0.5, 12);
    expect(impurity([10, 0], 'gini')).toBe(0);
    expect(impurity([1, 3], 'gini')).toBeCloseTo(0.375, 12);
    expect(impurity([5, 5], 'entropy')).toBeCloseTo(1, 12);
    expect(impurity([0, 7], 'entropy')).toBe(0);
    expect(impurity([1, 3], 'entropy')).toBeCloseTo(0.811278124459, 10);
    expect(impurity([0, 0], 'gini')).toBe(0);
  });
});

describe('best split', () => {
  it('equals the brute-force best over every threshold on both features, for both criteria, on 53 datasets', () => {
    for (const data of DATASETS) {
      for (const c of CRITERIA) {
        const ref = bruteBest(data, c);
        const got = bestSplit(data, c);
        if (ref === null) expect(got).toBeNull();
        else expect(got!.weighted).toBeCloseTo(ref, 12);
      }
    }
  });

  it('the chosen threshold really produces the reported counts and score', () => {
    for (const data of DATASETS.slice(0, 20)) {
      const s = bestSplit(data, 'gini')!;
      const left = data.filter((p) => valueOf(p, s.feature) <= s.threshold);
      const right = data.filter((p) => valueOf(p, s.feature) > s.threshold);
      expect([left.filter((p) => p.label === 0).length, left.filter((p) => p.label === 1).length]).toEqual([...s.left]);
      expect(right.length).toBe(s.right[0] + s.right[1]);
      expect(s.weighted).toBeCloseTo((left.length * refImpurity(left, 'gini') + right.length * refImpurity(right, 'gini')) / data.length, 12);
    }
  });

  it('lists one candidate per gap between sorted distinct values', () => {
    const data: Sample[] = [{ x: 0, y: 0, label: 0 }, { x: 1, y: 5, label: 1 }, { x: 1, y: 2, label: 0 }, { x: 3, y: 2, label: 1 }];
    expect(candidates(data, 0, 'gini').map((c) => c.threshold)).toEqual([0.5, 2]);
    expect(candidates(data, 1, 'gini').map((c) => c.threshold)).toEqual([1, 3.5]);
  });
});

const OPTS: TreeOptions[] = [
  { maxDepth: 12, minSamples: 2, criterion: 'gini' },
  { maxDepth: 3, minSamples: 2, criterion: 'entropy' },
  { maxDepth: 6, minSamples: 10, criterion: 'gini' },
  { maxDepth: 1, minSamples: 2, criterion: 'gini' },
];

describe('growTree', () => {
  it('every split is the greedy best for the samples that reached it; leaves are pure or stopped by a limit', () => {
    for (const data of DATASETS) {
      for (const o of OPTS) {
        const t = growTree(data, o);
        for (const n of t.nodes) {
          if (n.split) {
            expect(n.split.weighted).toBeCloseTo(bruteBest(n.samples, o.criterion)!, 12);
            expect(t.nodes[n.left!].samples.length + t.nodes[n.right!].samples.length).toBe(n.samples.length);
            expect(t.nodes[n.left!].samples.every((p) => valueOf(p, n.split!.feature) <= n.split!.threshold)).toBe(true);
            continue;
          }
          const [n0, n1] = n.counts;
          if (n.stop === 'pure') expect(n0 === 0 || n1 === 0).toBe(true);
          else if (n.stop === 'depth') expect(n.depth).toBe(o.maxDepth);
          else if (n.stop === 'min-samples') expect(n0 + n1).toBeLessThan(o.minSamples);
          else {
            expect(n.stop).toBe('no-threshold');
            expect(new Set(n.samples.map((p) => `${p.x},${p.y}`)).size).toBe(1);
          }
        }
      }
    }
  });

  it('with no limits, every training point is classified correctly unless two points of different classes coincide', () => {
    for (const data of DATASETS) {
      const t = growTree(data, OPTS[0]);
      if (t.nodes.some((n) => n.depth === OPTS[0].maxDepth)) continue;
      expect(accuracy((p) => predictTree(t, p), data)).toBe(1);
    }
  });

  it('grows breadth first: split k never sits deeper than split k + 1', () => {
    for (const data of DATASETS.slice(0, 10)) {
      const t = growTree(data, OPTS[0]);
      const order = t.nodes.filter((n) => n.order !== null).sort((a, b) => a.order! - b.order!);
      for (let i = 1; i < order.length; i++) expect(order[i].depth).toBeGreaterThanOrEqual(order[i - 1].depth);
    }
  });

  it('a partial tree predicts with the majority of the node each point has reached so far', () => {
    const data = presetData('moons').train;
    const t = growTree(data, OPTS[0]);
    for (let steps = 0; steps <= t.splits; steps++) {
      for (const p of data) {
        const leaf = leafFor(t, p, steps);
        expect(leaf.samples).toContain(p);
        expect(predictTree(t, p, steps)).toBe(leaf.counts[1] > leaf.counts[0] ? 1 : 0);
      }
      expect(splitLines(t, steps)).toHaveLength(steps);
    }
    expect(visibleNodes(t, 0)).toHaveLength(1);
    expect(visibleNodes(t, t.splits)).toHaveLength(2 * t.splits + 1);
  });

  it('the regions tile the plane: each node\'s rectangle is exactly where points reach it', () => {
    const t = growTree(presetData('moons').train, OPTS[0]);
    for (const p of planeGrid) {
      const leaf = leafFor(t, p);
      const b = leaf.bounds;
      expect(p.x >= b.x0 - 1e-12 && p.x <= b.x1 + 1e-12 && p.y >= b.y0 - 1e-12 && p.y <= b.y1 + 1e-12).toBe(true);
    }
  });
});

describe('depth vs overfitting on the presets (the misconception)', () => {
  it('"One noisy point": the deep tree carves a one-point sliver and loses validation accuracy that depth 2 keeps', () => {
    const { train, val } = presetData('noisy');
    const deep = growTree(train, OPTS[0]);
    const shallow = growTree(train, { maxDepth: 2, minSamples: 2, criterion: 'gini' });
    const sliver = leafFor(deep, NOISY_POINT);
    expect(sliver.counts).toEqual([0, 1]);
    expect(accuracy((p) => predictTree(deep, p), train)).toBe(1);
    expect(accuracy((p) => predictTree(deep, p), val)).toBeLessThan(accuracy((p) => predictTree(shallow, p), val));
  });

  it('"Moons": the fully grown tree fits training perfectly but is not the best on validation', () => {
    const { train, val } = presetData('moons');
    const accs = [1, 2, 3, 4, 5, 6, 8, 12].map((d) => {
      const t = growTree(train, { maxDepth: d, minSamples: 2, criterion: 'gini' });
      return { d, train: accuracy((p) => predictTree(t, p), train), val: accuracy((p) => predictTree(t, p), val) };
    });
    const full = accs[accs.length - 1];
    expect(full.train).toBe(1);
    expect(Math.max(...accs.map((a) => a.val))).toBeGreaterThan(Math.min(...accs.filter((a) => a.d >= 4).map((a) => a.val)));
  });
});

describe('random forest', () => {
  it('a bootstrap has n draws, all from the training set, and is the same for the same seed', () => {
    const train = presetData('moons').train;
    const a = forestTree(train, 3, 4);
    const b = forestTree(train, 3, 4);
    expect(a.bootstrap).toHaveLength(train.length);
    expect(a.bootstrap.every((p) => train.includes(p))).toBe(true);
    expect(a.bootstrap).toEqual(b.bootstrap);
    expect(new Set(a.bootstrap).size).toBeLessThan(train.length);
    expect(forestTree(train, 4, 4).bootstrap).not.toEqual(a.bootstrap);
  });

  it('every forest prediction is the majority vote of its member trees', () => {
    const train = presetData('blobs').train;
    for (const n of [1, 3, 7, 25]) {
      const trees = growForest(train, n, 9);
      for (const p of planeGrid.filter((_, i) => i % 7 === 0)) {
        const ones = trees.map((t) => predictTree(t, p)).filter((c) => c === 1).length;
        expect(predictForest(trees, p)).toBe(ones > n - ones ? 1 : 0);
      }
    }
  });

  it('is deterministic per seed', () => {
    const train = presetData('moons').train;
    const a = growForest(train, 5, 2);
    const b = growForest(train, 5, 2);
    expect(planeGrid.map((p) => predictForest(a, p))).toEqual(planeGrid.map((p) => predictForest(b, p)));
  });

  it('on every preset, 25 bagged trees disagree across seeds on less of the plane than one tree does', () => {
    for (const id of PRESET_IDS) {
      const { train, val } = presetData(id);
      expect(seedSpread(train, val, 25, 1).disagreement).toBeLessThan(seedSpread(train, val, 1, 1).disagreement);
    }
  });
});

/** Brute-force stump: every value as a cut, both directions, weighted error by filtering. */
function bruteStumpError(data: readonly Sample[], w: readonly number[]): number {
  let best = Infinity;
  for (const f of FEATURES) {
    for (const v of new Set(data.map((s) => valueOf(s, f)))) {
      if (!data.some((s) => valueOf(s, f) > v)) continue;
      for (const below of [0, 1] as Cls[]) {
        const err = data.reduce((s, p, i) => s + ((valueOf(p, f) <= v ? below : 1 - below) !== p.label ? w[i] : 0), 0);
        best = Math.min(best, err);
      }
    }
  }
  return best;
}

describe('AdaBoost', () => {
  it('each stump has the lowest weighted error a stump can have, under that round\'s weights', () => {
    for (const data of DATASETS.slice(0, 15)) {
      const b = adaboost(data, 6);
      for (const r of b.rounds) expect(r.error).toBeCloseTo(bruteStumpError(data, r.weights), 12);
      const uniform = data.map(() => 1 / data.length);
      expect(bestStump(data, uniform)!.error).toBeCloseTo(bruteStumpError(data, uniform), 12);
    }
  });

  it('αₜ = ½ ln((1 − εₜ)/εₜ), and the weights update to wᵢ·exp(−αₜ yᵢ hₜ(xᵢ)) / Zₜ', () => {
    for (const id of PRESET_IDS) {
      const train = presetData(id).train;
      for (const r of adaboost(train).rounds) {
        expect(r.alpha).toBeCloseTo(0.5 * Math.log((1 - r.error) / r.error), 12);
        const wrong = train.map((p) => stumpPredict(r.stump, p) !== p.label);
        expect(r.error).toBeCloseTo(r.weights.reduce((s, w, i) => s + (wrong[i] ? w : 0), 0), 12);
        const z = 2 * Math.sqrt(r.error * (1 - r.error));
        r.nextWeights.forEach((w, i) => expect(w).toBeCloseTo((r.weights[i] * Math.exp(wrong[i] ? r.alpha : -r.alpha)) / z, 12));
        expect(r.nextWeights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12);
        // The points this stump got wrong carry exactly half the weight next round.
        expect(r.nextWeights.reduce((s, w, i) => s + (wrong[i] ? w : 0), 0)).toBeCloseTo(0.5, 12);
      }
    }
  });

  it('the exponential loss never rises (it is the product of Zₜ ≤ 1) and bounds the training error', () => {
    for (const data of [...PRESET_IDS.map((id) => presetData(id).train), ...DATASETS.slice(3, 23)]) {
      const b = adaboost(data);
      let product = 1;
      b.rounds.forEach((r, t) => {
        product *= 2 * Math.sqrt(r.error * (1 - r.error));
        // A perfect stump's ε is clamped to keep α finite, so the Zₜ identity only holds for the others.
        if (r.error > 1e-10) expect(r.expLoss).toBeCloseTo(product, 9);
        expect(r.trainError).toBeLessThanOrEqual(r.expLoss + 1e-12);
        if (t) expect(r.expLoss).toBeLessThanOrEqual(b.rounds[t - 1].expLoss + 1e-12);
      });
    }
  });

  it('training error itself is NOT monotone: on every preset some round makes it worse (the lesson says so)', () => {
    for (const id of PRESET_IDS) {
      const errs = adaboost(presetData(id).train).rounds.map((r) => r.trainError);
      expect(errs.some((e, t) => t > 0 && e > errs[t - 1])).toBe(true);
    }
  });

  it('the combined vote is the sign of Σ αₜ hₜ(x), and runs up to 30 rounds on the presets', () => {
    for (const id of PRESET_IDS) {
      const b = adaboost(presetData(id).train);
      expect(b.rounds).toHaveLength(MAX_ROUNDS);
      for (const p of planeGrid.filter((_, i) => i % 11 === 0)) {
        const s = b.rounds.reduce((acc, r) => acc + r.alpha * (stumpPredict(r.stump, p) === 1 ? 1 : -1), 0);
        expect(boostScore(b.rounds, p)).toBeCloseTo(s, 12);
        expect(predictBoost(b.rounds, p)).toBe(s > 0 ? 1 : 0);
      }
    }
  });

  it('stops after a perfect stump with a finite α', () => {
    const data: Sample[] = [{ x: 0, y: 0, label: 0 }, { x: 1, y: 0, label: 0 }, { x: 2, y: 0, label: 1 }, { x: 3, y: 0, label: 1 }];
    const b = adaboost(data);
    expect(b.stopped).toBe('perfect');
    expect(b.rounds).toHaveLength(1);
    expect(Number.isFinite(b.rounds[0].alpha)).toBe(true);
    expect(b.rounds[0].trainError).toBe(0);
  });
});

describe('confusion and depth helpers', () => {
  it('confusion counts add up and match accuracy', () => {
    const { train, val } = presetData('blobs');
    const t = growTree(train, OPTS[1]);
    const c = confusion((p) => predictTree(t, p), val);
    expect(c.tp + c.fp + c.fn + c.tn).toBe(val.length);
    expect((c.tp + c.tn) / val.length).toBeCloseTo(accuracy((p) => predictTree(t, p), val), 12);
    expect(depthAt(t, t.splits)).toBeLessThanOrEqual(3);
  });
});
