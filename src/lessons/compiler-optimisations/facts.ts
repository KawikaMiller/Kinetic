/** Numbers the try-this, key ideas and quiz quote: all read off the model at the default state, never typed. */
import { aliasView, firstRoundChanges, floatRow, loopView, passView, reassocView, show, ssaView } from './model';
import { staticCount } from './ir';
import { NO_LOOP_PASSES, OPENING, ORDER_PRESETS } from './opening';
import { P1 } from './programs';

const O = OPENING;
const named = (id: string) => ORDER_PRESETS.find((p) => p.id === id)!.order;

const opening = passView(O.passes.order, O.passes.enabled, O.passes.fixedPoint, O.passes.input);
const propagateFirst = passView(named('propagate-first'), O.passes.enabled, false, O.passes.input);
const dceFirst = passView(named('dce-first'), O.passes.enabled, false, O.passes.input);
const goodOnce = passView(named('good'), O.passes.enabled, false, O.passes.input);
const goodFixed = passView(named('good'), O.passes.enabled, true, O.passes.input);

const L = O.loop;
const base = loopView(NO_LOOP_PASSES, true, L.x, L.n);
const inlined = loopView({ ...NO_LOOP_PASSES, inlining: true }, true, L.x, L.n);
const hoisted = loopView({ ...NO_LOOP_PASSES, inlining: true, hoisting: true }, true, L.x, L.n);
const lieDce = loopView({ inlining: true, hoisting: true, dce: true, deleteLoops: false }, false, L.x, L.n);
const lieGone = loopView({ inlining: true, hoisting: true, dce: true, deleteLoops: true }, false, L.x, L.n);
const usedKept = loopView({ inlining: true, hoisting: true, dce: true, deleteLoops: true }, true, L.x, L.n);

const aliasWrong = aliasView(true, true);
const aliasKept = aliasView(false, false);
const aliasFast = aliasView(false, true);
const ssa = ssaView(O.ssa.branchTaken);
const x3 = ssa.where('x3');
const R = O.refusals;
const reassoc = reassocView(R.reassoc.a, R.reassoc.b, R.reassoc.c);

export const FACTS = {
  ssaResult: ssa.ssaResult,
  x3DefLine: (x3.def ?? 0) + 1,
  x3UseLine: (x3.uses[0] ?? 0) + 1,
  p1Static: staticCount(P1),
  p1Executed: opening.beforeRun.executed,
  foldFirstFolds: firstRoundChanges(opening).fold ?? 0,
  propagateFirstFolds: firstRoundChanges(propagateFirst).fold ?? 0,
  openingStatic: staticCount(opening.after),
  dceFirstRemoved: firstRoundChanges(dceFirst).dce ?? 0,
  dceFirstStatic: staticCount(dceFirst.after),
  goodOnceStatic: staticCount(goodOnce.after),
  goodFixedStatic: staticCount(goodFixed.after),
  goodFixedRounds: goodFixed.pipeline.changedRounds,
  loopN: L.n,
  loopBase: base.afterRun.executed,
  loopBasePer: base.perIterationAfter,
  loopInlined: inlined.afterRun.executed,
  loopInlinedPer: inlined.perIterationAfter,
  loopHoisted: hoisted.afterRun.executed,
  loopHoistedPer: hoisted.perIterationAfter,
  loopHoistedZeroTrip: hoisted.zeroTripAfter,
  loopBaseZeroTrip: base.zeroTripAfter,
  lieDceExecuted: lieDce.afterRun.executed,
  lieGoneExecuted: lieGone.afterRun.executed,
  usedBlocker: usedKept.blocker ?? '',
  aliasKeptRefusals: aliasKept.pass.refused.length,
  aliasFastLoads: aliasFast.compared.afterRun.loads,
  aliasFastResult: aliasFast.compared.afterRun.value,
  aliasBaseLoads: aliasFast.compared.beforeRun.loads,
  usedExecuted: usedKept.afterRun.executed,
  aliasWrongOriginal: aliasWrong.compared.beforeRun.value,
  aliasWrongOptimised: aliasWrong.compared.afterRun.value,
  infinityTimesZero: show(floatRow('f64', Infinity).actual),
  minusThreeTimesZero: show(floatRow('f64', -3).actual),
  reassocLeft: show(reassoc.left),
  reassocRight: show(reassoc.right),
};
