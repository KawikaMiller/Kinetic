import { describe, expect, it } from 'vitest';
import { blobs } from './fixtures/datasets';
import { matMul } from './linalg';
import {
  attention,
  attentionBackward,
  convBackward,
  createAttentionHead,
  createConvNet,
  createFactorisation,
  createMlp,
  createSgd,
  gradCheck,
  type Activation,
  type AttentionBatch,
  type ConvBatch,
  type Rating,
  type Trainable,
} from './nn';
import { mulberry32 } from './random';

const XOR = {
  xs: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  ys: [0, 1, 1, 0],
};

const TOLERANCE = 1e-6;

const randomBatch = (seed: number, n = 6) => {
  const rnd = mulberry32(seed);
  return {
    xs: Array.from({ length: n }, () => [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]),
    ys: Array.from({ length: n }, () => (rnd() < 0.5 ? 0 : 1)),
  };
};

describe('gradCheck on the MLP', () => {
  for (const activation of ['tanh', 'sigmoid', 'relu'] as Activation[]) {
    it(`passes for ${activation} on 20 seeded networks`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const hidden = seed % 2 ? [5] : [4, 3];
        const net = createMlp({ inputs: 3, hidden, activation, seed, l2: seed % 3 ? 0 : 0.01 });
        const result = gradCheck(net, randomBatch(seed));
        expect(result.maxRelError).toBeLessThan(TOLERANCE);
        expect(result.checked).toBeGreaterThan(net.params.length / 2);
      }
    });
  }

  it('passes for a linear output with squared error', () => {
    const net = createMlp({ inputs: 3, hidden: [4], activation: 'tanh', output: 'linear', seed: 3 });
    const batch = { xs: randomBatch(3).xs, ys: [0.5, -1.2, 2, 0.1, 0, 3] };
    expect(gradCheck(net, batch).maxRelError).toBeLessThan(TOLERANCE);
  });

  it('reports the cost: 2P forward passes numerically against one forward and one backward pass', () => {
    const net = createMlp({ inputs: 2, hidden: [3], activation: 'tanh', seed: 1 });
    const result = gradCheck(net, XOR);
    expect(result.numericForwardPasses).toBe(2 * net.params.length);
    expect(result.backpropPasses).toBe(2);
  });

  it('skips ReLU kinks instead of reporting them as error', () => {
    const net = createMlp({ inputs: 2, hidden: [3], activation: 'relu', seed: 1 });
    net.params.fill(0);
    net.params[9] = 1; // output weights 1: every hidden pre-activation is exactly 0, on the kink
    net.params[10] = 1;
    net.params[11] = 1;
    const result = gradCheck(net, { xs: XOR.xs, ys: [1, 1, 1, 1] }); // XOR's own labels cancel at p = 0.5
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.maxRelError).toBeLessThan(TOLERANCE);
  });
});

describe('a deliberately wrong backward fails gradCheck', () => {
  const wrong = [
    ['drops f(z) from the hidden error', { hidden: [4, 3], fault: 'dropDerivative' }],
    ['multiplies by W instead of its transpose', { hidden: [4, 4], fault: 'transposeWeights' }],
    ['has the wrong sign', { hidden: [4], fault: 'flipSign' }],
  ] as const;
  for (const [name, { hidden, fault }] of wrong) {
    it(`an MLP that ${name}`, () => {
      const net = createMlp({ inputs: 3, hidden, activation: 'tanh', seed: 7, fault });
      expect(gradCheck(net, randomBatch(7)).maxRelError).toBeGreaterThan(1e-2);
    });
  }

  it('the same network with the correct backward passes', () => {
    const net = createMlp({ inputs: 3, hidden: [4, 4], activation: 'tanh', seed: 7 });
    expect(gradCheck(net, randomBatch(7)).maxRelError).toBeLessThan(TOLERANCE);
  });
});

