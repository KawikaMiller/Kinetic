/** What a device's own operations are doing: waiting to be sent, on the wire, or acknowledged. Pure. */
import type { TraceRow } from '../../core/distSim';
import type { DeviceState, Msg } from './nodes';
import type { DeviceId } from './ops';

export type Mark = 'pending' | 'inflight' | 'confirmed';

export function opMark(dev: DeviceState, id: string): Mark {
  if (!dev.outbox.includes(id)) return 'confirmed';
  return dev.sent.has(id) ? 'inflight' : 'pending';
}

const RANK: Record<Mark, number> = { confirmed: 0, inflight: 1, pending: 2 };

/** The least settled of the device's own operations that touch the item. */
export function itemMark(dev: DeviceState, itemId: string): Mark {
  let worst: Mark = 'confirmed';
  for (const o of dev.log) {
    if (o.device !== dev.id || (o.item !== itemId && o.id !== itemId)) continue;
    const m = opMark(dev, o.id);
    if (RANK[m] > RANK[worst]) worst = m;
  }
  return worst;
}

export const countMarks = (dev: DeviceState): Record<Mark, number> => ({
  pending: dev.outbox.filter((id) => !dev.sent.has(id)).length,
  inflight: dev.outbox.filter((id) => dev.sent.has(id)).length,
  confirmed: dev.log.filter((o) => o.device === dev.id).length - dev.outbox.length,
});

// ---- the sync loop's attempts, read from the trace ----------------------------------------------

export interface Attempt {
  n: number;
  at: number;
  /** Time since the previous attempt, ms. */
  gap: number | null;
  why: 'edit' | 'timer';
  lost: boolean;
  ops: number;
}

/** Every push a device sent, with whether it was lost and what set it off: an edit, or the retry timer. */
export function pushAttempts(trace: readonly TraceRow<Msg>[], device: DeviceId, editTimes: readonly number[]): Attempt[] {
  const lostIds = new Set(trace.filter((r) => r.kind === 'drop' && !r.dup && r.msgId !== undefined).map((r) => r.msgId));
  const sends = trace.filter((r) => r.kind === 'send' && r.from === device && r.payload?.type === 'push');
  return sends.map((r, i) => ({
    n: i + 1,
    at: r.t,
    gap: i === 0 ? null : r.t - sends[i - 1].t,
    why: editTimes.some((e) => Math.abs(e - r.t) < 1) ? 'edit' : 'timer',
    lost: lostIds.has(r.msgId),
    ops: r.payload?.type === 'push' ? r.payload.ops.length : 0,
  }));
}

/**
 * The waits between one retry-timer push and the next, for the timer pushes the outage swallowed: what backoff changes.
 * A push set off by an edit is not a retry, so it is left out and the wait is measured timer to timer.
 */
export function retryGaps(attempts: readonly Attempt[]): number[] {
  const gaps: number[] = [];
  let previous: Attempt | null = null;
  for (const a of attempts) {
    if (a.why !== 'timer') continue;
    if (previous !== null && a.lost) gaps.push(a.at - previous.at);
    previous = a;
  }
  return gaps;
}

/** The `since` of the first pull a device sent at or after `from`, or null. */
export function firstPullSince(trace: readonly TraceRow<Msg>[], device: DeviceId, from: number): number | null {
  const r = trace.find((x) => x.kind === 'send' && x.from === device && x.t >= from && x.payload?.type === 'pull');
  return r && r.payload?.type === 'pull' ? r.payload.since : null;
}

/** When the first push of `device` sent at or after `from` was delivered and acknowledged, or null. */
export function ackedAfter(trace: readonly TraceRow<Msg>[], device: DeviceId, from: number): number | null {
  const ack = trace.find((x) => x.kind === 'deliver' && x.to === device && x.t >= from && x.payload?.type === 'ack');
  return ack ? ack.t : null;
}
