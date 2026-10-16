import { describe, expect, it } from 'vitest';
import { createMlp, createSgd, gradCheck } from '../../core/nn';
import { mulberry32 } from '../../core/random';
import {
  BOUNDARY_RESOLUTION, CORNERS, DATASETS, DIVERGED_LOSS, DOMAIN, MAX_CURVE_POINTS, MAX_POINTS, NEURON_DEFAULT, PARAM_NAMES, SWEEP_EPOCHS, SWEEP_SEEDS, TRAIN_DEFAULT, VANISH_BELOW, XOR_CORNERS,
  RATE_STOPS, XOR_NETWORK_PARAMS, backwardNet, backwardOpening, bestLineAccuracy, bestLineOf, boundaryGrid, chainRule, checkPanel, cornerLabel, cornerReport, createNeuron, createSweep, createTrainRun,
  curvePoints, datasetPoints, decisionLine, fitNeuron, forwardArithmetic, forwardNet, forwardNumbers, forwardOpening, hiddenDomain, lastAccuracy, neuronAccuracy, neuronLoss,
  neuronOpening, neuronOutput, nudge, seedSweep, toBatch, trainCorners, trainOpening, trainSnapshot, xorCornerLoss,
  type TrainConfig,
} from './model';

const SLOW = { timeout: 120_000 };
const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

describe('datasets', () => {
  it('stay within the compute budget and the plane, with both classes present', () => {
    for (const d of DATASETS) {
      const points = datasetPoints(d.id);
      expect(points.length).toBeLessThanOrEqual(MAX_POINTS);
      expect(new Set(points.map((p) => p.label))).toEqual(new Set([0, 1]));
      for (const p of points) {
        expect(p.x).toBeGreaterThan(DOMAIN[0]);
        expect(p.x).toBeLessThan(DOMAIN[1]);
        expect(p.y).toBeGreaterThan(DOMAIN[0]);
        expect(p.y).toBeLessThan(DOMAIN[1]);
      }
    }
  });

  it('XOR labels are the parity of the quadrant, and the corner constants are the four corners', () => {
    for (const p of datasetPoints('xor')) expect(p.label).toBe((p.x > 0) !== (p.y > 0) ? 1 : 0);
    expect(XOR_CORNERS.map((c) => [c.x, c.y, c.label])).toEqual([[-1, -1, 0], [1, 1, 0], [-1, 1, 1], [1, -1, 1]]);
  });

  it('the data is fixed: building a dataset twice gives the same points', () => {
    for (const d of DATASETS) expect(d.make()).toEqual(d.make());
  });
});

