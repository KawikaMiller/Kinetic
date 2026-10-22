// What the scene draws, and how a distSim run becomes a list of frames: one per visible event.
import type { Cluster, Snapshot, TraceRow } from '../../core/distSim';
import type { NodeId } from './twoPc';

export type { NodeId } from './twoPc';
export type Tone = 'idle' | 'work' | 'ok' | 'bad' | 'hi' | 'violet' | 'dim';

export interface NodeView {
  status: string;
  tone: Tone;
  detail: string;
  lock?: boolean;
  crashed?: boolean;
  hidden?: boolean;
}

export interface StepMsg {
  from: NodeId;
  to: NodeId;
  label: string;
  tone: Tone;
  viaBus?: boolean;
}

export interface Consistency {
  label: string;
  tone: Tone;
}

/** One visible event of a run: the state after it and the messages it sent. */
export interface Step {
  /** Simulated ms of the event. */
  time: number;
  /** The row that caused the frame: a delivery, a timer, a crash or a restart. Null for the opening frame. */
  row: TraceRow<unknown> | null;
  nodes: Record<NodeId, NodeView>;
  msgs: StepMsg[];
  /** Messages sent so far, duplicates and drops included. */
  sent: number;
  locks: number;
  phase: string;
  consistency: Consistency;
  /** How long a participant has been holding its lock waiting for a decision, ms; 0 when none is. */
  stallMs: number;
  /** The safety rule that broke at this event, if one did. */
  violation: string | null;
  /** Numbers a caption quotes (votes in, acks in, the decision): read from the state, never typed. */
  facts: Record<string, number | string | null>;
}

/** A quiet stretch (drops, no-op timers) longer than this still gets a frame, so a long stall shows its clock. */
export const QUIET_GAP_MS = 10_000;

const EVENT_KINDS = new Set(['deliver', 'timer', 'crash', 'restart']);

export interface StepContext<M, S> {
  snap: Snapshot<S>;
  /** The rows this event added to the trace. */
  rows: readonly TraceRow<M>[];
  /** The event row among them; null for the opening frame. */
  row: TraceRow<M> | null;
  /** Messages sent so far. */
  sent: number;
}

const signature = (s: Step) => JSON.stringify([s.nodes, s.phase, s.consistency]);

/**
 * Run `cluster` event by event up to `until` and build a frame for the opening state and wherever something visible
 * happened: a state change, a send, a crash or restart, or the first event after a quiet stretch of QUIET_GAP_MS.
 */
export function walk<M, S>(cluster: Cluster<M, S>, until: number, build: (ctx: StepContext<M, S>) => Step): Step[] {
  cluster.start();
  const steps: Step[] = [build({ snap: cluster.snapshot(), rows: [], row: null, sent: 0 })];
  let seen = cluster.trace.length;
  let sent = 0;
  let lastKept = 0;
  while (cluster.queued > 0 && cluster.nextTime() <= until) {
    cluster.step();
    const rows = cluster.trace.slice(seen);
    seen = cluster.trace.length;
    const row = rows.find((r) => EVENT_KINDS.has(r.kind));
    sent += rows.filter((r) => r.kind === 'send').length;
    if (!row) continue;
    const step = build({ snap: cluster.snapshot(), rows, row, sent });
    const prev = steps[steps.length - 1];
    const visible = step.msgs.length > 0 || signature(step) !== signature(prev) || row.kind === 'crash' || row.kind === 'restart';
    if (!visible && row.t - lastKept < QUIET_GAP_MS) continue;
    steps.push(step);
    lastKept = row.t;
  }
  return steps;
}
