import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { labTotals, n, sortedCaption, speculationCaption, stepCaption } from './captions';
import { labFacts, sortedFacts, speculationFacts } from './facts';
import { labFrames, speculationFrames } from './frames';
import lesson from './index';
import { PREDICTOR_KINDS, missCount, run, type PredictorKind } from './predictor';
import {
  DEPTH_RANGE, LAB_LENGTH, PATTERN_PRESETS, PENALTY_RANGE, branchOutcomes, dataValues, labOpening, labOutcomes, loopConfig, loopCost, sortedOpening,
  speculation, speculationOpening,
} from './scenarios';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

describe('scene switches', () => {
  it('every scene is its own component and carries its own key, so no scene opens on another scene\'s state', () => {
    expect(sceneElements('branch-prediction')).toHaveLength(3);
    expect(sharedSceneComponents('branch-prediction')).toEqual([]);
    expect(sceneElements('branch-prediction').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    const lab = labOpening();
    expect(lab).toMatchObject({ kind: 'two-bit', initialCounter: 2, historyBits: 2, penalty: 15, every: 6, p: 0.7 });
    expect(lab.source).toEqual({ kind: 'pattern', pattern: PATTERN_PRESETS.find((p) => p.id === 'loop')!.pattern });
    expect(sortedOpening()).toEqual({ order: 'unsorted', kind: 'two-bit', branchless: false, penalty: 15 });
    expect(speculationOpening()).toEqual({ depth: 3, guessRight: false });
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: on the loop of four the 2-bit counter misses 16 of 64 and the 1-bit predictor 31', () => {
    const f = labFacts();
    expect([f.loopTwoBit, f.loopOneBit, f.branches]).toEqual([16, 31, 64]);
    // independent hand count: 2-bit misses the N once per period of 4 (16 periods); 1-bit misses the N and the T after it, except the very first T
    expect(f.loopTwoBit).toBe(64 / 4);
    expect(f.loopOneBit).toBe(2 * (64 / 4) - 1);
    expect(lesson.tryThis[0]).toContain('misses 16 and the 1-bit predictor 31');
  });

  it('try-this 2: alternating TN with the counter at 1 misses all 64, at 2 it misses 32 (the preset then the counter, as written)', () => {
    const f = labFacts();
    expect([f.altTwoBitWeak, f.altTwoBitDefault]).toEqual([64, 32]);
    expect(lesson.tryThis[1]).toContain('all 64 branches');
    expect(lesson.tryThis[1]).toContain('misses 32');
  });

  it('try-this 3: on TTNN the 1-bit predictor misses 31 of 64 and the 2-bit counter 47', () => {
    const f = labFacts();
    expect([f.pairsOneBit, f.pairsTwoBit]).toEqual([31, 47]);
    expect(f.pairsOneBit).toBeLessThan(f.pairsTwoBit);
    expect(lesson.tryThis[2]).toContain('misses 31 of 64 and the 2-bit counter 47');
  });

  it('try-this 4: unsorted is 122 misses and 3,366 cycles, sorted 3 and 1,581, branchless 2,048 (more than sorted branchy)', () => {
    const f = sortedFacts();
    expect(f).toMatchObject({ unsortedMisses: 122, sortedMisses: 3, unsortedCycles: 3366, sortedCycles: 1581, branchlessCycles: 2048, iterations: 256 });
    // cycles recomputed by hand: 256 iterations x 6 instructions + misses x 15
    expect(f.unsortedCycles).toBe(256 * 6 + 122 * 15);
    expect(f.branchlessCycles).toBe(256 * 8);
    expect(f.branchlessCycles).toBeGreaterThan(f.sortedCycles);
    expect(f.branchlessCycles).toBeLessThan(f.unsortedCycles);
    expect(lesson.tryThis[3]).toContain('122 of 256 branches and takes 3,366 cycles');
    expect(lesson.tryThis[3]).toContain('3 misses and 1,581 cycles');
    expect(lesson.tryThis[3]).toContain('2,048 cycles');
  });

  it('try-this 5: at stage 3 two instructions are flushed; at stage 15, fourteen and fourteen cycles; a right guess flushes nothing', () => {
    const f = speculationFacts();
    expect(f).toMatchObject({ depth: 3, flushed: 2, deep: 15, deepFlushed: 14, deepLost: 14 });
    for (let d = DEPTH_RANGE.min; d <= DEPTH_RANGE.max; d++) expect(speculation(d, true).flushed).toBe(0);
    expect(lesson.tryThis[4]).toContain('2 instructions are flushed');
    expect(lesson.tryThis[4]).toContain('14 are flushed and 14 fetch cycles');
  });
});

describe('the lab\'s controls and the numbers they feed', () => {
  const misses = (kind: PredictorKind, initialCounter: number, historyBits: number, source: Parameters<typeof labOutcomes>[0]) =>
    missCount(run({ kind, initialCounter, historyBits }, labOutcomes(source)));
  const streams = [
    ...PATTERN_PRESETS.map((p) => ({ kind: 'pattern' as const, pattern: p.pattern })),
    { kind: 'random' as const, p: 0.7 },
    { kind: 'sorted' as const },
    { kind: 'unsorted' as const },
  ];

  it('history bits feed only the two-level predictor and the initial counter feeds no static predictor (the control cross product)', () => {
    for (const source of streams) {
      for (const init of [0, 1, 2, 3]) {
        for (const kind of PREDICTOR_KINDS) {
          const byBits = [1, 2, 3, 4].map((h) => misses(kind, init, h, source));
          if (kind !== 'two-level') expect(new Set(byBits).size).toBe(1);
        }
      }
      for (const h of [1, 4]) {
        const statics = [0, 1, 2, 3].map((init) => misses('static-taken', init, h, source));
        expect(new Set(statics).size).toBe(1);
        expect(new Set([0, 1, 2, 3].map((init) => misses('static-not-taken', init, h, source))).size).toBe(1);
      }
    }
  });

  it('an all-taken and an all-not-taken pattern are valid, and a single flipped cell changes the stream', () => {
    const allT = labOutcomes({ kind: 'pattern', pattern: Array(16).fill(true) });
    const allN = labOutcomes({ kind: 'pattern', pattern: Array(16).fill(false) });
    expect(allT.every(Boolean)).toBe(true);
    expect(allN.some(Boolean)).toBe(false);
    expect(missCount(run({ kind: 'two-bit', initialCounter: 2, historyBits: 2 }, allT))).toBe(0);
    expect(labOutcomes({ kind: 'pattern', pattern: PATTERN_PRESETS[0].pattern.map((b, i) => (i === 3 ? !b : b)) })).not.toEqual(allT);
  });

  it('stat captions state what the numbers show at the start, the middle and the end', () => {
    const open = labOpening();
    const steps = run({ kind: open.kind, initialCounter: open.initialCounter, historyBits: open.historyBits }, labOutcomes(open.source));
    for (const k of [0, 31, LAB_LENGTH - 1]) {
      const totals = labTotals(steps.slice(0, k + 1), open.penalty, open.every);
      const say = text(stepCaption(steps[k], open.penalty, totals));
      expect(say).toContain(`${n(totals.misses)} ${totals.misses === 1 ? 'miss' : 'misses'} in ${n(k + 1)}`);
      expect(say).toContain(`${n(totals.cycles)} cycles`);
      expect(totals.cycles).toBe((k + 1) * open.every + totals.misses * open.penalty);
    }
    const frames = labFrames(open.kind, steps, open.penalty, open.every);
    expect(frames).toHaveLength(LAB_LENGTH + 1);
    expect(frames.every((f) => f.say !== undefined)).toBe(true);
    frames.forEach((f) => text(f.say));
  });
});

describe('the sorted scene across its controls', () => {
  it('branchless costs the same for every order, predictor and penalty only through the penalty-free instruction count', () => {
    const costs = (['sorted', 'unsorted'] as const).flatMap((order) =>
      PREDICTOR_KINDS.flatMap((kind) => [PENALTY_RANGE.min, PENALTY_RANGE.max].map((pen) => loopCost(order, loopConfig(kind), pen, true))),
    );
    expect(new Set(costs.map((c) => c.cycles)).size).toBe(1);
  });

  it('the caption quotes the misses and cycles of the same cost it came from, at the penalty extremes', () => {
    for (const order of ['sorted', 'unsorted'] as const) {
      for (const pen of [PENALTY_RANGE.min, PENALTY_RANGE.max]) {
        for (const kind of PREDICTOR_KINDS) {
          const cost = loopCost(order, loopConfig(kind), pen, false);
          const say = text(sortedCaption(order, cost, pen));
          expect(say).toContain(`misses ${n(cost.misses)} of 256`);
          expect(say).toContain(`${n(cost.cycles)} cycles`);
          expect(cost.cycles).toBe(256 * 6 + cost.misses * pen);
        }
      }
    }
    const free = loopCost('sorted', loopConfig('two-bit'), 15, true);
    expect(text(sortedCaption('sorted', free, 15))).toContain('0 misses');
  });

  it('the data really is sorted or not, with the same values in both orders', () => {
    const s = dataValues('sorted');
    expect(s.every((v, i) => i === 0 || s[i - 1] <= v)).toBe(true);
    expect(branchOutcomes(s).filter(Boolean).length).toBe(branchOutcomes(dataValues('unsorted')).filter(Boolean).length);
  });
});

describe('the speculation captions', () => {
  it('state the numbers of the same model at both ends of the slider', () => {
    for (const depth of [DEPTH_RANGE.min, DEPTH_RANGE.max]) {
      const wrong = text(speculationCaption(speculation(depth, false)));
      expect(wrong).toContain(`${n(depth - 1)} fetch cycles`);
      expect(wrong).toContain(`stage ${n(depth)}`);
      expect(text(speculationCaption(speculation(depth, true)))).toContain('Nothing is lost');
      const frames = speculationFrames(depth, false);
      expect(frames).toHaveLength(depth + 1);
      frames.forEach((f) => text(f.say));
    }
  });
});

describe('honesty and quiz', () => {
  it('no model file reads a clock, starts a timer or touches the network', () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts') && !name.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(4);
    for (const [name, source] of files) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
      expect(code, name).not.toMatch(/performance\.now|Date\.now|new Date|setTimeout|setInterval|requestAnimationFrame|fetch\(/);
    }
  });

  it('the correct quiz option is the strictly longest in at most half the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(lesson.quiz.length / 2);
  });

  it('the quiz numbers come from the model', () => {
    const f = labFacts();
    expect(lesson.quiz[0].why).toContain(`${f.altOneBit} of ${f.branches}`);
    expect(lesson.quiz[3].options[0]).toContain(`${f.pairsOneBit} against ${f.pairsTwoBit}`);
    expect(speculation(5, false).flushed).toBe(4);
    expect(lesson.quiz[4].answer).toBe(0);
    expect(lesson.quiz[4].options[0]).toBe('4');
    expect(missCount(run({ kind: 'two-bit', initialCounter: 3, historyBits: 2 }, labOutcomes({ kind: 'pattern', pattern: PATTERN_PRESETS[2].pattern })))).toBe(16);
  });
});
