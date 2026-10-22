/**
 * pureProtocol: a distributed protocol written as pure functions, so ONE implementation runs
 * under both harnesses (K4-2).
 *
 * - `networkExplorer(protocol, ...)` turns it into a state graph for `explore`: every schedule of
 *   deliveries (and, optionally, crashes) up to the budget, so a safety claim can be exhaustive.
 * - `asDistNodes(protocol)` turns the same functions into `core/distSim` nodes, so the protocol
 *   also runs under seeded delay, loss, duplication and partitions with `forSeeds`.
 *
 * A protocol node is `(state, message) -> (state', messages to send)`. It never mutates its
 * state (the explorer shares states between branches), never reads a clock and never draws a
 * random number: choices are the scheduler's, which is the whole point.
 *
 * Network models in the explorer:
 * - `'set'` (default): sent messages are never consumed. Any sent message may be delivered any
 *   number of times, in any order, or never, so loss, duplication and reordering are all
 *   subsumed (the model of Lamport's Paxos TLA+ spec) and the reachable set is finite for any
 *   protocol whose node states are.
 * - `'multiset'`: a delivery consumes the message. Use it when counts matter (2PC votes).
 *   Messages to a crashed node stay in flight, undelivered.
 * - `fifo: true` (with `'multiset'`): each channel (sender to receiver) is a queue and only its
 *   head can be delivered. Chandy-Lamport needs this.
 *
 * Crash model: up to `maxCrashed` nodes may crash (crash-stop, never restarted). A crashed node
 * handles nothing and takes no spontaneous step. Its state stays visible to invariants.
 */
import type { ActionLabel, Transition } from './explore';
import type { DistNode, NodeCtx } from './distSim/cluster';

export interface Outbound<M> {
  to: string;
  payload: M;
}

export interface StepResult<S, M> {
  state: S;
  send: Outbound<M>[];
}

export interface PureProtocol<S, M> {
  nodes: readonly string[];
  init: (id: string) => S;
  onMessage: (id: string, s: S, m: { from: string; payload: M }) => StepResult<S, M>;
  /** A spontaneous step (start a round, retry). Null when the node has nothing to do in this state. */
  onTimeout?: (id: string, s: S) => StepResult<S, M> | null;
  /** Canonical key of a node state (default JSON.stringify: keep property order consistent). */
  stateKey?: (s: S) => string;
  /** Words for a message in an action label (default: its JSON). */
  describe?: (payload: M) => string;
}

export interface NetMessage<M> {
  from: string;
  to: string;
  payload: M;
  key: string;
}

/** One state of the explored system: every node's state, what is on the wire, who has crashed. */
export interface NetState<S, M> {
  nodes: readonly S[];
  nodeKeys: readonly string[];
  /** The wire. A set (sorted, unique), a multiset (sorted) or FIFO queues (grouped by channel, queue order kept). */
  net: readonly NetMessage<M>[];
  crashed: readonly string[];
}

export interface NetAction<M> extends ActionLabel {
  kind: 'deliver' | 'timeout' | 'crash';
  /** deliver: the message delivered. */
  message?: { from: string; to: string; payload: M };
}

export type NetworkKind = 'set' | 'multiset';

export interface NetworkOptions<M> {
  network?: NetworkKind;
  /** Per-channel FIFO queues. Needs `network: 'multiset'`. */
  fifo?: boolean;
  /** How many nodes may crash (default 0). */
  maxCrashed?: number;
  /** Messages already on the wire at the start (a client request), from `from` (default "client"). */
  clientInputs?: readonly { to: string; payload: M; from?: string }[];
}

export interface NetworkExplorer<S, M> {
  init: NetState<S, M>;
  actions: (s: NetState<S, M>) => Transition<NetState<S, M>, NetAction<M>>[];
  key: (s: NetState<S, M>) => string;
  /** One node's state in an explored state. */
  nodeState: (s: NetState<S, M>, id: string) => S;
  /** Every node's state, by id (for invariants shared with the seeded leg). */
  nodeStates: (s: NetState<S, M>) => Record<string, S>;
}