describe('one neuron (scene 1)', () => {
  it('hand vector: w = 0.5, b = 0, x = 2, y = 1 gives p = 0.7311, loss 0.3133, dL/dw = -0.5379, dL/db = -0.2689', () => {
    const point = [{ x: 2, y: 0, label: 1 as const }];
    const weights = { w1: 0.5, w2: 0, b: 0 };
    expect(neuronOutput(weights, 2, 0)).toBeCloseTo(0.7310585786, 9);
    expect(neuronLoss(weights, point)).toBeCloseTo(0.3132616875, 9);
    const grad = createNeuron(weights).gradient(point);
    expect(grad[0]).toBeCloseTo(-0.5378828427, 9);
    expect(grad[1]).toBeCloseTo(0, 12);
    expect(grad[2]).toBeCloseTo(-0.2689414214, 9);
  });

  it('passes gradCheck on every dataset from 20 seeded weight settings, and a sign-flipped gradient fails it', () => {
    const rnd = mulberry32(3);
    for (const d of DATASETS) {
      for (let k = 0; k < 20; k++) {
        const start = { w1: rnd() * 6 - 3, w2: rnd() * 6 - 3, b: rnd() * 6 - 3 };
        const points = datasetPoints(d.id);
        expect(gradCheck(createNeuron(start), points).maxRelError).toBeLessThan(1e-6);
      }
    }
    const neuron = createNeuron(NEURON_DEFAULT);
    const wrong = { ...neuron, gradient: (p: Parameters<typeof neuron.gradient>[0]) => neuron.gradient(p).map((g) => -g) };
    expect(gradCheck(wrong, datasetPoints('blobs')).maxRelError).toBeGreaterThan(1e-2);
  });

  it('no setting of one neuron gets below ln 2 on the four XOR corners: a grid of 4,913 settings, and gradient descent settles at ln 2', () => {
    let best = Infinity;
    for (let i = 0; i <= 16; i++) {
      for (let j = 0; j <= 16; j++) {
        for (let k = 0; k <= 16; k++) {
          best = Math.min(best, neuronLoss({ w1: i * 0.5 - 4, w2: j * 0.5 - 4, b: k * 0.5 - 4 }, XOR_CORNERS));
        }
      }
    }
    expect(best).toBeGreaterThanOrEqual(Math.LN2 - 1e-12);
    expect(Math.abs(xorCornerLoss() - Math.LN2)).toBeLessThan(1e-3);
  });

  it('one straight line reaches at most 75% on the XOR corners and on the XOR clusters, and 100% on the blobs', () => {
    expect(bestLineAccuracy(XOR_CORNERS)).toBe(0.75);
    expect(bestLineOf('xor')).toBe(0.75);
    expect(bestLineOf('blobs')).toBe(1);
  });

  it('bestLineAccuracy is at least what 20,000 random lines reach on the moons, and equals one of them at its best direction', () => {
    const points = datasetPoints('moons');
    const best = bestLineAccuracy(points);
    const rnd = mulberry32(11);
    let randomBest = 0;
    for (let i = 0; i < 20_000; i++) {
      const angle = rnd() * Math.PI;
      const offset = rnd() * 4 - 2;
      const correct = points.filter((p) => (p.x * Math.cos(angle) + p.y * Math.sin(angle) > offset ? 1 : 0) === p.label).length;
      randomBest = Math.max(randomBest, correct / points.length, 1 - correct / points.length);
    }
    expect(randomBest).toBeLessThanOrEqual(best + 1e-12);
    expect(randomBest).toBeGreaterThan(best - 0.05);
  });

  it('the decision line satisfies w1 x + w2 y + b = 0 at both ends, on the edge of the plane, and is null when both weights are zero', () => {
    const rnd = mulberry32(5);
    for (let k = 0; k < 50; k++) {
      const w = { w1: rnd() * 6 - 3, w2: rnd() * 6 - 3, b: rnd() * 6 - 3 };
      const line = decisionLine(w)!;
      for (const [x, y] of line) expect(w.w1 * x + w.w2 * y + w.b).toBeCloseTo(0, 9);
      const [a, b] = line;
      const onEdge = (x: number, y: number) => [x, y].some((v) => v === DOMAIN[0] || v === DOMAIN[1]);
      expect(onEdge(a[0], a[1]) && onEdge(b[0], b[1])).toBe(true);
    }
    expect(decisionLine({ w1: 0, w2: 0, b: 1 })).toBeNull();
  });

  it('fitting keeps the weights inside the sliders and raises blob accuracy to 100%', () => {
    let w = NEURON_DEFAULT;
    for (let i = 0; i < 20; i++) w = fitNeuron(w, datasetPoints('blobs'), 100);
    for (const v of [w.w1, w.w2, w.b]) expect(Math.abs(v)).toBeLessThanOrEqual(5);
    expect(neuronAccuracy(w, datasetPoints('blobs'))).toBe(1);
  });
});

