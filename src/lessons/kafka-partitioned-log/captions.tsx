/**
 * kafka-partitioned-log: every caption, built from the model on screen. No number here is typed.
 */
import type { ReactNode } from 'react';
import { pctText } from '../../core/format';
import { PAUSE_TICKS, STEPS_PER_RECORD, TICK_CAP, busyConsumers, ledger, totalLag, type World } from './groups';
import { BURST_SIZE, distinctKeys, expectedMoveShare, movedKeys, partitionLengths, placedUnder, type Topic } from './partitioning';
import { frameAt, liveLeader, type ReplRun } from './replView';
import { HORIZON_MS, type ReplConfig } from './replication';
import { MAX_KEPT_SEGMENTS, readFrom, stateDiff, type RetPolicy, type SegLog } from './retention';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
/** The noun for a count, without the count: "record" for 1, "records" otherwise. */
const noun = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

export function partitionsCaption(t: Topic): ReactNode {
  const n = t.records.length;
  if (n === 0) {
    return (
      <>
        An empty topic of {hl('', t.p)} {noun(t.p, 'partition')}. A keyed record goes to {hl('', `hash(key) mod ${t.p}`)}, a keyless one to the next partition in turn (this lesson's rule).{' '}
        Send one, or a burst of {BURST_SIZE}.
      </>
    );
  }
  const lengths = partitionLengths(t);
  const busiest = lengths.indexOf(Math.max(...lengths));
  const moved = movedKeys(t);
  const keys = distinctKeys(t);
  const from = placedUnder(t);
  return (
    <>
      {hl('', n)} {noun(n, 'record')} in {t.p} {noun(t.p, 'partition')}; the fullest is {hl('info', `P${busiest}`)} with {pctText(lengths[busiest] / n, 0)} of them. Offsets count inside one tape only: the strip below interleaves the tapes
      in arrival order, and nothing orders records across partitions.
      {moved.length > 0 && (
        <>
          {' '}
          {hl('bad wrap', `${moved.length} of ${keys.length} ${noun(keys.length, 'key')} would now go to a different partition than their latest record`)}
          {from !== null && from !== t.p && <> (about {pctText(expectedMoveShare(from, t.p), 0)} expected going from {from} to {t.p})</>}: per-key order is not kept across the change.
        </>
      )}
    </>
  );
}

export function groupsCaption(w: World): ReactNode {
  const a = w.groups[0];
  const b = w.groups[1];
  const staying = a.consumers.filter((c) => !c.leaving).length;
  const busy = busyConsumers(a);
  const idle = staying - busy;
  const led = ledger(a);
  return (
    <>
      Tick {hl('', w.tick)} of {TICK_CAP}. Group A has {staying} {noun(staying, 'consumer')} on {w.p} {noun(w.p, 'partition')}: {hl('info', busy)} can work, since a group gives each partition to one consumer. Total lag {hl('violet', totalLag(a, w.logEnd))}, group B's {hl('violet', totalLag(b, w.logEnd))}.
      {idle > 0 && <> {idle} {noun(idle, 'consumer')} sit idle.</>}
      {a.pause > 0 && <> The group is paused for the rebalance: {hl('hi', `${a.pause} of ${PAUSE_TICKS}`)} ticks left.</>}
      {a.rebalance && a.pause === 0 && <> A rebalance waits for each consumer to finish its record.</>}
      {led.duplicates > 0 && <> {hl('bad', `${led.duplicates} ${noun(led.duplicates, 'record')} processed twice`)}.</>}
      {led.skipped > 0 && <> {hl('bad', `${led.skipped} ${noun(led.skipped, 'record')} committed but never processed`)}.</>}
    </>
  );
}

export const policyLine = (policy: 'after' | 'before'): ReactNode =>
  policy === 'after' ? (
    <>
      Commit after processing: a record takes {STEPS_PER_RECORD} ticks (process, apply, commit). A crash after the effect and before the commit repeats that record: at-least-once.
    </>
  ) : (
    <>
      Commit before processing: a record takes {STEPS_PER_RECORD} ticks (commit, process, apply). A crash after the commit and before the effect skips that record: at-most-once.
    </>
  );

const ackWords = (c: ReplConfig): string => {
  if (c.acks === 0) return 'acks=0: the producer is never told anything';
  if (c.acks === 1) return 'acks=1: the leader answers as soon as it has the record';
  return `acks=all with min.insync.replicas=${c.minIsr}: the leader answers when every in-sync replica has the record, and refuses a write when fewer than ${c.minIsr} ${c.minIsr === 1 ? 'is' : 'are'} in sync`;
};

export function replicationCaption(o: { config: ReplConfig; run: ReplRun; t: number }): ReactNode {
  const f = frameAt(o.run, o.t);
  const leader = liveLeader(f);
  const v = o.run.verdict;
  const now = Math.round(f.t);
  return (
    <>
      {ackWords(o.config)}; {o.config.unclean ? 'a replica outside the ISR may be elected when none in it is left' : 'only an ISR member is elected'}. At {hl('', `${Math.round(o.t)} ms`)}{' '}
      {leader && f.leader ? (
        <>
          the leader is {hl('violet', f.leader)} (epoch {f.epoch}), the in-sync set is {f.isr.join(', ')} and the high watermark is {hl('hi', leader.hwm)}.
        </>
      ) : (
        <>there is no live leader (the last event was at {now} ms): nothing can be written until one is elected.</>
      )}
      {f.lost.length > 0 && (
        <>
          {' '}
          {hl('bad wrap', `${f.lost.length} acknowledged ${noun(f.lost.length, 'record')} missing from the leader: ${f.lost.map((l) => `r${l.id} at offset ${l.offset}`).join(', ')}`)}.
        </>
      )}
      {f.missing.length > 0 && (
        <>
          {' '}
          {hl('bad wrap', `acks=0: nothing counts as acknowledged, and ${f.missing.map((l) => `r${l.id}`).join(', ')} ${f.missing.length === 1 ? 'is' : 'are'} missing from the leader`)}.
        </>
      )}
      {' '}
      {o.config.acks === 0 ? (
        <>The producer was told nothing, so no record counts as acknowledged and the safety check cannot fail; the table of what the leader holds is the real answer.</>
      ) : v.ok ? <>Nothing acknowledged is lost in the whole {HORIZON_MS} ms run.</> : <>The check fails at {hl('bad', `${Math.round(v.time)} ms`)} (event {v.step}): {v.message}.</>}
    </>
  );
}

export function retentionCaption(o: { policy: RetPolicy; log: SegLog; position: number; keep: number }): ReactNode {
  const { log, policy } = o;
  const n = log.history.length;
  const diff = stateDiff(log);
  const read = readFrom(log, o.position);
  const check = diff.length === 0 ? <>replaying the log into a Map gives {hl('ok', 'the same state')} as replaying every update ever sent</> : <>replaying the log into a Map {hl('bad wrap', `differs from the full history for ${diff.join(', ')}`)}</>;
  return (
    <>
      {policy === 'retention' ? <>Retention keeps the newest {hl('', o.keep)} {noun(o.keep, 'segment')} of up to {MAX_KEPT_SEGMENTS}: whole segments go, the log start moves to {hl('', log.logStart)}.</> : <>Compaction keeps the newest record of each key in the closed segments, so offsets are not renumbered and holes appear.</>}{' '}
      {n} {noun(n, 'update')} sent; {check}.{' '}
      {read.kind === 'out-of-range' && <>A consumer at offset {hl('bad', o.position)} gets {hl('bad', 'offset out of range')}: the log now starts at {read.logStart}.</>}
      {read.kind === 'record' && <>A consumer at offset {hl('info', o.position)} reads {read.record.key}={read.record.value ?? 'a tombstone'} from offset {read.record.offset}{read.record.offset !== o.position ? ', the next one that is still there' : ''}.</>}
      {read.kind === 'end' && <>A consumer at offset {hl('info', o.position)} is at the end of the log.</>}
    </>
  );
}
