/** The numbers the try-this entries quote, computed from each scene's default state by the same models the scenes draw. */
import { crashReport } from './captions';
import { CHECKPOINT_INTERVALS, DEFAULT_INTERVAL_INDEX, checkpointRun, commitCost, groupCommit } from './cost';
import { ACK_EARLY_SEED, COST_OPEN, WAL_OFF_SEED, presetMachine } from './view';
import { SEEDS, runSeed } from './wal';

/** A preset loaded in scene 1 and then "Crash now". */
export function presetCrash(id: string) {
  const m = presetMachine(id);
  const r = crashReport(m, false);
  return { disk3Before: m.disk[3], disk3After: r.recovered.disk[3], redone: r.redone, skipped: r.skipped, undone: r.undone, violations: r.violations, acked: m.acked };
}

/** Scene 2 on its default seed, with the learner flipping one protection. */
export function seedFacts() {
  const safe = runSeed(WAL_OFF_SEED);
  const walOff = runSeed(WAL_OFF_SEED, { enforceWal: false });
  const ack = runSeed(ACK_EARLY_SEED, { ackBeforeFsync: true });
  return { seed: WAL_OFF_SEED, safe: safe.violations, walOff: walOff.violations, ackSeed: ACK_EARLY_SEED, ack: ack.violations, ackSafe: runSeed(ACK_EARLY_SEED).violations };
}

export const lowestFailing = (policy: Parameters<typeof runSeed>[1]) => SEEDS.find((s) => runSeed(s, policy).violations.length > 0);

export function costFacts() {
  const plain = groupCommit(COST_OPEN.latencyMs, COST_OPEN.committers, false);
  const grouped = groupCommit(COST_OPEN.latencyMs, COST_OPEN.committers, true);
  return { plain: Math.round(plain.throughput), grouped: Math.round(grouped.throughput), noForce: commitCost({ force: false }), force: commitCost({ force: true }) };
}

export function checkpointFacts() {
  return { none: checkpointRun(CHECKPOINT_INTERVALS[DEFAULT_INTERVAL_INDEX]), every12: checkpointRun(12), every6: checkpointRun(6) };
}
