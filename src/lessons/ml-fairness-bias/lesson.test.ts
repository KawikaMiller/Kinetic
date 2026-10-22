import { describe, expect, it } from 'vitest';
import { choose, enumeratePaths, startWalk, validateScenario } from '../../core/scenario';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { chooseCaption, optionCaption, sourcesCaption, thresholdCaption, tradeoffCaption } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import {
  CRITERIA, DEFAULT, calibrationCheck, equaliseB, fitModel, gapsOf, generate, groupStats, predict, smallestWorstGap, thresholdGrid, type Criterion,
} from './model';
import { OPENING } from './opening';
import { runOptions } from './options';
import { CHOICES, CHOOSE, METER, OUTCOMES, START, TRUST } from './scenario';

const NO_JUNK = /NaN|undefined|\[object|Infinity/;

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('ml-fairness-bias');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('ml-fairness-bias')).toEqual([]);
  });

  it('every scene opens on its documented state', () => {
    expect(OPENING.scene).toBe('threshold');
    expect(OPENING.threshold).toEqual({ params: DEFAULT, t: 0.5 });
    expect(OPENING.tradeoff).toEqual({ population: 'different', scorer: 'imperfect', tA: 0.5, tB: 0.5, criterion: 'tpr' });
    expect(OPENING.options).toEqual({ params: DEFAULT, picked: 'one' });
    expect(OPENING.sources).toEqual({ share: 0.1, noise: 0.25 });
  });

  it('hidden controls feed nothing: the proxy value changes the options scene only, not the threshold scene numbers', () => {
    const at = (proxy: number) => {
      const rows = generate({ ...DEFAULT, proxy });
      const probs = predict(fitModel(rows, 'aware'), rows);
      return JSON.stringify([groupStats(rows, probs, 0.5, 0), groupStats(rows, probs, 0.5, 1)]);
    };
    expect(at(0)).toBe(at(3));
    expect(runOptions({ ...DEFAULT, proxy: 0 }).options[0].gaps).toEqual(runOptions({ ...DEFAULT, proxy: 3 }).options[0].gaps);
    expect(runOptions({ ...DEFAULT, proxy: 0 }).options[4].gaps.selection).not.toBe(runOptions({ ...DEFAULT, proxy: 3 }).options[4].gaps.selection);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: 78.4% against 52.3%, a 16.7-point true-positive gap, 1 of 5 criteria hold at 0.50 (only calibration, calibrated by construction) and 2 of 5 at 0.80', () => {
    const rows = generate(DEFAULT);
    const probs = predict(fitModel(rows, 'aware'), rows);
    const a = groupStats(rows, probs, 0.5, 0);
    const b = groupStats(rows, probs, 0.5, 1);
    expect([(a.selection * 100).toFixed(1), (b.selection * 100).toFixed(1), (gapsOf(a, b).tpr * 100).toFixed(1)]).toEqual(['78.4', '52.3', '16.7']);
    expect(CRITERIA.filter((c) => gapsOf(a, b)[c.id] <= 0.03)).toEqual([]);
    expect(calibrationCheck(rows, probs).holds).toBe(true);
    expect([FACTS.holding, FACTS.holdingHigh, FACTS.criteria]).toEqual([1, 2, 5]);
    expect(lesson.tryThis[0]).toContain('78.4%');
    expect(lesson.tryThis[0]).toContain('1 of 5 criteria hold');
    expect(lesson.tryThis[0]).toContain('and 2 of 5 hold');
  });

  it('try-this 2: finding B\'s cut-off leaves a 0.1-point true-positive gap and an 18.1-point precision gap; the closest pair is 9.1 points, 0.0 for a perfect scorer', () => {
    const rows = generate(DEFAULT);
    const probs = predict(fitModel(rows, 'aware'), rows);
    const tB = equaliseB(rows, probs, OPENING.tradeoff.tA, OPENING.tradeoff.criterion)!;
    const g = gapsOf(groupStats(rows, probs, OPENING.tradeoff.tA, 0), groupStats(rows, probs, tB, 1));
    expect([(g.tpr * 100).toFixed(1), (g.precision * 100).toFixed(1)]).toEqual(['0.1', '18.1']);
    expect([FACTS.worstDefault, FACTS.worstPerfect]).toEqual(['9.1', '0.0']);
    expect(lesson.tryThis[1]).toContain('falls to 0.1 points while the precision gap is 18.1');
    expect(lesson.tryThis[1]).toContain('9.1 points');
  });

  it('try-this 3: equal approval rate gives an approval gap of 0.0, FPR gap 13.4, precision gap 20.1, accuracy 76.5% to 74.0%; dropping the column gives 21.2 and with proxy 3.0 gives 26.1', () => {
    const o = runOptions(DEFAULT).options;
    expect([(o[2].gaps.selection * 100).toFixed(1), (o[2].gaps.fpr * 100).toFixed(1), (o[2].gaps.precision * 100).toFixed(1)]).toEqual(['0.0', '13.4', '20.1']);
    expect([FACTS.plainAccuracy, FACTS.selectionAccuracy, FACTS.unawareApprovalGap, FACTS.unawareProxyGap]).toEqual(['76.5%', '74.0%', '21.2', '26.1']);
    expect(lesson.tryThis[2]).toContain('from 76.5% to 74.0%');
    expect(lesson.tryThis[2]).toContain('21.2 points');
  });

  it('try-this 4: group B\'s error is 28.2% at a 10% share and 13.7% at 50%; 63.9% apparent against 72.0% actual at 25% noise', () => {
    expect([FACTS.repSmallB, FACTS.repLargeB, FACTS.apparentB, FACTS.actualB]).toEqual(['28.2%', '13.7%', '63.9%', '72.0%']);
    expect(lesson.tryThis[3]).toContain('its error is 28.2%');
    expect(lesson.tryThis[3]).toContain('falls to 13.7%');
  });

  it('try-this 5: demographic parity gives group B 78% approved, 101 denied and 419 defaulters approved, against 52% and 180 at the start', () => {
    const w = choose(CHOOSE, startWalk(CHOOSE), 'parity');
    expect([w.meters[METER.approved], w.meters[METER.denied], w.meters[METER.defaulters]]).toEqual([78, 101, 419]);
    expect([START.approvedB, START.deniedInError]).toEqual([52, 180]);
    expect(lesson.tryThis[4]).toContain('reads 78% (it was 52%)');
    expect(lesson.tryThis[4]).toContain('reads 101 (it was 180)');
  });
});

