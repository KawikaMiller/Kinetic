/** Every number the lesson text quotes, computed from the model at the default state. */
import { choose, startWalk } from '../../core/scenario';
import { pctText } from './captions';
import {
  CRITERIA, DEFAULT, calibrationCheck, equaliseB, fitModel, gapsOf, generate, groupStats, holds, predict, smallestWorstGap, thresholdGrid, type Params,
} from './model';
import { OPENING } from './opening';
import { runOptions } from './options';
import { CHOOSE, METER, START } from './scenario';
import { feedbackLoop, labelBias, representation, ROUNDS, LOOP } from './sources';

const pts = (x: number) => (x * 100).toFixed(1);
const rows = generate(DEFAULT);
const probs = predict(fitModel(rows, 'aware'), rows);
const atT = (t: number) => {
  const a = groupStats(rows, probs, t, 0);
  const b = groupStats(rows, probs, t, 1);
  const gaps = gapsOf(a, b);
  return { a, b, gaps, holding: CRITERIA.filter((c) => holds(gaps[c.id])).length + (calibrationCheck(rows, probs).holds ? 1 : 0) };
};
const half = atT(0.5);
const high = atT(0.8);

const worstFor = (p: Params) => {
  const r = generate(p);
  return smallestWorstGap(thresholdGrid(r, predict(fitModel(r, 'aware'), r)));
};
const tB = equaliseB(rows, probs, 0.5, 'tpr')!;
const found = gapsOf(groupStats(rows, probs, 0.5, 0), groupStats(rows, probs, tB, 1));

const options = runOptions(DEFAULT).options;
const proxied = runOptions({ ...DEFAULT, proxy: 3 }).options;
const repShare = OPENING.sources.share;
const repSmall = representation(repShare, 4);
const repLarge = representation(0.5, 4);
const labels = labelBias(OPENING.sources.noise, 4);
const loop = feedbackLoop(LOOP.seed);
loop.run(ROUNDS);
const parity = choose(CHOOSE, startWalk(CHOOSE), 'parity');

export const FACTS = {
  selectionA: pctText(half.a.selection),
  selectionB: pctText(half.b.selection),
  tprGap: pts(half.gaps.tpr),
  holding: half.holding,
  criteria: CRITERIA.length + 1,
  holdingHigh: high.holding,
  worstDefault: pts(worstFor(DEFAULT)),
  worstEqual: pts(worstFor({ ...DEFAULT, gap: 0, shift: 0 })),
  worstPerfect: pts(worstFor({ ...DEFAULT, separation: 20 })),
  foundTprGap: pts(found.tpr),
  foundPrecisionGap: pts(found.precision),
  plainAccuracy: pctText(options[0].accuracy),
  selectionAccuracy: pctText(options[2].accuracy),
  selectionGapAfter: pts(options[2].gaps.selection),
  selectionFprGap: pts(options[2].gaps.fpr),
  selectionPrecisionGap: pts(options[2].gaps.precision),
  plainApprovalGap: pts(options[0].gaps.selection),
  unawareApprovalGap: pts(options[4].gaps.selection),
  unawareProxyGap: pts(proxied[4].gaps.selection),
  repShare: Math.round(repShare * 100),
  repSmallB: pctText(repSmall.b),
  repLargeB: pctText(repLarge.b),
  labelNoise: Math.round(OPENING.sources.noise * 100),
  apparentB: pctText(labels.apparent.b),
  actualB: pctText(labels.actual.b),
  loopStart: pctText(loop.history[0].shareB),
  loopEnd: pctText(loop.history[ROUNDS].shareB),
  rounds: ROUNDS,
  startApprovedB: START.approvedB,
  startDenied: START.deniedInError,
  parityApprovedB: parity.meters[METER.approved],
  parityDenied: parity.meters[METER.denied],
  parityDefaulters: parity.meters[METER.defaulters],
} as const;
