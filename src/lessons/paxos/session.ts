/**
 * paxos, scene 1: the learner is the network. A pool of in-flight messages, each with Deliver, Drop and Duplicate, and
 * proposer buttons that start the next ballot. Every step calls the protocol's own `onMessage` and `onTimeout`.
 */
import type { PaxosConfig, PaxosMsg, PaxosState, ProposerState } from './protocol';
import { chosenText, describeMessage, isProposer, majority, ACCEPTOR_COUNT, protocolFor } from './protocol';

export interface PoolMsg {
  /** Unique and stable: replaying the same operations gives the same ids. */
  id: number;
  from: string;
  to: string;
  payload: PaxosMsg;
}

export interface Session {
  config: PaxosConfig;
  nodes: Record<string, PaxosState>;
  pool: PoolMsg[];
  nextId: number;
  /** What the last operation did, in words (a refused Accept names the promise that refused it). */
  note: string;
}

export type Op = { kind: 'start'; proposer: string } | { kind: 'deliver' | 'drop' | 'duplicate'; id: number };

/** The pool holds at most this many messages (duplicates beyond it are refused). */
export const POOL_CAP = 60;

export function initialSession(config: PaxosConfig): Session {
  const protocol = protocolFor(config);
  return { config, nodes: Object.fromEntries(protocol.nodes.map((id) => [id, protocol.init(id)])), pool: [], nextId: 1, note: 'nothing has happened yet' };
}

export type Applied = { ok: true; session: Session } | { ok: false; reason: string };

const withSends = (s: Session, from: string, sends: { to: string; payload: PaxosMsg }[]): { pool: PoolMsg[]; nextId: number } => {
  let id = s.nextId;
  const added = sends.map((m) => ({ id: id++, from, to: m.to, payload: m.payload }));
  return { pool: [...s.pool, ...added], nextId: id };
};

export function applyOp(s: Session, op: Op): Applied {
  const protocol = protocolFor(s.config);
  if (op.kind === 'start') {
    const result = protocol.onTimeout?.(op.proposer, s.nodes[op.proposer]) ?? null;
    if (!result) {
      const ballots = s.config.proposers.find((p) => p.id === op.proposer)?.ballots ?? [];
      return { ok: false, reason: `${op.proposer} has no ballots left in this lesson: it runs ballots ${ballots.join(', ')}.` };
    }
    const next = { ...s.nodes, [op.proposer]: result.state };
    return { ok: true, session: { ...s, nodes: next, ...withSends(s, op.proposer, result.send), note: `${op.proposer} starts ballot ${(result.state as ProposerState).ballot}` } };
  }
  const msg = s.pool.find((m) => m.id === op.id);
  if (!msg) return { ok: false, reason: 'That message is no longer in the pool.' };
  const rest = s.pool.filter((m) => m.id !== op.id);
  if (op.kind === 'drop') return { ok: true, session: { ...s, pool: rest, note: `${describeMessage(msg.payload)} to ${msg.to} is dropped` } };
  if (op.kind === 'duplicate') {
    if (s.pool.length >= POOL_CAP) return { ok: false, reason: `The pool holds at most ${POOL_CAP} messages: deliver or drop some before duplicating.` };
    return { ok: true, session: { ...s, pool: [...s.pool, { ...msg, id: s.nextId }], nextId: s.nextId + 1, note: `${describeMessage(msg.payload)} to ${msg.to} is duplicated` } };
  }
  const before = s.nodes[msg.to];
  const result = protocol.onMessage(msg.to, before, { from: msg.from, payload: msg.payload });
  const refused = msg.payload.type !== 'promise' && result.state === before && result.send.length === 0;
  const note = refused
    ? `${msg.to} ignores ${describeMessage(msg.payload)}: it has promised ${(before as { promised: number }).promised}`
    : `${msg.to} receives ${describeMessage(msg.payload)} from ${msg.from}`;
  const base = { ...s, pool: rest, nodes: { ...s.nodes, [msg.to]: result.state } };
  return { ok: true, session: { ...base, ...withSends(base, msg.to, result.send), note } };
}

