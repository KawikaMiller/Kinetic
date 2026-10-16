import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { lintLesson } from '../../core/lessonContent';
import { unscopedAbsolutes } from '../../core/lessonContentT3';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { cellSpec } from './cells';
import { ROUNDS, ratingRank } from './loop';
import { PINNED_LOOP_SEEDS, measureLoopSeeds } from './loopSeeds';
import { editsSummary, meanBaselineRmse, toggleHidden } from './problem';
import { factoriseCaption, funnelCaption, loopCaption, matrixCaption, neighbourCaption } from './captions';
import { DATA, factoriseFacts, funnelFacts, loopFacts, matrixFacts, mfFor, neighbourFacts, problemFor, referenceFor } from './facts';
import lesson from './index';
import { rank } from './funnel';
import { scoreNeighbours } from './neighbours';
import { EMPTY_EDITS, NEW_USER, rateNewUser } from './problem';
import { ITEMS, USERS } from './data';
import { FACTOR_DEFAULT, FUNNEL_DEFAULT, LOOP_DEFAULT, MATRIX_DEFAULT, NEIGHBOUR_DEFAULT, REFERENCE_MF } from './settings';

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('recommender-systems')).toHaveLength(5);
    expect(sharedSceneComponents('recommender-systems')).toEqual([]);
    expect(sceneElements('recommender-systems').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes, and the shared edits start empty', () => {
    expect(MATRIX_DEFAULT).toEqual({ showTruth: false, rateAs: 4 });
    expect(FACTOR_DEFAULT).toEqual({ factors: 6, lambda: 0, learningRate: 0.05, epochs: 150, seed: 1, showTruth: false });
    expect(NEIGHBOUR_DEFAULT).toEqual({ minOverlap: 2 });
    expect(FUNNEL_DEFAULT).toEqual({ user: 0, popularityPct: 0 });
    expect(LOOP_DEFAULT).toEqual({ exploration: false, seed: 1 });
    expect(EMPTY_EDITS).toEqual({ hidden: [], newUser: {} });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: the matrix counts, one hidden rating moves a cell to held-out, and a new user gets a first rating', () => {
    const f = matrixFacts();
    expect(f.train + f.test).toBe(180);
    expect(f.hiddenOne.train).toBe(f.train - 1);
    expect(f.hiddenOne.test).toBe(f.test + 1);
    expect(f.cold.train).toBe(f.train + 1);
    expect(lesson.tryThis[0]).toContain(`${f.train} of the 180 cells`);
    expect(lesson.tryThis[0]).toContain(`U${f.hiddenOne.cell[0] + 1}, F${f.hiddenOne.cell[1] + 1}`);
  });

  it('try-this 2: 6 factors overfit (train near 0, held-out risen) and 2 factors with 0.02 do better on held-out cells', () => {
    const f = factoriseFacts();
    expect(f.over.train[f.epochs]).toBeLessThan(0.05);
    expect(f.testRise).toBeGreaterThan(0.05);
    expect(f.small.test[f.epochs]).toBeLessThan(f.over.test[f.epochs]);
    expect(lesson.tryThis[1]).toContain(`has risen to ${f.over.test[f.epochs].toFixed(2)}`);
  });

  it('try-this 2 (M3): the penalty fixes the rise and fewer factors alone do not; held-out error is not monotone in the factor count at lambda 0', () => {
    const f = factoriseFacts();
    const p = problemFor();
    const E = FACTOR_DEFAULT.epochs;
    expect(f.penalised.test[E]).toBeLessThan(f.over.test[E] - 0.05);
    expect(f.penalised.test[E] - f.penalised.test[f.penalised.bestEpoch]).toBeLessThan(0.02);
    expect(f.twoNoPenalty.test[E] - f.twoNoPenalty.test[f.twoNoPenalty.bestEpoch]).toBeGreaterThan(0.05);
    const final = (factors: number) => mfFor(p, { factors }).test[E];
    expect(final(2)).toBeGreaterThan(final(6));
    expect(final(3)).toBeGreaterThan(final(6));
    expect(lesson.tryThis[1]).toContain('The penalty, not fewer factors, is what stops it');
    expect(lesson.tryThis[1]).toContain(`${f.penalised.test[E].toFixed(2)}`);
    expect(lesson.keyIdeas[0]).not.toMatch(/many latent factors/);
  });

  it('try-this 3: an overlap of 2 covers most held-out cells and 5 covers far fewer, and the factorisation beats the neighbours', () => {
    const f = neighbourFacts();
    expect(f.open.coverage).toBeGreaterThan(0.5);
    expect(f.strict.coverage).toBeLessThan(0.2);
    expect(f.mf).toBeLessThan(f.open.rmse);
    // the overall-mean bar, from an independent count over the held-out cells
    const p = problemFor();
    const trainMean = p.train.reduce((s, r) => s + r.rating, 0) / p.train.length;
    let sq = 0;
    for (let u = 0; u < USERS; u++) for (let i = 0; i < ITEMS; i++) if (p.seen(u, i) === null) sq += (DATA.truth[u][i] - trainMean) ** 2;
    expect(f.baseline).toBeCloseTo(Math.sqrt(sq / p.test.length), 12);
    expect(f.open.rmse).toBeGreaterThan(f.baseline);
    expect(expectCaption(neighbourCaption(f.open, f.mf, 2, f.baseline))).toContain('worse than predicting the overall mean');
    expect(lesson.tryThis[2]).toContain(`${f.baseline.toFixed(2)} for just predicting the overall mean`);
    expect(lesson.tryThis[2]).toContain(`${Math.round(f.strict.coverage * 100)}% of cells are covered`);
  });

  it('try-this 4: moving the popularity weight from 0 to 100% changes the films shown', () => {
    const f = funnelFacts();
    expect(f.plain.slice(0, 3)).not.toEqual(f.popular.slice(0, 3));
    expect(lesson.tryThis[3]).toContain('Set Weight on popularity to 100%');
  });

  it('try-this 5: the loop concentrates more than the same rule with no feedback, 10% exploration lowers the Gini, and the Gini rises over the rounds', () => {
    const f = loopFacts();
    expect(f.giniOff).toBeGreaterThan(f.giniFree + 0.1);
    expect(f.giniOn).toBeLessThan(f.giniOff);
    expect(f.off.giniByRound.at(-1)!).toBeGreaterThan(f.off.giniByRound[0] + 0.1);
    expect(new Set(f.off.giniByRound).size).toBeGreaterThan(ROUNDS / 2);
    expect(f.topFilmOff).not.toBe(f.topFilmFree);
    expect(lesson.tryThis[4]).toContain(`exposure Gini is ${f.giniOff.toFixed(2)}, against ${f.giniFree.toFixed(2)}`);
  });

  it('try-this 5 and quiz 4 quote seed rates that a fresh 200-seed measurement reproduces', () => {
    expect(measureLoopSeeds(DATA.truth)).toEqual(PINNED_LOOP_SEEDS);
    expect(PINNED_LOOP_SEEDS.winnerDiffers).toBeGreaterThan(PINNED_LOOP_SEEDS.streams * 0.3);
    expect(lesson.tryThis[4]).toContain(`${PINNED_LOOP_SEEDS.winnerDiffers}`);
    expect(lesson.quiz[3].why).toContain(`${PINNED_LOOP_SEEDS.giniHigher} of ${PINNED_LOOP_SEEDS.streams}`);
  });
});

