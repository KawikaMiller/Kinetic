import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { SIZE } from './barsData';
import { galleryCaption, learnCaption, parameterSentence, poolCaption, stackCaption } from './captions';
import {
  BAR_COLUMNS, DEFAULT_OPTIONS, SHIFTS, barAt, convParams, convolve, denseParams, kernelOf, outputSize, presetImage, shiftReport, windowSteps, type ConvOptions,
} from './convolve';
import { slideFrames } from './frames';
import lesson from './index';
import { LEARNED_AT, createLearnRun, learnedShare, trainGallery } from './learn';
import { convOpening, poolOpening, stackOpening } from './openings';
import { describeStack, type LayerKind } from './stack';

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the first row of the feature map is 0, 4, 0, -4, 0, 0 at 6 x 6; padding 1 gives 8 x 8; stride 2 with padding 0 gives 3 x 3', () => {
    const { image, kernel, options } = convOpening();
    expect(options).toEqual(DEFAULT_OPTIONS);
    const map = convolve(image, kernel, options);
    expect(map.length).toBe(6);
    expect(map[0]).toEqual([0, 4, 0, -4, 0, 0]);
    expect(convolve(image, kernel, { ...options, pad: 1 }).length).toBe(8);
    expect(convolve(image, kernel, { ...options, stride: 2 }).length).toBe(3);
  });

  it('try-this 2: flipping negates every Sobel response, and leaves the box blur unchanged', () => {
    const { image, kernel, options } = convOpening();
    const plain = convolve(image, kernel, options);
    const flipped = convolve(image, kernel, { ...options, flip: true });
    plain.forEach((row, y) => row.forEach((v, x) => expect(flipped[y][x]).toBeCloseTo(-v, 12)));
    expect(plain.flat().some((v) => v !== 0)).toBe(true);
    expect(convolve(image, kernelOf('blur'), { ...options, flip: true })).toEqual(convolve(image, kernelOf('blur'), options));
  });

  it('try-this 3: the default bar column 3 with shift +1 leaves the pooled map alone; bar column 4 changes 6 of 9 cells', () => {
    const open = poolOpening();
    expect(BAR_COLUMNS.map((c) => c + 1)).toEqual([3, 4, 5, 6]);
    expect([open.column + 1, open.shift]).toEqual([3, 1]);
    expect(shiftReport(barAt(open.column), open.shift).pooledChanged).toBe(0);
    const report = shiftReport(barAt(BAR_COLUMNS[1]), open.shift);
    expect(report.pooledChanged).toBe(6);
    expect(report.original.pooled.flat().length).toBe(9);
    expect(expectCaption(poolCaption(report, BAR_COLUMNS[1], 1))).toContain('changed in 6 of 9 cells');
  });

  it('try-this 4: the default seed reaches about 92% held-out accuracy after 12 presses of Step 10, and 6 of 8 seeds reach 90%', () => {
    const run = createLearnRun({ kernels: 1, seed: 1 });
    for (let i = 0; i < 12; i++) run.advance(10);
    expect(run.epoch).toBe(120);
    expect(Math.round(run.heldOut() * 100)).toBe(92);
    const gallery = trainGallery(1, 1);
    expect(learnedShare(gallery)).toBe(6);
    expect(expectCaption(galleryCaption(gallery, 6))).toContain('6 of 8 seeds reached 90%');
  });

  it('try-this 5: three convs give 7 x 7; conv, pool, conv gives 8 x 8; the moved outputs match the prediction (caption says so)', () => {
    const open = stackOpening();
    expect(describeStack(open.layers).at(-1)!.field).toBe(7);
    const rebuilt: LayerKind[] = ['conv', 'pool', 'conv'];
    const rows = describeStack(rebuilt);
    expect(rows.at(-1)!.field).toBe(8);
    expect(expectCaption(stackCaption(rebuilt, rows, 'pixel', true))).toContain('exactly the ones its receptive field predicts');
    expect(expectCaption(stackCaption(rebuilt, rows, 'pixel', false))).toContain('disagree');
  });
});

