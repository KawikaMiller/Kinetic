import type { ReactNode } from 'react';
import { decimal, integer } from '../../core/format';
import { chosenPairs, chosenText, type PaxosState } from './protocol';
import type { Session } from './session';

/** Scene 1: what the last move did and what is chosen, from the session. */
export function poolCaption(a: { session: Session; steps: number; refusal: string | null; bugLabel: string | null }): ReactNode {
  const { session } = a;
  const chosen = chosenPairs(session.nodes);
  const verdict = chosen.length > 1
    ? <span className="hl bad">two values chosen: {chosen.map((c) => c.value).join(', ')}</span>
    : chosen.length === 1
      ? <span className="hl ok">{chosenText(session.nodes)}</span>
      : <>{chosenText(session.nodes)}</>;
  return (
    <>
      {a.refusal ? <span className="hl bad">{a.refusal}</span> : <>Step {a.steps}: {session.note}.</>} {verdict}. {session.pool.length} message{session.pool.length === 1 ? '' : 's'} in flight.
      {a.bugLabel ? <> A planted bug is on: {a.bugLabel}.</> : null}
    </>
  );
}

/** Scene 2: the duel and the liveness panel. */
export function duelCaption(a: { ballots: number; steps: number; votes: number; stopped: boolean; value: string | null; decided: number; seeds: number; median: number | null }): ReactNode {
  return (
    <>
      Scripted schedule, replayed through the protocol: {a.ballots} ballots, {a.steps} steps and {a.votes} votes cast, so no value is chosen in these {a.steps} steps. This says nothing about what happens after the adversary stops.{' '}
      {a.stopped
        ? <>Stopped: the last Accept lands and <span className="hl ok">{a.value} is chosen</span>.</>
        : <>Press Stop duelling to deliver the last Accept.</>}{' '}
      Random schedules decided on {a.decided} of {a.seeds} seeds{a.median === null ? '' : `, median ${decimal(a.median, 1)} ms`}; that is a measurement, not a guarantee.
    </>
  );
}

/** Scene 3: the counting model. */
export function multiCaption(a: { values: number; single: number; stable: number; crashAfter: number | null; rerun: boolean }): ReactNode {
  return (
    <>
      {a.values} value{a.values === 1 ? '' : 's'}: single-decree Paxos uses {integer(a.single)} messages in this counting model, a stable proposer {integer(a.stable)}.
      {a.crashAfter !== null ? (a.rerun ? <> The proposer crashes after value {a.crashAfter}, so the next one runs phase 1 again.</> : <> The crash after value {a.crashAfter} costs nothing here: no value is left to decide.</>) : null} Counting model, not a measurement of any system.
    </>
  );
}

/** A promise or vote line for a state panel. */
export const acceptorLine = (s: PaxosState): string =>
  s.kind === 'acceptor' ? `promised ${s.promised}, ${s.votes.length === 0 ? 'no vote' : `last vote ${s.votes[s.votes.length - 1][0]} ${s.votes[s.votes.length - 1][1]}`}` : '';
