import { describe, expect, it } from 'vitest';
import { softmax, matMul } from '../../core/linalg';
import { attention, createAttentionHead, createSgd, gradCheck } from '../../core/nn';
import { mulberry32 } from '../../core/random';
import type { Mat } from '../../core/vec';
import { COST_DEFAULT, DRAW_LIMIT, LIMITS, costs, count, linear, quadratic } from './cost';
import {
  ITEMS, LEARNED_WEIGHT, MAX_EPOCHS, VALUES, KEYS as ITEM_KEYS, blendedQuery, createLookupRun, learned, lookup, lookupSweep, trainingBatch,
} from './lookup';
import { costOpening, headOpening, headsOpening, lookupOpening, scaleOpening } from './openings';
import { DK_STOPS, HIST_BINS, KEYS, maxWeight, measureScaling, normalStream, softmaxGradientNorm } from './scaling';
import {
  EMBEDDINGS, HEAD_A_SHARPNESS, MODEL_DIM, N, TOKENS, headAWeights, oneHead, positionCode, shuffleTest, shuffled, twoHeads, withPositions, wordVectors,
} from './tokens';

const SLOW = { timeout: 120_000 };
const rndMat = (rnd: () => number, rows: number, cols: number): Mat => Array.from({ length: rows }, () => Array.from({ length: cols }, () => rnd() * 2 - 1));
const sumRow = (r: readonly number[]) => r.reduce((a, b) => a + b, 0);

/** Independent oracle: scalar loops, no matMul and no softmax helper. */
function naiveAttention(Q: Mat, K: Mat, V: Mat): { weights: Mat; output: Mat } {
  const [n, dk, dv] = [Q.length, Q[0].length, V[0].length];
  const weights = Q.map((q) => {
    const scores = K.map((k) => {
      let s = 0;
      for (let t = 0; t < dk; t++) s += q[t] * k[t];
      return s / Math.sqrt(dk);
    });
    const top = Math.max(...scores);
    let total = 0;
    const exps = scores.map((s) => {
      const e = Math.exp(s - top);
      total += e;
      return e;
    });
    return exps.map((e) => e / total);
  });
  const output = weights.map((w) => Array.from({ length: dv }, (_, c) => w.reduce((s, wj, j) => s + wj * V[j][c], 0)));
  return { weights, output: n === 0 ? [] : output };
}

describe('attention (scene 1)', () => {
  it('hand vector: Q = K = V = I2 gives scores 0.7071 / 0, weights 0.6698 / 0.3302 and outputs equal to the weight rows', () => {
    const I2 = [[1, 0], [0, 1]];
    const r = attention(I2, I2, I2);
    expect(r.scores[0][0]).toBeCloseTo(0.7071, 4);
    expect(r.scores[0][1]).toBe(0);
    expect(r.weights[0][0]).toBeCloseTo(0.6698, 4);
    expect(r.weights[0][1]).toBeCloseTo(0.3302, 4);
    expect(r.weights[1][0]).toBeCloseTo(0.3302, 4);
    expect(r.weights[1][1]).toBeCloseTo(0.6698, 4);
    expect(r.output).toEqual(r.weights);
  });

  it('equals a naive scalar-loop implementation on 100 seeded cases, rows add to 1 within 1e-12', () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const [n, dk, dv] = [2 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 4)];
      const [Q, K, V] = [rndMat(rnd, n, dk), rndMat(rnd, n, dk), rndMat(rnd, n, dv)];
      const mine = attention(Q, K, V);
      const want = naiveAttention(Q, K, V);
      mine.weights.forEach((row, a) => {
        expect(Math.abs(sumRow(row) - 1)).toBeLessThan(1e-12);
        row.forEach((w, b) => expect(w).toBeCloseTo(want.weights[a][b], 12));
      });
      mine.output.forEach((row, a) => row.forEach((v, c) => expect(v).toBeCloseTo(want.output[a][c], 11)));
    }
  });

  it('with the causal mask every weight above the diagonal is exactly 0 and the rows still add to 1', () => {
    const rnd = mulberry32(2);
    for (let i = 0; i < 30; i++) {
      const [Q, K, V] = [rndMat(rnd, 6, 4), rndMat(rnd, 6, 4), rndMat(rnd, 6, 2)];
      attention(Q, K, V, { mask: 'causal' }).weights.forEach((row, r) => {
        expect(Math.abs(sumRow(row) - 1)).toBeLessThan(1e-12);
        row.forEach((w, c) => c > r && expect(w).toBe(0));
      });
    }
  });

  it('the token weights of the lesson are real rows of that attention: the head\'s matrix equals attention on the projected embeddings', () => {
    const head = oneHead(EMBEDDINGS);
    const Q = EMBEDDINGS.map((e) => e.map((v) => v * 2));
    expect(head.weights).toEqual(attention(Q, Q, head.V).weights);
    head.weights.forEach((row) => expect(Math.abs(sumRow(row) - 1)).toBeLessThan(1e-12));
    expect(head.weights[0]).toEqual(head.weights[4]);
  });

  it('editing one dimension of "cat" moves its weights exactly where that dimension enters a score: tokens whose own value in it is 0 do not notice', () => {
    const edited = EMBEDDINGS.map((r) => [...r]);
    edited[1][1] = 0;
    const before = oneHead(EMBEDDINGS).weights;
    const after = oneHead(edited).weights;
    for (let r = 0; r < N; r++) {
      const enters = r === 1 || EMBEDDINGS[r][1] !== 0;
      expect(Math.abs(after[r][1] - before[r][1]) > 1e-9, `row ${r} (${TOKENS[r]}) column cat`).toBe(enters);
    }
    expect(after[1][5]).toBeLessThan(before[1][5]);
    // The whole edited matrix still equals the naive oracle.
    const Q = edited.map((e) => e.map((v) => v * 2));
    naiveAttention(Q, Q, oneHead(edited).V).weights.forEach((row, a) => row.forEach((w, b) => expect(after[a][b]).toBeCloseTo(w, 12)));
  });
});

