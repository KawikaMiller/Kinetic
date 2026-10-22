/**
 * paxos: the lesson's configurations of the kit's single-decree Paxos fixture (core/fixtures/paxosProtocol), and what
 * "chosen" means in words. One protocol, written once: the explorer, the interactive pool and the seeded harness all call
 * the same `onMessage` and `onTimeout`.
 */
import { atMostOneChosen, chosenValues, majority, paxosProtocol, type AcceptorState, type PaxosConfig, type PaxosMsg, type PaxosState, type ProposerState } from '../../core/fixtures/paxosProtocol';
import type { PureProtocol } from '../../core/pureProtocol';

export { atMostOneChosen, chosenValues, majority, paxosProtocol };
export type { AcceptorState, PaxosConfig, PaxosMsg, PaxosState, ProposerState };

export const ACCEPTORS = ['a1', 'a2', 'a3'] as const;
export const ACCEPTOR_COUNT = ACCEPTORS.length;
export const PROPOSERS = ['P1', 'P2'] as const;
export const VALUE_OF: Record<string, string> = { P1: 'A', P2: 'B' };
/** P1 runs the odd ballots and P2 the even ones, so ballot numbers are unique across proposers. */
export const BALLOT_COUNT = 3;

export type Bug = 'none' | 'acceptBelowPromise' | 'ignorePromised';
export const BUGS: { value: Bug; label: string }[] = [
  { value: 'none', label: 'Correct protocol' },
  { value: 'acceptBelowPromise', label: 'Acceptor accepts below its promise' },
  { value: 'ignorePromised', label: 'Proposer ignores promised values' },
];

/** The ballots a proposer runs: P1 1, 3, 5 ... and P2 2, 4, 6 ... (`count` each). */
export const ballotsOf = (proposer: 'P1' | 'P2', count: number): number[] => Array.from({ length: count }, (_, k) => 2 * k + (proposer === 'P1' ? 1 : 2));

/** How many ballots each proposer runs. */
export interface BallotCounts {
  P1: number;
  P2: number;
}
/** The exhaustive search at 2 ballots (P1 runs 1, P2 runs 2) and at 3 (P1 runs 1 and 3). */
export const TWO_BALLOTS: BallotCounts = { P1: 1, P2: 1 };
export const THREE_BALLOTS: BallotCounts = { P1: 2, P2: 1 };
/** The interactive and seeded runs: three ballots each. */
export const RETRY_BALLOTS: BallotCounts = { P1: BALLOT_COUNT, P2: BALLOT_COUNT };

/** The lesson's configuration: three acceptors, P1 wanting A and P2 wanting B, optionally with a planted bug. */
export function configFor(counts: BallotCounts, bug: Bug = 'none'): PaxosConfig {
  return {
    acceptors: ACCEPTORS,
    proposers: [
      { id: 'P1', ballots: ballotsOf('P1', counts.P1), value: 'A' },
      { id: 'P2', ballots: ballotsOf('P2', counts.P2), value: 'B' },
    ],
    ...(bug === 'acceptBelowPromise' ? { acceptBelowPromise: true } : {}),
    ...(bug === 'ignorePromised' ? { ignorePromised: true } : {}),
  };
}

export const protocolFor = (config: PaxosConfig): PureProtocol<PaxosState, PaxosMsg> => paxosProtocol(config);

export const isAcceptor = (s: PaxosState): s is AcceptorState => s.kind === 'acceptor';
export const isProposer = (s: PaxosState): s is ProposerState => s.kind === 'proposer';

export interface Chosen {
  ballot: number;
  value: string;
}

/** Which (ballot, value) pairs a majority of acceptors voted for. */
export function chosenPairs(states: Record<string, PaxosState>): Chosen[] {
  const tally = new Map<string, number>();
  for (const a of ACCEPTORS) {
    const s = states[a];
    if (!isAcceptor(s)) continue;
    for (const [b, v] of s.votes) tally.set(`${b}|${v}`, (tally.get(`${b}|${v}`) ?? 0) + 1);
  }
  return [...tally]
    .filter(([, n]) => n >= majority(ACCEPTOR_COUNT))
    .map(([key]) => ({ ballot: Number(key.split('|')[0]), value: key.split('|')[1] }))
    .sort((x, y) => x.ballot - y.ballot);
}

/** "chosen: none", "chosen: A at ballot 1", "chosen: A at ballot 1, B at ballot 2". */
export function chosenText(states: Record<string, PaxosState>): string {
  const pairs = chosenPairs(states);
  return pairs.length === 0 ? 'chosen: none' : `chosen: ${pairs.map((c) => `${c.value} at ballot ${c.ballot}`).join(', ')}`;
}

export function describeMessage(m: PaxosMsg): string {
  return m.type === 'prepare' ? `Prepare(${m.ballot})` : m.type === 'accept' ? `Accept(${m.ballot}, ${m.value})` : `Promise(${m.ballot}${m.votedBallot > 0 ? `, voted ${m.votedBallot} ${m.votedValue}` : ', no vote'})`;
}
