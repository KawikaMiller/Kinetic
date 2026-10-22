/**
 * Single-decree Paxos as a `PureProtocol` (the K4-2 spike and gate fixture; a lesson may import
 * it or copy its shape). Acceptors promise and vote; each proposer runs its own ballots in
 * order, adopting the value of the highest-ballot vote among the promises it collected.
 *
 * Simplifications, all stated so a lesson can repeat them: acceptors do not reply to a
 * rejected Prepare or Accept (a silent ignore), and an accepted vote is not announced: a value
 * is "chosen" when a majority of acceptors have voted for the same (ballot, value), read from
 * the acceptors' vote histories, as the usual TLA+ formulation does.
 *
 * Two planted bugs share the same code, for broken-mode demos and for tests:
 * - `acceptBelowPromise`: an acceptor accepts any ballot, ignoring what it promised.
 * - `ignorePromised`: a proposer proposes its own value, ignoring votes reported in promises.
 */
import type { PureProtocol } from '../pureProtocol';

export interface PaxosProposer {
  id: string;
  /** Ballots it will run, in order. Ballots are positive and unique across proposers. */
  ballots: readonly number[];
  value: string;
}

export interface PaxosConfig {
  acceptors: readonly string[];
  proposers: readonly PaxosProposer[];
  acceptBelowPromise?: boolean;
  ignorePromised?: boolean;
}

export interface AcceptorState {
  kind: 'acceptor';
  promised: number;
  /** Every vote cast, as [ballot, value], in order. The last one is the current vote. */
  votes: [number, string][];
}

export interface ProposerState {
  kind: 'proposer';
  /** The ballot in progress (0: none started). */
  ballot: number;
  /** How many of its ballots it has started. */
  started: number;
  phase: 'idle' | 'preparing' | 'accepting';
  /** Promises received for the current ballot: [acceptor, voted ballot, voted value], sorted by acceptor. */
  promises: [string, number, string][];
  /** The value sent in Accept, once chosen for this ballot. */
  proposed: string;
}

export type PaxosState = AcceptorState | ProposerState;

export type PaxosMsg =
  | { type: 'prepare'; ballot: number }
  | { type: 'promise'; ballot: number; votedBallot: number; votedValue: string }
  | { type: 'accept'; ballot: number; value: string };

const NO_VALUE = '';

export const majority = (n: number) => Math.floor(n / 2) + 1;

export function paxosProtocol(config: PaxosConfig): PureProtocol<PaxosState, PaxosMsg> {
  const need = majority(config.acceptors.length);
  const proposer = (id: string) => config.proposers.find((p) => p.id === id);
  return {
    nodes: [...config.acceptors, ...config.proposers.map((p) => p.id)],
    init: (id): PaxosState =>
      proposer(id)
        ? { kind: 'proposer', ballot: 0, started: 0, phase: 'idle', promises: [], proposed: NO_VALUE }
        : { kind: 'acceptor', promised: 0, votes: [] },
    describe: (m) => (m.type === 'accept' ? `Accept(${m.ballot}, ${m.value})` : m.type === 'prepare' ? `Prepare(${m.ballot})` : `Promise(${m.ballot})`),
    onTimeout: (id, s) => {
      const p = proposer(id);
      if (!p || s.kind !== 'proposer' || s.started >= p.ballots.length) return null;
      const ballot = p.ballots[s.started];
      return {
        state: { ...s, ballot, started: s.started + 1, phase: 'preparing', promises: [], proposed: NO_VALUE },
        send: config.acceptors.map((to) => ({ to, payload: { type: 'prepare', ballot } })),
      };
    },
    onMessage: (id, s, { from, payload: m }) => {
      if (s.kind === 'acceptor') {
        if (m.type === 'prepare' && m.ballot > s.promised) {
          const last = s.votes[s.votes.length - 1];
          return {
            state: { ...s, promised: m.ballot },
            send: [{ to: from, payload: { type: 'promise', ballot: m.ballot, votedBallot: last ? last[0] : 0, votedValue: last ? last[1] : NO_VALUE } }],
          };
        }
        if (m.type === 'accept' && (config.acceptBelowPromise || m.ballot >= s.promised)) {
          return { state: { ...s, promised: Math.max(s.promised, m.ballot), votes: [...s.votes.filter(([b, v]) => b !== m.ballot || v !== m.value), [m.ballot, m.value]] }, send: [] };
        }
        return { state: s, send: [] };
      }
      const p = proposer(id)!;
      if (m.type !== 'promise' || s.phase !== 'preparing' || m.ballot !== s.ballot || s.promises.some(([a]) => a === from)) return { state: s, send: [] };
      const promises = [...s.promises, [from, m.votedBallot, m.votedValue] as [string, number, string]].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      if (promises.length < need) return { state: { ...s, promises }, send: [] };
      const best = promises.reduce((top, q) => (q[1] > top[1] ? q : top), promises[0]);
      const value = !config.ignorePromised && best[1] > 0 ? best[2] : p.value;
      return {
        state: { ...s, phase: 'accepting', promises: [], proposed: value },
        send: config.acceptors.map((to) => ({ to, payload: { type: 'accept', ballot: s.ballot, value } })),
      };
    },
  };
}

/** Values chosen so far: those a majority of acceptors voted for at one ballot. Brute force over (ballot, value) pairs. */
export function chosenValues(config: PaxosConfig, states: Record<string, PaxosState>): string[] {
  const tally = new Map<string, number>();
  for (const a of config.acceptors) {
    const s = states[a];
    if (s.kind !== 'acceptor') continue;
    for (const key of new Set(s.votes.map(([b, v]) => `${b}\u0000${v}`))) tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const chosen = new Set<string>();
  for (const [key, n] of tally) if (n >= majority(config.acceptors.length)) chosen.add(key.split('\u0000')[1]);
  return [...chosen].sort();
}

/** The safety property: at most one value is chosen. */
export const atMostOneChosen = (config: PaxosConfig) => (states: Record<string, PaxosState>): string | null => {
  const chosen = chosenValues(config, states);
  return chosen.length > 1 ? `two values chosen: ${chosen.join(', ')}` : null;
};

/** The spike's scenario: 3 acceptors, two proposers, one ballot each (1 and 2), values v1 and v2. */
export const SPIKE_CONFIG: PaxosConfig = {
  acceptors: ['a1', 'a2', 'a3'],
  proposers: [
    { id: 'p1', ballots: [1], value: 'v1' },
    { id: 'p2', ballots: [2], value: 'v2' },
  ],
};