describe('position, heads and the mask (scene 3)', () => {
  it('permutation equivariance: attention on projected rows satisfies f(P X) = P f(X) to 1e-12 for 100 seeded X, and fails once positions are added', () => {
    const rnd = mulberry32(3);
    let failedWithPositions = 0;
    for (let i = 0; i < 100; i++) {
      const [X, wq, wk, wv] = [rndMat(rnd, N, 4), rndMat(rnd, 4, 3), rndMat(rnd, 4, 3), rndMat(rnd, 4, 2)];
      const f = (x: Mat) => attention(matMul(x, wq), matMul(x, wk), matMul(x, wv)).output;
      const order = shuffled(N, i + 1);
      const permute = (m: Mat) => order.map((o) => m[o]);
      const plain = f(permute(X));
      permute(f(X)).forEach((row, r) => row.forEach((v, c) => expect(Math.abs(v - plain[r][c])).toBeLessThan(1e-12)));
      const withPos = (x: Mat) => x.map((row, r) => row.map((v, k) => v + (k < 2 ? positionCode(r, 2)[k] : 0)));
      const g = (x: Mat) => attention(matMul(withPos(x), wq), matMul(withPos(x), wk), matMul(withPos(x), wv)).output;
      const a = g(permute(X));
      const b = permute(g(X));
      if (a.some((row, r) => row.some((v, c) => Math.abs(v - b[r][c]) > 1e-9))) failedWithPositions++;
    }
    expect(failedWithPositions).toBeGreaterThan(95);
  });

  it('the sinusoidal position code equals the formula: PE(1, 0) = sin 1, PE(1, 1) = cos 1 at d = 2, and a hand-checked d = 6 row', () => {
    expect(positionCode(1, 2)).toEqual([Math.sin(1), Math.cos(1)]);
    expect(positionCode(0, 6)).toEqual([0, 1, 0, 1, 0, 1]);
    const d = 6;
    const pe = positionCode(3, d);
    for (let i = 0; i < d / 2; i++) {
      expect(pe[2 * i]).toBeCloseTo(Math.sin(3 / 10000 ** ((2 * i) / d)), 12);
      expect(pe[2 * i + 1]).toBeCloseTo(Math.cos(3 / 10000 ** ((2 * i) / d)), 12);
    }
  });

  it('withPositions touches only the two reserved dimensions, and adding it to word vectors never overlaps their numbers', () => {
    const words = wordVectors(EMBEDDINGS);
    const x = withPositions(words);
    x.forEach((row, r) => {
      expect(row.slice(2)).toEqual(words[r].slice(2));
      expect(row[0]).toBeCloseTo(Math.sin(r), 12);
      expect(row[1]).toBeCloseTo(Math.cos(r), 12);
    });
    expect(words[0].length).toBe(MODEL_DIM);
  });

  it('head A with no position code is uniform; with it, rows 2 to 6 put their top weight on the previous token', () => {
    const plain = twoHeads(EMBEDDINGS, { positions: false, causal: false }).a.weights;
    for (const row of plain) for (const w of row) expect(w).toBeCloseTo(1 / N, 12);
    const withPos = twoHeads(EMBEDDINGS, { positions: true, causal: false }).a.weights;
    for (let i = 1; i < N; i++) expect(withPos[i].indexOf(Math.max(...withPos[i])), `row ${i}`).toBe(i - 1);
    expect(HEAD_A_SHARPNESS).toBeGreaterThan(0);
    expect(headAWeights().wq.length).toBe(MODEL_DIM);
  });

  it('head A at the first token wraps to the last one without a mask (the code repeats every 2π), and stays on itself with the mask', () => {
    const open = twoHeads(EMBEDDINGS, { positions: true, causal: false }).a.weights[0];
    expect(open.indexOf(Math.max(...open))).toBe(N - 1);
    const masked = twoHeads(EMBEDDINGS, { positions: true, causal: true }).a.weights[0];
    expect(masked).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('head B gives the two "the" tokens equal weight on each other, more than on any other token', () => {
    const b = twoHeads(EMBEDDINGS, { positions: false, causal: false }).b.weights;
    expect(b[0][4]).toBeCloseTo(b[0][0], 12);
    for (const j of [1, 2, 3, 5]) expect(b[0][4]).toBeGreaterThan(b[0][j]);
  });

  it('both heads respect the causal mask exactly', () => {
    for (const positions of [false, true]) {
      const t = twoHeads(EMBEDDINGS, { positions, causal: true });
      for (const w of [t.a.weights, t.b.weights]) w.forEach((row, r) => row.forEach((v, c) => c > r && expect(v).toBe(0)));
    }
  });

  it('shuffled() is a deterministic permutation that is never the identity, for 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const order = shuffled(N, seed);
      expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      expect(order.some((v, i) => v !== i)).toBe(true);
      expect(shuffled(N, seed)).toEqual(order);
    }
  });

  it('the shuffle test over every control combination: order-blind exactly when nothing carries order, and it can fail', () => {
    const order = shuffled(N, 1);
    for (const positions of [false, true]) {
      for (const causal of [false, true]) {
        for (const two of [false, true]) {
          const rows = shuffleTest(EMBEDDINGS, { positions, causal, twoHeads: two }, order);
          const carriesOrder = causal || (positions && two);
          const allSame = rows.every((r) => r.same);
          expect(allSame, `pos ${positions} causal ${causal} two ${two}`).toBe(!carriesOrder);
        }
      }
    }
    // Positions with only head B change nothing (B ignores position), so the toggle feeds nothing in that mode.
    expect(twoHeads(EMBEDDINGS, { positions: true, causal: false }).b.output).toEqual(twoHeads(EMBEDDINGS, { positions: false, causal: false }).b.output);
  });

  it('broken variant: comparing each output with the row at the same position (not the same token) calls an order-blind layer order-aware', () => {
    const order = shuffled(N, 1);
    const before = twoHeads(EMBEDDINGS, { positions: false, causal: false }).concat;
    const after = twoHeads(EMBEDDINGS, { positions: false, causal: false, order }).concat;
    const byPosition = after.every((row, p) => row.every((v, k) => Math.abs(v - before[p][k]) < 1e-9));
    expect(byPosition).toBe(false);
    expect(shuffleTest(EMBEDDINGS, { positions: false, causal: false, twoHeads: true }, order).every((r) => r.same)).toBe(true);
  });
});

