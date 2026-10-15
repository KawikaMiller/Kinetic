import { describe, expect, it } from 'vitest';
import stage from './Stage.tsx?raw';
import lesson from './index';
import { FORGET_STEPS, PRESETS, WALK_SEED, WEATHER, analyse, distributionAt, pointMass, secondEigenvalues, setEntry, stationarySolve, tvSeries, visitFractions, walk } from './model';
import { conditionsOf, edgeLabel, forgetCaption, textCaption, verdictOf, verdictStat } from './text';

const PERIODIC = PRESETS.find((p) => p.id === 'periodic')!;

describe('try-this 3 starts from the default matrix even after try-this 2', () => {
  it('the edit of try-this 2 really changes the reading (0.350 against 0.558), which is why each scene must open on the default', () => {
    const decay = (P: typeof WEATHER) => secondEigenvalues(P).slem;
    expect(decay(WEATHER)).toBeCloseTo(0.558, 3);
    expect(decay(setEntry(WEATHER, 0, 0, 0.5))).toBeCloseTo(0.35, 3);
    expect(lesson.tryThis[2]).toContain('0.558');
  });

  it('Stage mounts the weather chain under a key per scene, so the edit does not follow the learner into the next scene', () => {
    // The repo has no DOM renderer: the key is pinned in source (without it, the hook state survives a scene switch).
    expect(stage).toMatch(/<ChainScene key=\{scene\}/);
    expect(stage).toMatch(/function ChainScene[\s\S]*useChain\(\)/);
  });
});

describe('the Verdict stat agrees with the stationary-distribution stat and the verdict sentence on every preset', () => {
  const expected: Record<string, { value: string; piUnique: boolean }> = {
    weather: { value: 'settles', piUnique: true },
    periodic: { value: 'cycles, period 2', piUnique: true },
    absorbing: { value: 'settles, not irreducible', piUnique: true },
    reducible: { value: 'not unique', piUnique: false },
  };

  it('values match the hand-classified presets, and no stat says "does not settle" for a chain that settles to one pi', () => {
    for (const p of PRESETS) {
      const a = analyse(p.P);
      const stat = verdictStat(a);
      expect(stat.value).toBe(expected[p.id].value);
      expect(stationarySolve(p.P) !== null).toBe(expected[p.id].piUnique);
      expect(a.uniqueStationary).toBe(expected[p.id].piUnique);
      expect(stat.value).not.toContain('does not settle');
      expect(stat.value.startsWith('settles')).toBe(a.settles && a.uniqueStationary);
      const sentence = verdictOf(a, p.states).text;
      if (stat.value === 'not unique') expect(sentence).toContain('not unique');
      if (stat.value.startsWith('cycles')) expect(sentence).toContain('cycles forever');
      if (p.id === 'absorbing') expect(sentence).toContain('only stationary distribution');
    }
  });
});

describe('"the bars" are scoped: the distribution at step t flips, the share of time still settles', () => {
  it('for the periodic chain the share of time reaches 50/50 while the step-one-million distribution is all on one state', () => {
    const shares = visitFractions(walk(PERIODIC.P, 0, WALK_SEED, 20_000), 20_000, 2);
    shares.forEach((s) => expect(Math.abs(s - 0.5)).toBeLessThan(0.01));
    expect(distributionAt(PERIODIC.P, pointMass(2, 0), 1_000_000)).toEqual([1, 0]);
    expect(distributionAt(PERIODIC.P, pointMass(2, 0), 1_000_001)).toEqual([0, 1]);
  });

  it('the question, key idea and why say which reading they mean, and the why mentions the time share', () => {
    const q = lesson.quiz[0];
    expect(q.q).toContain('step one million');
    expect(q.q).toContain('not the share of time');
    expect(q.why).toContain('share of time');
    expect(q.why).toContain('(0.5, 0.5)');
    expect(lesson.keyIdeas[3]).toContain('distribution of a periodic chain at step t');
    expect(lesson.keyIdeas[3]).toContain('share of time still settles');
  });
});

describe('minor wording and labels', () => {
  it('a complex pair is described by its modulus on average, never as "the larger modulus"; a real pair keeps that wording', () => {
    const complexP = [[0.445, 0.395, 0.161], [1, 0, 0], [0, 1, 0]];
    const l = secondEigenvalues(complexP);
    expect(l.kind).toBe('complex');
    const pi = stationarySolve(complexP)!;
    const series = tvSeries(complexP, pointMass(3, 0), pi, FORGET_STEPS);
    const text = forgetCaption({ t: 5, tv: series[5], prevTv: series[4], lambdas: l, settles: true, uniquePi: true });
    expect(text).not.toContain('larger modulus');
    expect(text).toContain('On average each step shrinks the distance by about the modulus');
    const real = forgetCaption({ t: 5, tv: 0.1, prevTv: 0.2, lambdas: secondEigenvalues(WEATHER), settles: true, uniquePi: true });
    expect(real).toContain('the larger modulus');
  });

  it('a condition that is not asked shows as not asked, not as failed', () => {
    for (const p of PRESETS) {
      const a = analyse(p.P);
      const aperiodic = conditionsOf(a, p.states)[1];
      expect(aperiodic.asked).toBe(a.irreducible);
      if (!aperiodic.asked) expect(aperiodic.detail).toContain('not asked');
    }
  });

  it('a chance that rounds to 0 is labelled "<0.001", never 0, and ordinary chances keep their label', () => {
    expect(edgeLabel(0.0001)).toBe('<0.001');
    expect(edgeLabel(0.0004999)).toBe('<0.001');
    expect(edgeLabel(0.0005)).not.toBe('0');
    expect(edgeLabel(0.15)).toBe('0.15');
    expect(edgeLabel(1)).toBe('1');
  });

  it('the text caption explains recombination only when a sentence is new', () => {
    expect(textCaption(10, 5, 0, 5)).not.toContain('because');
    expect(textCaption(10, 5, 2, 5)).toContain('because the chain recombines');
  });
});
