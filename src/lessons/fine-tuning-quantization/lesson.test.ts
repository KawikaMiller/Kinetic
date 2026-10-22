import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { adapterCaption, floorCaption, gapText, memoryCaption, quantCaption } from './captions';
import lesson from './index';
import { DEFAULT_LORA_SEED, TOLERANCE, TRAIN_STEPS, belowFloor, makeTarget, train, type TrainRun } from './lora';
import { DEFAULT_DIM, DEFAULT_RANK, FRACTION_HUNDREDTHS, PARAMS_DEFAULT, adapterParams, fullParams, memoryLines, weightBytes } from './memory';
import { DEFAULT_QUANT_SEED, OUTLIER_AT, OUTLIER_MIN_RATIO, SIZE, TENSOR, makeInputs, makeWeights, outputError, quantise, type Scheme } from './quant';

describe('scenes', () => {
  it('every scene component carries its own key and no component is shared between scenes', () => {
    const els = sceneElements('fine-tuning-quantization');
    expect(els).toHaveLength(3);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('fine-tuning-quantization')).toEqual([]);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect([DEFAULT_DIM, DEFAULT_RANK]).toEqual([4096, 8]);
    expect(PARAMS_DEFAULT).toBe(7e9);
    expect(FRACTION_HUNDREDTHS.default / 10_000).toBe(0.005);
    expect(DEFAULT_LORA_SEED).toBe(3);
    expect(DEFAULT_QUANT_SEED).toBe(1);
  });
});

const quantAt = (bits: number, scheme: Scheme, seed = DEFAULT_QUANT_SEED) => {
  const w = makeWeights(seed, true);
  const q = quantise(w, bits, scheme);
  const err = outputError(w, q.dequantised, makeInputs(seed));
  const zeroed = q.codes.flatMap((row, r) => row.map((c, k) => (c === 0 && !(r === OUTLIER_AT.row && k === OUTLIER_AT.col) ? 1 : 0))).reduce<number>((a, b) => a + b, 0);
  return { err, zeroed, caption: quantCaption(bits, scheme, true, err, zeroed, 63) };
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: 65,536 against 16,777,216 is 0.39%; past rank 2,048 the adapter is bigger', () => {
    expect(adapterParams(4096, 4096, 8)).toBe(65_536);
    expect(fullParams(4096, 4096)).toBe(16_777_216);
    expect(adapterCaption(4096, 4096, 8)).toContain('0.39%');
    expect(adapterCaption(4096, 4096, 8)).not.toContain('bigger');
    expect(adapterCaption(4096, 4096, 2049)).toContain('Past rank 2,048 the adapter is bigger than the matrix');
    expect(lesson.tryThis[0]).toContain('65,536 parameters against 16,777,216');
  });

  it('try-this 2: rank 2 leaves 3.752% and the trained adapter ends there; rank 3 leaves 0.921%', () => {
    const two = train(makeTarget(DEFAULT_LORA_SEED), 2, DEFAULT_LORA_SEED);
    expect(floorCaption(2, two)).toContain('leaves 3.752% of the target');
    expect(floorCaption(2, two)).toContain('Gradient descent reaches 3.752%');
    const three = train(makeTarget(DEFAULT_LORA_SEED), 3, DEFAULT_LORA_SEED);
    expect(floorCaption(3, three)).toContain('leaves 0.921%');
    expect(lesson.tryThis[1]).toContain('3.752%');
    expect(lesson.tryThis[1]).toContain('0.921%');
  });

  it('try-this 3: 8 bits per-tensor with the outlier is 6.4%; 4 bits is 92.2% with 61 of 63 ordinary weights zero', () => {
    expect(quantAt(8, TENSOR).caption).toContain('is 6.4%');
    const four = quantAt(4, TENSOR);
    expect(four.caption).toContain('is 92.2%');
    expect(four.caption).toContain('61 of the 63 ordinary weights round to zero');
    expect(lesson.tryThis[2]).toContain('6.4%');
    expect(lesson.tryThis[2]).toContain('92.2%, and 61 of the 63');
  });

  it('try-this 4: per-group of 4 at 4 bits is 5.3% with 5 ordinary weights zero', () => {
    const g = quantAt(4, { kind: 'group', size: 4 });
    expect(g.caption).toContain('per-group of 4 with one outlier');
    expect(g.caption).toContain('is 5.3%');
    expect(g.zeroed).toBe(5);
    expect(lesson.tryThis[3]).toContain('5.3% and 5 ordinary weights');
  });
});

