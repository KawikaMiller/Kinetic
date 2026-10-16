import { describe, expect, it } from 'vitest';
import { pctText } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { costCaption, headCaption, headsCaption, lookupCaption, ranked, scaleCaption } from './captions';
import { COST_DEFAULT, costs, count } from './cost';
import lesson from './index';
import { createLookupRun, lookupSweep } from './lookup';
import { DK_STOPS, measureScaling } from './scaling';
import { EMBEDDINGS, N, TOKENS, oneHead, shuffleTest, shuffled, twoHeads } from './tokens';

const SLOW = { timeout: 120_000 };

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: "cat" puts 0.34 on itself, 0.24 on "mat" and 0.20 on "sat"; rows add to 1; cat dim 2 at 0 lowers the weight on "mat"', () => {
    const w = oneHead(EMBEDDINGS).weights[1];
    expect(w.map((v) => v.toFixed(2))).toEqual(['0.08', '0.34', '0.20', '0.07', '0.08', '0.24']);
    const edited = EMBEDDINGS.map((r) => [...r]);
    edited[1][1] = 0;
    expect(oneHead(edited).weights[1][5]).toBeLessThan(w[5]);
    const text = expectCaption(headCaption(1, w));
    expect(text).toContain('"cat" (token 2) at 0.34');
    expect(text).toContain('"mat" (token 6) at 0.24');
    expect(text).toContain('add up to 1.00');
  });

  it('try-this 2: at d_k = 64 the std dev is about 8, the largest weight 0.88 unscaled and 0.36 scaled; at 512, 0.96 and 0.36', () => {
    const r = measureScaling(64);
    expect(DK_STOPS[3 + 3]).toBe(64);
    expect(Math.abs(r.sd - 8)).toBeLessThan(0.24);
    expect([r.unscaledMax.toFixed(2), r.scaledMax.toFixed(2)]).toEqual(['0.88', '0.36']);
    const big = measureScaling(512);
    expect([big.unscaledMax.toFixed(2), big.scaledMax.toFixed(2)]).toEqual(['0.96', '0.36']);
    expect(expectCaption(scaleCaption(r))).toContain('averages 0.88 unscaled and 0.36 after dividing');
  });

  it('try-this 3: with everything off a shuffle leaves all 6 outputs unchanged; with Two heads and the position code all 6 change', () => {
    const order = shuffled(N, 1);
    expect(shuffleTest(EMBEDDINGS, { positions: false, causal: false, twoHeads: false }, order).filter((r) => r.same).length).toBe(6);
    expect(shuffleTest(EMBEDDINGS, { positions: true, causal: false, twoHeads: true }, order).filter((r) => r.same).length).toBe(0);
  });

  it('try-this 4: the weight on key A rises from 29% to 92% by epoch 300, and all 20 seeds learn it', SLOW, () => {
    const run = createLookupRun(1);
    expect(pctText(run.diagonalHistory[0][0], 0)).toBe('29%');
    for (let i = 0; i < 30; i++) run.advance(10);
    expect(run.epoch).toBe(300);
    expect(pctText(run.diagonalHistory[300][0], 0)).toBe('92%');
    expect(lookupSweep(1).learnedCount).toBe(20);
  });

  it('try-this 5: n = 4,096 gives 16,777,216 weights per head; 8,192 gives 67,108,864 and the caption says it', () => {
    expect(costs(COST_DEFAULT).weightsPerHead).toBe(16_777_216);
    const bigger = { ...COST_DEFAULT, n: 8192 };
    expect(costs(bigger).weightsPerHead).toBe(67_108_864);
    expect(expectCaption(costCaption(bigger, costs(bigger)))).toContain(`n² = ${count(67_108_864)}`);
  });
});

