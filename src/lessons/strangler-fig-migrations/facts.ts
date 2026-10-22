/** Every number the lesson text quotes, computed from the model at the states the try-this entries walk through. */
import { choose, startWalk } from '../../core/scenario';
import { rateText } from './captions';
import {
  REQ_PER_MIN, SIM_MINUTES, bestOnEvery, defectPermille, initialFacade, neverRedPaths, pathRows, readout, rollBack, routeOf, setDualWrite, setMinutes,
  setMode, setShare, type Facade,
} from './model';
import { METER, MIGRATION, TAIL_TRAFFIC } from './scenario';

const search = routeOf('search');
const checkout = routeOf('checkout');

/** The try-this entries, replayed in written order from the default state. */
export const STEPS = (() => {
  const start = initialFacade();
  const searchServed = setMode(start, 'search', 'serve');
  const checkoutShadow = setMode(searchServed, 'checkout', 'shadow');
  const checkoutServed = setMinutes(setMode(checkoutShadow, 'checkout', 'serve'), 60);
  const dual = setDualWrite(checkoutServed, 'checkout', true);
  return { start, searchServed, checkoutShadow, checkoutServed, dual };
})();

const half: Facade = setShare(setMode(setMode(initialFacade(), 'search', 'serve'), 'checkout', 'serve'), 'checkout', 50);
const halfAt60 = setMinutes(setShare(setMode(initialFacade(), 'checkout', 'serve'), 'checkout', 50), 60);
const ledger = ['a1', 'b3', 'c1'].reduce((w, id) => choose(MIGRATION, w, id), startWalk(MIGRATION));
const rows = pathRows(MIGRATION);
const rolled = rollBack(STEPS.checkoutServed, 'checkout');

const effectOf = (choiceId: string, meter: string): number =>
  MIGRATION.nodes.flatMap((n) => n.choices).find((c) => c.id === choiceId)!.effects?.[meter] ?? 0;

export const FACTS = {
  reqPerMin: REQ_PER_MIN,
  minutes: STEPS.checkoutServed.minutes,
  a1Weeks: effectOf('a1', METER.weeks),
  a1Incidents: effectOf('a1', METER.incidents),
  a1Unknowns: -effectOf('a1', METER.surprises),
  a2Weeks: effectOf('a2', METER.weeks),
  a2Incidents: effectOf('a2', METER.incidents),
  a2Unknowns: -effectOf('a2', METER.surprises),
  c1Weeks: effectOf('c1', METER.weeks),
  c2Weeks: effectOf('c2', METER.weeks),
  c2Strain: effectOf('c2', METER.strain),
  tailTraffic: TAIL_TRAFFIC,
  simMinutes: SIM_MINUTES,
  trafficSearch: search.traffic,
  trafficCheckout: checkout.traffic,
  defectSearch: defectPermille(search) / 10,
  defectCheckout: defectPermille(checkout) / 10,
  searchError: rateText(readout(STEPS.searchServed).errorRate),
  mirrored: readout(STEPS.checkoutShadow).mirroredPerMin,
  mismatchPerMin: Math.round(readout(STEPS.checkoutShadow).mismatchPerMin),
  mismatchRate: rateText(readout(STEPS.checkoutShadow).mismatchRate ?? 0),
  shadowError: rateText(readout(STEPS.checkoutShadow).errorRate),
  checkoutServedError: rateText(readout(STEPS.checkoutServed).errorRate),
  checkoutAloneError: rateText(checkout.traffic / 100 * defectPermille(checkout) / 1000),
  halfError: rateText(readout(half).errorRate),
  halfCheckoutPart: rateText(0.5 * checkout.traffic / 100 * defectPermille(checkout) / 1000),
  writesPerMin: checkout.writesPerMin,
  lost: readout(STEPS.checkoutServed).lostTotal,
  lostHalf: readout(halfAt60).lostTotal,
  lostWithDual: readout(STEPS.dual).lostTotal,
  lostNotice: rolled.notice?.lost ?? 0,
  incidents: ledger.meters[METER.incidents],
  weeks: ledger.meters[METER.weeks],
  strain: ledger.meters[METER.strain],
  surprises: ledger.meters[METER.surprises],
  paths: rows.length,
  calmPaths: neverRedPaths(rows).length,
  bestOnEvery: bestOnEvery(MIGRATION, rows).length,
} as const;
