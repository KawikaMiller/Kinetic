import { mulberry32, type Rnd } from '../../core/random';
import { KEYS, apply, newDb, openSlots, snapshotViolation, type Db, type Op, type Outcome, type Timing, type Who } from './engine';

/** Operations in a generated schedule. */
export const SCHEDULE_LENGTH = 24;
const VALUE_RANGE = { min: 40, max: 99 };

/** How likely each kind of operation is, out of 100. */
const MIX: readonly { kind: Op['kind']; weight: number }[] = [
  { kind: 'begin', weight: 14 }, { kind: 'select', weight: 20 }, { kind: 'update', weight: 26 }, { kind: 'delete', weight: 5 },
  { kind: 'insert', weight: 8 }, { kind: 'commit', weight: 10 }, { kind: 'rollback', weight: 5 }, { kind: 'vacuum', weight: 12 },
];

const pick = <T>(xs: readonly T[], rnd: Rnd): T => xs[Math.floor(rnd() * xs.length)];

function nextOp(db: Db, rnd: Rnd, broken: boolean): Op {
  let roll = rnd() * MIX.reduce((s, m) => s + m.weight, 0);
  const kind = MIX.find((m) => (roll -= m.weight) < 0)!.kind;
  const open = openSlots(db);
  const who = (): Who => (open.length && rnd() < 0.8 ? pick(open, rnd) : 'auto');
  const key = pick(KEYS, rnd);
  const value = VALUE_RANGE.min + Math.floor(rnd() * (VALUE_RANGE.max - VALUE_RANGE.min + 1));
  switch (kind) {
    case 'begin': return { kind };
    case 'select': return { kind, who: who() };
    case 'update': return { kind, who: who(), key, value };
    case 'delete': return { kind, who: who(), key };
    case 'insert': return { kind, who: who(), key, value };
    case 'commit':
    case 'rollback': return { kind, who: open.length ? pick(open, rnd) : 1 };
    case 'vacuum': return { kind, broken };
  }
}

export interface TraceStep {
  op: Op;
  before: Db;
  db: Db;
  outcome: Outcome;
  /** Set when a VACUUM changed what a running transaction's snapshot reads. */
  violation: string | null;
}

export interface Trace {
  seed: number;
  timing: Timing;
  steps: TraceStep[];
  /** Index of the first step that broke the invariant, or null. */
  firstViolation: number | null;
}

/**
 * Run the seeded schedule through the real engine. The schedule is drawn as it goes (it looks at which transactions
 * are open), so the same seed always gives the same trace. `broken` swaps in the VACUUM that ignores open snapshots.
 */
export function runSchedule(seed: number, opts: { timing?: Timing; broken?: boolean; length?: number } = {}): Trace {
  const { timing = 'transaction', broken = false, length = SCHEDULE_LENGTH } = opts;
  const rnd = mulberry32(seed);
  let db = newDb(timing);
  const steps: TraceStep[] = [];
  for (let i = 0; i < length; i++) {
    const op = nextOp(db, rnd, broken);
    const before = db;
    const applied = apply(db, op);
    db = applied.db;
    steps.push({ op, before, db, outcome: applied.outcome, violation: op.kind === 'vacuum' ? snapshotViolation(before, db) : null });
  }
  const firstViolation = steps.findIndex((s) => s.violation !== null);
  return { seed, timing, steps, firstViolation: firstViolation < 0 ? null : firstViolation };
}

/**
 * The lowest seed in 1 to 200 whose schedule breaks the invariant under the broken VACUUM (horizon = the latest commit).
 * Pinned here and re-derived by a test, because a seed only means something for a given draw order.
 */
export const BROKEN_SEED = 2;

/** The counterexample shown when the learner turns the broken VACUUM on: the schedule up to the step that breaks it. */
export function counterexample(): Trace & { steps: TraceStep[] } {
  const trace = runSchedule(BROKEN_SEED, { broken: true });
  return { ...trace, steps: trace.firstViolation === null ? trace.steps : trace.steps.slice(0, trace.firstViolation + 1) };
}
