/**
 * The client-operation log: what a client asked of a replicated store and how each request
 * ended. A node records one `OpRecord` when a request reaches it and settles it when it answers,
 * refuses or never gets to; `historyOf` turns the log into the `RegisterOp` list the register
 * checkers in `invariants.ts` (`linearizable`, `sequential`, `causal`, `convergent`) take.
 */
import type { RegisterOp } from './invariants';

export type OpOutcome = 'ok' | 'refused' | 'open';

/**
 * One request as a client saw it. `invoke` and `response` are true times in simulated ms.
 * `outcome` says how it ended: `ok` (answered), `refused` (the store said no, e.g. a timeout
 * without a quorum) or `open` (still running, or it never got an answer). `response` is null
 * until the request is answered or refused.
 */
export interface OpRecord<V = unknown, N extends string = string> {
  /** The request's id: its position in the scenario's script. */
  op: number;
  kind: 'write' | 'read';
  client: string;
  /** The replica that took the request. */
  node: N;
  /** Which register (default: the one register). */
  key?: string;
  invoke: number;
  response: number | null;
  outcome: OpOutcome;
  /** A write's value, or what a read returned (null for a read that got no answer). */
  value: V | null;
}

/** Close a request: it ends `outcome` at time `response`, and a read's `value` is what it returned. */
export function settleOp<V>(
  record: OpRecord<V>,
  response: number,
  outcome: Exclude<OpOutcome, 'open'>,
  value: V | null = record.value,
): void {
  record.response = response;
  record.outcome = outcome;
  record.value = value;
}

/** What the client waited, sent to answered, ms; null if it was never answered. */
export const latencyOf = (op: OpRecord): number | null => (op.response === null ? null : op.response - op.invoke);

/**
 * The register history the clients saw, for `linearizable` and the other checkers. An answered
 * request keeps its times. A refused or still-open write may or may not have taken effect, so it
 * stays in the history as one that never answered (`response` is Infinity: it overlaps everything
 * after it). A refused or open read tells the client nothing and is left out.
 */
export function historyOf<V>(ops: readonly OpRecord<V>[]): RegisterOp<V>[] {
  return ops.flatMap((o): RegisterOp<V>[] => {
    const { value } = o;
    if (value === null) return [];
    const base = { process: o.client, kind: o.kind, value, invoke: o.invoke, ...(o.key === undefined ? {} : { key: o.key }) };
    if (o.outcome === 'ok' && o.response !== null) return [{ ...base, response: o.response }];
    return o.kind === 'write' ? [{ ...base, response: Infinity }] : [];
  });
}
