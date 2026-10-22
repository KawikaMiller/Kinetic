import type { ReactNode } from 'react';
import { decimal, integer } from '../../core/format';
import { chosenPairs, chosenText, type PaxosState } from './protocol';
import type { Session } from './session';

/** Scene 1: what the last move did and what is chosen, from the session. */
export function poolCaption(a: { session: Session; steps: number; refusal: string | null; bugLabel: string | null }): ReactNode {
  const { session } = a;
  const chosen = chosenPairs(session.nodes);
  const verdict = chosen.length > 1
    ? <span className="hl bad wrap">two values chosen: {chosen.map((c) => c.value).join(', ')}</span>
    : chosen.length === 1
      ? <span className="hl ok wrap">{chosenText(session.nodes)}</span>
      : <>{chosenText(session.nodes)}</>;
  return (
    <>
      {a.refusal ? <span className="hl bad wrap">{a.refusal}</span> : <>Step {a.steps}: {session.note}.</>} {verdict}. {session.pool.length} message{session.pool.length === 1 ? '' : 's'} in flight.
      {a.bugLabel ? <> A planted bug is on: {a.bugLabel}.</> : null}
    </>
  );
}

/** Scene 2: the duel and the liveness panel. */
export function duelCaption(a: { ballots: number; steps: number; votes: number; stopped: boolean; value: string | null; decided: number; seeds: number; median: number | null }): ReactNode {
  const stoppedWithValue = a.stopped && a.value !== null;
  return (
    <>
      Scripted schedule, replayed through the protocol: {a.ballots} ballots and {a.steps} steps{' '}
      {stoppedWithValue
        ? <>chose no value. Stopped: the last Accept lands, {a.votes} votes are cast and <span className="hl ok wrap">{a.value} is chosen</span>. The scripted steps say nothing about what happens while the adversary keeps duelling.</>
        : <>cast {a.votes} votes, so no value is chosen in these {a.steps} steps. This says nothing about what happens after the adversary stops. Press Stop duelling to deliver the last Accept.</>}{' '}
      Random schedules decided on {a.decided} of {a.seeds} seeds{a.median === null ? '' : `, median ${decimal(a.median, 1)} ms`}; that is a measurement, not a guarantee.
    </>
  );
}

/** The hint under the duel table, from the session counts: an Accept is only refused once it is delivered. */
export function duelHint(a: { stopped: boolean; refused: number; chosen: readonly string[]; pendingAccepts: number; votes: number; steps: number }): string {
  if (a.stopped && a.chosen.length > 0) {
    return `Stopped: ${a.refused} earlier Accept deliveries to a1 and a2 are refused because they promised a higher ballot, and the last ballot's Accept lands: ${a.chosen.join(', ')} is chosen.`;
  }
  return `Each Prepare(b + 1) lands before Accept(b) would, so an Accept(b) delivered to a1 or a2 is refused. ${a.pendingAccepts} Accepts are waiting, none delivered, and ${a.votes} votes have been cast in ${a.steps} steps.`;
}

/** The first line of the shortest-counterexample trace, so the player's frame 0 keeps the scene's sentence and never reads "start". */
export const counterexampleStart = (a: { bugLabel: string | null; steps: number; message: string }): string =>
  `Shortest counterexample${a.bugLabel ? ` under the planted bug "${a.bugLabel}"` : ''}: ${a.steps} steps end in "${a.message}". Step through it.`;

/** Scene 3: the counting model. */
export function multiCaption(a: { values: number; single: number; stable: number; crashAfter: number | null; rerun: boolean }): ReactNode {
  return (
    <>
      {a.values} value{a.values === 1 ? '' : 's'}: single-decree Paxos uses {integer(a.single)} messages in this counting model, a stable proposer {integer(a.stable)}{a.single === a.stable ? ', the same, because one value needs one phase 1 either way' : ''}.
      {a.crashAfter !== null ? (a.rerun ? <> The proposer crashes after value {a.crashAfter}, so the next one runs phase 1 again.</> : a.crashAfter === a.values ? <> The crash after value {a.crashAfter} costs nothing here: no value is left to decide.</> : <> No crash happens here: only {a.values} value{a.values === 1 ? '' : 's'}, and the crash would come after value {a.crashAfter}.</>) : null} Counting model, not a measurement of any system.
    </>
  );
}

/** A promise or vote line for a state panel. */
export const acceptorLine = (s: PaxosState): string =>
  s.kind === 'acceptor' ? `promised ${s.promised}, ${s.votes.length === 0 ? 'no vote' : `last vote ${s.votes[s.votes.length - 1][0]} ${s.votes[s.votes.length - 1][1]}`}` : '';
