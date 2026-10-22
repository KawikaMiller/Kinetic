import type { ReactNode } from 'react';
import { decimal, integer } from '../../core/format';
import { PROCS, type Bit, type SeedRun } from './onePhase';
import { DELIVERIES_PER_ROUND, type Prop, type RoundChoices, type RoundOutcome } from './rounds';
import type { Session, SessionVerdict, Setup } from './session';
import type { Valency } from './valency';

const joinWords = (xs: string[]) => xs.join(', ');

/** What scene 1 says about the configuration, as one function of the model: a finished run is not called bivalent. */
export function configurationView(a: { valency: Valency; terminal: boolean; decisions: readonly (Bit | null)[] }): {
  chip: string;
  tone: string;
  stat: string;
  color: string;
  sub: (states: number) => string;
} {
  const decided = a.decisions.filter((d): d is Bit => d !== null);
  if (a.terminal && decided.length > 0) {
    const agreed = decided.every((d) => d === decided[0]);
    const list = a.decisions.map((d, i) => `${PROCS[i]} ${d ?? 'undecided'}`).join(', ');
    return {
      chip: agreed ? `finished: nothing left to deliver, decisions ${list}` : `finished with a disagreement: ${list}`,
      tone: agreed ? 'tone-ok' : 'tone-bad',
      stat: 'finished',
      color: agreed ? 'var(--ok)' : 'var(--bad)',
      sub: () => 'nothing left to deliver',
    };
  }
  const sub = (states: number) => `valency over ${integer(states)} reachable configurations`;
  switch (a.valency) {
    case 'bivalent':
      return { chip: 'bivalent: runs from here can reach a decision of 0 and a decision of 1', tone: 'tone-violet', stat: 'bivalent', color: 'var(--violet)', sub };
    case '0-valent':
      return { chip: '0-valent: every decision reachable from here is 0', tone: 'tone-info', stat: '0-valent', color: 'var(--info)', sub };
    case '1-valent':
      return { chip: '1-valent: every decision reachable from here is 1', tone: 'tone-info', stat: '1-valent', color: 'var(--info)', sub };
    default:
      return { chip: 'no decision can be reached from here', tone: 'tone-dim', stat: 'no decision reachable', color: 'var(--dim)', sub };
  }
}

/** Scene 1: the configuration, in words that come from the same session. */
export function decideCaption(a: {
  setup: Setup;
  session: Session;
  valency: Valency;
  disagreementReachable: boolean;
  verdict: SessionVerdict;
  decisions: (Bit | null)[];
  terminal: boolean;
}): ReactNode {
  const { setup, valency, disagreementReachable, verdict, decisions, session } = a;
  const inputs = setup.inputs.join(' ');
  const decided = decisions.map((d, i) => (d === null ? null : `${PROCS[i]} decided ${d}`)).filter((t): t is string => t !== null);
  const protocol = setup.mode === 'one' ? 'Each process decides on the first message it hears' : 'Each process waits to hear both others';
  if (verdict.broken) {
    return (
      <>
        <span className="hl bad wrap">{verdict.broken}</span> after {session.deliveries} deliver{session.deliveries === 1 ? 'y' : 'ies'}: {joinWords(decided)}. The network, not the protocol, picked which message each process heard first.
      </>
    );
  }
  if (verdict.stuck) {
    return (
      <>
        {verdict.undecided.join(' and ')} did not decide within {session.deliveries} deliveries, and every message that could still arrive has: the rest are {PROCS[setup.silent ?? 0]}'s, held back in this run: the adversary never delivers them. A process cannot tell a crashed {PROCS[setup.silent ?? 0]} from a slow one.
      </>
    );
  }
  if (a.terminal && decided.length > 0) {
    return (
      <>
        {protocol}. Inputs {inputs}: everything has been delivered after {session.deliveries} deliver{session.deliveries === 1 ? 'y' : 'ies'}, {joinWords(decided)}. This run is finished, so it has no valency left to talk about.
      </>
    );
  }
  return (
    <>
      {protocol}. Inputs {inputs}, {session.deliveries === 0 ? 'nothing delivered yet' : `${session.deliveries} deliver${session.deliveries === 1 ? 'y' : 'ies'} so far`}
      {decided.length > 0 ? <>, {joinWords(decided)}</> : null}. This configuration is <span className={`hl wrap ${valency === 'bivalent' ? 'violet' : 'info'}`}>{valency}</span>
      {disagreementReachable ? <>, and a disagreement is still <span className="hl bad wrap">reachable</span>.</> : <>, and no disagreement is reachable from here.</>}
    </>
  );
}