describe('hand vectors', () => {
  it('a single sigmoid neuron: w = 0.5, b = 0, x = 2, y = 1', () => {
    // The output neuron of a 1-1-1 net, fed by a hidden unit that passes x straight through
    // (relu, weight 1, bias 0): its own arithmetic is the single neuron's.
    const net = createMlp({ inputs: 1, hidden: [1], activation: 'relu', seed: 1 });
    net.params.splice(0, 4, 1, 0, 0.5, 0);
    const batch = { xs: [[2]], ys: [1] };
    const p = net.predict([2]);
    expect(p).toBeCloseTo(0.7311, 4);
    expect(net.loss(batch)).toBeCloseTo(0.3133, 4);
    const grad = net.gradient(batch);
    expect(grad[2]).toBeCloseTo((p - 1) * 2, 10); // dL/dw of the output neuron
    expect(grad[2]).toBeCloseTo(-0.5379, 4);
    expect(grad[3]).toBeCloseTo(-0.2689, 4);
  });

  it('the hand-built ReLU XOR network returns exactly 0, 1, 1, 0 (linear output)', () => {
    const net = createMlp({ inputs: 2, hidden: [2], activation: 'relu', output: 'linear', seed: 1 });
    // hidden weights all 1, hidden biases 0 and -1, output weights 1 and -2, bias 0
    net.params.splice(0, net.params.length, 1, 1, 1, 1, 0, -1, 1, -2, 0);
    expect(XOR.xs.map((x) => net.predict(x))).toEqual([0, 1, 1, 0]);
  });

  it('trace exposes every z and a', () => {
    const net = createMlp({ inputs: 2, hidden: [2], activation: 'relu', output: 'linear', seed: 1 });
    net.params.splice(0, net.params.length, 1, 1, 1, 1, 0, -1, 1, -2, 0);
    const { z, a } = net.trace([1, 1]);
    expect(z).toEqual([[2, 1], [0]]);
    expect(a).toEqual([[1, 1], [2, 1], [0]]);
  });
});

describe('training', () => {
  const train = (net: Trainable<typeof XOR>, epochs: number, learningRate = 0.5, momentum = 0) => {
    const sgd = createSgd({ learningRate, momentum });
    const losses: number[] = [];
    for (let e = 0; e < epochs; e++) losses.push(sgd.step(net, XOR));
    return losses;
  };

  it('XOR loss falls on a fixed seed (momentum helps rather than hurts)', () => {
    const plain = createMlp({ inputs: 2, hidden: [4], activation: 'tanh', seed: 5 });
    const losses = train(plain, 2000);
    expect(losses[losses.length - 1]).toBeLessThan(0.1);
    expect(losses[losses.length - 1]).toBeLessThan(losses[0] / 5);
    const momentum = createMlp({ inputs: 2, hidden: [4], activation: 'tanh', seed: 5 });
    expect(train(momentum, 300, 0.2, 0.9).pop()).toBeLessThan(plain.loss(XOR) * 10 + 0.5);
    expect(XOR.xs.map((x) => Math.round(plain.predict(x)))).toEqual(XOR.ys);
  });

  it('is deterministic: the same seed gives the same curve', () => {
    const run = () => train(createMlp({ inputs: 2, hidden: [3], activation: 'tanh', seed: 9 }), 50);
    expect(run()).toEqual(run());
  });

  it('one hidden unit never gets XOR beyond 3 of 4 right, on 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const net = createMlp({ inputs: 2, hidden: [1], activation: 'tanh', seed });
      train(net, 1500);
      const right = XOR.xs.filter((x, i) => Math.round(net.predict(x)) === XOR.ys[i]).length;
      expect(right).toBeLessThanOrEqual(3);
    }
  });

  it('fits two blobs', () => {
    const points = blobs({ seed: 3, centers: [[-2, -2], [2, 2]], n: 30, spread: 0.8 });
    const data = { xs: points.map((p) => [p.x, p.y]), ys: points.map((p) => p.label) };
    const net = createMlp({ inputs: 2, hidden: [3], activation: 'relu', seed: 4 });
    const sgd = createSgd({ learningRate: 0.2, momentum: 0.5 });
    for (let e = 0; e < 300; e++) sgd.step(net, data);
    const right = data.xs.filter((x, i) => Math.round(net.predict(x)) === data.ys[i]).length;
    expect(right / data.xs.length).toBeGreaterThan(0.95);
  });

  it('a too-large learning rate diverges to a non-finite loss that the caller can detect', () => {
    const net = createMlp({ inputs: 2, hidden: [3], activation: 'tanh', output: 'linear', seed: 2 });
    const sgd = createSgd({ learningRate: 50 });
    const batch = { xs: XOR.xs, ys: [10, 20, 30, 40] };
    let last = 0;
    for (let e = 0; e < 200 && Number.isFinite(last); e++) last = sgd.step(net, batch);
    expect(Number.isFinite(last)).toBe(false);
  });

  it('counts dead ReLUs and splits gradient norms by layer', () => {
    const net = createMlp({ inputs: 2, hidden: [3], activation: 'relu', seed: 1 });
    net.params[6] = -100; // hidden unit 0's bias: negative on every point
    expect(net.deadUnits(XOR.xs)).toBeGreaterThanOrEqual(1);
    expect(createMlp({ inputs: 2, hidden: [3], activation: 'tanh', seed: 1 }).deadUnits(XOR.xs)).toBe(0);
    const norms = net.layerGradientNorms(net.gradient(XOR));
    expect(norms).toHaveLength(2);
  });

  it('refuses sizes outside the kit limits and bad optimiser settings', () => {
    expect(() => createMlp({ inputs: 2, hidden: [17], activation: 'tanh', seed: 1 })).toThrow(RangeError);
    expect(() => createMlp({ inputs: 2, hidden: [2, 2, 2], activation: 'tanh', seed: 1 })).toThrow(RangeError);
    expect(() => createMlp({ inputs: 2, hidden: [], activation: 'tanh', seed: 1 })).toThrow(RangeError);
    expect(() => createSgd({ learningRate: 0 })).toThrow(RangeError);
    expect(() => createSgd({ learningRate: 0.1, momentum: 1 })).toThrow(RangeError);
  });
});

