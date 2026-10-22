/**
 * distributed-snapshots: the Chandy-Lamport marker algorithm as pure state functions, shared by the explorer's
 * `PureProtocol` (two processes, exhaustive) and by the seeded `distSim` nodes (three processes, random transfers).
 *
 * A process holds tokens. The initiator records its own state, sends a marker on every outgoing channel and starts
 * recording every incoming channel. A process that receives a marker on channel c for the FIRST time records its state,
 * marks c's recorded contents empty, sends a marker on every outgoing channel and starts recording its other incoming
 * channels. A marker on a channel that is already recording stops it: its contents are the tokens received on it since.
 * The snapshot is complete when every process has recorded and every incoming channel has seen a marker.
 */
import { explore, type ActionLabel } from '../../core/explore';
import { networkExplorer, type NetState, type PureProtocol } from '../../core/pureProtocol';

export type ChannelStatus = 'idle' | 'recording' | 'done';
export interface Channel {
  status: ChannelStatus;
  /** Tokens received on this channel while it was recording. */
  sum: number;
}

export interface Proc {
  id: string;
  tokens: number;
  /** Transfers sent so far (the explorer bounds them). */
  sent: number;
  /** The state this process recorded, or null before it recorded. */
  recorded: number | null;
  /** Per incoming channel, keyed by the sender's id. */
  channels: Record<string, Channel>;
}

export const TOTAL_TOKENS = 300;
export const TOKENS_EACH = 100;

export function initProc(id: string, peers: readonly string[], tokens: number): Proc {
  return { id, tokens, sent: 0, recorded: null, channels: Object.fromEntries(peers.filter((p) => p !== id).map((p) => [p, { status: 'idle' as const, sum: 0 }])) };
}

/** Send `amount` tokens (the caller checks it is at most what the process holds). */
export const withdraw = (p: Proc, amount: number): Proc => ({ ...p, tokens: p.tokens - amount, sent: p.sent + 1 });

/** Record this process's state and start recording every incoming channel except those listed as already closed. */
export function recordSelf(p: Proc, closed: readonly string[] = []): Proc {
  const channels = Object.fromEntries(Object.entries(p.channels).map(([from]) => [from, closed.includes(from) ? { status: 'done' as const, sum: 0 } : { status: 'recording' as const, sum: 0 }]));
  return { ...p, recorded: p.tokens, channels };
}

export interface MarkerResult {
  state: Proc;
  /** This marker made the process record, so it must now send markers on every outgoing channel. */
  recordedNow: boolean;
}

export function onMarker(p: Proc, from: string): MarkerResult {
  if (p.recorded === null) return { state: recordSelf(p, [from]), recordedNow: true };
  return { state: { ...p, channels: { ...p.channels, [from]: { status: 'done', sum: p.channels[from].sum } } }, recordedNow: false };
}

export function onToken(p: Proc, from: string, amount: number): Proc {
  const c = p.channels[from];
  const channels = p.recorded !== null && c.status === 'recording' ? { ...p.channels, [from]: { ...c, sum: c.sum + amount } } : p.channels;
  return { ...p, tokens: p.tokens + amount, channels };
}

/** Every process has recorded and every incoming channel has seen its marker. */
export const complete = (procs: readonly Proc[]): boolean => procs.every((p) => p.recorded !== null && Object.values(p.channels).every((c) => c.status === 'done'));

export interface Recorded {
  /** Sum of the recorded process states. */
  states: number;
  /** Sum of the recorded channel contents. */
  channels: number;
  total: number;
}

export function recordedTotals(procs: readonly Proc[]): Recorded {
  const states = procs.reduce((s, p) => s + (p.recorded ?? 0), 0);
  const channels = procs.reduce((s, p) => s + Object.values(p.channels).reduce((a, c) => a + (c.status === 'done' ? c.sum : 0), 0), 0);
  return { states, channels, total: states + channels };
}

// ---------- the explorer leg: two processes, each starts with 2 tokens ----------

export const SMALL = { processes: ['A', 'B'] as const, tokens: 2, total: 4 };
export const SENDS = { min: 1, max: 3 } as const;

export type SnapMsg = { type: 'token'; amount: number } | { type: 'marker' } | { type: 'initiate' };

const otherOf = (id: string): string => (id === 'A' ? 'B' : 'A');

/** The explorer's protocol: each process may send up to `maxSends` transfers of 1 token; the environment tells A to start the snapshot, at any time. */
export function smallProtocol(maxSends: number): PureProtocol<Proc, SnapMsg> {
  return {
    nodes: SMALL.processes,
    init: (id) => initProc(id, SMALL.processes, SMALL.tokens),
    describe: (m) => (m.type === 'token' ? `${m.amount} token` : m.type === 'marker' ? 'marker' : 'start the snapshot'),
    onTimeout: (id, s) => (s.sent < maxSends && s.tokens >= 1 ? { state: withdraw(s, 1), send: [{ to: otherOf(id), payload: { type: 'token', amount: 1 } }] } : null),
    onMessage: (id, s, { from, payload }) => {
      if (payload.type === 'token') return { state: onToken(s, from, payload.amount), send: [] };
      if (payload.type === 'initiate') return s.recorded === null ? { state: recordSelf(s), send: [{ to: otherOf(id), payload: { type: 'marker' } }] } : { state: s, send: [] };
      const r = onMarker(s, from);
      return { state: r.state, send: r.recordedNow ? [{ to: otherOf(id), payload: { type: 'marker' } }] : [] };
    },
  };
}

export const conservationText = (recorded: number, total: number): string => `conservation broken: the record sums to ${recorded} of ${total}`;

/** Safety on an explored state: once the snapshot is complete, states plus channels equal the total. */
export function conserved(procs: readonly Proc[], total: number): string | null {
  if (!complete(procs)) return null;
  const r = recordedTotals(procs);
  return r.total === total ? null : conservationText(r.total, total);
}

export interface SmallSearch {
  states: number;
  truncated: boolean;
  violation: { message: string; steps: { actor: string; text: string; state: NetState<Proc, SnapMsg> }[] } | null;
  init: NetState<Proc, SnapMsg>;
}

/** Explore every schedule of the two-process model: FIFO or not, up to `maxSends` transfers each. */
export function searchSmall(fifo: boolean, maxSends: number): SmallSearch {
  const protocol = smallProtocol(maxSends);
  const net = networkExplorer(protocol, { network: 'multiset', fifo, clientInputs: [{ from: 'env', to: 'A', payload: { type: 'initiate' } }] });
  const result = explore<NetState<Proc, SnapMsg>, ActionLabel>({ ...net, invariant: (s) => conserved(Object.values(net.nodeStates(s)), SMALL.total) });
  return {
    states: result.states,
    truncated: result.truncated,
    init: net.init,
    violation: result.violation && { message: result.violation.message, steps: result.violation.path.map((p) => ({ actor: p.label.actor, text: p.label.text, state: p.state })) },
  };
}
