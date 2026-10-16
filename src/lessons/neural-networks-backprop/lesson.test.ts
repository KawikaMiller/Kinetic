import { describe, expect, it } from 'vitest';
import { createSgd, gradCheck } from '../../core/nn';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { forwardCaption, neuronCaption, trainCaption } from './captions';
import { BACK_STEPS, LAST_STEP, backwardFrames, chainLines } from './frames';
import lesson from './index';
import {
  BACKWARD_EPOCHS, CORNERS, DIVERGED_LOSS, FIT_STEPS, NEURON_DEFAULT, SWEEP_SEEDS, TRAIN_DEFAULT, XOR_CORNERS, backwardNet, backwardOpening, bestLineOf, chainRule, checkPanel, cornerLabel,
  createTrainRun, datasetPoints, fitNeuron, forwardNet, forwardNumbers, forwardOpening, neuronOpening, neuronStats, seedSweep, toBatch, trainCorners, trainOpening, trainSnapshot, createNeuron,
} from './model';
import { sig } from '../../core/format';

const SLOW = { timeout: 120_000 };

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: default weights get 30% of the blobs; Fit reaches 100%; then on XOR Fit leaves the loss near 0.69 at 50%, below the 75% a line can reach', () => {
    const open = neuronOpening();
    expect(open.dataset).toBe('blobs');
    const blobs = datasetPoints('blobs');
    expect(neuronStats(open.weights, 'blobs').accuracy).toBe(0.3);
    const fitted = fitNeuron(open.weights, blobs, FIT_STEPS);
    expect(neuronStats(fitted, 'blobs').accuracy).toBe(1);
    const xor = datasetPoints('xor');
    const stalled = fitNeuron(fitted, xor, FIT_STEPS);
    const stats = neuronStats(stalled, 'xor');
    expect(stats.loss).toBeGreaterThan(0.68);
    expect(stats.loss).toBeLessThan(0.7);
    expect(stats.accuracy).toBe(0.5);
    expect(stats.best).toBe(0.75);
    // Pressing Fit again does not rescue it.
    expect(neuronStats(fitNeuron(stalled, xor, FIT_STEPS), 'xor').accuracy).toBe(0.5);
  });

  it('try-this 2: the hand-built network on corner (1, 1) reads hidden 2 and 1 and output 0; corner (0, 1) reads hidden 1 and 0 and output 1', () => {
    const open = forwardOpening();
    expect(open.preset).toBe('xor');
    expect(open.x).toEqual([1, 1]);
    const net = forwardNet(open.preset, open.seed);
    const at11 = forwardNumbers(net, [1, 1]);
    expect(at11.h).toEqual([2, 1]);
    expect(at11.out).toBe(0);
    const at01 = forwardNumbers(net, [0, 1]);
    expect(at01.h).toEqual([1, 0]);
    expect(at01.out).toBe(1);
    expect(expectCaption(forwardCaption({ numbers: at11, label: cornerLabel([1, 1]) }))).toContain('the network is right here');
  });

  it('try-this 3: switching to "Break it" turns gradCheck from passing to failing, and the table shows the broken run at ln 2 and the correct run far below', () => {
    const open = backwardOpening();
    expect(open.broken).toBe(false);
    expect(checkPanel(backwardNet(open.seed, 'none')).maxRelError).toBeLessThan(1e-6);
    expect(checkPanel(backwardNet(open.seed, 'dropDerivative')).maxRelError).toBeGreaterThan(1e-2);
    const good = trainCorners(open.seed, 'none');
    const bad = trainCorners(open.seed, 'dropDerivative');
    expect(Math.abs(bad.endLoss - Math.LN2)).toBeLessThan(1e-3);
    expect(good.endLoss).toBeLessThan(0.1);
  });

  it('try-this 4: from the default, 300 epochs reach 95%; one unit solves none of 20 seeds and three solve 18', SLOW, () => {
    const open = trainOpening();
    expect(open.config).toMatchObject({ dataset: 'xor', hidden: [3], activation: 'tanh', learningRate: 0.5, momentum: 0, seed: 1 });
    const run = createTrainRun(open.config);
    run.advance(300);
    expect(trainSnapshot(run).accuracy).toBe(0.95);
    expect(seedSweep({ ...open.config, hidden: [1] }).solved).toBe(0);
    expect(seedSweep(open.config).solved).toBe(18);
  });

  it('try-this 5: ReLU with rate 10 and momentum 0.5 diverges at epoch 5 and the caption says so', () => {
    const run = createTrainRun({ ...trainOpening().config, activation: 'relu', learningRate: 10, momentum: 0.5 });
    run.advance(100);
    expect(run.divergedAt).toBe(5);
    const snap = trainSnapshot(run);
    const text = expectCaption(trainCaption({ ...snap, activation: 'relu' }));
    expect(text).toContain('Diverged at epoch 5');
  });
});