describe('convolution', () => {
  const rnd = mulberry32(11);
  const grid = (h: number, w: number) => Array.from({ length: h }, () => Array.from({ length: w }, () => rnd() * 2 - 1));

  const naiveConv = (img: number[][], ker: number[][]) =>
    Array.from({ length: img.length - ker.length + 1 }, (_, oy) =>
      Array.from({ length: img[0].length - ker[0].length + 1 }, (_, ox) => {
        let s = 0;
        for (let ky = 0; ky < ker.length; ky++) for (let kx = 0; kx < ker[0].length; kx++) s += img[oy + ky][ox + kx] * ker[ky][kx];
        return s;
      }),
    );

  /** Loss = sum(c * conv(image, kernel)): its gradients are exactly convBackward's with dOut = c. */
  const probe = (target: 'kernel' | 'image', fault: 'none' | 'noFlip') => {
    const image = grid(5, 5);
    const kernel = grid(3, 3);
    const c = grid(3, 3);
    const params = (target === 'image' ? image : kernel).flat();
    const live = (m: number[][]) => m.map((_, y) => params.slice(y * m[0].length, (y + 1) * m[0].length));
    const current = () => ({ img: target === 'image' ? live(image) : image, ker: target === 'kernel' ? live(kernel) : kernel });
    const model: Trainable<null> = {
      params,
      loss: () => {
        const { img, ker } = current();
        return naiveConv(img, ker).reduce((s, row, y) => s + row.reduce((t, v, x) => t + v * c[y][x], 0), 0);
      },
      gradient: () => {
        const { img, ker } = current();
        const b = convBackward(img, ker, c, { fault });
        return (target === 'image' ? b.dImage : b.dKernel).flat();
      },
    };
    return model;
  };

  it('convBackward passes gradCheck for the kernel and the input', () => {
    expect(gradCheck(probe('kernel', 'none'), null).maxRelError).toBeLessThan(TOLERANCE);
    expect(gradCheck(probe('image', 'none'), null).maxRelError).toBeLessThan(TOLERANCE);
  });

  it('an input gradient without the kernel flip fails gradCheck', () => {
    expect(gradCheck(probe('image', 'noFlip'), null).maxRelError).toBeGreaterThan(1e-2);
  });

  const bars = (seed: number, n = 12): ConvBatch => {
    const r = mulberry32(seed);
    const images: number[][][] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const vertical = i % 2 === 0;
      const at = 1 + Math.floor(r() * 6);
      images.push(
        Array.from({ length: 8 }, (_, y) =>
          Array.from({ length: 8 }, (_, x) => ((vertical ? x : y) === at ? 1 : 0) + (r() - 0.5) * 0.2),
        ),
      );
      ys.push(vertical ? 1 : 0);
    }
    return { images, ys };
  };

  it('the conv net (kernels, biases, output weights) passes gradCheck', () => {
    for (const kernels of [1, 2]) {
      const net = createConvNet({ size: 8, kernels, seed: 4 });
      const result = gradCheck(net, bars(4));
      expect(result.maxRelError).toBeLessThan(TOLERANCE);
      expect(result.checked).toBeGreaterThan(net.params.length / 2);
    }
  });

  it('learns to tell vertical from horizontal bars', () => {
    const net = createConvNet({ size: 8, kernels: 2, seed: 4 });
    const data = bars(4, 24);
    const sgd = createSgd({ learningRate: 0.3, momentum: 0.5 });
    const first = sgd.step(net, data);
    for (let e = 0; e < 400; e++) sgd.step(net, data);
    expect(net.loss(data)).toBeLessThan(first / 3);
    const right = data.images.filter((img, i) => Math.round(net.predict(img)) === data.ys[i]).length;
    expect(right / data.images.length).toBeGreaterThan(0.9);
    expect(net.featureMap(data.images[0], 0)).toHaveLength(6);
  });
});