describe('the forward pass (scene 2)', () => {
  const inputs: [number, number][] = [[0, 0], [0, 1], [1, 0], [1, 1]];

  it('the hand-built ReLU XOR network returns exactly 0, 1, 1, 0', () => {
    const net = forwardNet('xor', 1);
    expect(inputs.map((x) => forwardNumbers(net, x).out)).toEqual([0, 1, 1, 0]);
    expect(cornerReport(net).right).toBe(4);
  });

  it('XOR network hidden values at (1, 1) are z = (2, 1), h = (2, 1) by hand: 1 + 1 + 0 and 1 + 1 - 1', () => {
    const n = forwardNumbers(forwardNet('xor', 1), [1, 1]);
    expect(n.z).toEqual([2, 1]);
    expect(n.h).toEqual([2, 1]);
  });

  it('the by-hand arithmetic equals the traced forward pass on 200 seeded networks and inputs', () => {
    const rnd = mulberry32(8);
    for (const seed of seeds(40)) {
      const net = forwardNet('random', seed);
      for (let k = 0; k < 5; k++) {
        const x: [number, number] = [rnd() * 2 - 0.5, rnd() * 2 - 0.5];
        const a = forwardArithmetic(net.params, x);
        const t = forwardNumbers(net, x);
        a.hidden.forEach((u, j) => {
          expect(u.z).toBeCloseTo(t.z[j], 12);
          expect(u.h).toBeCloseTo(t.h[j], 12);
        });
        expect(a.out.value).toBeCloseTo(t.out, 12);
      }
    }
  });

  it('hidden control: the seed does not reach the hand-built preset, and does change the random one', () => {
    const reference = forwardNet('xor', 0).params;
    for (const seed of seeds(30, 0)) expect(forwardNet('xor', seed).params).toEqual(reference);
    expect(reference).toEqual([...XOR_NETWORK_PARAMS]);
    expect(forwardNet('random', 1).params).not.toEqual(forwardNet('random', 2).params);
  });

  it('only the four corners have an XOR label, and the label is XOR of the inputs', () => {
    for (const c of CORNERS) expect(cornerLabel([c.x, c.y])).toBe((c.x === 1) !== (c.y === 1) ? 1 : 0);
    expect(cornerLabel([0.5, 0.5])).toBeNull();
    expect(cornerLabel([2, 0])).toBeNull();
  });

  it('the hidden-space plot range holds the corners and every input the sliders can reach, so dragging never rescales it', () => {
    for (const seed of seeds(20)) {
      const net = forwardNet('random', seed);
      const [lo, hi] = hiddenDomain(net);
      for (const a of [-0.5, 0, 0.5, 1, 1.5]) {
        for (const b of [-0.5, 0, 0.5, 1, 1.5]) {
          for (const h of net.trace([a, b]).a[1]) {
            expect(h).toBeGreaterThanOrEqual(lo);
            expect(h).toBeLessThanOrEqual(hi);
          }
        }
      }
    }
  });
});

