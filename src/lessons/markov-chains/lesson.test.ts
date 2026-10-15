import { describe, expect, it } from 'vitest';
import { pctText } from '../../core/format';
import { mulberry32, randInt } from '../../core/random';
import lesson from './index';
import {
  FORGET_STEPS, GUIDE_ANCHOR, PRESETS, WALK_MAX, WALK_SEED, WEATHER, analyse, distributionAt, guideSeries, pointMass, reachableFrom, secondEigenvalues, setEntry,
  startDistribution, stationarySolve, tvSeries, visitFractions, walk, type Matrix,
} from './model';
import { CORPORA, buildChain, generateSentences, inCorpus, nextWords, parseCorpus } from './textChain';
import {
  CONVERGED_AFTER, CONVERGED_TOLERANCE, conditionsOf, failureCaption, forgetCaption, isConverged, measuredRatio, stateConverged, textCaption, verdictOf, walkCaption,
} from './text';

const NO_JUNK = /NaN|undefined|null|Infinity|\[object/;
const STATES = ['Sunny', 'Cloudy', 'Rainy'];
const caps = (r: Parameters<typeof walkCaption>[0]) => walkCaption(r);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: 100,000 steps from Sunny with seed 7 land within 0.01 of pi, and the sentence quotes those numbers', () => {
    const pi = stationarySolve(WEATHER)!;
    const f = visitFractions(walk(WEATHER, 0, WALK_SEED, WALK_MAX), WALK_MAX, 3);
    f.forEach((x, i) => expect(Math.abs(x - pi[i])).toBeLessThan(CONVERGED_TOLERANCE));
    const readout = { states: STATES, t: WALK_MAX, at: 0, fractions: f, pi, seed: WALK_SEED };
    expect(isConverged(readout)).toBe(true);
    expect(caps(readout)).toContain('Every share is within 0.01');
    f.forEach((x) => expect(lesson.tryThis[0]).toContain(pctText(x)));
    expect(lesson.tryThis[0]).toContain('56.7%');
  });

  it('try-this 2: Sunny to Sunny at 0.5 rescales the row to 0.5, 0.375, 0.125 (hand-worked: 0.15 and 0.05 keep their 3 to 1 ratio in the remaining 0.5)', () => {
    const row = setEntry(WEATHER, 0, 0, 0.5)[0];
    expect(row[1]).toBeCloseTo(0.375, 12);
    expect(row[2]).toBeCloseTo(0.125, 12);
    expect(row.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
    expect(lesson.tryThis[1]).toContain('0.375 and 0.125');
  });

  it('try-this 3: from Sunny the ratio of successive distances at t = 10 is within 2% of the second eigenvalue 0.558', () => {
    const pi = stationarySolve(WEATHER)!;
    const series = tvSeries(WEATHER, pointMass(3, 0), pi, FORGET_STEPS);
    const l = secondEigenvalues(WEATHER);
    const ratio = series[10] / series[9];
    expect(Math.abs(ratio - l.slem) / l.slem).toBeLessThan(0.02);
    expect(lesson.tryThis[2]).toContain(`reads ${ratio.toFixed(3)}`);
    expect(lesson.tryThis[2]).toContain('0.558');
    const text = forgetCaption({ t: 10, tv: series[10], prevTv: series[9], lambdas: l, settles: true, uniquePi: true });
    expect(text).toContain(`${ratio.toFixed(3)} times the previous step`);
    expect(text).toContain('0.558');
  });

  it('try-this 4: the periodic chain from A is at (0, 1) at t = 7 and (1, 0) at t = 8', () => {
    const P = PRESETS.find((p) => p.id === 'periodic')!.P;
    expect(distributionAt(P, [1, 0], 7)).toEqual([0, 1]);
    expect(distributionAt(P, [1, 0], 8)).toEqual([1, 0]);
    expect(lesson.tryThis[3]).toContain('A 0, B 1');
    expect(lesson.tryThis[3]).toContain('A 1, B 0');
    const preset = PRESETS.find((p) => p.id === 'periodic')!;
    expect(failureCaption(preset.label, analyse(preset.P), preset.states, 7, 'A')).toContain('period 2');
  });

  it('try-this 5: the default corpus makes "the" the most common word, followed by cat 3/8-style shares quoted from the model', () => {
    const parsed = parseCorpus(CORPORA[0].text);
    if (!parsed.ok) throw new Error('corpus');
    const chain = buildChain(parsed.value);
    expect(chain.words[0]).toBe('the');
    const after = nextWords(chain, 'the');
    // Hand count: the cat sat / the dog sat / the cat saw / the dog / a dog saw a cat on the mat -> the: cat, mat, dog, rug, cat, dog, mat.
    const counts = new Map(after.map((r) => [r.word, r.count]));
    expect(Object.fromEntries(counts)).toEqual({ cat: 2, dog: 2, mat: 2, rug: 1 });
    expect(lesson.tryThis[4]).toContain('cat 28.6%');
    const fresh = generateSentences(chain, 3).filter((s) => !inCorpus(chain, s)).length;
    expect(lesson.tryThis[4]).toContain(`with seed 3, ${fresh} of the 5 sentences are new`);
    expect(textCaption(chain.sentences.flat().length, chain.words.length, fresh, 5)).toContain(`${fresh} of 5 generated sentences`);
  });
});

