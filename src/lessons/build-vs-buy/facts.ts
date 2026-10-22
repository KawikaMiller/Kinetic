/** Every number the lesson text quotes, computed from the model at the states the try-this entries walk through. */
import { choose, startWalk } from '../../core/scenario';
import { COMPONENTS, amount, breakEven, componentOf, crossoverYear, defaultAssumptions, rows, type OptionId } from './model';
import { METER, PRICE_RISE } from './scenario';

/** The yearly benefit the fourth try-this entry lowers B to. */
const LOW_BENEFIT = 200;
const a = defaultAssumptions();
const a9 = { ...a, horizon: 9 };
const email = componentOf('email');
const engine = componentOf('engine');
const netOf = (c: typeof email, stage: 'product' | 'custom', assumptions: typeof a) => Object.fromEntries(rows(c, stage, assumptions).map((r) => [r.option, r.net])) as Record<OptionId, number>;
const costOf = (c: typeof email, assumptions: typeof a) => Object.fromEntries(rows(c, 'product', assumptions).map((r) => [r.option, r.cost])) as Record<OptionId, number>;

const emailNet = netOf(email, 'product', a);
const email9 = costOf(email, a9);
const engineCost = costOf(engine, a);
const engineNet = netOf(engine, 'custom', a);
const low = netOf(engine, 'custom', { ...a, benefit: { ...a.benefit, engine: LOW_BENEFIT } });
const ledger = ['opensource', 'plan'].reduce((w, id) => choose(PRICE_RISE, w, id), startWalk(PRICE_RISE));
const buildVsBuy = breakEven(engine, 'build', 'buy', a)!;

export const FACTS = {
  horizon: a.horizon,
  longHorizon: a9.horizon,
  growth: a.growth,
  maintenance: a.maintenance,
  emailBuild: amount(emailNet.build),
  emailOss: amount(emailNet.oss),
  emailBuy: amount(emailNet.buy),
  crossover: crossoverYear(email, a.growth, a.maintenance),
  email9Build: amount(email9.build),
  email9Buy: amount(email9.buy),
  engineBenefit: engine.benefit,
  engineBuildCost: amount(engineCost.build),
  engineBuyCost: amount(engineCost.buy),
  engineBuildNet: amount(engineNet.build),
  engineBuyNet: amount(engineNet.buy),
  lowBenefit: LOW_BENEFIT,
  engineReverseBuild: engine.reversal.build,
  engineReverseBuy: engine.reversal.buy,
  lowBuildNet: amount(low.build),
  lowOssNet: amount(low.oss),
  lowBuyNet: amount(low.buy),
  breakEven: amount(buildVsBuy),
  costGap: amount(engineCost.build - engineCost.buy),
  extra: ledger.meters[METER.extra],
  weeks: ledger.meters[METER.weeks],
  lockin: ledger.meters[METER.lockin],
  components: COMPONENTS.length,
} as const;
