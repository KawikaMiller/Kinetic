/** The numbers the try-this entries quote, computed from each scene's default state by the same models the scenes draw. */
import { clock, dataLostMin, latestRecoverable, restore, restoreTime } from './backup';
import { DRILL_PLAN } from './drillView';
import { DEFAULT_PLAN, SCENARIOS, WEAK_PLAN, backupSets, hiddenFault, lowestUntestedFailure, restoreFrom, soundOutcome, verdict, type Plan } from './plan';
import { planRows } from './planView';
import { DRILL_OPEN, PLAN_OPEN, TIMELINE_OPEN, checkTarget, restoreInput, type TimelineInput } from './view';

const open = (patch: Partial<TimelineInput> = {}): TimelineInput => ({ snapshotH: TIMELINE_OPEN.snapshotH, logOn: TIMELINE_OPEN.logOn, logMin: TIMELINE_OPEN.logMin, gapSeed: null, disasterAt: TIMELINE_OPEN.disasterAt, ...patch });
const TARGET = (3 * 24 + 14) * 60 + 6;

/** Scene 1: the opening state, with the log archive off, with a target after the disaster, and with a lost segment. */
export function timelineFacts() {
  const on = restoreInput(open());
  const off = restoreInput(open({ logOn: false }));
  const gap = restoreInput(open({ gapSeed: TIMELINE_OPEN.gapSeed }));
  return {
    on: { lost: dataLostMin(on), recoverable: clock(latestRecoverable(on)), reached: clock(restore(on, TARGET).reached), seconds: Math.round(restoreTime(on, TARGET, TIMELINE_OPEN.throughput).totalS) },
    off: { lost: dataLostMin(off), recoverable: clock(latestRecoverable(off)), reached: clock(restore(off, TARGET).reached) },
    afterDisaster: checkTarget('14:50', 3, on),
    gap: checkTarget(TIMELINE_OPEN.targetText, 3, gap),
    ok: checkTarget(TIMELINE_OPEN.targetText, 3, on),
  };
}

/** Scene 2: the sound plan, the weak plan, a replica-only plan, and a same-account plan, on the scene's seed. */
export function planFacts() {
  const count = (p: Plan) => planRows(p, PLAN_OPEN.seed).filter((r) => r.verdict.ok).length;
  const row = (p: Plan, id: (typeof SCENARIOS)[number]['id']) => verdict(p, id, PLAN_OPEN.seed);
  return {
    total: SCENARIOS.length,
    sound: count(DEFAULT_PLAN),
    weak: count(WEAK_PLAN),
    migration: row(DEFAULT_PLAN, 'migration'),
    replicaMigration: row({ ...DEFAULT_PLAN, method: 'replica' }, 'migration'),
    sameAccount: row({ ...DEFAULT_PLAN, where: 'account', immutableDays: 0 }, 'ransomware'),
  };
}

/** Scene 3: seed 3, never tested, hits the fault at the disaster; the drill finds it first. */
export function drillFacts() {
  const plan = DRILL_PLAN;
  const sets = backupSets(plan, DRILL_OPEN.seed);
  const struck = restoreFrom(plan, sets, DRILL_OPEN.seed);
  const fixed = restoreFrom(plan, sets.map((s) => ({ ...s, fault: null, gapSegment: null })), DRILL_OPEN.seed);
  return { seed: DRILL_OPEN.seed, lowest: lowestUntestedFailure(plan), lowestGap: lowestUntestedFailure(plan, 'gap'), fault: hiddenFault(DRILL_OPEN.seed, plan), struck, fixed, sound: soundOutcome(plan, DRILL_OPEN.seed) };
}
