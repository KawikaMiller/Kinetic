/** Numbers the try-this, key ideas and quiz quote, read off the model at the default state. */
import { startWalk, choose } from '../../core/scenario';
import { CELLS, FLOWS, applyControl, categoriesOf, cellId, controlById, crossingFlows, metersOf, reveal, revealAll, targetById, withPlacement } from './model';
import { OPENING } from './opening';
import { METER, SPRINT, SPRINT_DAYS, START_RISK } from './sprint';

const start = OPENING.state();
const audit = targetById('audit');
const orders = targetById('orders');
const afterReveal = reveal(start, cellId('orders', 'T'));
const all = revealAll(start);
const refused = applyControl(all, cellId('browser', 'S'), 'rate-limit');
const accepted = applyControl(all, cellId('browser', 'S'), 'authn');
const fixFirst = choose(SPRINT, startWalk(SPRINT), 'transit-fix');

export const FACTS = {
  flows: FLOWS.length,
  crossingDefault: crossingFlows(start.placement).length,
  crossingAuditInData: crossingFlows(withPlacement(start, { audit: 'data' }).placement).length,
  crossingOrdersInApp: crossingFlows(withPlacement(start, { orders: 'app' }).placement).length,
  cells: CELLS.length,
  auditCategories: categoriesOf(audit).length,
  ordersCategories: categoriesOf(orders).length,
  revealedAfterOne: metersOf(afterReveal).revealed,
  neverLookedAfterOne: metersOf(afterReveal).neverLooked,
  refusedKind: refused.kind,
  rateLimitCovers: controlById('rate-limit').covers.join(''),
  acceptedKind: accepted.kind,
  mitigatedAfterAccept: metersOf(accepted.state).mitigated,
  startRisk: START_RISK,
  riskAfterFix: fixFirst.meters[METER.risk],
  effortAfterFix: fixFirst.meters[METER.effort],
  sprintDays: SPRINT_DAYS,
};
