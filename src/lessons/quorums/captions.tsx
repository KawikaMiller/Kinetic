import type { ReactNode } from 'react';
import { canGather, failuresTolerated, missProbability, missingPairs, type WaitStats } from './quorum';
import { sharedNow, type SetsState } from './sets';
import { TIMEOUT_MS, type StoreOp } from './store';
import type { Schedule, StoreRun } from './storeView';
import { pctText, sig } from '../../core/format';

/** 1st, 2nd, 3rd, 4th. */
const ordinal = (k: number): string => `${k}${['th', 'st', 'nd', 'rd'][k % 100 > 10 && k % 100 < 14 ? 0 : k % 10 < 4 ? k % 10 : 0]}`;
const count = (n: bigint): string => n.toLocaleString('en-US');
const NAMES = 'ABCDEFG';
const letters = (xs: readonly number[]): string => xs.map((i) => NAMES[i]).join(', ');

/** Scene 1: the counting for the current N, W and R, and the outcome of the last read. */
export function setsCaption(s: SetsState): ReactNode {
  const q = { n: s.n, w: s.w, r: s.r };
  const { missing, total } = missingPairs(q);
  const shared = sharedNow(s);
  return (
    <>
      N = {s.n}, W = {s.w}, R = {s.r}: R + W = {s.r + s.w}, {s.r + s.w > s.n ? <><span className="hl ok">more than N</span>, so every write set and read set share at least {s.r + s.w - s.n} {s.r + s.w - s.n === 1 ? 'replica' : 'replicas'}.</> : <><span className="hl bad">not more than N</span>, so {count(missing)} of the {count(total)} pairs of sets miss each other, and a random read set misses a given write set {pctText(missProbability(q), 1)} of the time.</>}
      {s.writeSet.length === s.w && s.readSet.length === s.r ? <> The sets you picked {shared.length > 0 ? <>share <span className="hl">{letters(shared)}</span>.</> : <><span className="hl bad">share no replica</span>.</>}</> : null}
      {s.lastRead ? <> The last read returned version {s.lastRead.returned} while the latest is {s.lastRead.latest}: {s.lastRead.returned < s.lastRead.latest ? <span className="hl bad">stale</span> : <span className="hl ok">fresh</span>}.</> : null}
    </>
  );
}

/** Scene 2: what the crashed and cut-off replicas do to a write and a read, from the arithmetic and from the simulation. */
export function availabilityCaption(a: { n: number; w: number; r: number; unreachable: number; write: StoreOp; read: StoreOp }): ReactNode {
  const took = (op: StoreOp) => op.response! - op.invoke;
  const outcome = (op: StoreOp) => (op.outcome === 'ok' ? <span className="hl ok">completes in {took(op)} ms</span> : <span className="hl bad">no quorum after {took(op)} ms</span>);
  return (
    <>
      With {a.unreachable} of {a.n} replicas unreachable, a write needs {a.w} replies and {a.n - a.unreachable} can answer: {outcome(a.write)}. A read needs {a.r} and {outcome(a.read)}. A write survives {failuresTolerated(a.n, a.w)} failures and a read {failuresTolerated(a.n, a.r)}.
      {canGather(a.n, a.unreachable, a.w) === (a.write.outcome === 'ok') ? '' : ' (the simulation disagrees with the arithmetic)'}
    </>
  );
}

/** Scene 2: the latency of waiting for the W-th reply. */
export function latencyCaption(a: { n: number; w: number; rows: readonly WaitStats[]; kth: { formula: number; sim: number } }): ReactNode {
  const row = a.rows[a.w - 1];
  const first = a.rows[0];
  return (
    <>
      An operation waits for the {ordinal(a.w)} fastest of {a.n} replies: p50 {sig(row.p50, 3)} ms and p99 {sig(row.p99, 3)} ms, against {sig(first.p50, 3)} ms and {sig(first.p99, 3)} ms for the fastest reply alone. With exponential latencies of mean 1 the expected wait is{' '}
      {sig(a.kth.formula, 4)} by the formula and {sig(a.kth.sim, 4)} in simulation.
    </>
  );
}

/** Scene 3: the run on screen. */
export function storeCaption(a: { schedule: Schedule; run: StoreRun; w: number; r: number; sloppy: boolean; t: number }): ReactNode {
  const { run } = a;
  const shown = run.ops.filter((o) => o.invoke <= a.t);
  const refusedThenSeen = run.ops.find((w) => w.kind === 'write' && w.outcome === 'refused' && run.ops.some((r) => r.kind === 'read' && r.outcome === 'ok' && r.invoke > w.response! && r.value! >= w.value!));
  const acked = shown.filter((o) => o.kind === 'write' && o.outcome === 'ok' && o.response !== null && o.response <= a.t).length;
  return (
    <>
      W = {a.w}, R = {a.r}{a.sloppy ? ', sloppy' : ''}: at {a.t} ms {acked} {acked === 1 ? 'write is' : 'writes are'} acknowledged. For the whole run the acknowledged-write invariant {run.invariant ? <span className="hl bad wrap">fails: {run.invariant}</span> : <span className="hl ok">holds</span>}
      {' '}and the history is {run.linearizable ? <span className="hl bad">not linearizable</span> : <span className="hl ok">linearizable</span>}.
      {run.ops.some((o) => o.outcome === 'refused') ? <> An operation that gathers no quorum ends "no quorum" {TIMEOUT_MS} ms after it began.</> : null}
      {refusedThenSeen ? <> The write that ended "no quorum" was refused, not undone: a copy had already reached a replica, and once the cut heals a read returns it. A refused write is indeterminate.</> : null}
      {run.open > 0 ? <> {run.open} {run.open === 1 ? 'operation is' : 'operations are'} still waiting when the run stops and {run.open === 1 ? 'is' : 'are'} left out of the history, so "linearizable" speaks only for the finished ones.</> : null}
    </>
  );
}
