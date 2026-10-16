/**
 * What the three tables and the ladder diagram show of a run at one moment, read from the run's own records.
 * Pure, so a test can pin a row against the model.
 */
import type { SeqActor } from '../../core/sequenceLayout';
import { toSequence, type TraceRow } from '../../core/distSim';
import { BROKER, CONSUMER, DB, RELAY, SVC, type OMsg, type OutboxRun } from './outbox';

export const ACTORS: SeqActor[] = [
  { id: 'client', label: 'client' },
  { id: SVC, label: 'service' },
  { id: DB, label: 'database' },
  { id: RELAY, label: 'relay' },
  { id: BROKER, label: 'broker' },
  { id: CONSUMER, label: 'consumer' },
];

export const msgLabel = (p: OMsg): string => {
  switch (p.type) {
    case 'place': return `place order ${p.order}`;
    case 'write': return p.outbox ? `write order ${p.order} + outbox row` : `write order ${p.order}`;
    case 'committed': return `committed ${p.order}`;
    case 'publish': return `publish OrderPlaced ${p.order}`;
    case 'published': return `published ${p.order}`;
    case 'deliver': return `deliver ${p.order}`;
    case 'poll': return 'poll';
    case 'rows': return `rows: ${p.rows.map((r) => r.id).join(', ') || 'none'}`;
    case 'mark': return `mark ${p.id} sent`;
  }
};

/** A trace without the relay's empty polls: a poll that found nothing is thirty arrows of noise. */
export function storyTrace(trace: readonly TraceRow<OMsg>[]): TraceRow<OMsg>[] {
  const quiet = new Set<number>();
  for (const r of trace) if (r.payload && (r.payload.type === 'poll' || (r.payload.type === 'rows' && r.payload.rows.length === 0)) && r.msgId !== undefined) quiet.add(r.msgId);
  return trace.filter((r) => !(r.msgId !== undefined && quiet.has(r.msgId))).filter((r) => r.kind !== 'timer');
}

export function sequenceAt(run: OutboxRun, now: number) {
  return toSequence(storyTrace(run.cluster.trace).filter((r) => r.t <= now), { actors: ACTORS, label: msgLabel, events: true });
}

export type OutboxRowState = 'open' | 'unsent' | 'sent';
export interface TableState {
  orders: { order: number; amount: number }[];
  outbox: { id: number; order: number; state: OutboxRowState }[];
  /** Per order, how many times its effect has been applied, and how many repeats the inbox ignored. */
  effects: { order: number; applied: number; ignored: number }[];
  published: number;
}

export function stateAt(run: OutboxRun, now: number): TableState {
  const orderIds = [...new Set(run.handled.filter((h) => h.at <= now).map((h) => h.order))];
  return {
    orders: run.orders.filter((o) => o.at <= now).map((o) => ({ order: o.order, amount: o.amount })),
    outbox: run.outbox.filter((r) => r.createdAt <= now).map((r) => ({
      id: r.id,
      order: r.order,
      state: r.committedAt === null || r.committedAt > now ? ('open' as const) : r.sentAt !== null && r.sentAt <= now ? ('sent' as const) : ('unsent' as const),
    })),
    effects: orderIds.map((order) => {
      const mine = run.handled.filter((h) => h.order === order && h.at <= now);
      return { order, applied: mine.filter((h) => h.applied).length, ignored: mine.filter((h) => !h.applied).length };
    }),
    published: run.published.filter((p) => p.at <= now).length,
  };
}