describe('captions are computed from the model', () => {
  it('the slide captions quote each window\'s sum and the formula against the real output for every stride, padding, ReLU and flip setting', () => {
    for (const stride of [1, 2]) {
      for (const pad of [0, 1]) {
        for (const relu of [false, true]) {
          for (const flip of [false, true]) {
            const o: ConvOptions = { stride, pad, relu, flip };
            const { image, kernel } = convOpening();
            const map = convolve(image, kernel, o);
            const steps = windowSteps(image, kernel, o);
            const frames = slideFrames(steps, SIZE, 3, o, map.length);
            expect(frames.length).toBe(steps.length + 2);
            const first = expectCaption(frames[0].say);
            expect(first).toContain(`floor((8 + 2·${pad} − 3) / ${stride}) + 1 = ${outputSize(8, 3, pad, stride)}`);
            expect(first).toContain(`the real output is ${map.length} x ${map.length}`);
            expect(first.includes('flipped')).toBe(flip);
            expect(first.includes('zero-padded')).toBe(pad === 1);
            steps.forEach((s, i) => {
              const text = expectCaption(frames[i + 1].say);
              expect(text).toContain(`add up to ${Number(s.sum.toFixed(2)) < 0 ? '−' : ''}${Math.abs(Number(s.sum.toFixed(2)))}`);
              expect(text.includes('ReLU clamps'), `${JSON.stringify(o)} step ${i}`).toBe(relu && s.sum < 0);
              expect(text.includes('ReLU keeps'), `${JSON.stringify(o)} step ${i}`).toBe(relu && s.sum >= 0);
            });
            expect(expectCaption(frames.at(-1)!.say)).toContain(`All ${steps.length} windows done`);
          }
        }
      }
    }
  });

  it('the pool caption quotes the real counts for every bar column and shift', () => {
    for (const column of BAR_COLUMNS) {
      for (const shift of SHIFTS) {
        const report = shiftReport(barAt(column), shift);
        const text = expectCaption(poolCaption(report, column, shift));
        if (shift === 0) {
          expect(text).toContain('not shifted');
          continue;
        }
        expect(text.includes('stayed the same')).toBe(report.pooledChanged === 0);
        if (report.pooledChanged > 0) expect(text).toContain(`changed in ${report.pooledChanged} of 9 cells`);
        expect(text).toContain(`Bar in column ${column + 1}`);
        expect(text).toContain(report.mapShifted ? 'moved with the bar' : 'did not simply move');
      }
    }
  });

  it('the learn caption: untrained, learned and not yet', () => {
    const run = createLearnRun({ kernels: 1, seed: 1 });
    const state = () => ({ epoch: run.epoch, loss: run.lossHistory.at(-1)!, trainAccuracy: run.trainAccuracy.at(-1)!, heldOut: run.heldOut(), kernels: 1 });
    expect(expectCaption(learnCaption(state()))).toContain(`loss ${state().loss.toFixed(3)}`);
    run.advance(120);
    const trained = expectCaption(learnCaption(state()));
    expect(trained).toContain('Epoch 120');
    expect(trained.includes('fitted a detector')).toBe(run.heldOut() >= LEARNED_AT);
    const dead = createLearnRun({ kernels: 1, seed: 3 });
    dead.advance(120);
    expect(expectCaption(learnCaption({ epoch: 120, loss: 1, trainAccuracy: 0.5, heldOut: dead.heldOut(), kernels: 1 }))).toContain('Not there yet');
  });

  it('the parameter sentence is built from the shapes: 10 against 2,340, and per kernel for two', () => {
    expect(expectCaption(parameterSentence(1, 8))).toContain('= 10 numbers');
    const one = expectCaption(parameterSentence(1, 8));
    expect(one).toContain('64 x 36 + 36 = 2,340');
    const two = expectCaption(parameterSentence(2, 8));
    expect(two).toContain(`${convParams(2, 3)}`);
    expect(two).toContain(`${(denseParams(64, 36) * 2).toLocaleString('en-US')} for 2`);
  });

  it('the stack caption names every layer and the receptive field, for every layer list up to four', () => {
    const lists: LayerKind[][] = [[], ['conv'], ['pool'], ['conv', 'pool'], ['conv', 'pool', 'conv'], ['conv', 'conv', 'conv', 'conv'], ['conv', 'pool', 'conv', 'pool']];
    for (const layers of lists) {
      const rows = describeStack(layers);
      const text = expectCaption(stackCaption(layers, rows, 'field', null));
      if (rows.length === 0) {
        expect(text).toContain('1 x 1');
        continue;
      }
      const last = rows.at(-1)!;
      expect(text).toContain(`${last.field} x ${last.field} patch`);
      expect(text).toContain(`the output is ${last.side} x ${last.side}`);
      expect(text.includes('moved')).toBe(false);
    }
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: one output depends on its 3 x 3 patch: changing a pixel outside the window leaves that cell unchanged, one inside changes it', () => {
    const { kernel } = convOpening();
    const image = presetImage('ell');
    const base = convolve(image, kernel, DEFAULT_OPTIONS);
    const outside = image.map((r) => [...r]);
    outside[7][7] = 1;
    const inside = image.map((r) => [...r]);
    inside[1][2] = 1 - inside[1][2];
    expect(convolve(outside, kernel, DEFAULT_OPTIONS)[0][0]).toBe(base[0][0]);
    expect(convolve(inside, kernel, DEFAULT_OPTIONS)[0][0]).not.toBe(base[0][0]);
  });

  it('Q2: a shift may or may not change the pooled map: both outcomes occur', () => {
    const outcomes = new Set(BAR_COLUMNS.flatMap((c) => SHIFTS.filter((s) => s !== 0).map((s) => shiftReport(barAt(c), s).pooledChanged === 0)));
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it('Q3: conv, pool, conv is 8 x 8 by the recurrence (3 + 1 + 2 · 2); the distractors 7, 9 and 6 are other stacks or wrong sums', () => {
    expect(describeStack(['conv', 'pool', 'conv']).at(-1)!.field).toBe(8);
    expect(describeStack(['conv', 'conv', 'conv']).at(-1)!.field).toBe(7);
    expect(lesson.quiz[2].options[lesson.quiz[2].answer]).toBe('8 x 8');
  });

  it('Q4: 10 against 2,340, and the distractors 9 / 2,304 are the weights without the biases', () => {
    expect(convParams(1, 3)).toBe(10);
    expect(denseParams(64, 36)).toBe(2340);
    expect(64 * 36).toBe(2304);
    expect(lesson.quiz[3].options[lesson.quiz[3].answer]).toBe('10, against 2,340 for the dense layer');
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('cnns-convolution');
    expect(elements.map((e) => e.component)).toEqual(['PoolScene', 'LearnScene', 'StackScene', 'ConvScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });
});