describe('the backward pass (scene 3)', () => {
  it('the by-hand chain rule equals core/nn on one example, correct and with the slope dropped, for 20 seeds and all four corners', () => {
    for (const seed of seeds(20)) {
      for (const dropped of [false, true]) {
        const net = backwardNet(seed, dropped ? 'dropDerivative' : 'none');
        for (const c of XOR_CORNERS) {
          const hand = chainRule(net, [c.x, c.y], c.label, dropped);
          const library = net.gradient({ xs: [[c.x, c.y]], ys: [c.label] });
          hand.gradient.forEach((g, i) => expect(g).toBeCloseTo(library[i], 12));
        }
      }
    }
  });

  it('hand vector: output error is p - y, and equals the central-difference slope of the loss with respect to the output bias', () => {
    const net = backwardNet(1);
    const c = chainRule(net, [-1, 1], 1);
    expect(c.deltaOut).toBe(c.p - 1);
    const h = 1e-6;
    const lossWith = (b: number) => {
      const original = net.params[8];
      net.params[8] = b;
      const value = net.loss({ xs: [[-1, 1]], ys: [1] });
      net.params[8] = original;
      return value;
    };
    expect(c.gradient[8]).toBeCloseTo((lossWith(net.params[8] + h) - lossWith(net.params[8] - h)) / (2 * h), 7);
  });

  it('gradCheck passes below 1e-6 on 20 seeded networks and fails (above 1e-2) with the slope dropped or the sign flipped', () => {
    for (const seed of seeds(20)) {
      expect(checkPanel(backwardNet(seed)).maxRelError).toBeLessThan(1e-6);
      expect(checkPanel(backwardNet(seed, 'dropDerivative')).maxRelError).toBeGreaterThan(1e-2);
      expect(checkPanel(backwardNet(seed, 'flipSign')).maxRelError).toBeGreaterThan(1e-2);
    }
  });

  it('the cost figures come from the network: 2P forward passes, P = the number of parameters (9 for a 2-2-1 network)', () => {
    const panel = checkPanel(backwardNet(1));
    expect(panel.parameters).toBe(9);
    expect(panel.numericForwardPasses).toBe(2 * panel.checked);
    expect(panel.checked + panel.skipped).toBe(panel.parameters);
    expect(PARAM_NAMES.length).toBe(panel.parameters);
    const big = createMlp({ inputs: 2, hidden: [16, 16], activation: 'tanh', seed: 1 });
    expect(checkPanel(big).numericForwardPasses).toBe(2 * big.params.length);
  });

  it('nudging a weight: the finite-difference slope approaches the analytic gradient as epsilon shrinks, and does not when the slope is dropped', () => {
    const net = backwardNet(1);
    const near = nudge(net, [-1, 1], 1, 6, 1e-5);
    const far = nudge(net, [-1, 1], 1, 6, 0.5);
    expect(Math.abs(near.finiteDifference - near.analytic)).toBeLessThan(1e-4);
    expect(Math.abs(far.finiteDifference - far.analytic)).toBeGreaterThan(Math.abs(near.finiteDifference - near.analytic));
    const broken = backwardNet(1, 'dropDerivative');
    const hiddenWeight = nudge(broken, [-1, 1], 1, 0, 1e-5);
    expect(Math.abs(hiddenWeight.finiteDifference - hiddenWeight.analytic)).toBeGreaterThan(1e-3);
    expect(net.params).toEqual(backwardNet(1).params);
  });

  it('training claim: with the correct backward pass the corners are solved, with the slope dropped the loss ends at ln 2, from seeds 1 to 3', () => {
    for (const seed of [1, 2, 3]) {
      const good = trainCorners(seed, 'none');
      const bad = trainCorners(seed, 'dropDerivative');
      expect(good.endLoss).toBeLessThan(0.1);
      expect(good.accuracy).toBe(1);
      expect(Math.abs(bad.endLoss - Math.LN2)).toBeLessThan(1e-3);
      expect(bad.accuracy).toBe(0.5);
      expect(bad.startLoss).toBe(good.startLoss);
    }
  });

  it('some seeds get a correct backward pass stuck too, so the table shows the run it is given (seed 4 ends above 0.3)', () => {
    expect(trainCorners(4, 'none').endLoss).toBeGreaterThan(0.3);
  });
});