describe('manipulations: the wrong move and what the page says', () => {
  it('manipulation 1: a rank past the crossover says the adapter is bigger than the matrix, and the rank limit refuses past the smaller dimension', () => {
    expect(adapterParams(4096, 4096, 2049)).toBeGreaterThan(fullParams(4096, 4096));
    expect(adapterCaption(4096, 4096, 4096)).toContain('bigger than the matrix');
    expect(adapterCaption(16_384, 16_384, 8193)).toContain('Past rank 8,192');
  });

  it('manipulation 2: the outlier on at 4 bits per tensor is a large error, per-group removes it, and the toy without the outlier is mild', () => {
    const w = makeWeights(1, true);
    const withOutlier = outputError(w, quantise(w, 4, TENSOR).dequantised, makeInputs(1)).rms;
    const grouped = outputError(w, quantise(w, 4, { kind: 'group', size: 4 }).dequantised, makeInputs(1)).rms;
    const plain = makeWeights(1, false);
    const without = outputError(plain, quantise(plain, 4, TENSOR).dequantised, makeInputs(1)).rms;
    expect(withOutlier).toBeGreaterThan(0.9);
    expect(grouped).toBeLessThan(0.06);
    expect(without).toBeLessThan(0.25);
  });

  it('manipulation 3: a rank below what the spectrum needs leaves a floor above zero, and a run still above it says so with the step count', () => {
    const one = train(makeTarget(DEFAULT_LORA_SEED), 1, DEFAULT_LORA_SEED);
    expect(one.optimum).toBeGreaterThan(0.29);
    expect(floorCaption(1, one)).toContain('leaves 29.229%');
    const stuck: TrainRun = { curve: [1, 0.5], final: 0.5, optimum: 0.0375, gap: 0.4625, withinTolerance: false };
    const text = floorCaption(2, stuck);
    expect(text).toContain(`Still above the optimum after ${TRAIN_STEPS.toLocaleString('en-US')} steps`);
    expect(text).toContain('against a floor of 3.750%');
    expect(TOLERANCE).toBe(0.005);
  });
});

describe('the lesson text agrees with the model', () => {
  it('key ideas and quiz explanations quote the model\'s numbers', () => {
    const lines = memoryLines(7e9, 0.005);
    expect(lines.full / 1e9).toBe(112);
    expect(weightBytes(7e9, 16) / 1e9).toBe(14);
    expect(weightBytes(7e9, 4) / 1e9).toBe(3.5);
    expect(lesson.keyIdeas[0]).toContain('0.39%');
    expect(lesson.keyIdeas[2]).toContain('14 GB at 16 bits and 3.5 GB at 4 bits');
    expect(lesson.keyIdeas[3]).toContain('61 of 63');
    expect(lesson.quiz[1].why).toContain('65,536');
    expect(lesson.quiz[2].why).toContain('61 of the 63');
    expect(lesson.quiz[2].why).toContain('92.2%');
    expect(lesson.quiz[2].why).toContain('6.4%');
    expect(lesson.quiz[3].why).toContain('92.2% to 5.3%');
  });

  it('the memory caption quotes the three lines at the defaults', () => {
    expect(memoryCaption(7e9, 0.005)).toContain('112.00 GB');
    expect(memoryCaption(7e9, 0.005)).toContain('14.56 GB');
    expect(memoryCaption(7e9, 0.005)).toContain('4.06 GB');
  });
});

describe('the outlier is the largest weight, by construction', () => {
  it('on 1,000 seeds the flagged entry is the largest magnitude in the matrix, by at least the stated ratio, with its sign kept', () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const w = makeWeights(seed, true);
      const plain = makeWeights(seed, false);
      const flat = w.flatMap((row, r) => row.map((v, c) => ({ v, r, c })));
      const others = Math.max(...flat.filter(({ r, c }) => r !== OUTLIER_AT.row || c !== OUTLIER_AT.col).map(({ v }) => Math.abs(v)));
      const mine = w[OUTLIER_AT.row][OUTLIER_AT.col];
      expect(Math.abs(mine), `seed ${seed}`).toBeGreaterThanOrEqual(OUTLIER_MIN_RATIO * others - 1e-12);
      expect(Math.sign(mine), `seed ${seed}`).toBe(Math.sign(plain[OUTLIER_AT.row][OUTLIER_AT.col]));
      expect(w.length * w[0].length).toBe(SIZE * SIZE);
    }
  });

  it('seed 10, which used to draw an outlier of 0.27 under a larger ordinary weight, now has the violet weight as the peak', () => {
    const w = makeWeights(10, true);
    const peak = Math.max(...w.flat().map(Math.abs));
    expect(Math.abs(w[OUTLIER_AT.row][OUTLIER_AT.col])).toBe(peak);
  });
});

describe('the floor statement is computed, not typed', () => {
  const base: TrainRun = { curve: [1, 0.03], final: 0.0375, optimum: 0.0375, gap: 0, withinTolerance: true };

  it('a trained error under the optimum is called a bug, with the true signed gap, never "not below it"', () => {
    const under: TrainRun = { ...base, final: 0.03, gap: -0.0075 };
    expect(belowFloor(under)).toBe(true);
    expect(floorCaption(2, under)).toContain('BELOW the floor by 0.750%');
    expect(floorCaption(2, under)).not.toContain('not below it');
    expect(gapText(under)).toBe('-0.750%');
  });

  it('on or above the floor says not below it and states the tolerance it checked; float noise prints as zero', () => {
    expect(belowFloor({ ...base, gap: -2.8e-16 })).toBe(false);
    expect(gapText({ ...base, gap: -2.8e-16 })).toBe('0.000%');
    expect(floorCaption(2, base)).toContain('not below it (checked to 1e-9)');
    expect(floorCaption(2, base)).toContain("within 0.005 of the floor (as a share of the target's energy)");
  });
});

describe('the adapter caption at rank 1', () => {
  it('says "at every rank" when rank 1 is already bigger than the matrix, and "past rank" only when a crossover lies above 1', () => {
    expect(adapterCaption(1, 1, 1)).not.toContain('Past rank');
    expect(adapterParams(1, 1, 1)).toBeGreaterThan(fullParams(1, 1));
    expect(adapterCaption(1, 1, 1)).toContain('At every rank the adapter is bigger');
    expect(adapterCaption(2, 2, 2)).toContain('Past rank 1 the adapter is bigger');
  });
});