describe('why divide by sqrt(d_k) (scene 2)', () => {
  it('the sample standard deviation of q . k is within 3% of sqrt(d_k) at d_k = 4, 16, 64, 256 on 20,000 draws', () => {
    for (const dk of [4, 16, 64, 256]) {
      const r = measureScaling(dk, 21, 20_000, 10);
      expect(Math.abs(r.sd / Math.sqrt(dk) - 1), `d_k ${dk}`).toBeLessThan(0.03);
    }
  });

  it('scaled weights are spread out and unscaled ones are nearly one-hot: scaled stays near its theory value, unscaled climbs, at d_k = 64 and 512', () => {
    // Independent oracle: scores drawn straight from N(0, d_k) and N(0, 1) with another generator, no vectors.
    const oracle = (sd: number, seed: number) => {
      const normal = normalStream(mulberry32(seed));
      let total = 0;
      for (let n = 0; n < 20_000; n++) total += maxWeight(Array.from({ length: KEYS }, () => normal() * sd));
      return total / 20_000;
    };
    const scaledOracle = oracle(1, 99);
    for (const dk of [64, 512]) {
      const r = measureScaling(dk);
      expect(Math.abs(r.unscaledMax - oracle(Math.sqrt(dk), 98))).toBeLessThan(0.03);
      expect(Math.abs(r.scaledMax - scaledOracle)).toBeLessThan(0.02);
      expect(r.scaledMax).toBeLessThan(r.unscaledMax);
      expect(r.unscaledGrad).toBeLessThan(r.scaledGrad);
    }
    expect(measureScaling(512).unscaledMax).toBeGreaterThan(0.9);
    expect(measureScaling(64).scaledMax).toBeLessThan(0.45);
  });

  it('at d_k = 1 dividing by the square root changes nothing, so the two measurements agree', () => {
    const r = measureScaling(1);
    expect(r.scaledMax).toBe(r.unscaledMax);
  });

  it('maxWeight equals the largest entry of core softmax; the gradient norm equals the Frobenius norm of diag(w) - w w^T', () => {
    const rnd = mulberry32(4);
    for (let i = 0; i < 50; i++) {
      const scores = Array.from({ length: 8 }, () => (rnd() - 0.5) * 20);
      const t = 0.5 + rnd() * 8;
      const w = softmax(scores, t);
      expect(maxWeight(scores, t)).toBeCloseTo(Math.max(...w), 12);
      let frob = 0;
      for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) frob += ((a === b ? w[a] : 0) - w[a] * w[b]) ** 2;
      expect(softmaxGradientNorm(w)).toBeCloseTo(Math.sqrt(frob), 12);
    }
    expect(softmaxGradientNorm([1, 0, 0, 0])).toBe(0);
  });

  it('the normal stream has mean 0 and variance 1 over 100,000 draws and repeats from its seed', () => {
    const draw = (seed: number) => {
      const next = normalStream(mulberry32(seed));
      return Array.from({ length: 100_000 }, next);
    };
    const xs = draw(5);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(variance - 1)).toBeLessThan(0.02);
    expect(draw(5).slice(0, 50)).toEqual(xs.slice(0, 50));
  });

  it('the histogram holds the samples (at most a couple fall outside four deviations of the widest setting), and results are cached', () => {
    for (const dk of DK_STOPS) {
      const r = measureScaling(dk);
      expect(r.histogram.counts.length).toBe(HIST_BINS);
      expect(r.histogram.counts.reduce((a, b) => a + b, 0) + r.histogram.outside).toBe(r.dots.length);
      expect(r.histogram.outside).toBeLessThanOrEqual(2);
    }
    expect(measureScaling(64)).toBe(measureScaling(64));
  });
});