describe('captions follow the controls', () => {
  it('the matrix caption counts hidden cells and new-user ratings exactly', () => {
    const p = problemFor(rateNewUser(EMPTY_EDITS, 2, 5));
    const c = expectCaption(matrixCaption(p));
    expect(c).toContain('The new user has rated 1 film.');
    expect(expectCaption(matrixCaption(problemFor()))).toContain('cold start');
  });

  it('the factorise caption says "overfitting" exactly when held-out error has risen more than 0.02 past its minimum, over factors and epochs', () => {
    const p = problemFor();
    for (const factors of [1, 2, 4, 6]) {
      for (const epochs of [0, 30, 150, 300]) {
        for (const lambda of [0, 0.05]) {
          const cfg = { factors, lambda, learningRate: 0.05, epochs, seed: 1 };
          const run = mfFor(p, cfg);
          const c = expectCaption(factoriseCaption(run, cfg));
          const rise = run.test[epochs] - run.test[run.bestEpoch];
          expect(c.includes('overfitting'), `${factors} ${epochs} ${lambda}`).toBe(epochs > 0 && rise > 0.02);
          expect(c).toContain(`training RMSE ${run.train[epochs].toFixed(2)}`);
        }
      }
    }
  });

  it('the neighbour caption prints the coverage it computed for every minimum overlap', () => {
    const p = problemFor();
    const mf = referenceFor(p).test[REFERENCE_MF.epochs];
    for (let m = 1; m <= 6; m++) {
      const s = scoreNeighbours(p, m);
      expect(expectCaption(neighbourCaption(s, mf, m, meanBaselineRmse(p)))).toContain(`${Math.round(s.coverage * 100)}% of held-out cells`);
    }
  });

  it('the funnel caption names the films shown and counts those that moved, for every user and weight', () => {
    const f = funnelFacts();
    for (const user of [0, 5, 11]) {
      for (const w of [0, 50, 100]) {
        const shown = rank(f.cands, f.features, w / 100).map((r) => r.item);
        const c = expectCaption(funnelCaption(user, shown, f.plain, w));
        expect(c).toContain(`User ${user + 1}:`);
        expect(c.includes('ignores popularity')).toBe(w === 0);
      }
    }
  });

  it('the loop caption prints the Ginis it measured, names the films and says whether the two runs agree', () => {
    const f = loopFacts();
    const input = { exploration: false, gini: f.giniOff, giniFree: f.giniFree, top: f.topFilmOff, rank: f.rankOff, topFree: f.topFilmFree, rankFree: f.rankFree, rounds: 50 };
    const c = expectCaption(loopCaption(input));
    expect(c).toContain(f.giniOff.toFixed(2));
    expect(c).toContain(f.giniFree.toFixed(2));
    expect(c).toContain('The two runs favour different films');
    expect(expectCaption(loopCaption({ ...input, top: f.topFilmFree, exploration: true }))).toContain('Here both runs favour the same film');
    expect(expectCaption(loopCaption({ ...input, exploration: true }))).toContain('10% random exploration');
    expect(f.rankOff).toBe(ratingRank(DATA.truth, f.topFilmOff));
  });

  it('the matrix edits reach scenes 2 to 4, so the edits strip must say so (M1)', () => {
    // try-this 1's two clicks, then the numbers try-this 2 and 3 quote change: the strip is what tells the learner why
    const [u, i] = DATA.observed.flatMap((row, r) => row.map((o, c) => (o ? [r, c] : null))).find((x) => x !== null) as [number, number];
    const edited = rateNewUser(toggleHidden(DATA, EMPTY_EDITS, u, i), 0, MATRIX_DEFAULT.rateAs);
    const base = problemFor();
    const after = problemFor(edited);
    const E = FACTOR_DEFAULT.epochs;
    expect(mfFor(after).test[E]).not.toBeCloseTo(mfFor(base).test[E], 2);
    expect(scoreNeighbours(after, 2).rmse).not.toBeCloseTo(scoreNeighbours(base, 2).rmse, 2);
    expect(editsSummary(edited)).toContain('1 observed rating hidden and 1 rating given as the new user');
    expect(editsSummary(EMPTY_EDITS)).toContain('not edited');
    expect(editsSummary(toggleHidden(DATA, EMPTY_EDITS, u, i))).not.toContain('new user');
    expect(lesson.tryThis[1]).toContain('Reset my edits');
    expect(lesson.tryThis[2]).toContain('Reset my edits');
  });
});

