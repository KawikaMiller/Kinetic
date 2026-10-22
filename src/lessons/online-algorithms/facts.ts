import {
  B_DEFAULT, LATE_THRESHOLD_WITNESS, WITNESS_HORIZON, autopilot, boundViolations, breakEven, breakEvenBound, challenge, lateThreshold, maxSeason, opt, pagingScore, ratio,
  skiCost, worstSeason,
} from './model';

const B = B_DEFAULT;
const be = breakEven(B);
const late = lateThreshold(B);
const lateViolations = boundViolations(late, B);
const refused = challenge(be, B, 2);
const cyclic = Array.from({ length: 12 }, (_, i) => (i % 4) + 1);
const cyclicScore = pagingScore(cyclic, 3);
const thirty = pagingScore(autopilot([], 3, 30), 3);
const fixed2 = (x: number) => x.toFixed(2);

/** The numbers the default ski rental (B = 10, break-even t = 9, a season of 11 days) and the paging scene put in the text. All come from the model. */
export const FACTS = {
  B,
  t: be.t,
  N: 11,
  cost: skiCost(be, B, 11),
  optimum: opt(B, 11),
  ratio: fixed2(ratio(be, B, 11)),
  bound: fixed2(breakEvenBound(B)),
  shortSeasonRatio: fixed2(ratio(be, B, 9)),
  buyAtOnceRatio: fixed2(ratio({ t: 0, never: false }, B, 1)),
  worstN: worstSeason(be, B).N,
  refusedN: refused.N,
  refusedRatio: fixed2(refused.ratio),
  lateCost: skiCost(late, B, LATE_THRESHOLD_WITNESS.N),
  lateRatio: fixed2(ratio(late, B, LATE_THRESHOLD_WITNESS.N)),
  lateViolations: lateViolations.violations,
  horizon: WITNESS_HORIZON,
  neverRatio: ratio({ t: 0, never: true }, B, maxSeason(B)),
  seasonMax: maxSeason(B),
  cyclicLru: cyclicScore.lru,
  cyclicOpt: cyclicScore.optimum,
  cyclicRatio: cyclicScore.ratio!.toFixed(1),
  thirtyLru: thirty.lru,
  thirtyOpt: thirty.optimum,
  thirtyRatio: thirty.ratio!.toFixed(1),
};
