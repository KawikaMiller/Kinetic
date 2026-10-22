/** Every number the lesson text quotes, computed from the model at the states the try-this entries walk through. */
import { decimal, integer } from '../../core/format';
import { choose, startWalk } from '../../core/scenario';
import {
  DECISIONS, DEFAULT_TAU, DEFAULT_W, DOORS_P0, crossoverCost, decisionOf, deliberateCount, doorClosing, optimalHours, optimalTotal, rigourOf, techniqueRow, techniqueOf, totalCost, undoAt,
} from './model';
import { METER, QUEUE_SERVICE } from './scenario';

const h1 = (x: number): string => decimal(x, 1);
const database = rigourOf(decisionOf('database'));
const rename = rigourOf(decisionOf('rename'));
const renameSure = { ...rename, p0: 0.9 };
const adapter = techniqueRow(database, techniqueOf('adapter'));
const pilot = techniqueRow(database, techniqueOf('pilot'));
/** The quiz's worked decision: 200 hours to undo, a 40% chance of being wrong, tau 10 h, w 1. */
const quizModel = { undo: 200, p0: 0.4, tau: DEFAULT_TAU, w: DEFAULT_W };
/** A week of review, in hours, for the first quiz question. */
const WEEK_HOURS = 40;
const closing = doorClosing(20, 10, crossoverCost(DOORS_P0, DEFAULT_TAU, DEFAULT_W));
const doorMonth = closing.kind === 'month' ? closing.month : NaN;
const walk = (ids: string[]) => ids.reduce((w, id) => choose(QUEUE_SERVICE, w, id), startWalk(QUEUE_SERVICE));
const frozen = walk(['r1', 'freeze']);
const slow = walk(['r3', 'more']);
const shipFast = walk(['r2', 'asis']);

export const FACTS = {
  decisions: DECISIONS.length,
  deliberate: deliberateCount(),
  decideNow: DECISIONS.length - deliberateCount(),
  tau: DEFAULT_TAU,
  w: DEFAULT_W,
  dbUndo: integer(database.undo),
  dbChance: Math.round(database.p0 * 100),
  dbCrossover: h1(crossoverCost(database.p0, database.tau, database.w)),
  dbBest: h1(optimalHours(database)),
  dbBestTotal: h1(optimalTotal(database)),
  dbNone: h1(totalCost(0, database)),
  dbAt33: h1(totalCost(33, database)),
  dbAt80: h1(totalCost(80, database)),
  renameCrossover: h1(crossoverCost(rename.p0, rename.tau, rename.w)),
  renameNone: h1(totalCost(0, rename)),
  renameAt80: h1(totalCost(80, rename)),
  renameAt60: h1(totalCost(60, rename)),
  renameSureCrossover: h1(crossoverCost(renameSure.p0, renameSure.tau, renameSure.w)),
  renameSureBest: h1(optimalHours(renameSure)),
  doorMonth: h1(doorMonth),
  doorCostAt3: h1(undoAt(20, 10, 3)),
  doorCrossover: h1(crossoverCost(DOORS_P0, DEFAULT_TAU, DEFAULT_W)),
  adapterSaving: h1(adapter.saving),
  adapterSetup: adapter.technique.setup,
  /** tau * w * ln(1 / factor): the saving of any technique while both sides stay past the crossover. */
  adapterClosed: h1(DEFAULT_TAU * DEFAULT_W * Math.log(1 / adapter.technique.factor)),
  adapterUndoAfter: h1(adapter.undoAfter),
  adapterAfter: h1(adapter.totalAfter),
  pilotSaving: h1(pilot.saving),
  pilotSetup: pilot.technique.setup,
  week: WEEK_HOURS,
  weekCost: h1(totalCost(WEEK_HOURS, rename)),
  quizBest: h1(optimalHours(quizModel)),
  quizNone: h1(totalCost(0, quizModel)),
  quizBestTotal: h1(optimalTotal(quizModel)),
  quizRatio: h1((quizModel.p0 * quizModel.undo) / (quizModel.tau * quizModel.w)),
  frozenSlack: frozen.meters[METER.slack],
  frozenRegret: frozen.meters[METER.regret],
  frozenUndo: frozen.meters[METER.undo],
  slowSlack: slow.meters[METER.slack],
  slowRegret: slow.meters[METER.regret],
  shipFastSlack: shipFast.meters[METER.slack],
  shipFastRegret: shipFast.meters[METER.regret],
  shipFastUpkeep: shipFast.meters[METER.upkeep],
} as const;