const KEY_SEP = '\u0001';
const NET_SEP = '\u0002';

const jsonKey = (v: unknown): string => JSON.stringify(v);
const byKey = (a: NetMessage<unknown>, b: NetMessage<unknown>) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const channelOf = (m: NetMessage<unknown>) => `${m.from}>${m.to}`;
const byChannel = (a: NetMessage<unknown>, b: NetMessage<unknown>) => {
  const [x, y] = [channelOf(a), channelOf(b)];
  return x < y ? -1 : x > y ? 1 : 0;
};

export function networkExplorer<S, M>(protocol: PureProtocol<S, M>, options: NetworkOptions<M> = {}): NetworkExplorer<S, M> {
  const network = options.network ?? 'set';
  const fifo = options.fifo ?? false;
  if (fifo && network === 'set') throw new RangeError('networkExplorer: fifo needs the multiset network (a set never consumes, so there is no queue)');
  const maxCrashed = options.maxCrashed ?? 0;
  const nodeKey = protocol.stateKey ?? jsonKey;
  const describe = protocol.describe ?? jsonKey;
  const index = new Map(protocol.nodes.map((id, i) => [id, i]));
  const at = (id: string): number => {
    const i = index.get(id);
    if (i === undefined) throw new RangeError(`networkExplorer: unknown node "${id}"`);
    return i;
  };
  const message = (from: string, to: string, payload: M): NetMessage<M> => {
    at(to);
    return { from, to, payload, key: `${from}>${to}:${jsonKey(payload)}` };
  };

  /** The wire after `remove` (an index, or -1) is consumed and `sends` are added, in canonical form. */
  const rewire = (net: readonly NetMessage<M>[], remove: number, sends: readonly NetMessage<M>[]): readonly NetMessage<M>[] => {
    if (network === 'set') {
      const have = new Set(net.map((m) => m.key));
      const fresh = sends.filter((m, i) => !have.has(m.key) && sends.findIndex((o) => o.key === m.key) === i);
      return fresh.length === 0 ? net : [...net, ...fresh].sort(byKey);
    }
    const rest = remove >= 0 ? net.filter((_, i) => i !== remove) : [...net];
    // FIFO keeps arrival order inside a channel (Array.sort is stable); otherwise a multiset is sorted by key.
    return [...rest, ...sends].sort(fifo ? byChannel : byKey);
  };

  const nodeUpdate = (s: NetState<S, M>, i: number, state: S): Pick<NetState<S, M>, 'nodes' | 'nodeKeys'> => {
    const nodes = s.nodes.slice();
    const nodeKeys = s.nodeKeys.slice();
    nodes[i] = state;
    nodeKeys[i] = nodeKey(state);
    return { nodes, nodeKeys };
  };

  const key = (s: NetState<S, M>) => `${s.nodeKeys.join(KEY_SEP)}${NET_SEP}${s.net.map((m) => m.key).join(KEY_SEP)}${NET_SEP}${s.crashed.join(KEY_SEP)}`;

  const stepTo = (s: NetState<S, M>, id: string, result: StepResult<S, M>, remove: number): NetState<S, M> => {
    const updated = nodeUpdate(s, at(id), result.state);
    const net = rewire(s.net, remove, result.send.map((o) => message(id, o.to, o.payload)));
    return { ...updated, net, crashed: s.crashed };
  };

  const isUp = (s: NetState<S, M>, id: string) => !s.crashed.includes(id);

  /** Indexes of the messages that may be delivered next. */
  const deliverable = (s: NetState<S, M>): number[] => {
    const out: number[] = [];
    const seenChannel = new Set<string>();
    s.net.forEach((m, i) => {
      if (!isUp(s, m.to)) return;
      if (fifo) {
        const c = channelOf(m);
        if (seenChannel.has(c)) return;
        seenChannel.add(c);
      } else if (network === 'multiset' && i > 0 && s.net[i - 1].key === m.key) {
        return;
      }
      out.push(i);
    });
    return out;
  };

  const actions = (s: NetState<S, M>): Transition<NetState<S, M>, NetAction<M>>[] => {
    const out: Transition<NetState<S, M>, NetAction<M>>[] = [];
    const here = key(s);
    for (const i of deliverable(s)) {
      const m = s.net[i];
      const result = protocol.onMessage(m.to, s.nodes[at(m.to)], { from: m.from, payload: m.payload });
      const next = stepTo(s, m.to, result, network === 'set' ? -1 : i);
      if (network === 'set' && key(next) === here) continue;
      out.push({
        label: { actor: m.to, kind: 'deliver', text: `${m.to} receives ${describe(m.payload)} from ${m.from}`, message: { from: m.from, to: m.to, payload: m.payload } },
        next,
      });
    }
    if (protocol.onTimeout) {
      for (const id of protocol.nodes) {
        if (!isUp(s, id)) continue;
        const result = protocol.onTimeout(id, s.nodes[at(id)]);
        if (!result) continue;
        const next = stepTo(s, id, result, -1);
        if (key(next) === here) continue;
        out.push({ label: { actor: id, kind: 'timeout', text: `${id} takes a spontaneous step` }, next });
      }
    }
    if (s.crashed.length < maxCrashed) {
      for (const id of protocol.nodes) {
        if (isUp(s, id)) out.push({ label: { actor: id, kind: 'crash', text: `${id} crashes` }, next: { ...s, crashed: [...s.crashed, id].sort() } });
      }
    }
    return out;
  };

  const nodes = protocol.nodes.map((id) => protocol.init(id));
  const wire = (options.clientInputs ?? []).map((c) => message(c.from ?? 'client', c.to, c.payload));
  const init: NetState<S, M> = {
    nodes,
    nodeKeys: nodes.map(nodeKey),
    net: [...wire].sort(fifo ? byChannel : byKey).filter((m, i, all) => network !== 'set' || all.findIndex((o) => o.key === m.key) === i),
    crashed: [],
  };

  return {
    init,
    actions,
    key,
    nodeState: (s, id) => s.nodes[at(id)],
    nodeStates: (s) => Object.fromEntries(protocol.nodes.map((id, i) => [id, s.nodes[i]])),
  };
}