/** Apply operations in order; an operation that is refused is skipped (the caller only stores accepted ones). */
export function replayOps(config: PaxosConfig, ops: readonly Op[]): Session {
  let s = initialSession(config);
  for (const op of ops) {
    const r = applyOp(s, op);
    if (r.ok) s = r.session;
  }
  return s;
}

/** The pinned text for pressing Accept before a majority of promises. */
export const needPromises = (proposer: string, held: number): string =>
  `${proposer} has promises from ${held} of ${ACCEPTOR_COUNT} acceptors: it needs ${majority(ACCEPTOR_COUNT)} before it may send Accept.`;

/** What pressing a proposer's "send Accept" does: a refusal, or what the protocol already did. */
export function acceptNow(s: Session, proposer: string): { ok: boolean; text: string } {
  const state = s.nodes[proposer];
  if (!isProposer(state) || state.phase === 'idle') return { ok: false, text: `${proposer} has not started a ballot: press its start button first.` };
  if (state.phase === 'accepting') return { ok: true, text: `${proposer} already sent Accept(${state.ballot}, ${state.proposed}) the moment its second promise arrived.` };
  return { ok: false, text: needPromises(proposer, state.promises.length) };
}

export const verdictOf = (s: Session): string => chosenText(s.nodes);

/** A step of a preset, named by what it does, so it survives changes in message ids. */
export type Step = { start: string } | { deliver: { type: PaxosMsg['type']; ballot: number; to: string; from?: string } };

/** The pool message a step names, or undefined when it is not there. */
export const findStep = (s: Session, step: Extract<Step, { deliver: unknown }>): PoolMsg | undefined =>
  s.pool.find((m) => m.payload.type === step.deliver.type && m.payload.ballot === step.deliver.ballot && m.to === step.deliver.to && (step.deliver.from === undefined || m.from === step.deliver.from));

/** Run a preset's steps from the empty session; returns the operations it took. */
export function runSteps(config: PaxosConfig, steps: readonly Step[]): { session: Session; ops: Op[] } {
  let s = initialSession(config);
  const ops: Op[] = [];
  for (const step of steps) {
    let op: Op | null = null;
    if ('start' in step) op = { kind: 'start', proposer: step.start };
    else {
      const m = findStep(s, step);
      if (m) op = { kind: 'deliver', id: m.id };
    }
    if (!op) throw new Error(`preset step is not available: ${JSON.stringify(step)}`);
    const r = applyOp(s, op);
    if (!r.ok) throw new Error(r.reason);
    s = r.session;
    ops.push(op);
  }
  return { session: s, ops };
}

const prepare = (ballot: number, to: string): Step => ({ deliver: { type: 'prepare', ballot, to } });
const promise = (ballot: number, from: string, to: string): Step => ({ deliver: { type: 'promise', ballot, from, to } });
const accept = (ballot: number, to: string): Step => ({ deliver: { type: 'accept', ballot, to } });

/** "A is chosen cleanly": 7 steps. */
export const CLEAN: Step[] = [{ start: 'P1' }, prepare(1, 'a1'), prepare(1, 'a2'), promise(1, 'a1', 'P1'), promise(1, 'a2', 'P1'), accept(1, 'a1'), accept(1, 'a2')];

/** "P2 arrives later and must adopt A": after CLEAN, P2 prepares at a2 and a3. */
export const LATE: Step[] = [...CLEAN, { start: 'P2' }, prepare(2, 'a2'), prepare(2, 'a3'), promise(2, 'a2', 'P2'), promise(2, 'a3', 'P2')];

/** "P2 pre-empts P1": ballot 2 lands on a1 and a2 before Accept(1, A) does. */
export const PREEMPT: Step[] = [
  { start: 'P1' }, { start: 'P2' }, prepare(1, 'a1'), prepare(1, 'a2'), promise(1, 'a1', 'P1'), promise(1, 'a2', 'P1'),
  prepare(2, 'a1'), prepare(2, 'a2'), accept(1, 'a1'),
];

export const PRESETS: { id: string; label: string; steps: Step[] }[] = [
  { id: 'clean', label: 'A is chosen cleanly', steps: CLEAN },
  { id: 'late', label: 'P2 arrives later and must adopt A', steps: LATE },
  { id: 'preempt', label: 'P2 pre-empts P1', steps: PREEMPT },
];
