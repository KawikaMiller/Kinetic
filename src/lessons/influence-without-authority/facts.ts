/** Every number the lesson text quotes, computed from the model at the states the try-this entries walk through. */
import { choose, startWalk } from '../../core/scenario';
import { EMPTY_PLAN, NATURAL_PLANS, SIX_SLOT_PLAN, SUPPORT_TO_PASS, matchedPlan, openingStats, orderingScores, passingWith, runPlan, searchPlans, type Slot } from './model';
import { METER, MEETING } from './scenario';

const score = (plan: readonly Slot[]) => runPlan(plan).score;
const search = searchPlans();
const openers = openingStats();
const dana: Slot = { who: 'dana', angle: 'cost' };
const walk = (ids: string[]) => ids.reduce((w, id) => choose(MEETING, w, id), startWalk(MEETING));
const lost = walk(['push', 'hold']);
const askPilot = walk(['ask', 'pilot']);
const pushConcedePilot = walk(['push', 'concede', 'pilot']);
const orders = orderingScores(['gus', 'dana', 'eli']);
const OPENING_SHARE = Math.round((openers.gus.passing / search.passing) * 100);

export const FACTS = {
  none: score(EMPTY_PLAN),
  noneAgainst: runPlan(EMPTY_PLAN).vetoes.length,
  natural: score(NATURAL_PLANS[0].plan),
  naturalIvo: score(NATURAL_PLANS[1].plan),
  gusPlan: score(matchedPlan(['gus', 'dana', 'eli'])),
  mismatched: score([dana, dana, dana]),
  six: score(SIX_SLOT_PLAN),
  /** Gus, Dana and Eli all pitched on the wrong angle (cost): a mismatch still passes spillover from Gus. */
  gusDanaEliAllCost: score(['gus', 'dana', 'eli'].map((who) => ({ who: who as 'gus', angle: 'cost' as const }))),
  orderMin: Math.min(...orders.map((o) => o.score)),
  orderMax: Math.max(...orders.map((o) => o.score)),
  ordersAtBest: orders.filter((o) => o.score === search.best).length,
  /** True when exactly the orderings with Gus before Dana reach the best score. */
  gusBeforeDanaIsBest: orders.every((o) => (o.order.indexOf('gus') < o.order.indexOf('dana')) === (o.score === search.best)),
  ordersPassing: orders.filter((o) => o.pass).length,
  withGus: passingWith('gus'),
  pass: SUPPORT_TO_PASS,
  total: search.total.toLocaleString('en-US'),
  passing: search.passing,
  best: search.best,
  bestPlans: search.bestPlans.length,
  danaOpenBest: openers.dana.best,
  ivoOpenBest: openers.ivo.best,
  hanaOpenBest: openers.hana.best,
  gusOpenPassing: openers.gus.passing,
  gusOpenShare: OPENING_SHARE,
  lostSupport: lost.meters[METER.support],
  askPilotSupport: askPilot.meters[METER.support],
  askPilotTrust: askPilot.meters[METER.trust],
  askPilotWeeks: askPilot.meters[METER.weeks],
  askPilotScope: askPilot.meters[METER.scope],
  scopeGivenUp: 100 - askPilot.meters[METER.scope],
  pushPilotTrust: pushConcedePilot.meters[METER.trust],
  pushPilotWeeks: pushConcedePilot.meters[METER.weeks],
  pushPilotScope: pushConcedePilot.meters[METER.scope],
} as const;
