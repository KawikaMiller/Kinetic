/** Every number the lesson text quotes, computed from the model at the default state (never typed twice). */
import { sig } from '../../core/format';
import {
  CONE_PHASES, OUTCOME_MODELS, RUNS, SUM_DEFAULT, THREE_POINT_DEFAULT, bandRatio, chanceBy, outcomePoints, outsideCone, simulateTotal, sumFacts, sumSpec,
  threePointResult, QUANTITIES, lowScoreChance,
} from './model';
import { MANAGER, RISK } from './scenario';

const first = CONE_PHASES[0];
const last = CONE_PHASES[CONE_PHASES.length - 1];

const spec = sumSpec(SUM_DEFAULT.n, SUM_DEFAULT.sigma, SUM_DEFAULT.rho, SUM_DEFAULT.seed);
const run = simulateTotal(spec);
const sums = sumFacts(spec, run);
const corrSpec = sumSpec(SUM_DEFAULT.n, SUM_DEFAULT.sigma, 0.8, SUM_DEFAULT.seed);
const corrRun = simulateTotal(corrSpec);
const twoSpec = sumSpec(2, SUM_DEFAULT.sigma, 0, SUM_DEFAULT.seed);
const twoRun = simulateTotal(twoSpec);
const tp = threePointResult(THREE_POINT_DEFAULT);

export const FACTS = {
  runs: RUNS.toLocaleString('en-US'),
  phases: CONE_PHASES.length,
  conceptLow: first.low,
  conceptHigh: first.high,
  conceptRatio: sig(bandRatio(first), 3),
  detailedLow: last.low,
  detailedHigh: last.high,
  detailedRatio: sig(bandRatio(last), 3),
  points: outcomePoints('flat').length,
  flatOutside: outsideCone(outcomePoints('flat')),
  coneOutside: outsideCone(outcomePoints('cone')),
  flatLabel: OUTCOME_MODELS[1].label,
  tasks: SUM_DEFAULT.n,
  sumModes: sig(sums.sumModes, 3),
  sumMedians: sig(sums.sumMedians, 3),
  sumMeans: sig(sums.sumMeans, 3),
  p50: sig(sums.p50, 3),
  p80: sig(sums.p80, 3),
  p90: sig(sums.p90, 3),
  chanceAtMedians: Math.round(chanceBy(run, sums.sumMedians) * 100),
  chanceAtModes: Math.round(chanceBy(run, sums.sumModes) * 100),
  sdIndependent: sig(run.sd, 3),
  sdCorrelated: sig(corrRun.sd, 3),
  chanceTwoTasks: Math.round(chanceBy(twoRun, sumFacts(twoSpec, twoRun).sumMedians) * 100),
  pertMean: sig(tp.pert.mean, 3),
  fitMean: sig(tp.fit.mean, 3),
  pertP80: sig(tp.pert.p80, 3),
  fitP80: sig(tp.fit.p80, 3),
  calibrationRows: QUANTITIES.length,
  calibrationOneIn: Math.round(1 / lowScoreChance(QUANTITIES.length, 4, 0.9)),
  mibValue: QUANTITIES[0].value.toLocaleString('en-US'),
  riskDate: RISK.date,
  riskRange: RISK.range,
  endings: MANAGER.endings.length,
} as const;
