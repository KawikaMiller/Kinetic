/** Every number the lesson text quotes, computed from the model at the default state. */
import { choose, startWalk } from '../../core/scenario';
import {
  CAPACITY, CLOSE_CALL, DEPENDENCY, ITEMS, bestOrder, delayCost, lineOf, orderBy, simulateRanks, swapsToRatioOrder, topTwo, valueBy, withinCapacity,
} from './model';
import { OPENING } from './opening';
import { BASE_VALUE, METER, OUTCOMES, STAKEHOLDER, SWAP_OUT } from './scenario';

const label = (id: string) => ITEMS.find((i) => i.id === id)!.label;
const ratioOrder = orderBy(ITEMS, 'ratio');
const week = OPENING.plane.week;
const bestFree = bestOrder(ITEMS, null);
const bestBound = bestOrder(ITEMS, DEPENDENCY);
const yourCost = delayCost(ITEMS, OPENING.cost.order);
const ranks = simulateRanks(ITEMS, OPENING.ranges.sigma, OPENING.ranges.seed);
const top = topTwo(ranks);
const line = lineOf(ITEMS, new Set(withinCapacity(ITEMS, CAPACITY.default)));
const wide = lineOf(ITEMS, new Set(withinCapacity(ITEMS, 20)));
const wideRanks = simulateRanks(ITEMS, 0.6, OPENING.ranges.seed);
const wideTop = topTwo(wideRanks);
const late = 40;
const swapped = choose(STAKEHOLDER, startWalk(STAKEHOLDER), 'swap');

export const FACTS = {
  week,
  valueRatio: Math.round(valueBy(ITEMS, ratioOrder, week)),
  valueImpact: Math.round(valueBy(ITEMS, orderBy(ITEMS, 'impact'), week)),
  valueEffort: Math.round(valueBy(ITEMS, orderBy(ITEMS, 'effort'), week)),
  lateWeek: late,
  lateRatio: Math.round(valueBy(ITEMS, ratioOrder, late)),
  lateImpact: Math.round(valueBy(ITEMS, orderBy(ITEMS, 'impact'), late)),
  lateEffort: Math.round(valueBy(ITEMS, orderBy(ITEMS, 'effort'), late)),
  firstImpact: label(orderBy(ITEMS, 'impact')[0]),
  firstRatio: label(ratioOrder[0]),
  yourCost,
  bestCost: bestFree.cost,
  extraCost: yourCost - bestFree.cost,
  swaps: swapsToRatioOrder(ITEMS, OPENING.cost.order).length,
  boundCost: bestBound.cost,
  dependencyBefore: label(DEPENDENCY.before),
  dependencyAfter: label(DEPENDENCY.after),
  topName: label(top.top),
  secondName: label(top.second),
  topPct: Math.round(ranks.first[top.top] * 100),
  secondPct: Math.round(ranks.first[top.second] * 100),
  gapPts: Math.round(top.gap * 100),
  closePts: Math.round(CLOSE_CALL * 100),
  wideGapPts: Math.round(wideTop.gap * 100),
  wideClose: wideTop.close,
  capacity: CAPACITY.default,
  lineItems: withinCapacity(ITEMS, CAPACITY.default).length,
  lineValue: line.value,
  lineCut: line.cutCost,
  wideItems: withinCapacity(ITEMS, 20).length,
  wideCut: wide.cutCost,
  baseValue: BASE_VALUE,
  swapOut: SWAP_OUT.label,
  swapValue: swapped.meters[METER.value],
  swapTrust: swapped.meters[METER.trust],
  splitValue: OUTCOMES.split.value,
} as const;
