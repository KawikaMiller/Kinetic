/**
 * The numbers the try-this entries quote, computed from the same models the scenes run, so the text cannot drift from the stage.
 * Each function replays the entry from the scene's default state, as written.
 */
import { DEFAULT_CONSUMERS, DEFAULT_GROUP_PARTITIONS, DEFAULT_GROUP_SEED, advance, busyConsumers, crashAtWorstMoment, drain, ledger, newWorld, setConsumers } from './groups';
import { DEFAULT_PARTITIONS, DEFAULT_SEED, KEY_SETS, appendKeys, burstKeys, distinctKeys, movedKeys, newTopic } from './partitioning';
import { DEFAULT_REPL, runRepl } from './replView';
import { SAFE_CONFIG } from './replication';
import { DEFAULT_KEPT_SEGMENTS, DEFAULT_POSITION, applyCompaction, applyRetention, onDisk, preloaded, readFrom, stateDiff } from './retention';

/** The consumer count the "raise Consumers" entry goes to. */
export const RAISED_CONSUMERS = 6;

/** Try-this 1: the default topic, one burst of the 5 user ids, then one more partition. */
export function repartitionFacts() {
  const sent = appendKeys(newTopic(DEFAULT_PARTITIONS), burstKeys(KEY_SETS[0], DEFAULT_SEED, 0));
  if (!sent.ok) throw new Error(sent.error);
  const topic = { ...sent.topic, p: DEFAULT_PARTITIONS + 1 };
  return { from: DEFAULT_PARTITIONS, to: topic.p, keys: distinctKeys(topic).length, moved: movedKeys(topic).length };
}

/** Try-this 2: the default group, raised to RAISED_CONSUMERS, one tick later. */
export function raiseFacts() {
  const w = advance(setConsumers(newWorld({ p: DEFAULT_GROUP_PARTITIONS, consumers: DEFAULT_CONSUMERS, policy: 'after', seed: DEFAULT_GROUP_SEED }), RAISED_CONSUMERS));
  const busy = busyConsumers(w.groups[0]);
  return { busy, idle: RAISED_CONSUMERS - busy, ranRebalance: w.groups[0].rebalance === null, assigned: w.events.some((e) => e.text.startsWith('assign P2 to c3')) };
}

/** Try-this 3: crash c1 at the worst moment under each commit policy, then let the group drain. */
export function commitFacts() {
  const outcome = (policy: 'after' | 'before') => {
    const start = newWorld({ p: DEFAULT_GROUP_PARTITIONS, consumers: DEFAULT_CONSUMERS, policy, seed: DEFAULT_GROUP_SEED });
    const crashed = crashAtWorstMoment(start, 'c1');
    const drained = crashed && drain(crashed);
    if (!drained) throw new Error('the crash never happened or the group never drained');
    const l = ledger(drained.groups[0]);
    return { duplicates: l.duplicates, skipped: l.skipped };
  };
  return { after: outcome('after'), before: outcome('before') };
}

/** Try-this 4: the default replication scene to the end, and the same schedule under the safe settings. */
export function acksFacts() {
  const broken = runRepl(DEFAULT_REPL);
  const safe = runRepl({ ...DEFAULT_REPL, config: SAFE_CONFIG });
  if (broken.verdict.ok) throw new Error('the default schedule should lose a record');
  return {
    message: broken.verdict.message,
    at: Math.round(broken.verdict.time),
    safeOk: safe.verdict.ok,
    safeR4: safe.frames.at(-1)!.records.find((r) => r.id === 4)?.fate,
  };
}

/** Try-this 5: retention, then compaction, on the preloaded log. */
export function retentionFacts() {
  const full = preloaded();
  const trimmed = applyRetention(full, DEFAULT_KEPT_SEGMENTS);
  const compacted = applyCompaction(full);
  return {
    sent: full.history.length,
    logStart: trimmed.logStart,
    position: DEFAULT_POSITION,
    outOfRange: readFrom(trimmed, DEFAULT_POSITION).kind === 'out-of-range',
    kept: onDisk(compacted).map((r) => r.offset),
    retentionDiffers: stateDiff(trimmed),
    compactionDiffers: stateDiff(compacted),
  };
}
