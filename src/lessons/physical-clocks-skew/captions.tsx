import type { ReactNode } from 'react';
import { sig } from '../distributions/fmt';
import { POLLS_SHOWN, UNSYNCED_HORIZON_MS, type SyncMode } from './clocks';
import { NODE_NAMES, pollSecondsOf, type DriftState, type DriftView } from './drift';
import { absTimeText, signedMs, timeText } from './format';
import { LEASE_END_MS, type LeaseRun } from './lease';
import type { LogLine } from './orderLog';
import { CAUSAL_CHAIN } from './orderLog';

const HOUR_MS = 3_600_000;

/** Scene 1: the drift plot, in words that come from the same series. */
export function driftCaption(s: DriftState, v: DriftView): ReactNode {
  const name = NODE_NAMES[s.node];
  const ppm = v.clock.driftPpm;
  const day = <><span className="hl info">{name}</span> drifts {signedMs(v.perDayMs)} a day ({ppm} ppm; 1 ppm is 86.4 ms a day)</>;
  if (s.mode === 'off') {
    const end = v.series[s.node].at(-1)!.skew;
    return (
      <>
        With no sync nothing pulls the clocks back toward true time. {day}, so after {UNSYNCED_HORIZON_MS / HOUR_MS} hours its skew is {timeText(end)}.
      </>
    );
  }
  const how = s.mode === 'step' ? 'a step jumps the clock (and can move it backwards)' : 'a slew changes only how fast the clock runs';
  return (
    <>
      {name} syncs every {pollSecondsOf(s)} s over the next {POLLS_SHOWN} polls: between syncs its error grows at its drift rate, so it peaks near drift × poll = {absTimeText(v.driftTimesPollMs)}, and {how}.
      {v.asymmetryMs === 0 ? ' ' : <> The path adds {signedMs(v.asymmetryMs)} that no sync removes. </>}The worst error in the second half of the window is {absTimeText(v.worst)} over all five nodes.
    </>
  );
}

/** Scene 1: the exchange panel. */
export function exchangeCaption(v: DriftView, forwardMs: number, returnMs: number): ReactNode {
  const e = v.exchange;
  return (
    <>
      One exchange: θ = ((t1 − t0) + (t2 − t3)) / 2 = {signedMs(e.theta)} and δ = (t3 − t0) − (t2 − t1) = {sig(e.delta, 4)} ms. The estimate is off by {signedMs(v.exchangeError)}; with a forward delay of {forwardMs} ms and a return delay of {returnMs} ms,
      NTP's symmetric-path assumption alone gives (forward − return) / 2 = {signedMs(v.asymmetryMs)}.
    </>
  );
}

export const SYNC_LABEL: Record<SyncMode, string> = { off: 'No sync', step: 'Step', slew: 'Slew' };

/** Scene 2, last-write-wins. */
export function lwwCaption(a: { stamp1: number | undefined; stamp2: number | undefined; winner: number; offsetA: number; offsetB: number; held: boolean }): ReactNode {
  const stamped = a.stamp1 !== undefined && a.stamp2 !== undefined;
  return (
    <>
      A's clock is {signedMs(a.offsetA)} and B's is {signedMs(a.offsetB)}.{' '}
      {stamped ? <>Write 1 was stamped {sig(a.stamp1!, 8)} ms and write 2, which began after write 1 was acknowledged, {sig(a.stamp2!, 8)} ms. </> : null}
      {a.held ? <>Both replicas keep <span className="hl ok">x = {a.winner}</span>, the later write.</> : <>Both replicas keep <span className="hl bad">x = {a.winner}</span>: the earlier write wins because its stamp is larger.</>}
    </>
  );
}

/** Scene 2, the lease. */
export function leaseCaption(run: LeaseRun, a: { offsetMs: number; marginMs: number; believedEndMs: number }): ReactNode {
  return (
    <>
      The lease ends at {LEASE_END_MS / 1000} s on the server's clock. A holder whose clock is {signedMs(a.offsetMs)} off and that stops {timeText(a.marginMs)} early believes in it until true time {sig(a.believedEndMs / 1000, 5)} s.{' '}
      {run.overlap ? (
        <><span className="hl bad">Two holders</span> from {sig(run.overlap.from / 1000, 5)} s to {sig(run.overlap.to / 1000, 5)} s: {timeText(run.overlap.to - run.overlap.from)} in which both believe.</>
      ) : (
        <><span className="hl ok">No two holders</span> in this run: the old holder let go before the lease was given to the next node.</>
      )}
    </>
  );
}

/** Scene 2, the log. */
export function logCaption(merged: readonly LogLine[], offsetB: number): ReactNode {
  const order = merged.map((l) => l.text);
  const inOrder = CAUSAL_CHAIN.every((t, i) => order.indexOf(t) === i);
  return (
    <>
      b's clock is {signedMs(offsetB)}. Merged by timestamp the log reads: {order.join(', then ')}.{' '}
      {inOrder ? <span className="hl ok">Cause before effect.</span> : <span className="hl bad">An effect sorts before its cause.</span>}
    </>
  );
}

/** Scene 3. */
export function intervalCaption(a: { epsilonMs: number; share: number; waitMs: number; winner: number | null; errorMs: number; commitWait: boolean }): ReactNode {
  const pastEpsilon = a.errorMs > a.epsilonMs;
  return (
    <>
      With ε = {a.epsilonMs} ms two events are ordered only when they are more than 2ε = {2 * a.epsilonMs} ms apart: {sig(a.share * 100, 3)}% of the sampled pairs. {a.commitWait ? <>Commit wait adds {a.waitMs} ms to every write. </> : <>Without commit wait writes pay nothing and keep their raw stamps. </>}
      {a.winner === null ? null : a.winner === 2 ? (
        <>With A's clock {a.errorMs} ms off, write 2 <span className="hl ok">wins</span>{pastEpsilon && a.commitWait ? <>, but A is past ε = {a.epsilonMs} ms, so the guarantee no longer covers it</> : null}.</>
      ) : (
        <>
          With A's clock {a.errorMs} ms off, write 1 <span className="hl bad">wins</span> although it was acknowledged first
          {a.commitWait ? <>: A is off by more than ε = {a.epsilonMs} ms, and the guarantee holds only while every clock is within ε</> : <>: with commit wait off the raw stamps decide, and A's stamp is {a.errorMs} ms ahead of true time</>}.
        </>
      )}
    </>
  );
}
