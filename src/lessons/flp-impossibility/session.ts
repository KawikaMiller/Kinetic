/**
 * flp-impossibility, scene 1: the learner is the scheduler. A session is a configuration of the one-round protocol
 * (the explorer's net state), the process whose messages the adversary holds back for ever, and a delivery count.
 */
import { explore, type StateGraph } from '../../core/explore';
import type { NetAction, NetState } from '../../core/pureProtocol';
import { AND_TABLE, PROCS, oneExplorer, others, safetyOf, decisionsIn, symmetric, type Bit, type InputMsg, type Inputs, type Mode, type OneConfig, type OneState, type RuleTable } from './onePhase';
import { propagateValency, type ValencyResult } from './valency';

export type Net = NetState<OneState, InputMsg>;

export interface Session {
  config: OneConfig;
  net: Net;
  /** The process the adversary never delivers from (a crash looks the same), or null. */
  silent: number | null;
  deliveries: number;
}

export const startSession = (config: OneConfig, silent: number | null = null): Session => ({ config, net: oneExplorer(config).init, silent, deliveries: 0 });

export interface Delivery {
  label: NetAction<InputMsg>;
  next: Net;
}

/** The deliveries the adversary may pick next: every pending message except the held-back process's. */
export function deliverable(session: Session): Delivery[] {
  const net = oneExplorer(session.config);
  return net.actions(session.net).filter((t) => t.label.kind === 'deliver' && !heldBack(session.silent, t.label));
}

/** A crashed process sends nothing and receives nothing: its messages, and the ones to it, stay undelivered. */
const heldBack = (silent: number | null, label: NetAction<InputMsg>): boolean =>
  silent !== null && (label.message?.from === PROCS[silent] || label.message?.to === PROCS[silent]);

export function deliver(session: Session, index: number): Session {
  const options = deliverable(session);
  const pick = options[index];
  if (!pick) return session;
  return { ...session, net: pick.next, deliveries: session.deliveries + 1 };
}

/** Deliver the pending message from `from` to `to`, if the adversary has it on offer; the session unchanged otherwise. */
export function deliverFromTo(session: Session, from: string, to: string): Session {
  const k = deliverable(session).findIndex((t) => t.label.message?.from === from && t.label.message.to === to);
  return k < 0 ? session : deliver(session, k);
}

/** Deliver everything that can still arrive, in offer order. */
export function settle(session: Session): Session {
  let s = session;
  while (deliverable(s).length > 0) s = deliver(s, 0);
  return s;
}

export const stateOf =(session: Session, i: number): OneState => session.net.nodes[i];
export const decisionOf = (session: Session): (Bit | null)[] => decisionsIn(oneExplorer(session.config).nodeStates(session.net));

/** The pinned refusal for asking a process to decide before it has heard anyone. */
export const noNewsRefusal = (i: number): string => `${PROCS[i]} has heard no one yet: it has nothing to decide from.`;

/** What asking process `i` to decide right now does: a refusal, or what its protocol already did. */
export function decideNow(session: Session, i: number): { ok: boolean; text: string } {
  const s = stateOf(session, i);
  if (s.heard.length === 0) return { ok: false, text: noNewsRefusal(i) };
  if (s.decision !== null) return { ok: true, text: `${PROCS[i]} already decided ${s.decision}.` };
  return { ok: false, text: `${PROCS[i]} has heard ${s.heard.length} of the ${others(i).length} others: this protocol waits for all three inputs before it decides.` };
}

/** Valency of a session: explore every delivery order from here (held-back messages stay held back). */
export function sessionValency(session: Session): ValencyResult & { states: number } {
  const net = oneExplorer(session.config);
  const result = explore({
    init: session.net,
    key: net.key,
    actions: (s: Net) => net.actions(s).filter((t) => t.label.kind === 'deliver' && !heldBack(session.silent, t.label)),
    graph: true,
  });
  const graph = result.graph as StateGraph<Net, NetAction<InputMsg>>;
  const analysis = propagateValency(graph, (s) => decisionsIn(net.nodeStates(s)).filter((d): d is Bit => d !== null));
  return { ...analysis, states: result.states };
}

export interface SessionVerdict {
  /** The rule broken in this configuration right now, or null. */
  broken: string | null;
  /** True when no delivery remains and some process that is not held back is undecided. */
  stuck: boolean;
  undecided: string[];
}

export function sessionVerdict(session: Session): SessionVerdict {
  const net = oneExplorer(session.config);
  const broken = safetyOf(session.config.inputs)(net.nodeStates(session.net));
  const undecided = PROCS.filter((_, i) => i !== session.silent && session.net.nodes[i].decision === null);
  return { broken, stuck: deliverable(session).length === 0 && undecided.length > 0, undecided };
}

// ---------- the scene's setup ----------

export interface Setup {
  inputs: Inputs;
  mode: Mode;
  table: RuleTable;
  /** The process the adversary holds back for ever, or null. */
  silent: number | null;
  /** The deliveries made so far, as indexes into the pending list at the time. */
  picks: number[];
}
export const DEFAULT_SETUP: Setup = { inputs: [1, 1, 0], mode: 'one', table: AND_TABLE, silent: null, picks: [] };

/** The session a setup describes: start, then each pick in order. */
export function replay(setup: Setup): Session {
  let session = startSession({ inputs: setup.inputs, mode: setup.mode, rules: symmetric(setup.table) }, setup.silent);
  for (const k of setup.picks) session = deliver(session, k);
  return session;
}
