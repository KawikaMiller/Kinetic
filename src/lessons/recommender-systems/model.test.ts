import { describe, expect, it } from 'vitest';
import { svdSmall } from '../../core/linalg';
import { createFactorisation, gradCheck, type Rating, type Trainable } from '../../core/nn';
import { mulberry32 } from '../../core/random';
import { DEFAULT_SEED, ITEMS, USERS, countObserved, dataset, generate, observedMask } from './data';
import { DATA, problemFor } from './facts';
import { candidates, rank, itemFeatures, CANDIDATES } from './funnel';
import { gini } from '../../core/stats';
import { simulateLoop, EXPLORATION, LIKE_AT, ROUNDS, SLATE } from './loop';
import { centred, fitFull, runMf } from './mf';
import { predictCell, scoreNeighbours, similarity, userRatings, type UserRatings } from './neighbours';
import { EMPTY_EDITS, NEW_USER, TOTAL_USERS, buildProblem, rateNewUser, toggleHidden } from './problem';

describe('the data', () => {
  it('has 12 users, 15 films, about 40% observed, every rating 1 to 5, every user and film seen', () => {
    const d = dataset(DEFAULT_SEED);
    expect(d.truth).toHaveLength(USERS);
    expect(d.truth[0]).toHaveLength(ITEMS);
    expect(d.truth.flat().every((r) => Number.isInteger(r) && r >= 1 && r <= 5)).toBe(true);
    const share = countObserved(d.observed) / (USERS * ITEMS);
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.5);
    for (let seed = 0; seed < 60; seed++) {
      const mask = observedMask(seed);
      expect(mask.every((row) => row.filter(Boolean).length >= 3)).toBe(true);
      for (let i = 0; i < ITEMS; i++) expect(mask.filter((row) => row[i]).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('the hidden structure is rank 2: the noiseless matrix has two non-negligible singular values before rounding', () => {
    const { userFactors, itemFactors } = generate(5, 6, 8, 0);
    const exact = userFactors.map((p) => itemFactors.map((q) => 3 + 0.9 * (p[0] * q[0] + p[1] * q[1])));
    const centredMatrix = exact.map((row) => row.map((v) => v - 3));
    const s = svdSmall(centredMatrix).s;
    expect(s[1]).toBeGreaterThan(0.1);
    expect(s[2]).toBeLessThan(1e-9);
  });
});

describe('the gradient', () => {
  const ratings: Rating[] = Array.from({ length: 40 }, (_, n) => ({ user: n % TOTAL_USERS, item: (n * 7) % ITEMS, rating: ((n * 3) % 5) - 2 }));

  it('equals the numeric gradient (gradCheck) for several factor counts and penalties', () => {
    for (const [factors, lambda] of [[1, 0], [3, 0.05], [6, 0.2]] as const) {
      const model = createFactorisation({ users: TOTAL_USERS, items: ITEMS, factors, seed: 4, lambda });
      expect(gradCheck(model, ratings).maxRelError, `k ${factors} lambda ${lambda}`).toBeLessThan(1e-6);
    }
  });

  it('a deliberately wrong gradient fails the same check', () => {
    const model = createFactorisation({ users: TOTAL_USERS, items: ITEMS, factors: 3, seed: 4, lambda: 0.05 });
    const wrong: Trainable<readonly Rating[]> = { params: model.params, loss: model.loss, gradient: (b) => model.gradient(b).map((g) => g * 0.5) };
    expect(gradCheck(wrong, ratings).maxRelError).toBeGreaterThan(1e-2);
  });
});

describe('Eckart-Young as the oracle on a fully observed matrix', () => {
  // 6 x 8 because svdSmall refuses anything above 8 x 8; the same oracle was also checked by hand against an independent SVD at the lesson's full 12 x 15.
  const small = generate(7, 6, 8, 0.3);
  const matrix = small.truth.map((r) => [...r]);
  const sigma = svdSmall(matrix).s;

  it('SGD reaches the best rank-k error sqrt(sum of sigma_i^2 for i > k) / sqrt(cells), within 1%, and never beats it', () => {
    for (const k of [1, 2, 3]) {
      const optimum = Math.sqrt(sigma.slice(k).reduce((a, b) => a + b * b, 0) / (6 * 8));
      const fit = fitFull(matrix, { factors: k, lambda: 0, learningRate: 0.02, epochs: 3000, seed: 2 });
      expect(fit.rmse, `k ${k}`).toBeGreaterThanOrEqual(optimum - 1e-6);
      expect(fit.rmse, `k ${k}`).toBeLessThan(optimum * 1.01);
    }
  });

  it('with k equal to the true rank on noiseless data the RMSE falls below 0.05', () => {
    // an exactly rank-2 matrix (the mean is taken out, since a constant adds a third dimension)
    const { userFactors, itemFactors } = generate(9, 6, 8, 0);
    const exact = userFactors.map((p) => itemFactors.map((q) => 0.9 * (p[0] * q[0] + p[1] * q[1])));
    const fit = fitFull(exact, { factors: 2, lambda: 0, learningRate: 0.02, epochs: 3000, seed: 3 });
    expect(fit.rmse).toBeLessThan(0.05);
  });
});

describe('the factorisation on the lesson data', () => {
  it('centres the ratings on the mean and starts near the mean predictor', () => {
    const p = problemFor();
    expect(centred(p.train, p.mean).reduce((s, r) => s + r.rating, 0)).toBeCloseTo(0, 9);
    const run = runMf(p, { factors: 2, lambda: 0, learningRate: 0.05, epochs: 0, seed: 1 });
    for (const t of p.test) expect(Math.abs(run.predict(t.user, t.item) - p.mean)).toBeLessThan(0.1);
  });

  it('overfits: 6 factors with no penalty drive training error to near zero while held-out error rises from its minimum', () => {
    const run = runMf(problemFor(), { factors: 6, lambda: 0, learningRate: 0.05, epochs: 150, seed: 1 });
    expect(run.train[150]).toBeLessThan(0.05);
    expect(run.test[150] - run.test[run.bestEpoch]).toBeGreaterThan(0.05);
    expect(run.bestEpoch).toBeLessThan(100);
  });

  it('two factors with a little regularisation beat the overfit model on held-out cells', () => {
    const p = problemFor();
    const small = runMf(p, { factors: 2, lambda: 0.02, learningRate: 0.05, epochs: 150, seed: 1 });
    const over = runMf(p, { factors: 6, lambda: 0, learningRate: 0.05, epochs: 150, seed: 1 });
    expect(small.test[150]).toBeLessThan(over.test[150]);
    expect(small.test[150]).toBeLessThan(small.test[0]);
  });

  it('a user with no ratings is predicted close to the mean, far tighter than the spread of other users', () => {
    const p = problemFor();
    const run = runMf(p, { factors: 2, lambda: 0.02, learningRate: 0.05, epochs: 150, seed: 1 });
    const cold = Array.from({ length: ITEMS }, (_, i) => run.predict(NEW_USER, i) - p.mean);
    const warm = Array.from({ length: ITEMS }, (_, i) => run.predict(0, i) - p.mean);
    const spread = (xs: number[]) => Math.max(...xs.map(Math.abs));
    expect(spread(cold)).toBeLessThan(0.5);
    expect(spread(cold)).toBeLessThan(spread(warm));
  });
});

describe('user-based neighbours', () => {
  // A rated films 0 and 1 as 5 and 3; B rated 0, 1, 2 as 4, 2, 4; C rated them 1, 5, 2.
  // Means: A 4, B 10/3, C 8/3. Centred on co-rated films 0 and 1: A (1, -1), B (2/3, -4/3), C (-5/3, 7/3).
  // cos(A, B) = 2 / (sqrt 2 sqrt(20/9)) = 0.9487 > 0, cos(A, C) = -4 / (sqrt 2 sqrt(74/9)) < 0 (ignored).
  // Prediction for A on film 2 = 4 + (4 - 10/3) = 14/3.
  const rows: (number | null)[][] = Array.from({ length: TOTAL_USERS }, () => new Array<number | null>(ITEMS).fill(null));
  rows[0][0] = 5; rows[0][1] = 3;
  rows[1][0] = 4; rows[1][1] = 2; rows[1][2] = 4;
  rows[2][0] = 1; rows[2][1] = 5; rows[2][2] = 2;
  const means = rows.map((r) => {
    const own = r.filter((x): x is number => x !== null);
    return own.length ? own.reduce((a, b) => a + b, 0) / own.length : 3;
  });
  const hand: UserRatings = { ratings: rows, means };

  it('equals the hand-worked 3 x 3 example', () => {
    expect(similarity(hand, 0, 1, 2)?.sim).toBeCloseTo(2 / (Math.SQRT2 * Math.sqrt(20 / 9)), 9);
    expect(similarity(hand, 0, 2, 2)?.sim).toBeLessThan(0);
    const p = predictCell(hand, 0, 2, 2);
    expect(p.neighbours).toBe(1);
    expect(p.value).toBeCloseTo(14 / 3, 9);
  });

  it('refuses a neighbour below the minimum overlap and falls back to the user mean', () => {
    expect(similarity(hand, 0, 1, 3)).toBeNull();
    expect(predictCell(hand, 0, 2, 3)).toEqual({ value: 4, neighbours: 0 });
  });

  it('coverage never rises as the minimum overlap grows', () => {
    const p = problemFor();
    let last = 1;
    for (let m = 1; m <= 6; m++) {
      const c = scoreNeighbours(p, m).coverage;
      expect(c).toBeLessThanOrEqual(last);
      last = c;
    }
    expect(userRatings(p).ratings).toHaveLength(TOTAL_USERS);
  });
});

describe('the funnel', () => {
  it('candidates equal a brute-force sort of every unrated film by dot product, for all 12 users', () => {
    const p = problemFor();
    const run = runMf(p, { factors: 2, lambda: 0.02, learningRate: 0.05, epochs: 150, seed: 1 });
    for (let u = 0; u < USERS; u++) {
      const dots: { item: number; dot: number }[] = [];
      for (let i = 0; i < ITEMS; i++) {
        if (p.seen(u, i) !== null) continue;
        const dot = [0, 1].reduce((s, f) => s + run.model.params[u * 2 + f] * run.model.params[TOTAL_USERS * 2 + i * 2 + f], 0);
        dots.push({ item: i, dot });
      }
      dots.sort((a, b) => b.dot - a.dot || a.item - b.item);
      expect(candidates(p, run, u).map((c) => c.item), `user ${u}`).toEqual(dots.slice(0, CANDIDATES).map((d) => d.item));
    }
  });

  it('weight 0 orders by the model, weight 1 by the invented features', () => {
    const p = problemFor();
    const run = runMf(p, { factors: 2, lambda: 0.02, learningRate: 0.05, epochs: 150, seed: 1 });
    const cands = candidates(p, run, 0);
    const features = itemFeatures(DEFAULT_SEED);
    expect(rank(cands, features, 0).map((r) => r.item)).toEqual(cands.map((c) => c.item));
    const byFeature = [...rank(cands, features, 1)].map((r) => r.features);
    expect(byFeature).toEqual([...byFeature].sort((a, b) => b - a));
  });
});

describe('the feedback loop', () => {
  it('Gini of equal counts is 0, of all on one item is 1 - 1/n, and matches the sorted-rank formula', () => {
    expect(gini([4, 4, 4, 4])).toBe(0);
    expect(gini([0, 0, 9, 0, 0])).toBeCloseTo(1 - 1 / 5, 12);
    const rnd = mulberry32(2);
    for (let t = 0; t < 100; t++) {
      const xs = Array.from({ length: 8 }, () => Math.floor(rnd() * 20));
      if (xs.every((x) => x === 0)) continue;
      const sorted = [...xs].sort((a, b) => a - b);
      const n = sorted.length;
      const total = sorted.reduce((a, b) => a + b, 0);
      const alt = (2 * sorted.reduce((s, x, i) => s + (i + 1) * x, 0)) / (n * total) - (n + 1) / n;
      expect(gini(xs)).toBeCloseTo(alt, 12);
    }
  });

  it('every round shows every user a slate of 3, and exploration lowers the final exposure Gini on at least 95% of 200 seeds', () => {
    let lower = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const off = simulateLoop(DATA.truth, seed, 0);
      const on = simulateLoop(DATA.truth, seed, EXPLORATION);
      expect(off.exposure.reduce((a, b) => a + b, 0)).toBe(ROUNDS * USERS * SLATE);
      expect(on.exposure.reduce((a, b) => a + b, 0)).toBe(ROUNDS * USERS * SLATE);
      if (on.giniByRound.at(-1)! < off.giniByRound.at(-1)!) lower++;
    }
    expect(lower / 200).toBeGreaterThanOrEqual(0.95);
  });

  it('the no-feedback run learns exactly rounds x true likes, the loop learns only from what it showed (independent count)', () => {
    const trueLikes = Array.from({ length: ITEMS }, (_, i) => DATA.truth.filter((row) => row[i] >= LIKE_AT).length);
    const free = simulateLoop(DATA.truth, 3, 0, 'everyone');
    expect(free.likes).toEqual(trueLikes.map((n) => n * ROUNDS));
    const loop = simulateLoop(DATA.truth, 3, 0);
    loop.likes.forEach((l, i) => expect(l).toBeLessThanOrEqual(loop.exposure[i]));
    // a film the loop never showed has no likes, however popular it is in truth
    const unseen = loop.exposure.findIndex((e) => e === 0);
    if (unseen >= 0) expect(loop.likes[unseen]).toBe(0);
  });

  it('the degenerate loop is gone: the Gini curve moves, and feedback ends more concentrated than no feedback on every one of 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const loop = simulateLoop(DATA.truth, seed, 0);
      const free = simulateLoop(DATA.truth, seed, 0, 'everyone');
      expect(new Set(loop.giniByRound).size, `seed ${seed}`).toBeGreaterThan(10);
      expect(gini(loop.exposure), `seed ${seed}`).toBeGreaterThan(gini(free.exposure));
    }
  });
});