describe('learn a lookup (scene 4)', () => {
  it('the head passes gradCheck on the lookup batch, a head without the 1/sqrt(d_k) fails it, and W_v takes no part', () => {
    const batch = trainingBatch();
    const head = createAttentionHead({ inputs: ITEMS, keyDim: ITEMS, valueDim: ITEMS, seed: 1 });
    expect(gradCheck(head, batch).maxRelError).toBeLessThan(1e-6);
    const wrong = createAttentionHead({ inputs: ITEMS, keyDim: ITEMS, valueDim: ITEMS, seed: 1, fault: 'dropScale' });
    expect(gradCheck(wrong, batch).maxRelError).toBeGreaterThan(1e-2);
    const before = head.params.slice(2 * ITEMS * ITEMS);
    const sgd = createSgd({ learningRate: 1 });
    for (let i = 0; i < 50; i++) sgd.step(head, batch);
    expect(head.params.slice(2 * ITEMS * ITEMS)).toEqual(before);
  });

  it('an untrained head attends about evenly (about 1 in 4 on the right key) on seeds 1 to 20', () => {
    for (let seed = 1; seed <= 20; seed++) for (const w of createLookupRun(seed).diagonalHistory[0]) {
      expect(w).toBeGreaterThan(0.1);
      expect(w).toBeLessThan(0.4);
    }
  });

  it('stated share: all 20 seeds put at least 80% on the right key for all four queries within 300 epochs, so the scene is not cut', SLOW, () => {
    expect(lookupSweep(1)).toEqual({ seeds: 20, epochs: 300, learnedCount: 20 });
    expect(LEARNED_WEIGHT).toBe(0.8);
    const run = createLookupRun(1);
    run.advance(MAX_EPOCHS + 50);
    expect(run.epoch).toBe(MAX_EPOCHS);
    expect(learned(run)).toBe(true);
  });

  it('the trained lookup follows the query: each key returns near its own value, and a half-and-half query splits the weight between its two items', () => {
    const run = createLookupRun(1);
    run.advance(300);
    for (let i = 0; i < ITEMS; i++) {
      const { weights, output } = lookup(run.head, ITEM_KEYS[i]);
      expect(Math.abs(sumRow(weights) - 1)).toBeLessThan(1e-12);
      expect(weights.indexOf(Math.max(...weights))).toBe(i);
      output.forEach((v, k) => expect(Math.abs(v - VALUES[i][k])).toBeLessThan(0.5));
    }
    const { weights } = lookup(run.head, blendedQuery(0, 1, 0.5));
    expect(weights[0] + weights[1]).toBeGreaterThan(0.8);
    expect(blendedQuery(0, 1, 0)).toEqual(ITEM_KEYS[0]);
    expect(blendedQuery(0, 1, 1)).toEqual(ITEM_KEYS[1]);
  });

  it('the diagonal rises over training for the default seed, from about 0.25 to above 0.9', () => {
    const run = createLookupRun(1);
    run.advance(300);
    run.diagonalHistory[0].forEach((w, i) => expect(run.diagonalHistory[300][i]).toBeGreaterThan(w + 0.5));
    expect(Math.min(...run.diagonalHistory[300])).toBeGreaterThan(0.9);
  });
});