describe('cells', () => {
  it('a hidden rating is an outline, a cold-start row is blank until predicted, and predictions turn green, orange or red against the truth', () => {
    const p = problemFor();
    const run = mfFor(p, { factors: 2, lambda: 0.02 });
    const tones = new Set<string | undefined>();
    for (let u = 0; u < 12; u++) for (let i = 0; i < 15; i++) if (p.seen(u, i) === null) tones.add(cellSpec(p, { kind: 'predictions', run }, true, u, i).tone);
    expect(tones.has('ok')).toBe(true);
    expect(tones.has('bad') || tones.has('orange')).toBe(true);
    expect(cellSpec(p, { kind: 'ratings' }, false, NEW_USER, 0)).toEqual({ fill: 'none' });
    expect(cellSpec(p, { kind: 'predictions', run }, true, NEW_USER, 0).tone).toBe('violet');
    expect(DATA.observed.flat().some(Boolean)).toBe(true);
  });
});

describe('lesson content', () => {
  it('has five try-this entries, five questions, and passes the content lint', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
    expect(lintLesson(lesson, new Set(TOPICS.map((t) => t.id)))).toEqual([]);
    expect(unscopedAbsolutes(lesson.keyIdeas.join(' '))).toEqual([]);
    for (const q of lesson.quiz) expect(unscopedAbsolutes(q.why), q.why).toEqual([]);
  });
});
