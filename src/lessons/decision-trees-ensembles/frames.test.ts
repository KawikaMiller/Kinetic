import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { boostFrames, depthCurve, forestCaption, num, question, treeCaption } from './frames';
import { PRESET_IDS, accuracy, adaboost, growTree, predictTree, presetData, seedSpread, type Criterion, type TreeOptions } from './model';

const MAX_DEPTH_SLIDER = 8;

describe('num', () => {
  it('uses a real minus and never prints −0.00', () => {
    expect(num(-0.4567)).toBe('−0.46');
    expect(num(-0.001)).toBe('0.00');
    expect(num(1.5, 3)).toBe('1.500');
  });
});

describe('treeCaption', () => {
  it('every preset × criterion × depth limit × step names the split just made and the accuracies on screen', () => {
    for (const id of PRESET_IDS) {
      const data = presetData(id);
      for (const criterion of ['gini', 'entropy'] as Criterion[]) {
        for (const maxDepth of [1, 3, MAX_DEPTH_SLIDER]) {
          const opts: TreeOptions = { maxDepth, minSamples: 2, criterion };
          const tree = growTree(data.train, opts);
          for (let steps = 0; steps <= tree.splits; steps++) {
            const c = text(treeCaption(tree, steps, data, opts, MAX_DEPTH_SLIDER));
            expect(c).not.toMatch(/NaN|undefined/);
            if (steps === 0) {
              expect(c).toContain(`all ${data.train.length} training points`);
              continue;
            }
            const train = Math.round(accuracy((p) => predictTree(tree, p, steps), data.train) * 100);
            const val = Math.round(accuracy((p) => predictTree(tree, p, steps), data.val) * 100);
            expect(c).toContain(`Training accuracy ${train}%, validation ${val}%.`);
            if (steps < tree.splits) expect(c).toContain(`Split ${steps}: ${question(tree.nodes.find((n) => n.order === steps - 1)!)}`);
            else {
              const best = depthCurve(data, opts, MAX_DEPTH_SLIDER).reduce((b, x) => (x.val > b.val ? x : b));
              const valExact = accuracy((p) => predictTree(tree, p), data.val);
              expect(c.includes('No depth limit from 1 to 8 does better')).toBe(valExact >= best.val);
              expect(c.includes(`A depth limit of ${best.depth} would score`)).toBe(valExact < best.val);
              expect(c.includes('single training point')).toBe(tree.nodes.some((n) => !n.split && n.counts[0] + n.counts[1] === 1));
            }
          }
        }
      }
    }
  });

  it('"One noisy point" grown fully says a shallower tree does better and points at the sliver', () => {
    const data = presetData('noisy');
    const opts: TreeOptions = { maxDepth: MAX_DEPTH_SLIDER, minSamples: 2, criterion: 'gini' };
    const tree = growTree(data.train, opts);
    const c = text(treeCaption(tree, tree.splits, data, opts, MAX_DEPTH_SLIDER));
    expect(c).toMatch(/A depth limit of \d would score/);
    expect(c).toContain('single training point');
  });
});

describe('forestCaption', () => {
  it('calls the forest steadier only when it disagrees with itself less than one tree does', () => {
    for (const id of PRESET_IDS) {
      const { train, val } = presetData(id);
      const one = seedSpread(train, val, 1, 1);
      for (const n of [1, 3, 25]) {
        const many = seedSpread(train, val, n, 1);
        const c = text(forestCaption(n, 0.9, one, many));
        expect(c.includes('steadier')).toBe(n > 1 && many.disagreement < one.disagreement);
        expect(c.includes('jumpier')).toBe(n > 1 && many.disagreement > one.disagreement);
        expect(c).toContain(`${Math.round(one.disagreement * 100)}%`);
      }
    }
    // A made-up case where the forest is the jumpier one: the caption must not praise it.
    const c = text(forestCaption(5, 0.8, { accuracies: [0.8], disagreement: 0.1 }, { accuracies: [0.8], disagreement: 0.2 }));
    expect(c).toContain('jumpier');
    expect(c).not.toContain('steadier');
  });
});

describe('boostFrames', () => {
  it('one frame per round; each states that round\'s α and ε and says "up" exactly when training error rose', () => {
    for (const id of PRESET_IDS) {
      const b = adaboost(presetData(id).train);
      const frames = boostFrames(b);
      expect(frames).toHaveLength(b.rounds.length);
      frames.forEach((f, t) => {
        const c = text(f.say);
        const r = b.rounds[t];
        expect(f.round).toBe(t + 1);
        expect(c).toContain(`α = ½ ln((1 − ε)/ε) = ${num(r.alpha, 3)}`);
        expect(c).toContain(`ε = ${num(r.error, 3)}`);
        const rose = t > 0 && r.trainError > b.rounds[t - 1].trainError;
        expect(c.includes('went up this round')).toBe(rose);
        expect(c).toContain('carry half of all the weight');
      });
    }
  });

  it('a perfect stump says boosting stops, and does not claim its (zero) misses carry half the weight', () => {
    const b = adaboost([{ x: 0, y: 0, label: 0 }, { x: 1, y: 0, label: 1 }]);
    const c = text(boostFrames(b)[0].say);
    expect(c).toContain('boosting stops here');
    expect(c).not.toContain('carry half');
  });
});
