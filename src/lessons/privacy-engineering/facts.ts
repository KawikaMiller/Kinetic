/** Every number the lesson text quotes that does not need the crypto API, computed once from the model at each scene's opening state. */
import { BACKUP_RETENTION_DAYS, COPIES, countStatus, stateOf, type Scenario } from './copies';
import { makePublicList, makeTable, viewOf } from './kanon';
import { FIELD_ORDER, FIELDS, stillIdentifying } from './logline';
import { BUDGET, NOISE_SEED, TRUE_COUNT, answersFor, ask, mean, noiseScale } from './noise';
import { initialKanon, initialLogs, initialRecords } from './opening';

const records = initialRecords();
const at = (patch: Partial<Scenario>) => stateOf({ ...records, ...patch });
const names = (states: ReturnType<typeof at>, s: string) => states.filter((x) => x.status === s).map((x) => x.copy.label.toLowerCase());

const table = makeTable();
const list = makePublicList(table);
const kanon = initialKanon();
const opening = viewOf(table, list, { zip: kanon.zip, age: kanon.age }, kanon.suppressBelow);
const generalised = viewOf(table, list, { zip: 3, age: 'range' }, 1);

const tenAtOne = answersFor(NOISE_SEED, ask([], 1, 10).map((epsilon) => ({ epsilon })));
const hundredAtTenth = answersFor(NOISE_SEED, ask([], 0.1, 100).map((epsilon) => ({ epsilon })));

const logs = initialLogs();
const readableOnDay = (strategy: Scenario['strategy'], day: number) => countStatus(at({ strategy, day }), 'readable');
/** The first day a fan-out queue leaves nothing readable. */
const queueDone = Array.from({ length: 91 }, (_, d) => d).find((d) => readableOnDay('queue', d) === 0)!;

export const FACTS = {
  copies: COPIES.length,
  backupDays: BACKUP_RETENTION_DAYS,
  primaryDay0Readable: countStatus(at({}), 'readable'),
  primaryDay90Readable: countStatus(at({ day: 90 }), 'readable'),
  primaryDay90Names: names(at({ day: 90 }), 'readable'),
  queueDoneDay: queueDone,
  queueBeforeDone: readableOnDay('queue', queueDone - 1),
  shredUnreadable: countStatus(at({ strategy: 'shred' }), 'unreadable'),
  shredReadable: countStatus(at({ strategy: 'shred' }), 'readable'),
  holdHeld: countStatus(at({ strategy: 'queue', day: 90, legalHold: true }), 'held'),
  minimiseAbsent: countStatus(at({ minimise: true }), 'absent'),
  people: table.length,
  openingK: opening.readouts.k!,
  openingUnique: opening.readouts.unique,
  openingLinked: opening.linkedNow,
  generalisedK: generalised.readouts.k!,
  generalisedL: generalised.readouts.l!,
  generalisedUnique: generalised.readouts.unique,
  generalisedLinked: generalised.linkedNow,
  generalisedLoss: Math.round(generalised.loss * 100),
  leakSize: generalised.leak!.members.length,
  leakCondition: generalised.leak!.members[0].condition,
  trueCount: TRUE_COUNT,
  budget: BUDGET,
  tenMean: mean(tenAtOne.values).toFixed(1),
  tenSpent: tenAtOne.spent,
  tenAnswers: tenAtOne.values.length,
  tenScale: noiseScale(1).toFixed(1),
  hundredMean: mean(hundredAtTenth.values).toFixed(1),
  hundredAnswers: hundredAtTenth.values.length,
  hundredScale: noiseScale(0.1).toFixed(1),
  personalFields: FIELD_ORDER.filter((f) => FIELDS[f].pii).length,
  openingIdentifying: stillIdentifying(logs.choice).length,
};