describe('captions are computed from the model', () => {
  it('the neuron caption quotes weights, loss, accuracy and the brute-force ceiling at several settings, for both datasets', () => {
    for (const dataset of ['blobs', 'xor'] as const) {
      for (const weights of [NEURON_DEFAULT, { w1: 0, w2: 0, b: 0 }, { w1: -5, w2: 5, b: 2.5 }, fitNeuron(NEURON_DEFAULT, datasetPoints(dataset), FIT_STEPS)]) {
        const stats = neuronStats(weights, dataset);
        const text = expectCaption(neuronCaption(weights, dataset, stats));
        expect(text).toContain(`the loss is ${sig(stats.loss)}`);
        expect(text).toContain(`${Math.round(stats.accuracy * 100)}% of the points`);
        expect(text.includes('matches the best any straight line'), `${dataset} ${JSON.stringify(weights)}`).toBe(stats.accuracy >= stats.best - 1e-9);
        expect(text.includes('ceiling on XOR')).toBe(dataset === 'xor');
        expect(text).toContain(`${Math.round(bestLineOf(dataset) * 100)}%`);
      }
    }
  });

  it('the forward caption states the right/wrong verdict only on corners, from the real output', () => {
    for (const seed of [1, 2, 3, 4]) {
      const net = forwardNet('random', seed);
      for (const c of CORNERS) {
        const numbers = forwardNumbers(net, [c.x, c.y]);
        const text = expectCaption(forwardCaption({ numbers, label: c.label }));
        const reading = numbers.out > 0.5 ? 1 : 0;
        expect(text).toContain(`that is class ${reading}; XOR says class ${c.label}, so the network is ${reading === c.label ? 'right' : 'wrong'} here`);
      }
      const off = expectCaption(forwardCaption({ numbers: forwardNumbers(net, [0.5, 0.25]), label: cornerLabel([0.5, 0.25]) }));
      expect(off).toContain('not one of the four corners');
      expect(off).not.toContain('XOR says');
    }
  });

  it('every backward step has a caption, and each one quotes numbers from the chain rule it just computed', () => {
    for (const broken of [false, true]) {
      const net = backwardNet(1, broken ? 'dropDerivative' : 'none');
      for (const c of XOR_CORNERS) {
        const chain = chainRule(net, [c.x, c.y], c.label, broken);
        const frames = backwardFrames(chain, broken);
        expect(frames.map((f) => f.step)).toEqual([0, 1, 2, 3, 4]);
        expect(frames.length).toBe(LAST_STEP + 1);
        expect(BACK_STEPS.length).toBe(frames.length);
        const text = frames.map((f) => expectCaption(f.say));
        expect(text[0]).toContain(`p = ${sig(chain.p)}`);
        expect(text[0]).toContain(`the loss is ${sig(chain.loss)}`);
        expect(text[1]).toContain(sig(chain.deltaOut));
        expect(text[2]).toContain(`(${sig(chain.gradient[6])}, ${sig(chain.gradient[7])})`);
        expect(text[3]).toContain(`(${sig(chain.deltaHidden[0])}, ${sig(chain.deltaHidden[1])})`);
        expect(text[3].includes('Broken on purpose')).toBe(broken);
        expect(text[3].includes('(1 − h²) is the tanh slope')).toBe(!broken);
        const lines = chainLines(chain, broken);
        expect(lines.length).toBe(5);
        expect(lines[3].includes('slope is dropped')).toBe(broken);
        expect(lines[1]).toContain(sig(chain.deltaOut));
      }
    }
  });

  it('the train caption: untrained, trained (fell or rose), dead units and diverged, each from the run', () => {
    const fresh = createTrainRun(TRAIN_DEFAULT);
    expect(expectCaption(trainCaption({ ...trainSnapshot(fresh), activation: 'tanh' }))).toContain(`Untrained: the loss is ${sig(fresh.lossHistory[0])}`);
    fresh.advance(100);
    const snap = trainSnapshot(fresh);
    const trained = expectCaption(trainCaption({ ...snap, activation: 'tanh' }));
    expect(trained).toContain(`Epoch 100: the loss fell from ${sig(snap.startLoss)} to ${sig(snap.loss)}`);
    expect(trained).toContain(`${Math.round(snap.accuracy * 100)}% of the points are right`);
    expect(trained).not.toContain('dead');
    const dead = createTrainRun({ ...TRAIN_DEFAULT, dataset: 'circles', activation: 'relu', hidden: [8], learningRate: 10 });
    dead.advance(200);
    const deadSnap = trainSnapshot(dead);
    expect(deadSnap.dead).toBe(8);
    expect(expectCaption(trainCaption({ ...deadSnap, activation: 'relu' }))).toContain('8 of 8 hidden ReLU units are dead');
    const rose = expectCaption(trainCaption({ ...snap, loss: snap.startLoss + 1, activation: 'tanh' }));
    expect(rose).toContain('the loss rose');
    const diverged = expectCaption(trainCaption({ ...snap, divergedAt: 7, activation: 'tanh' }));
    expect(diverged).toContain('Diverged at epoch 7');
    expect(diverged).toContain(`passed ${DIVERGED_LOSS}`);
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: backprop produces the gradient and the step is gradient descent: one step moves each weight by exactly rate times its gradient', () => {
    const net = backwardNet(1);
    const batch = toBatch(XOR_CORNERS);
    const grad = net.gradient(batch);
    const before = [...net.params];
    createSgd({ learningRate: 0.25 }).step(net, batch);
    net.params.forEach((w, i) => expect(w).toBeCloseTo(before[i] - 0.25 * grad[i], 12));
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toContain('gradient descent then uses them');
  });

  it('Q2: with one hidden unit no setting beats 75% on XOR: the decision region is a half-plane, checked on a grid of 40,401 weight triples', () => {
    const points = datasetPoints('xor');
    let best = 0;
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 40; j++) {
        for (const b of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
          // One hidden unit then a monotone output: the class is decided by which side of w.x + b a point is on.
          const [w1, w2] = [(i - 20) / 5, (j - 20) / 5];
          const side = points.map((p) => (w1 * p.x + w2 * p.y + b > 0 ? 1 : 0));
          const agree = points.filter((p, k) => side[k] === p.label).length / points.length;
          best = Math.max(best, agree, 1 - agree);
        }
      }
    }
    expect(best).toBe(0.75);
    expect(bestLineOf('xor')).toBe(0.75);
  });

  it('Q3: dropping the slope makes gradCheck fail on 20 seeds, while the correct backward pass passes', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const wrong = backwardNet(seed, 'dropDerivative');
      expect(gradCheck(wrong, toBatch(XOR_CORNERS)).maxRelError).toBeGreaterThan(1e-2);
      expect(gradCheck(backwardNet(seed), toBatch(XOR_CORNERS)).maxRelError).toBeLessThan(1e-6);
    }
  });

  it('Q4: a million weights cost 2,000,000 numeric forward passes; the panel computes 2P from the weights it has', () => {
    const panel = checkPanel(backwardNet(1));
    expect(panel.numericForwardPasses).toBe(2 * panel.parameters);
    expect(2 * 1_000_000).toBe(2_000_000);
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toContain('2,000,000 forward passes');
  });

  it('a one-neuron gradient step from the sliders matches core/nn: the neuron is a Trainable like the rest', () => {
    const neuron = createNeuron(NEURON_DEFAULT);
    const points = datasetPoints('blobs');
    const before = [...neuron.params];
    const grad = neuron.gradient(points);
    createSgd({ learningRate: 0.5 }).step(neuron, points);
    neuron.params.forEach((w, i) => expect(w).toBeCloseTo(before[i] - 0.5 * grad[i], 12));
    expect(BACKWARD_EPOCHS).toBeGreaterThan(0);
    expect(SWEEP_SEEDS).toBe(20);
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key, so no scene inherits another scene\'s state', () => {
    const elements = sceneElements('neural-networks-backprop');
    expect(elements.map((e) => e.component)).toEqual(['ForwardScene', 'BackwardScene', 'TrainScene', 'NeuronScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });
});