describe('the learner\'s edits', () => {
  it('hiding an observed rating moves it from training to held-out, and hiding twice restores it', () => {
    const base = problemFor();
    const [u, i] = DATA.observed.flatMap((row, r) => row.map((o, c) => (o ? [r, c] : null))).find((x) => x !== null) as [number, number];
    const once = toggleHidden(DATA, EMPTY_EDITS, u, i);
    const hidden = buildProblem(DATA, once);
    expect(hidden.train).toHaveLength(base.train.length - 1);
    expect(hidden.test).toHaveLength(base.test.length + 1);
    expect(buildProblem(DATA, toggleHidden(DATA, once, u, i)).train).toHaveLength(base.train.length);
  });

  it('only observed cells can be hidden, and only ratings 1 to 5 of films 0 to 14 can be given', () => {
    const blank = DATA.observed.flatMap((row, r) => row.map((o, c) => (o ? null : [r, c]))).find((x) => x !== null) as [number, number];
    expect(toggleHidden(DATA, EMPTY_EDITS, blank[0], blank[1])).toBe(EMPTY_EDITS);
    expect(toggleHidden(DATA, EMPTY_EDITS, NEW_USER, 0)).toBe(EMPTY_EDITS);
    for (const [item, rating] of [[0, 0], [0, 6], [0, 2.5], [-1, 3], [15, 3]] as const) expect(rateNewUser(EMPTY_EDITS, item, rating)).toBe(EMPTY_EDITS);
    const rated = rateNewUser(EMPTY_EDITS, 3, 4);
    expect(buildProblem(DATA, rated).train.at(-1)).toEqual({ user: NEW_USER, item: 3, rating: 4 });
    expect(rateNewUser(rated, 3, 4).newUser).toEqual({});
  });
});
