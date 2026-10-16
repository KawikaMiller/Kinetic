/** The numbers the try-this entries, captions and quiz explanations quote, each computed from the model. */
import { DEFAULT_SEED, ITEMS, dataset, countObserved } from './data';
import { candidates, itemFeatures, rank } from './funnel';
import { EXPLORATION, mostShown, ratingRank, simulateLoop } from './loop';
import { runMf, type MfConfig, type MfRun } from './mf';
import { scoreNeighbours } from './neighbours';
import { EMPTY_EDITS, NEW_USER, buildProblem, meanBaselineRmse, rateNewUser, toggleHidden, type Edits, type Problem } from './problem';
import { FACTOR_DEFAULT, FUNNEL_DEFAULT, LOOP_DEFAULT, MATRIX_DEFAULT, NEIGHBOUR_DEFAULT, REFERENCE_MF } from './settings';

export const DATA = dataset(DEFAULT_SEED);
export const problemFor = (edits: Edits = EMPTY_EDITS): Problem => buildProblem(DATA, edits);

const mfConfig = (over: Partial<MfConfig> = {}): MfConfig => ({
  factors: FACTOR_DEFAULT.factors, lambda: FACTOR_DEFAULT.lambda, learningRate: FACTOR_DEFAULT.learningRate, epochs: FACTOR_DEFAULT.epochs, seed: FACTOR_DEFAULT.seed, ...over,
});
export const mfFor = (problem: Problem, over: Partial<MfConfig> = {}): MfRun => runMf(problem, mfConfig(over));
export const referenceFor = (problem: Problem): MfRun => runMf(problem, { ...REFERENCE_MF });

export function matrixFacts() {
  const p = problemFor();
  const firstObserved = DATA.observed.flatMap((row, u) => row.map((o, i) => (o ? [u, i] : null))).find((c) => c !== null) as [number, number];
  const hiddenOne = problemFor(toggleHidden(DATA, EMPTY_EDITS, firstObserved[0], firstObserved[1]));
  const cold = problemFor(rateNewUser(EMPTY_EDITS, 0, MATRIX_DEFAULT.rateAs));
  return { observed: countObserved(DATA.observed), train: p.train.length, test: p.test.length, hiddenOne: { train: hiddenOne.train.length, test: hiddenOne.test.length, cell: firstObserved }, cold: { train: cold.train.length } };
}

export function factoriseFacts() {
  const p = problemFor();
  const over = mfFor(p);
  const small = mfFor(p, { factors: 2, lambda: 0.02 });
  const penalised = mfFor(p, { lambda: 0.02 });
  const twoNoPenalty = mfFor(p, { factors: 2 });
  const E = FACTOR_DEFAULT.epochs;
  const spreadOf = (run: MfRun, user: number) => Math.max(...Array.from({ length: ITEMS }, (_, i) => Math.abs(run.predict(user, i) - p.mean)));
  return { coldSpread: spreadOf(small, NEW_USER), warmSpread: spreadOf(small, 0), coldSpreadDefault: spreadOf(over, NEW_USER), over, small, penalised, twoNoPenalty, epochs: E, trainDrop: over.train[over.bestEpoch] - over.train[E], testRise: over.test[E] - over.test[over.bestEpoch] };
}

export function neighbourFacts() {
  const p = problemFor();
  const ref = referenceFor(p);
  return {
    open: scoreNeighbours(p, NEIGHBOUR_DEFAULT.minOverlap),
    strict: scoreNeighbours(p, 5),
    loose: scoreNeighbours(p, 1),
    mf: ref.test[REFERENCE_MF.epochs],
    baseline: meanBaselineRmse(p),
  };
}

export function funnelFacts() {
  const p = problemFor();
  const ref = referenceFor(p);
  const features = itemFeatures(DEFAULT_SEED);
  const cands = candidates(p, ref, FUNNEL_DEFAULT.user);
  const at = (pct: number) => rank(cands, features, pct / 100).map((r) => r.item);
  return { cands, features, plain: at(FUNNEL_DEFAULT.popularityPct), popular: at(100), half: at(50) };
}

export function loopFacts() {
  const off = simulateLoop(DATA.truth, LOOP_DEFAULT.seed, 0);
  const on = simulateLoop(DATA.truth, LOOP_DEFAULT.seed, EXPLORATION);
  const free = simulateLoop(DATA.truth, LOOP_DEFAULT.seed, 0, 'everyone');
  const last = (run: typeof off) => run.giniByRound.at(-1)!;
  return {
    off, on, free,
    giniOff: last(off), giniOn: last(on), giniFree: last(free),
    topFilmOff: mostShown(off.exposure), topFilmFree: mostShown(free.exposure),
    rankOff: ratingRank(DATA.truth, mostShown(off.exposure)), rankFree: ratingRank(DATA.truth, mostShown(free.exposure)),
  };
}
