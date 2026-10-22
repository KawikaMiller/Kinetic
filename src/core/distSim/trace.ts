/**
 * The record a distSim cluster leaves behind, and the adapter that turns it into a ladder
 * diagram. A trace is plain data: the same seed always produces the same rows, so a test, a
 * step-player frame and a counterexample shown on screen all read one trace.
 */
import { decimal } from '../format';
import type { SeqActor, SeqMessage } from '../sequenceLayout';

export type TraceKind =
  /** A node handed a message to the network (at its send time). */
  | 'send'
  /** A message reached a live node and its `onMessage` ran (at its delivery time). */
  | 'deliver'
  /** A message was thrown away: `reason` says why. */
  | 'drop'
  /** A timer fired and `onTimer` ran. */
  | 'timer'
  | 'crash'
  | 'restart'
  /** A node stalled (it neither sends nor handles anything until it resumes). */
  | 'pause'
  | 'resume'
  /** A link cut began / healed between two groups of nodes. */
  | 'partition'
  | 'heal';

/** Why a message was dropped. */
export type DropReason = 'loss' | 'partition' | 'dropNext' | 'down';

export interface TraceRow<M = unknown> {
  /**
   * Position in the trace, from 0: unique within a run and the same on every run with that
   * seed, so `${seed}:${id}` is a stable React key for a LogStream row.
   */
  id: number;
  /** True (simulated) time in ms when the row happened. Rows are in non-decreasing `t`. */
  t: number;
  kind: TraceKind;
  /** send, deliver, drop: the message's endpoints. partition, heal: the two groups, joined by "+". */
  from?: string;
  to?: string;
  /** timer, crash, restart, pause, resume: the node. */
  node?: string;
  /** Ties a message's send, deliver and drop rows together (a duplicate shares the original's id). */
  msgId?: number;
  payload?: M;
  reason?: DropReason;
  /** This delivery (or drop) is the network's duplicate copy of the message. */
  dup?: boolean;
  /** timer: the timer id. */
  detail?: string;
}

export interface ToSequenceOptions<M> {
  /** Actors in lane order, with labels; default is every node named in the trace, in order of first appearance. */
  actors?: readonly SeqActor[];
  /** The arrow text for a message (default: the payload's `type` field, else its JSON). */
  label?: (payload: M) => string;
  /** Also draw crash, restart, pause and resume as self-messages on the node's lane (default true). */
  events?: boolean;
  /** Also draw timer firings as self-messages (default false: they bury the messages). */
  timers?: boolean;
  /** Add a note under each arrow with its send and delivery times. */
  times?: boolean;
}

const defaultLabel = (payload: unknown): string => {
  if (payload && typeof payload === 'object' && 'type' in payload && typeof payload.type === 'string') return payload.type;
  const text = JSON.stringify(payload);
  return text === undefined ? String(payload) : text;
};

const SELF_EVENT_LABEL: Partial<Record<TraceKind, string>> = { crash: 'crash', restart: 'restart', pause: 'pause', resume: 'resume' };

/**
 * A trace as `SequenceDiagram` input: one message per `send` (an arrow, stopped with a ✕ when
 * the trace says it was dropped), one more for each duplicate delivery, and a message that
 * arrived with no send row (an `inject`) drawn at its delivery. Message ids are `m<msgId>`
 * (`m<msgId>d` for a duplicate), so a click on an arrow maps back to the trace.
 * Pass `trace.slice(0, n)` to replay the diagram up to row n.
 */
export function toSequence<M>(trace: readonly TraceRow<M>[], o: ToSequenceOptions<M> = {}): { actors: SeqActor[]; messages: SeqMessage[] } {
  const label = (p: M) => (o.label ?? defaultLabel)(p);
  const events = o.events ?? true;
  const messages: SeqMessage[] = [];
  const byMsg = new Map<number, SeqMessage>();
  const sentAt = new Map<number, number>();
  const seen: string[] = [];
  const see = (id: string | undefined) => {
    if (id !== undefined && !seen.includes(id)) seen.push(id);
  };
  const add = (m: SeqMessage, msgId?: number) => {
    messages.push(m);
    if (msgId !== undefined) byMsg.set(msgId, m);
  };

  for (const row of trace) {
    if (row.kind === 'send') {
      see(row.from);
      see(row.to);
      add({ id: `m${row.msgId}`, from: row.from!, to: row.to!, label: label(row.payload as M) }, row.msgId);
      sentAt.set(row.msgId!, row.t);
    } else if (row.kind === 'drop' && row.msgId !== undefined && !row.dup) {
      const m = byMsg.get(row.msgId);
      if (m) m.lost = true;
    } else if (row.kind === 'deliver') {
      see(row.from);
      see(row.to);
      const m = row.msgId === undefined ? undefined : byMsg.get(row.msgId);
      if (row.dup) {
        add({ id: `m${row.msgId}d`, from: row.from!, to: row.to!, label: `${label(row.payload as M)} (duplicate)` });
      } else if (!m) {
        add({ id: `m${row.msgId}`, from: row.from!, to: row.to!, label: label(row.payload as M) }, row.msgId);
      } else if (o.times) {
        m.note = `sent ${decimal(sentAt.get(row.msgId!)!, 1)}ms, arrived ${decimal(row.t, 1)}ms`;
      }
    } else if ((events && row.kind in SELF_EVENT_LABEL) || (o.timers && row.kind === 'timer')) {
      see(row.node);
      add({ id: `r${row.id}`, from: row.node!, to: row.node!, label: row.kind === 'timer' ? `timer ${row.detail}` : SELF_EVENT_LABEL[row.kind]! });
    }
  }

  const actors = o.actors ? [...o.actors] : seen.map((id) => ({ id, label: id }));
  return { actors, messages };
}
