/** Captions and verdict sentences, every number from the model on screen. Plain strings, so tests can read them. */
import type { Snapshot, TraceRow } from '../../core/distSim';
import { CONSUMERS, CONSUMER_LABEL, type CdcState, type Flags, type Msg } from './cdc';
import type { PollResult } from './polling';
import type { RetentionPoint } from './retention';
import { connOf, dbOf, inSync, labelOf, redeliveries, syncedCount } from './view';
import { bytes } from '../../core/format';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function tailCaption(snap: Snapshot<CdcState>, now: number, note: string | null): string {
  const c = connOf(snap);
  const head = `At ${now} ms: ${plural(dbOf(snap).log.length, 'log record')}, saved position LSN ${c.saved}, ${plural(c.inflight, 'event')} in flight, ${syncedCount(snap)} of ${CONSUMERS.length} consumers in sync.`;
  return note ? `${head} ${note}.` : head;
}

export function replayCaption(snap: Snapshot<CdcState>, now: number, trace: readonly TraceRow<Msg>[], flags: Flags): string {
  const c = connOf(snap);
  const again = redeliveries(trace);
  const lagging = CONSUMERS.filter((id) => !inSync(snap, id)).map((id) => CONSUMER_LABEL[id]);
  const apply = `${flags.idempotent ? 'idempotent apply' : 'blind apply'}, ${flags.ackBeforeApply ? 'acknowledging before applying' : 'acknowledging after applying'}`;
  return `At ${now} ms (${apply}): saved position LSN ${c.saved}, ${plural(again, 'event delivery', 'event deliveries')} repeated so far, ${lagging.length === 0 ? 'every consumer matches the source' : `behind: ${lagging.join(', ')}`}.`;
}

export function seedVerdict(seed: number, rule: string | null, message: string | null): string {
  return rule === null
    ? `Seed ${seed}: S1, S2 and S3 hold: no committed change was lost, each key was applied in LSN order, and every consumer equals the source once the stream drained.`
    : `Seed ${seed}: ${rule} is broken: ${message}.`;
}

export function pollingText(r: PollResult): string {
  if (r.misses.length === 0) return 'The poller\'s copy equals the source table.';
  return `The poller's copy is wrong: ${r.misses.map((m) => (m.why === 'delete' ? `row ${m.key} was deleted at the source and is still in the copy, because a deleted row has no updated_at to find` : `row ${m.key} never arrived, because its transaction committed after the poller had moved past its timestamp`)).join('; ')}.`;
}

/** `end` is the divergence at the end of the run, `loss` the first change streaming passed without delivering it (it can be covered by a later write). */
export function snapshotText(from: 'snapshot' | 'now', end: string | null, loss: string | null = null): string {
  const how = from === 'snapshot' ? 'Streaming from the log position where the snapshot began' : 'Streaming from where the log is when the snapshot ends';
  const mid = loss === null ? '' : ` Mid-run, ${loss}${end === null ? ', and a later write to the same key covered it' : ''}.`;
  return `${how}: ${end === null ? 'the new consumer ends equal to the source.' : `at the end ${end}.`}${mid}`;
}

export function retentionText(p: RetentionPoint, slot: boolean): string {
  const kept = bytes(p.bytes, { iec: true, dp: 1 });
  if (!slot) return `At tick ${p.tick} with no slot the source keeps ${kept} of log for its own recovery. ${p.resumable ? 'The reader can still resume.' : 'The reader\'s position has been recycled: it cannot resume and needs a new snapshot.'}`;
  return `At tick ${p.tick} the source keeps ${kept} of log (${plural(p.retainedRecords, 'record')}), everything after the reader's saved position at ${plural(p.saved, 'record')}.${p.overBudget ? ' That is over the disk budget.' : ''}`;
}

export const traceLine = (row: TraceRow<Msg>): string => {
  const what = row.payload ? labelOf(row.payload) : (row.detail ?? row.kind);
  const route = row.from && row.to ? `${row.from} to ${row.to}` : (row.node ?? '');
  return `${row.t} ms ${row.kind}${route ? ` ${route}` : ''}: ${what}${row.reason ? ` (${row.reason})` : ''}`;
};

