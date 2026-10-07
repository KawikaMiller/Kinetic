import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { mulberry32 } from '../../core/random';
import { gdCaption, lineText, linearCaption, num, sigFig, thresholdCaption, trainFrames, trainVerdict } from './frames';
import {
  L2, LINEAR_DATA, NEED_TWO_X, OUTLIER, accuracyAt, descendLine, linearFit, logisticData, sameAsClosedForm, separates, stillGrowing, trainLogistic,
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

describe('review B8: GD-line and slope sweeps', () => {
  const rnd = mulberry32(31);

  it('the reviewer repros (a cluster near x = 9, a very wide spread) now converge onto the closed form', () => {
    const cluster = [{ x: 8.8, y: 3 }, { x: 9, y: 4.2 }, { x: 9.1, y: 3.6 }, { x: 9.3, y: 5 }];
    const wide = [{ x: 0.1, y: 9.5 }, { x: 0.3, y: 9.9 }, { x: 9.9, y: 0.2 }, { x: 9.7, y: 0.5 }];
    for (const pts of [cluster, wide]) {
      const run = descendLine(pts)!;
      expect(sameAsClosedForm(run, pts)).toBe(true);
      expect(text(gdCaption(run, run.snapshots.length - 1, pts))).toContain('same line');
    }
  });

  it('over 200 random datasets, "same line" is said exactly when GD converged within 1e-4 of the closed form', () => {
    for (let t = 0; t < 200; t++) {
      const n = 2 + Math.floor(rnd() * 18);
      const centre = rnd() * 10;
      const spread = 0.05 + rnd() * 5;
      const pts = Array.from({ length: n }, () => ({ x: Math.min(10, Math.max(0, centre + (rnd() - 0.5) * spread)), y: rnd() * 10 }));
      const run = descendLine(pts);
      if (!run) continue;
      const fit = linearFit(pts);
      if (!fit.ok) continue;
      const last = run.snapshots.at(-1)!;
      const close = Math.abs(last.b - fit.b) < 1e-4 && Math.abs(last.m - fit.m) < 1e-4;
      const c = text(gdCaption(run, run.snapshots.length - 1, pts));
      expect(c.includes('same line')).toBe(run.converged && close);
      if (!c.includes('same line')) expect(c).toContain('still');
    }
  });

  it('never says "moved the slope from X to X"', () => {
    for (let t = 0; t < 300; t++) {
      const pts = Array.from({ length: 6 }, () => ({ x: 1 + rnd() * 8, y: rnd() * 10 }));
      pts.push({ x: 9.5, y: rnd() * 10 });
      const c = text(linearCaption(pts, true));
      const m = /moved the slope from (\S+) to (\S+)\./.exec(c);
      if (m) expect(m[1]).not.toBe(m[2]);
    }
    expect(sigFig(100.00004)).toBe('100');
    expect(sigFig(-0.61123)).toBe('−0.6112');
  });
});
