/** The numbers the try-this entries quote, computed from each scene's default state by the same models the scenes draw. */
import { SAFE_FLAGS, lowestFailing, type Fault, type Scenario, type TimedTx } from './cdc';
import { SLOW_COMMIT_DEFAULT, pollingRun, pollTimesEvery, twoInterleaved, POLL_END_MS, POLL_EVERY_MS, type PollTx } from './polling';
import { retentionAt, type RetentionConfig } from './retention';
import { evaluateSnapshot, lowestSnapshotFailure, scanTimeOf } from './snapshot';
import { REPLAY_OPEN, REPLAY_OPS, RETENTION_OPEN, TAIL_OPEN, connOf, consOf, dbOf, redeliveries, replay, syncedCount } from './view';

const scenario = (ops: TimedTx[], faults: Fault[] = [], flags = SAFE_FLAGS): Scenario => ({ seed: TAIL_OPEN.seed, ops, faults, flags, loss: 0, duplicate: 0 });
const ins = (txid: number, key: number): TimedTx => ({ at: 0, tx: { txid, outcome: 'commit', stmts: [{ op: 'insert', key, row: { status: TAIL_OPEN.status, amount: TAIL_OPEN.amount } }] } });

/** Scene 1: Insert row 3 at time 0, then Time 60. */
export function insertFacts() {
  const r = replay(scenario([ins(1, 3)]), 60);
  return { synced: syncedCount(r.snap), saved: connOf(r.snap).saved, records: dbOf(r.snap).log.length };
}

/** Scene 1: Insert rows 3 and 4, then "Two updates, roll back" on rows 3 and 4, then Time 60. */
export function rollbackFacts() {
  const ops: TimedTx[] = [
    ins(1, 3),
    ins(2, 4),
    { at: 0, tx: { txid: 3, outcome: 'rollback', stmts: [3, 4].map((key) => ({ op: 'update' as const, key, row: { status: TAIL_OPEN.status, amount: TAIL_OPEN.amount } })) } },
  ];
  const r = replay(scenario(ops), 60);
  const applied = (['search', 'cache', 'warehouse'] as const).flatMap((c) => consOf(r.snap, c).applied);
  return { synced: syncedCount(r.snap), records: dbOf(r.snap).log.length, rolledBackApplied: applied.includes(3), rolledBackTx: dbOf(r.snap).rolledBack };
}

/** Scene 2: no faults, Time 500; then the connector killed at 50 ms. */
export const KILL_AT = 50;
export function replayFacts() {
  const base = (flags = REPLAY_OPEN.flags, faults: Fault[] = []): Scenario => ({ seed: 1, ops: REPLAY_OPS, faults, flags, loss: 0, duplicate: 0 });
  const quiet = replay(base(), 500);
  const kill: Fault[] = [{ kind: 'crash-connector', at: KILL_AT }];
  const idem = replay(base(REPLAY_OPEN.flags, kill), 500);
  const blind = replay(base({ ...REPLAY_OPEN.flags, idempotent: false }, kill), 500);
  return {
    quiet: { synced: syncedCount(quiet.snap), repeated: redeliveries(quiet.trace) },
    idem: { synced: syncedCount(idem.snap), repeated: redeliveries(idem.trace) },
    blind: { synced: syncedCount(blind.snap), repeated: redeliveries(blind.trace) },
  };
}

export const seedPins = () => ({
  blind: lowestFailing({ ...SAFE_FLAGS, idempotent: false }, 'clean'),
  blindNoisy: lowestFailing({ ...SAFE_FLAGS, idempotent: false }, 'noisy'),
  ackBefore: lowestFailing({ ...SAFE_FLAGS, ackBeforeApply: true }, 'noisy'),
});

/** Scene 3: the preset write to row 7 just after the scan read it. */
export const presetWrites = () => [{ at: scanTimeOf(7) + 15, key: 7, row: { status: 'paid', amount: 101 } }];
export function snapshotFacts() {
  const writes = presetWrites();
  const good = evaluateSnapshot({ seed: 1, from: 'snapshot', writes });
  const bad = evaluateSnapshot({ seed: 1, from: 'now', writes });
  return { goodMissing: good.end, badMissing: bad.end, pinNow: lowestSnapshotFailure('now'), pinGood: lowestSnapshotFailure('snapshot') };
}

export function pollFacts() {
  const run = (txs: PollTx[]) => pollingRun(txs, pollTimesEvery(POLL_EVERY_MS, POLL_END_MS), POLL_END_MS);
  const late = run(twoInterleaved(SLOW_COMMIT_DEFAULT));
  const early = run(twoInterleaved(13));
  const withDelete = run([...twoInterleaved(13), { txid: 3, begin: 100, commit: 102, stmts: [{ op: 'delete', key: 2 }] }]);
  return { late: late.misses, early: early.misses, withDelete: withDelete.misses };
}

const cfg = (slot: boolean): RetentionConfig => ({ slot, lagRecords: RETENTION_OPEN.lag, deadAt: RETENTION_OPEN.deadAt });
export function retentionFacts() {
  return { open: retentionAt(cfg(true), RETENTION_OPEN.now), late: retentionAt(cfg(true), 100), noSlot: retentionAt(cfg(false), 100) };
}