describe('captions are computed from the model', () => {
  it('the head caption names the two strongest tokens with their weights for every token', () => {
    const head = oneHead(EMBEDDINGS);
    for (let t = 0; t < N; t++) {
      const [first, second] = ranked(head.weights[t]);
      const text = expectCaption(headCaption(t, head.weights[t]));
      expect(text).toContain(`"${TOKENS[first]}" (token ${first + 1}) at ${head.weights[t][first].toFixed(2)}`);
      expect(text).toContain(`"${TOKENS[second]}" (token ${second + 1}) at ${head.weights[t][second].toFixed(2)}`);
    }
  });

  it('the scale caption quotes the measured numbers at every d_k and adds the one-hot sentence exactly when the gap is big', () => {
    for (const dk of DK_STOPS) {
      const r = measureScaling(dk);
      const text = expectCaption(scaleCaption(r));
      expect(text).toContain(`averages ${r.unscaledMax.toFixed(2)} unscaled and ${r.scaledMax.toFixed(2)}`);
      expect(text.includes('close to one-hot'), `d_k ${dk}`).toBe(r.unscaledMax - r.scaledMax > 0.05);
    }
  });

  it('the heads caption over every toggle combination and shuffle state states only what the weights show', () => {
    const order = shuffled(N, 1);
    for (const causal of [false, true]) {
      for (const positions of [false, true]) {
        for (const two of [false, true]) {
          for (const shuffle of [null, order]) {
            const layer = twoHeads(EMBEDDINGS, { positions, causal });
            const test = shuffle ? shuffleTest(EMBEDDINGS, { positions, causal, twoHeads: two }, shuffle) : null;
            const text = expectCaption(headsCaption({ causal, positions, twoHeads: two, aWeights: two ? layer.a.weights : null, shuffle: test }));
            expect(text.includes('Causal mask'), 'mask sentence').toBe(causal);
            expect(text.includes('Head A'), 'head A sentence').toBe(two);
            expect(text.includes('no position code'), 'head A blind').toBe(two && !positions);
            if (two && positions) {
              const previous = layer.a.weights.slice(1).map((row, i) => row[i]);
              const mean = previous.reduce((a, b) => a + b, 0) / previous.length;
              expect(text).toContain(`on average ${mean.toFixed(2)} of its weight on the previous token`);
              expect(text.includes('points at token 6'), 'wrap note').toBe(!causal);
            }
            if (test) {
              const kept = test.filter((r) => r.same).length;
              expect(text.includes('cannot tell the order'), 'order-blind').toBe(kept === N);
              if (kept < N) expect(text).toContain(`${kept} of ${N} tokens kept their output`);
              expect(text.includes('mask itself carries order')).toBe(kept < N && causal && !positions);
            } else expect(text.includes('Shuffled')).toBe(false);
          }
        }
      }
    }
    expect(expectCaption(headsCaption({ causal: false, positions: false, twoHeads: false, aWeights: null, shuffle: null }))).toContain('Head B looks at tokens');
  });

  it('the lookup caption: untrained, partly trained and learned, from the run', () => {
    const run = createLookupRun(1);
    const view = (item: number) => ({
      epoch: run.epoch, item, weight: run.diagonalHistory[run.epoch][item], start: run.diagonalHistory[0][item], loss: run.lossHistory[run.epoch],
      allLearned: run.diagonalHistory[run.epoch].every((w) => w >= 0.8),
    });
    expect(expectCaption(lookupCaption(view(0)))).toContain('Untrained');
    run.advance(40);
    const mid = expectCaption(lookupCaption(view(0)));
    expect(mid).toContain('Epoch 40');
    expect(mid.includes('Not every query is there yet')).toBe(!view(0).allLearned);
    run.advance(260);
    expect(expectCaption(lookupCaption(view(2)))).toContain('a lookup this toy learned');
  });

  it('the cost caption quotes the three figures for the defaults and for a million tokens', () => {
    for (const input of [COST_DEFAULT, { ...COST_DEFAULT, n: 1_000_000 }]) {
      const c = costs(input);
      const text = expectCaption(costCaption(input, c));
      expect(text).toContain(`n² = ${count(c.weightsPerHead)}`);
      expect(text).toContain(`${count(c.weightsTotal)}`);
      expect(text).toContain(`2n²d = ${count(c.scoreFlops)}`);
    }
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q2: shuffled input without position or mask gives each token the same output row, only moved', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(shuffleTest(EMBEDDINGS, { positions: false, causal: false, twoHeads: true }, shuffled(N, seed)).every((r) => r.same)).toBe(true);
    }
  });

  it('Q3: unscaled softmax over 8 keys is nearly one-hot at large d_k and scaled is not (the distractors about rows summing to 1 and positivity are true of softmax with or without the scale)', () => {
    const big = measureScaling(512);
    expect(big.unscaledMax).toBeGreaterThan(0.9);
    expect(big.scaledMax).toBeLessThan(0.45);
    for (const row of oneHead(EMBEDDINGS).weights) {
      expect(Math.abs(row.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-12);
      for (const w of row) expect(w).toBeGreaterThan(0);
    }
  });

  it('Q4: 4,096 to 8,192 tokens is 4 times the weights, 67,108,864 against 16,777,216', () => {
    expect(costs({ ...COST_DEFAULT, n: 8192 }).weightsPerHead / costs({ ...COST_DEFAULT, n: 4096 }).weightsPerHead).toBe(4);
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toBe('It grows 4 times');
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('attention-transformers');
    expect(elements.map((e) => e.component)).toEqual(['ScaleScene', 'HeadsScene', 'LookupScene', 'CostScene', 'HeadScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });
});