describe('attention', () => {
  it('weights are row-stochastic and the output is weights x V (hand vector)', () => {
    const Q = [[1, 0]];
    const K = [[1, 0], [0, 1]];
    const V = [[10, 0], [0, 10]];
    const { weights, output } = attention(Q, K, V);
    const e = Math.exp(1 / Math.sqrt(2));
    expect(weights[0][0]).toBeCloseTo(e / (e + 1), 12);
    expect(weights[0][0] + weights[0][1]).toBeCloseTo(1, 12);
    expect(output[0][0]).toBeCloseTo((10 * e) / (e + 1), 10);
  });

  it('a causal mask zeroes the future and a matrix mask zeroes what it forbids', () => {
    const X = [[1, 0], [0, 1], [1, 1]];
    const { weights } = attention(X, X, X, { mask: 'causal' });
    expect(weights[0]).toEqual([1, 0, 0]);
    expect(weights[1][2]).toBe(0);
    expect(weights[2].every((w) => w > 0)).toBe(true);
    const custom = attention(X, X, X, { mask: [[true, false, true], [true, true, false], [false, false, true]] });
    expect(custom.weights[0][1]).toBe(0);
    expect(custom.weights[2]).toEqual([0, 0, 1]);
  });

  it('a fully masked row gives zero weights, not NaN', () => {
    const { weights, output } = attention([[1, 1]], [[1, 0]], [[3, 4]], { mask: [[false]] });
    expect(weights).toEqual([[0]]);
    expect(output).toEqual([[0, 0]]);
  });

  const lookup = (): AttentionBatch => {
    const keys = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    const r = mulberry32(21);
    const values = keys.map(() => Array.from({ length: 4 }, () => r() * 2 - 1));
    return { queries: [keys[2]], keys, values, targets: [values[2]] };
  };

  it('W_q, W_k and W_v pass gradCheck, plain and causal', () => {
    for (const seed of [1, 2, 3]) {
      const head = createAttentionHead({ inputs: 4, keyDim: 3, valueDim: 4, seed });
      const batch = lookup();
      expect(gradCheck(head, batch).maxRelError).toBeLessThan(TOLERANCE);
      expect(gradCheck(head, { ...batch, values: undefined }).maxRelError).toBeLessThan(TOLERANCE);
      const X = [[1, 0, 0, 1], [0, 1, 1, 0], [1, 1, 0, 0]];
      const self: AttentionBatch = { queries: X, keys: X, targets: [[1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0]], mask: 'causal' };
      expect(gradCheck(head, self).maxRelError).toBeLessThan(TOLERANCE);
    }
  });

  it('a backward missing 1 / sqrt(d_k) fails gradCheck', () => {
    const head = createAttentionHead({ inputs: 4, keyDim: 3, valueDim: 4, seed: 1, fault: 'dropScale' });
    expect(gradCheck(head, lookup()).maxRelError).toBeGreaterThan(1e-2);
  });

  it('attentionBackward gives dV = weights^T dOut', () => {
    const Q = [[1, 2]];
    const K = [[1, 0], [0, 1]];
    const V = [[1, 0], [0, 1]];
    const { weights } = attention(Q, K, V);
    const { dV } = attentionBackward(Q, K, V, weights, [[1, 0]]);
    expect(dV).toEqual(matMul([[weights[0][0]], [weights[0][1]]], [[1, 0]]));
  });

  it('training the lookup raises the weight on the right item, on most of 20 seeds', () => {
    const batch = lookup();
    let solved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const head = createAttentionHead({ inputs: 4, keyDim: 4, valueDim: 4, seed });
      const sgd = createSgd({ learningRate: 1, momentum: 0.5 });
      for (let e = 0; e < 600; e++) sgd.step(head, batch);
      if (head.forward(batch).weights[0][2] > 0.8) solved++;
    }
    expect(solved).toBeGreaterThanOrEqual(15);
  });
});

describe('matrix factorisation', () => {
  // A rank-1 truth: rating(u, i) = (u + 1) * (i + 1) / 4.
  const ratings: Rating[] = [];
  for (let user = 0; user < 4; user++) {
    for (let item = 0; item < 5; item++) if ((user + item) % 3 !== 0) ratings.push({ user, item, rating: ((user + 1) * (item + 1)) / 4 });
  }

  it('passes gradCheck with and without a penalty', () => {
    for (const lambda of [0, 0.05]) {
      const model = createFactorisation({ users: 4, items: 5, factors: 3, seed: 2, lambda });
      expect(gradCheck(model, ratings).maxRelError).toBeLessThan(TOLERANCE);
    }
  });

  it('SGD drives the training RMSE down on observed cells', () => {
    const model = createFactorisation({ users: 4, items: 5, factors: 2, seed: 2 });
    const start = model.rmse(ratings);
    const sgd = createSgd({ learningRate: 0.5, momentum: 0.5 });
    for (let e = 0; e < 800; e++) sgd.step(model, ratings);
    expect(model.rmse(ratings)).toBeLessThan(start / 5);
    expect(model.rmse(ratings)).toBeLessThan(0.1);
  });
});