describe('every caption reads cleanly across the control space', () => {
  it('the walk caption holds at step 0, mid-run and converged, with and without a unique pi, for 200 seeded matrices', () => {
    const rnd = mulberry32(17);
    for (let k = 0; k < 200; k++) {
      let P: Matrix = WEATHER;
      for (let e = 0; e < 3; e++) P = setEntry(P, randInt(0, 2, rnd), randInt(0, 2, rnd), [0, 1, rnd()][randInt(0, 2, rnd)]);
      const pi = stationarySolve(P);
      const start = randInt(0, 2, rnd);
      const path = walk(P, start, k + 1, 3000);
      for (const t of [0, 1, 50, CONVERGED_AFTER, 3000]) {
        const f = visitFractions(path, t, 3);
        const text = caps({ states: STATES, t, at: path[t], fractions: f, pi, seed: k + 1 });
        expect(text).not.toMatch(NO_JUNK);
        expect(text).toContain(STATES[path[t]]);
        if (!pi) expect(text).toContain('no unique stationary distribution');
      }
    }
  });

  it('a state is converged only after 1,000 steps and within 0.01 of pi, and the caption agrees with it', () => {
    expect(stateConverged(999, 0.5, 0.5)).toBe(false);
    expect(stateConverged(CONVERGED_AFTER, 0.5, 0.5 + CONVERGED_TOLERANCE - 1e-6)).toBe(true);
    expect(stateConverged(CONVERGED_AFTER, 0.5, 0.5 + CONVERGED_TOLERANCE)).toBe(false);
    const early = { states: STATES, t: 10, at: 0, fractions: [0.5, 0.3, 0.2], pi: [0.5, 0.3, 0.2], seed: 1 };
    expect(isConverged(early)).toBe(false);
    expect(caps(early)).not.toContain('Every share is within');
  });

  it('the forgetting caption covers every preset chain x start x step, including no unique pi, periodic and complex pairs', () => {
    const chains: Matrix[] = [...PRESETS.filter((p) => p.P.length === 3).map((p) => p.P), [[0.1, 0.8, 0.1], [0.1, 0.1, 0.8], [0.8, 0.1, 0.1]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]]];
    let seenComplex = false;
    let seenNoPi = false;
    let seenFlat = false;
    for (const P of chains) {
      const a = analyse(P);
      const pi = stationarySolve(P);
      const lambdas = secondEigenvalues(P);
      for (const start of [0, 1, 2, 'even'] as const) {
        const series = pi ? tvSeries(P, startDistribution(3, start), pi, FORGET_STEPS) : null;
        for (const t of [0, 1, 5, 20, FORGET_STEPS]) {
          const text = forgetCaption({ t, tv: series ? series[t] : null, prevTv: series && t > 0 ? series[t - 1] : null, lambdas, settles: a.settles, uniquePi: !!pi });
          expect(text).not.toMatch(NO_JUNK);
          expect(text).toContain('second eigenvalues are');
          if (lambdas.kind === 'complex') {
            seenComplex = true;
            if (pi && a.settles && lambdas.slem < 1 - 1e-9) expect(text).toContain('complex');
          }
          if (!pi) {
            seenNoPi = true;
            expect(text).toContain('more than one stationary distribution');
          }
          if (pi && (!a.settles || lambdas.slem >= 1 - 1e-9)) {
            seenFlat = true;
            expect(text).toContain('does not forget its start');
          }
        }
      }
    }
    expect(seenComplex && seenNoPi && seenFlat).toBe(true);
    expect(measuredRatio(null, 0.1)).toBeNull();
    expect(measuredRatio(1e-12, 1e-13)).toBeNull();
    expect(measuredRatio(0.2, 0.1)).toBe(0.5);
  });

  it('the guide passes through the measured point at the anchor and shrinks by slem each step, and is dropped when the anchor is below the axis', () => {
    const pi = stationarySolve(WEATHER)!;
    const series = tvSeries(WEATHER, pointMass(3, 0), pi, FORGET_STEPS);
    const l = secondEigenvalues(WEATHER);
    const guide = guideSeries(series, l.slem)!;
    expect(guide[GUIDE_ANCHOR]).toBeCloseTo(series[GUIDE_ANCHOR], 15);
    expect(guide[GUIDE_ANCHOR + 3] / guide[GUIDE_ANCHOR + 2]).toBeCloseTo(l.slem, 12);
    expect(guideSeries([0.5, 0.2, 0, 0, 0, 0, 0], 0.5)).toBeNull();
  });

  it('the verdicts and conditions name exactly what the analysis finds, for every preset', () => {
    const byId = Object.fromEntries(PRESETS.map((p) => [p.id, { p, a: analyse(p.P) }]));
    expect(verdictOf(byId.weather.a, byId.weather.p.states).tone).toBe('ok');
    expect(verdictOf(byId.periodic.a, byId.periodic.p.states).text).toContain('period 2');
    expect(verdictOf(byId.absorbing.a, byId.absorbing.p.states).text).toContain('absorbing state (C)');
    expect(verdictOf(byId.reducible.a, byId.reducible.p.states).text).toContain('2 closed classes ({A, B} and {C, D})');
    for (const { p, a } of Object.values(byId)) {
      const conditions = conditionsOf(a, p.states);
      expect(conditions.map((c) => c.name)).toEqual(['Irreducible', 'Aperiodic', 'Finite']);
      expect(conditions[0].met).toBe(a.irreducible);
      expect(conditions[1].met).toBe(a.period === 1);
      for (const c of conditions) expect(c.detail).not.toMatch(NO_JUNK);
      expect(failureCaption(p.label, a, p.states, 12, p.states[0])).not.toMatch(NO_JUNK);
    }
    expect(conditionsOf(byId.reducible.a, byId.reducible.p.states)[1].detail).toContain('not asked');
  });
});

describe('hidden controls feed nothing', () => {
  it('the failure scene reads only its presets: editing the weather chain changes nothing there', () => {
    const before = PRESETS.map((p) => analyse(p.P));
    setEntry(WEATHER, 0, 0, 0.1);
    expect(PRESETS.map((p) => analyse(p.P))).toEqual(before);
    expect(WEATHER[0]).toEqual([0.8, 0.15, 0.05]);
  });

  it('the walk path ignores the speed and the step count: a longer run only extends the shorter one', () => {
    const a = walk(WEATHER, 0, WALK_SEED, 500);
    const b = walk(WEATHER, 0, WALK_SEED, WALK_MAX);
    expect(Array.from(b.slice(0, 501))).toEqual(Array.from(a));
  });

  it('reachability: a state no path leads to from the start is the only kind that is dimmed', () => {
    const absorbing = PRESETS.find((p) => p.id === 'absorbing')!.P;
    expect([...reachableFrom(absorbing, 2)]).toEqual([2]);
    expect(reachableFrom(absorbing, 0).size).toBe(3);
    const reducible = PRESETS.find((p) => p.id === 'reducible')!.P;
    expect([...reachableFrom(reducible, 0)].sort()).toEqual([0, 1]);
  });
});