describe('captions across the control cross product', () => {
  it('the threshold caption is clean across thresholds, base-rate gaps and group sizes, and its counts follow the rows', () => {
    for (const nB of [100, 800, 1900]) {
      for (const gap of [0, 0.4]) {
        const p = { ...DEFAULT, nB, gap };
        const rows = generate(p);
        const probs = predict(fitModel(rows, 'aware'), rows);
        for (const t of [0, 0.01, 0.5, 0.99, 1]) {
          const a = groupStats(rows, probs, t, 0);
          const b = groupStats(rows, probs, t, 1);
          const text = expectCaption(thresholdCaption(t, a, b, gapsOf(a, b), calibrationCheck(rows, probs)));
          expect(text, `${nB} ${gap} ${t}`).not.toMatch(NO_JUNK);
          expect(text).toContain(`At a cut-off of ${t.toFixed(2)}`);
        }
      }
    }
  });

  it('the trade-off caption says all three can be equal exactly where the model says so', () => {
    for (const [gap, shift, separation] of [[DEFAULT.gap, DEFAULT.shift, DEFAULT.separation], [0, 0, DEFAULT.separation], [DEFAULT.gap, DEFAULT.shift, 20]] as const) {
      const rows = generate({ ...DEFAULT, gap, shift, separation });
      const probs = predict(fitModel(rows, 'aware'), rows);
      const worst = smallestWorstGap(thresholdGrid(rows, probs));
      for (const criterion of CRITERIA.map((c) => c.id) as Criterion[]) {
        const g = gapsOf(groupStats(rows, probs, 0.5, 0), groupStats(rows, probs, 0.5, 1));
        const text = expectCaption(tradeoffCaption({ tA: 0.5, tB: 0.5, criterion, gaps: g, worstPossible: worst, perfect: separation === 20, equalBase: gap === 0 }));
        expect(text).not.toMatch(NO_JUNK);
        expect(text.includes('can be equal at once')).toBe(worst <= 0.03);
        expect(text.includes('cannot all be equal')).toBe(worst > 0.03);
      }
    }
  });

  it('the option, sources and choose captions are clean in every state', () => {
    const { options } = runOptions(DEFAULT);
    for (const o of options) expect(expectCaption(optionCaption(options[0], o))).not.toMatch(NO_JUNK);
    expect(expectCaption(sourcesCaption(0.1, 0.282, 0.2, 0.639, 0.72, 0.4, 0.342))).toContain('28.2%');
    expect(expectCaption(chooseCaption(CHOOSE, startWalk(CHOOSE)))).toContain('Group B approved 52%');
    for (const c of CHOICES) expect(expectCaption(chooseCaption(CHOOSE, choose(CHOOSE, startWalk(CHOOSE), c.id)))).not.toMatch(NO_JUNK);
  });
});

describe('choosing a metric', () => {
  it('validates, reaches all four endings, no ending is marked correct, and each ending says what it gives up', () => {
    expect(validateScenario(CHOOSE)).toEqual([]);
    const paths = enumeratePaths(CHOOSE);
    expect(paths).toHaveLength(4);
    expect(new Set(paths.map((p) => p.endingId)).size).toBe(4);
    for (const e of CHOOSE.endings) {
      expect(`${e.title} ${e.text}`).not.toMatch(/\b(correct|best|right answer|wrong)\b/i);
      expect(e.text).toContain('What it gives up');
    }
  });

  it('no criterion is at least as good as another on approvals, denials, defaulters and trust at once', () => {
    const keys = CHOICES.map((c) => ({ id: c.id, approved: OUTCOMES[c.id].approvedB, denied: -OUTCOMES[c.id].deniedInError, defaulters: -OUTCOMES[c.id].defaultersApproved, trust: TRUST[c.id] }));
    for (const a of keys) for (const b of keys) if (a.id !== b.id) expect(a.approved >= b.approved && a.denied >= b.denied && a.defaulters >= b.defaulters && a.trust >= b.trust, `${a.id} vs ${b.id}`).toBe(false);
  });

  it('each choice reaches the criterion it names, on the lesson\'s own data', () => {
    const rows = generate(DEFAULT);
    const probs = predict(fitModel(rows, 'aware'), rows);
    const gapOf = (id: string, criterion: Criterion) => gapsOf(groupStats(rows, probs, 0.5, 0), groupStats(rows, probs, CHOICES.find((c) => c.id === id)!.tB, 1))[criterion];
    expect(gapOf('parity', 'selection')).toBeLessThan(0.005);
    expect(gapOf('opportunity', 'tpr')).toBeLessThan(0.005);
    expect(gapOf('odds', 'fpr')).toBeLessThan(0.03);
    expect(gapOf('precision', 'precision')).toBeLessThan(0.03);
  });
});
