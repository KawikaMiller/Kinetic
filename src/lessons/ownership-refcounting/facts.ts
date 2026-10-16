/** Numbers the try-this, key ideas and quiz quote, read off the models at the opening state. */
import { CHAIN_SCRIPT, CYCLE_SCRIPT, leaked, replay, updateCost, WEAK_BACK_SCRIPT, type Fate, type Op } from './heap';
import { OPENING } from './opening';
import { checkSequential, freedAt, PRESETS, RULES } from './ownership';

const freedAtOps = (fates: Fate[]) => fates.flatMap((f) => (f.kind === 'freed' ? [f.at] : []));
const count = (fates: Fate[], kind: Fate['kind']) => fates.filter((f) => f.kind === kind).length;
const strays = (log: readonly Op[]) => {
  const r = replay(log, 'counting');
  return leaked(r.heaps[r.heaps.length - 1]).length;
};

const open = OPENING.counting.log;
const openCounting = replay(open, 'counting');
const withCollect = replay([...open, { kind: 'collect' }], 'tracing');
const weak = replay(WEAK_BACK_SCRIPT, 'counting');
const chain = replay(CHAIN_SCRIPT, 'counting');
const updates = openCounting.heaps[openCounting.heaps.length - 1].updates;
const verdict = (id: string) => checkSequential(PRESETS.find((p) => p.id === id)!.program);
const first = (id: string) => verdict(id).problems[0];

export const FACTS = {
  openLeaked: strays(open),
  openFreed: count(openCounting.fates, 'freed'),
  cycleLeaked: strays(CYCLE_SCRIPT),
  collectOp: open.length + 1,
  collectFreed: count(withCollect.fates, 'freed'),
  weakFreedAt: freedAtOps(weak.fates),
  weakLeaked: strays(WEAK_BACK_SCRIPT),
  chainFreedAt: freedAtOps(chain.fates),
  chainFreed: count(chain.fates, 'freed'),
  updates,
  plainCost: updateCost(updates, false),
  atomicCost: updateCost(updates, true),
  openingAccepted: verdict(OPENING.ownership.preset).accepted,
  openingFreed: freedAt(PRESETS.find((p) => p.id === OPENING.ownership.preset)!.program).why,
  sharedThenMutLine: first('shared-then-mut').line + 1,
  sharedThenMutRule: RULES[first('shared-then-mut').rule].code,
  twoMutLine: first('two-mut').line + 1,
  twoMutRule: RULES[first('two-mut').rule].code,
  afterMoveLine: first('after-move').line + 1,
  afterMoveRule: RULES[first('after-move').rule].code,
};