/** Delay before a node's spontaneous step is attempted after it changes state, simulated ms. */
const STEP_DELAY_MS = 1;
const STEP_TIMER = 'step';

/**
 * The same protocol as `core/distSim` nodes. A spontaneous step runs on a timer, one
 * `STEP_DELAY_MS` after init and after every state change, until `onTimeout` returns null.
 * Node state is durable across `restart` (a restart only re-arms the timer): the pure protocol
 * has no notion of volatile state. The nodes are stateful closures, so build a fresh set per run.
 */
export function asDistNodes<S, M>(protocol: PureProtocol<S, M>): Record<string, DistNode<M, S>> {
  const nodes: Record<string, DistNode<M, S>> = {};
  for (const id of protocol.nodes) {
    let state = protocol.init(id);
    const apply = (ctx: NodeCtx<M>, result: StepResult<S, M>) => {
      state = result.state;
      for (const o of result.send) ctx.send(o.to, o.payload);
      ctx.setTimer(STEP_TIMER, STEP_DELAY_MS);
    };
    nodes[id] = {
      init: (ctx) => ctx.setTimer(STEP_TIMER, STEP_DELAY_MS),
      onMessage: (ctx, msg) => apply(ctx, protocol.onMessage(id, state, { from: msg.from, payload: msg.payload })),
      onTimer: (ctx) => {
        const result = protocol.onTimeout?.(id, state);
        if (result) apply(ctx, result);
      },
      snapshot: () => state,
    };
  }
  return nodes;
}