const propText = (p: Prop) => (p === null ? '⊥' : String(p));

/** Scene 2. */
export function cycleCaption(a: {
  inputs: readonly Bit[];
  choices: RoundChoices | null;
  run: { rounds: RoundOutcome[]; decidedIn: number | null } | null;
  same: boolean | null;
  repeats: number | null;
  cycling: number;
}): ReactNode {
  const start = a.inputs.join(' ');
  if (!a.choices) {
    return <>Pick two messages for every process in both phases, or press Assist. A process takes exactly two of the three messages; the scheduler decides which two. Inputs {start}.</>;
  }
  if (!a.run || a.run.rounds.length === 0) {
    return <>Every cell holds two picks: the round is {DELIVERIES_PER_ROUND} deliveries. Press Play round to run it from inputs {start}.</>;
  }
  const last = a.run.rounds[a.run.rounds.length - 1];
  const rounds = a.run.rounds.length;
  const proposals = last.proposals.map(propText).join(' ');
  if (a.run.decidedIn !== null) {
    return <>A process <span className="hl ok wrap">decided</span> in round {a.run.decidedIn}: decisions {last.after.decision.map((d) => d ?? '–').join(' ')}. Proposals were {proposals} in the last round (⊥ means the two estimates taken differed).</>;
  }
  return (
    <>
      Round {rounds}: proposals {proposals}, nobody decided, estimates {last.after.est.join(' ')}
      {a.same ? <>, the <span className="hl amber wrap">same configuration</span> as the start. {rounds * DELIVERIES_PER_ROUND} deliveries so far and no decision: each repetition is a legal schedule.</> : <>, a different configuration from the start ({start}).</>}
    </>
  );
}

/** Scene 3's opening sentence, plain text: the trace player's frame 0 shows it, so the caption never reads "start". */
export const escapeStartText = (a: { inputs: readonly Bit[]; failing: number; seeds: number; deliveries: number }): string =>
  `Timeout protocol, inputs ${a.inputs.join(' ')}, nobody has decided yet. It breaks agreement on ${a.failing} of ${a.seeds} seeds, and the shortest breaking schedule takes ${a.deliveries} deliveries: step through it.`;

/** Scene 3. */
export function escapeCaption(a: {
  seed: number;
  run: SeedRun;
  failing: number;
  lowest: number;
  deliveries: number;
  coin: boolean;
  exact: number[];
  plainDecided: number | null;
}): ReactNode {
  const { run } = a;
  return (
    <>
      Timeout protocol, seed {a.seed}: inputs {run.inputs.join(' ')}, decisions {run.decisions.map((d) => d ?? '–').join(' ')}
      {run.broken ? <>: <span className="hl bad wrap">{run.broken}</span></> : <>: <span className="hl ok wrap">agreement held</span></>}. It breaks agreement on {a.failing} of 200 seeds, and the shortest breaking schedule takes {a.deliveries} deliveries.{' '}
      {a.coin ? (
        <>With fair coins the same schedule leaves nobody decided after round 4 with probability {decimal(a.exact[3], 4)}.</>
      ) : (
        <>Without a coin that schedule {a.plainDecided === null ? 'leaves everyone undecided in the rounds replayed' : `decides in round ${a.plainDecided}`}.</>
      )}
    </>
  );
}
