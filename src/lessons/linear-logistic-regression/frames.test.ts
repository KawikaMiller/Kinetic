import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { gdCaption, lineText, linearCaption, num, thresholdCaption, trainFrames, trainVerdict } from './frames';
import {
  L2, LINEAR_DATA, NEED_TWO_X, OUTLIER, accuracyAt, descendLine, linearFit, logisticData, separates, stillGrowing, trainLogistic,
  type ClassSet, type Dims,
} from './model';

describe('linear captions', () => {
  it('states the real fitted line and MSE, and the refusal for one x', () => {
    const fit = linearFit(LINEAR_DATA);
    if (!fit.ok) throw new Error('fit');
    const c = text(linearCaption(LINEAR_DATA, false));
    expect(c).toContain(lineText(fit.b, fit.m));
    expect(c).toContain(`MSE ${num(fit.mse)}`);
    expect(text(linearCaption([{ x: 5, y: 2 }, { x: 5, y: 7 }], false))).toBe(`No line: ${NEED_TWO_X}`);
  });

  it('with Compare on, names the line without the biggest residual (the outlier)', () => {
    const pts = [...LINEAR_DATA, OUTLIER];
    const without = linearFit(LINEAR_DATA);
    if (!without.ok) throw new Error('fit');
    expect(text(linearCaption(pts, true))).toContain(`the line would be ${lineText(without.b, without.m)}`);
  });

  it('gradient descent: in-progress frames show the current line, the last says how close it got to the closed form', () => {
    const run = descendLine(LINEAR_DATA)!;
    expect(text(gdCaption(run, 0, LINEAR_DATA))).toContain('step 0: y = 0 + 0x');
    const last = text(gdCaption(run, run.snapshots.length - 1, LINEAR_DATA));
    expect(last).toContain(`stopped after ${run.steps.toLocaleString('en-US')} steps`);
    expect(last).toContain('same line');
  });
});

describe('logistic frames, every features × data × L2 combination', () => {
  it('ends on a verdict that matches the run: still growing only when the weights really are', () => {
    for (const dims of [1, 2] as Dims[]) {
      for (const set of ['overlapping', 'separable'] as ClassSet[]) {
        for (const l2 of [false, true]) {
          const pts = logisticData(dims, set);
          const run = trainLogistic(pts, dims, l2 ? L2 : 0);
          const frames = trainFrames(run, pts, dims, l2);
          expect(frames).toHaveLength(run.snapshots.length);
          expect(text(frames.at(-1)!.say)).toBe(text(trainVerdict(run, pts, dims, l2)));
          const v = text(frames.at(-1)!.say);
          expect(v.includes('still growing')).toBe(stillGrowing(run));
          expect(v.includes('still growing')).toBe(set === 'separable' && !l2);
          if (v.includes('still growing')) expect(v).toContain(separates(run.snapshots.at(-1)!.params, pts, dims) ? 'perfectly separable' : "hasn't settled");
          frames.slice(1, -1).forEach((f, i) => expect(text(f.say)).toContain(`Step ${run.snapshots[i + 1].step.toLocaleString('en-US')}: log loss`));
        }
      }
    }
  });
});

describe('thresholdCaption', () => {
  it('reports the true count of points that get their own class', () => {
    const pts = logisticData(2, 'overlapping');
    const params = trainLogistic(pts, 2, 0).snapshots.at(-1)!.params;
    for (const t of [0.05, 0.3, 0.5, 0.9]) {
      expect(text(thresholdCaption(params, pts, 2, t))).toContain(`${accuracyAt(params, pts, 2, t)} of ${pts.length} points get their true class`);
    }
  });
});