describe('cost of context (scene 5)', () => {
  it('the figures equal their formulas for 100 typed values, including the biggest the fields allow', () => {
    const rnd = mulberry32(8);
    const cases = Array.from({ length: 100 }, () => ({
      n: 1 + Math.floor(rnd() * LIMITS.n.max),
      d: 1 + Math.floor(rnd() * LIMITS.d.max),
      heads: 1 + Math.floor(rnd() * LIMITS.heads.max),
      layers: 1 + Math.floor(rnd() * LIMITS.layers.max),
    }));
    cases.push({ n: LIMITS.n.max, d: LIMITS.d.max, heads: LIMITS.heads.max, layers: LIMITS.layers.max });
    for (const input of cases) {
      const c = costs(input);
      expect(c.weightsPerHead).toBe(input.n ** 2);
      expect(c.weightsTotal).toBe(input.n ** 2 * input.heads * input.layers);
      expect(c.scoreFlops).toBe(2 * input.n ** 2 * input.d);
      expect(c.parameters).toBe(12 * input.layers * input.d ** 2);
      expect(Number.isFinite(c.weightsTotal) && Number.isFinite(c.scoreFlops) && Number.isFinite(c.parameters)).toBe(true);
      for (const v of [c.weightsPerHead, c.weightsTotal, c.scoreFlops, c.parameters]) expect(count(v)).not.toMatch(/Infinity|NaN/);
    }
  });

  it('the default is n = 4,096: 16,777,216 weights per head, doubling n gives exactly 4 times as many', () => {
    expect(costs(COST_DEFAULT).weightsPerHead).toBe(16_777_216);
    expect(costs({ ...COST_DEFAULT, n: 8192 }).weightsPerHead).toBe(4 * 16_777_216);
    expect(costs({ ...COST_DEFAULT, n: 8192 }).weightsPerHead).toBe(67_108_864);
  });

  it('counts print in full below a billion and as m x 10^e above, with 3 significant figures', () => {
    expect(count(16_777_216)).toBe('16,777,216');
    expect(count(6_442_450_944)).toBe('6.44 × 10⁹');
    expect(count(1e12)).toBe('1 × 10¹²');
    expect(count(Infinity)).toBe('beyond a double');
  });

  it('the two curves: n squared above n for every n over 1, equal at 1; at most 64 cells are drawn', () => {
    expect(quadratic(1)).toBe(linear(1));
    for (const n of [2, 10, 1e3, 1e6]) expect(quadratic(n)).toBeGreaterThan(linear(n));
    expect(DRAW_LIMIT).toBe(64);
  });
});

describe('opening states are pure functions', () => {
  it('each scene opens from fresh values, and mutating one result never reaches the next', () => {
    for (const open of [headOpening, scaleOpening, headsOpening, lookupOpening, costOpening]) {
      expect(open()).toEqual(open());
      expect(open()).not.toBe(open());
    }
    const embeddings = headOpening().embeddings;
    embeddings[1][1] = 99;
    expect(headOpening().embeddings[1][1]).toBe(0.9);
    expect(EMBEDDINGS[1][1]).toBe(0.9);
    expect(headsOpening()).toMatchObject({ causal: false, positions: false, twoHeads: false, order: null });
    expect(TOKENS.length).toBe(N);
  });
});