describe('training (scene 4)', () => {
  it('loss falls over the first 50 epochs at a small learning rate on every dataset, for 20 seeds', () => {
    for (const d of DATASETS) {
      for (const seed of seeds(20)) {
        const run = createTrainRun({ ...TRAIN_DEFAULT, dataset: d.id, learningRate: 0.1, seed });
        run.advance(50);
        expect(run.lossHistory[50], `${d.id} seed ${seed}`).toBeLessThan(run.lossHistory[0]);
      }
    }
  });

  it('one hidden unit never beats the best straight line on XOR over 50 seeds, tanh, sigmoid and ReLU alike', SLOW, () => {
    const ceiling = bestLineOf('xor');
    for (const activation of ['tanh', 'sigmoid', 'relu'] as const) {
      for (const seed of seeds(50)) {
        const run = createTrainRun({ ...TRAIN_DEFAULT, hidden: [1], activation, seed });
        run.advance(300);
        expect(Math.max(...run.accuracyHistory), `${activation} seed ${seed}`).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('seed sweep: 20 seeds, 3 tanh units reach 100% on 18 and one unit on none, and a sliced sweep equals a whole one', SLOW, () => {
    const manual = (hidden: number[]) =>
      seeds(SWEEP_SEEDS).filter((seed) => {
        const run = createTrainRun({ ...TRAIN_DEFAULT, hidden, seed });
        run.advance(SWEEP_EPOCHS);
        return run.divergedAt === null && lastAccuracy(run) === 1;
      }).length;
    expect(manual([3])).toBe(18);
    expect(seedSweep(TRAIN_DEFAULT).solved).toBe(18);
    const sliced = createSweep(TRAIN_DEFAULT);
    while (!sliced.done) sliced.advance(7);
    expect(sliced.solved).toBe(18);
    expect(sliced.finished).toBe(SWEEP_SEEDS);
    expect(seedSweep({ ...TRAIN_DEFAULT, hidden: [1] }).solved).toBe(0);
  });

  it('a diverging setup (ReLU, rate 10, momentum 0.5) stops with a finite recorded history and no further epochs', () => {
    const run = createTrainRun({ ...TRAIN_DEFAULT, activation: 'relu', learningRate: 10, momentum: 0.5 });
    run.advance(100);
    expect(run.divergedAt).toBe(5);
    expect(run.epoch).toBe(5);
    expect(run.lossHistory.length).toBe(5);
    for (const loss of run.lossHistory) {
      expect(Number.isFinite(loss)).toBe(true);
      expect(loss).toBeLessThanOrEqual(DIVERGED_LOSS);
    }
    run.advance(100);
    expect(run.epoch).toBe(5);
  });

  it('a non-finite loss also ends the run as diverged, never plotted', () => {
    const run = createTrainRun({ ...TRAIN_DEFAULT, activation: 'relu', learningRate: 10, momentum: 0.95, hidden: [8], dataset: 'circles' });
    run.advance(200);
    expect(run.lossHistory.every(Number.isFinite)).toBe(true);
    expect(run.accuracyHistory.every(Number.isFinite)).toBe(true);
  });

  it('dead ReLUs: circles, 8 ReLU units, rate 10 leave all 8 dead, matching a count made by hand from the weights', () => {
    const run = createTrainRun({ ...TRAIN_DEFAULT, dataset: 'circles', activation: 'relu', hidden: [8], learningRate: 10, seed: 1 });
    run.advance(200);
    const p = run.net.params;
    let byHand = 0;
    for (let j = 0; j < 8; j++) {
      if (run.batch.xs.every((x) => p[2 * j] * x[0] + p[2 * j + 1] * x[1] + p[16 + j] < 0)) byHand++;
    }
    expect(byHand).toBe(8);
    expect(run.net.deadUnits(run.batch.xs)).toBe(byHand);
    expect(lastAccuracy(run)).toBe(0.5);
  });

  it('dead units are reported only for ReLU', () => {
    for (const activation of ['tanh', 'sigmoid'] as const) {
      const run = createTrainRun({ ...TRAIN_DEFAULT, activation });
      run.advance(20);
      expect(trainSnapshot(run).dead).toBe(0);
    }
  });

  it('vanishing gradients tend to appear with sigmoid units: two hidden layers, the input-side gradient is under the vanishing line on at least 18 of 20 seeds, and on none for tanh', () => {
    const ratio = (activation: 'sigmoid' | 'tanh', seed: number) => trainSnapshot(createTrainRun({ ...TRAIN_DEFAULT, hidden: [3, 3], activation, seed })).inputToOutput;
    expect(seeds(20).filter((seed) => ratio('sigmoid', seed) < VANISH_BELOW).length).toBeGreaterThanOrEqual(18);
    expect(seeds(20).filter((seed) => ratio('tanh', seed) < VANISH_BELOW).length).toBe(0);
  });

  it('the boundary grid has one cell per sample, row 0 at the top, and its class matches predict at that cell', () => {
    const run = createTrainRun(TRAIN_DEFAULT);
    run.advance(100);
    const grid = boundaryGrid(run.net);
    expect(grid.length).toBe(BOUNDARY_RESOLUTION);
    const step = (DOMAIN[1] - DOMAIN[0]) / BOUNDARY_RESOLUTION;
    for (const [row, col] of [[0, 0], [0, 39], [39, 0], [20, 20], [7, 31]]) {
      const x = DOMAIN[0] + (col + 0.5) * step;
      const y = DOMAIN[1] - (row + 0.5) * step;
      expect(grid[row][col].tone).toBe(run.net.predict([x, y]) > 0.5 ? 'sky' : 'orange');
    }
  });

  it('curvePoints thins long histories to the budget and keeps the first and last epoch', () => {
    const values = Array.from({ length: 5001 }, (_, i) => 1 / (1 + i));
    const points = curvePoints(values);
    expect(points.length).toBeLessThanOrEqual(MAX_CURVE_POINTS + 1);
    expect(points[0]).toEqual([0, 1]);
    expect(points[points.length - 1]).toEqual([5000, values[5000]]);
    expect(curvePoints([3, 2, 1])).toEqual([[0, 3], [1, 2], [2, 1]]);
  });

  it('the learning-rate stops run from 0.01 to 10 in increasing order, space out like a log scale, and contain the default and the try-this values exactly', () => {
    expect(RATE_STOPS[0]).toBe(0.01);
    expect(RATE_STOPS[RATE_STOPS.length - 1]).toBe(10);
    for (let i = 1; i < RATE_STOPS.length; i++) {
      expect(RATE_STOPS[i]).toBeGreaterThan(RATE_STOPS[i - 1]);
      expect(RATE_STOPS[i] / RATE_STOPS[i - 1]).toBeLessThan(2);
    }
    for (const rate of [TRAIN_DEFAULT.learningRate, 0.1, 1, 10]) expect(RATE_STOPS).toContain(rate);
  });

  it('control cross product: every dataset, activation, depth and L2 trains three epochs with finite numbers and a consistent snapshot', () => {
    for (const dataset of DATASETS.map((d) => d.id)) {
      for (const activation of ['tanh', 'relu', 'sigmoid'] as const) {
        for (const layers of [1, 2]) {
          for (const l2 of [0, 0.001, 0.01]) {
            const config: TrainConfig = { ...TRAIN_DEFAULT, dataset, activation, hidden: Array.from({ length: layers }, () => 3), l2 };
            const run = createTrainRun(config);
            run.advance(3);
            const snap = trainSnapshot(run);
            expect(snap.epoch).toBe(3);
            expect(snap.lossHistory.length).toBe(4);
            expect(snap.norms.length).toBe(layers + 1);
            expect([snap.loss, snap.accuracy, ...snap.norms].every(Number.isFinite)).toBe(true);
            expect(snap.wrong.length).toBe(run.points.length);
            expect(snap.wrong.filter((w) => !w).length / run.points.length).toBeCloseTo(snap.accuracy, 12);
          }
        }
      }
    }
  });

  it('the update is plain gradient descent on the gradient from core/nn: w - rate * gradient, weight by weight', () => {
    const net = createMlp({ inputs: 2, hidden: [3], activation: 'tanh', seed: 1 });
    const batch = toBatch(datasetPoints('xor'));
    const grad = net.gradient(batch);
    const before = [...net.params];
    createSgd({ learningRate: 0.5 }).step(net, batch);
    net.params.forEach((w, i) => expect(w).toBeCloseTo(before[i] - 0.5 * grad[i], 12));
  });

  it('training stays inside the compute budget: 1,000 epochs of the default run in under a second', () => {
    const started = performance.now();
    createTrainRun(TRAIN_DEFAULT).advance(1000);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('opening states are pure functions', () => {
  it('each scene opens from fresh values, and mutating one result never reaches the next', () => {
    const openers = [neuronOpening, forwardOpening, backwardOpening, trainOpening];
    for (const open of openers) {
      expect(open()).toEqual(open());
      expect(open()).not.toBe(open());
    }
    const x = forwardOpening().x;
    x[0] = 99;
    expect(forwardOpening().x).toEqual([1, 1]);
    const w = neuronOpening().weights;
    w.w1 = 99;
    expect(neuronOpening().weights).toEqual(NEURON_DEFAULT);
    const c = trainOpening().config;
    c.learningRate = 99;
    expect(trainOpening().config.learningRate).toBe(TRAIN_DEFAULT.learningRate);
  });
});
