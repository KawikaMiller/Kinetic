/**
 * CAP & PACELC model: a one-register replicated store on core/distSim, in three flavours.
 *
 * - `quorum` (the CP choice): a read or write talks to a majority of the three replicas
 *   (a query phase, then a store phase, the textbook "ABD" register). Without a majority it
 *   times out and refuses.
 * - `all` (PACELC "EC"): a write is stored on every replica before it is acknowledged; reads are local.
 * - `local` (the AP choice, and PACELC "EL"): a write is acknowledged as soon as one replica has it,
 *   and spreads in the background (an immediate send plus a periodic exchange), the newest
 *   timestamp winning.
 *
 * Nothing on screen is typed: the story the lesson plays is one scripted run of these nodes,
 * and every value, refusal, latency and stale read is read back from it. The partition and the
 * client requests are scripted (the lesson says so); the replicas' behaviour is not.
 */
import {
  createCluster, linearizable, type Cluster, type DistNode, type RegisterOp, type Safety,
} from '../../core/distSim';

export type Policy = 'quorum' | 'all' | 'local';
export type NodeId = 'N1' | 'N2' | 'N3';
export const NODE_IDS: readonly NodeId[] = ['N1', 'N2', 'N3'];
/** Replicas needed for a majority of three. */
export const MAJORITY = 2;
/** The value every replica starts with. */
export const INITIAL_VALUE = 1;

/** Time a replica spends handling a client request before it acts (illustrative). */
export const PROCESS_MS = 5;
/** A request that has not finished after this long is refused. */
export const OP_TIMEOUT_MS = 120;
/** How often a replica pushes its value to the others in the background. */
export const GOSSIP_MS = 50;

interface Tag {
  ver: number;
  by: string;
}
interface Cell {
  tag: Tag;
  value: number;
}
const newer = (a: Tag, b: Tag) => a.ver > b.ver || (a.ver === b.ver && a.by > b.by);

export type Msg =
  | { type: 'put'; op: number; value: number }
  | { type: 'get'; op: number }
  | { type: 'query'; op: number }
  | { type: 'cell'; op: number; cell: Cell }
  | { type: 'store'; op: number; cell: Cell }
  | { type: 'stored'; op: number }
  | { type: 'gossip'; cell: Cell };

/** What a client saw: one request and how it ended. */
export interface OpRecord {
  op: number;
  kind: 'write' | 'read';
  client: string;
  node: NodeId;
  invoke: number;
  /** When the client was answered; null while the request is still open or when no answer ever came. */
  response: number | null;
  outcome: 'ok' | 'refused' | 'open';
  /** A write's value, or what a read returned (null for a refused read). */
  value: number | null;
}

export interface NodeState {
  value: number;
  ops: OpRecord[];
}

interface Pending {
  record: OpRecord;
  value: number;
  phase: 'process' | 'query' | 'store';
  cells: Map<string, Cell>;
  acked: Set<string>;
  result: Cell | null;
}

const INITIAL_CELL: Cell = { tag: { ver: 0, by: '' }, value: INITIAL_VALUE };

function registerNode(policy: Policy, id: string): DistNode<Msg, NodeState> {
  let cell = INITIAL_CELL;
  const records: OpRecord[] = [];
  let pending = new Map<number, Pending>();

  const adopt = (c: Cell) => {
    if (newer(c.tag, cell.tag)) cell = c;
  };
  const others = (peers: readonly string[]) => peers.filter((p) => p !== id);

  return {
    init: (ctx) => {
      pending = new Map();
      ctx.setTimer('gossip', GOSSIP_MS);
    },
    snapshot: () => ({ value: cell.value, ops: records.map((r) => ({ ...r })) }),
    onTimer: (ctx, timerId) => {
      if (timerId === 'gossip') {
        for (const p of others(ctx.peers)) ctx.send(p, { type: 'gossip', cell });
        ctx.setTimer('gossip', GOSSIP_MS);
        return;
      }
      const [kind, opText] = timerId.split(':');
      const op = Number(opText);
      const p = pending.get(op);
      if (!p) return;
      const finish = (outcome: 'ok' | 'refused', value: number | null) => {
        p.record.response = ctx.trueNow;
        p.record.outcome = outcome;
        p.record.value = value;
        pending.delete(op);
        ctx.cancelTimer(`to:${op}`);
      };
      if (kind === 'to') return finish('refused', p.record.kind === 'write' ? p.value : null);

      // kind === 'do': the request has been handled for PROCESS_MS, now act on it.
      const isWrite = p.record.kind === 'write';
      if (policy === 'quorum') {
        p.phase = 'query';
        p.cells.set(id, cell);
        for (const peer of others(ctx.peers)) ctx.send(peer, { type: 'query', op });
      } else if (policy === 'all') {
        if (!isWrite) return finish('ok', cell.value);
        cell = { tag: { ver: cell.tag.ver + 1, by: id }, value: p.value };
        p.phase = 'store';
        p.acked.add(id);
        for (const peer of others(ctx.peers)) ctx.send(peer, { type: 'store', op, cell });
      } else {
        if (!isWrite) return finish('ok', cell.value);
        cell = { tag: { ver: ctx.now(), by: id }, value: p.value };
        finish('ok', p.value);
        for (const peer of others(ctx.peers)) ctx.send(peer, { type: 'gossip', cell });
      }
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      switch (m.type) {
        case 'put':
        case 'get': {
          const record: OpRecord = {
            op: m.op, kind: m.type === 'put' ? 'write' : 'read', client: msg.from, node: id as NodeId,
            invoke: ctx.trueNow, response: null, outcome: 'open', value: m.type === 'put' ? m.value : null,
          };
          records.push(record);
          pending.set(m.op, {
            record, value: m.type === 'put' ? m.value : 0, phase: 'process', cells: new Map(), acked: new Set(), result: null,
          });
          ctx.setTimer(`do:${m.op}`, PROCESS_MS);
          ctx.setTimer(`to:${m.op}`, OP_TIMEOUT_MS);
          return;
        }
        case 'gossip':
          adopt(m.cell);
          return;
        case 'query':
          ctx.send(msg.from, { type: 'cell', op: m.op, cell });
          return;
        case 'store':
          adopt(m.cell);
          ctx.send(msg.from, { type: 'stored', op: m.op });
          return;
        case 'cell': {
          const p = pending.get(m.op);
          if (!p || p.phase !== 'query') return;
          p.cells.set(msg.from, m.cell);
          if (p.cells.size < MAJORITY) return;
          const best = [...p.cells.values()].reduce((a, b) => (newer(b.tag, a.tag) ? b : a));
          const chosen: Cell = p.record.kind === 'write' ? { tag: { ver: best.tag.ver + 1, by: id }, value: p.value } : best;
          adopt(chosen);
          p.result = chosen;
          p.phase = 'store';
          p.acked = new Set([id]);
          for (const peer of others(ctx.peers)) ctx.send(peer, { type: 'store', op: m.op, cell: chosen });
          return;
        }
        case 'stored': {
          const p = pending.get(m.op);
          if (!p || p.phase !== 'store') return;
          p.acked.add(msg.from);
          const needed = policy === 'all' ? ctx.peers.length : MAJORITY;
          if (p.acked.size < needed) return;
          p.record.response = ctx.trueNow;
          p.record.outcome = 'ok';
          p.record.value = p.record.kind === 'write' ? p.value : (p.result?.value ?? null);
          pending.delete(m.op);
          ctx.cancelTimer(`to:${m.op}`);
        }
      }
    },
  };
}

/* ---------- scripted requests ---------- */

export interface Request {
  at: number;
  client: string;
  node: NodeId;
  kind: 'write' | 'read';
  /** The value a write sets (reads leave it unset). */
  value?: number;
}

/** A request's id is its position in the scenario's list. */
export function injectRequests(cluster: Cluster<Msg, NodeState>, requests: readonly Request[]): void {
  requests.forEach((r, op) => {
    cluster.inject(r.at, r.node, r.kind === 'write' ? { type: 'put', op, value: r.value ?? 0 } : { type: 'get', op }, r.client);
  });
}

/** All requests the replicas have seen, ordered by when they arrived. */
export function allOps(nodes: Record<string, { state?: NodeState | undefined }>): OpRecord[] {
  return Object.values(nodes)
    .flatMap((n) => n.state?.ops ?? [])
    .sort((a, b) => a.invoke - b.invoke || a.op - b.op);
}

/* ---------- invariants and measurements ---------- */

/**
 * The register history clients saw, for distSim's `linearizable` checker. A refused or still-open
 * write may or may not have taken effect, so it stays in the history as one that never answered;
 * a refused or open read tells the client nothing and is left out.
 */
export function historyOf(ops: readonly OpRecord[]): RegisterOp<number>[] {
  return ops.flatMap((o): RegisterOp<number>[] => {
    const value = o.value;
    if (o.outcome === 'ok' && value !== null && o.response !== null) {
      return [{ process: o.client, kind: o.kind, value, invoke: o.invoke, response: o.response }];
    }
    if (o.kind === 'write' && value !== null) return [{ process: o.client, kind: 'write', value, invoke: o.invoke, response: Infinity }];
    return [];
  });
}

/** Safety for the CP choice: what clients were told is consistent with one up-to-date copy. */
export const clientsSeeOneRegister: Safety<NodeState> = (snap) => {
  const history = historyOf(allOps(snap.nodes));
  return linearizable(history, { initial: INITIAL_VALUE });
};

interface Cut {
  groups: [Set<string>, Set<string>];
  from: number;
  until: number;
}

/** The partitions that really happened, read from the cluster's trace (not from the scenario's script). */
function cutsInTrace(cluster: Cluster<Msg, NodeState>): Cut[] {
  const cuts: Cut[] = [];
  const open = new Map<string, Cut>();
  for (const row of cluster.trace) {
    if ((row.kind !== 'partition' && row.kind !== 'heal') || row.from === undefined || row.to === undefined) continue;
    const label = `${row.from}|${row.to}`;
    if (row.kind === 'partition') {
      const cut: Cut = { groups: [new Set(row.from.split('+')), new Set(row.to.split('+'))], from: row.t, until: Infinity };
      open.set(label, cut);
      cuts.push(cut);
    } else {
      const cut = open.get(label);
      if (cut) cut.until = row.t;
    }
  }
  return cuts;
}

/** How many replicas `node` can talk to at time `t` (itself included), given the partitions in the trace. */
export function reachableAt(cluster: Cluster<Msg, NodeState>, node: string, t: number): number {
  const active = cutsInTrace(cluster).filter((c) => c.from <= t && t < c.until);
  const seen = new Set([node]);
  const queue = [node];
  while (queue.length) {
    const a = queue.pop()!;
    for (const b of cluster.nodeIds) {
      if (seen.has(b)) continue;
      const cutBetween = active.some((c) => (c.groups[0].has(a) && c.groups[1].has(b)) || (c.groups[1].has(a) && c.groups[0].has(b)));
      if (!cutBetween) {
        seen.add(b);
        queue.push(b);
      }
    }
  }
  return seen.size;
}

/**
 * Safety for "a minority side refuses": no request is answered ok by a replica that, at that moment,
 * could reach fewer than a majority of replicas. Built on the real cluster so partitions come from its trace.
 */
export function minorityRefuses(cluster: Cluster<Msg, NodeState>): Safety<NodeState> {
  return (snap) => {
    for (const o of allOps(snap.nodes)) {
      if (o.outcome === 'ok' && o.response !== null && reachableAt(cluster, o.node, o.response) < MAJORITY) {
        return `${o.node} answered a ${o.kind} ok at ${o.response} ms from a side with fewer than ${MAJORITY} replicas`;
      }
    }
    return null;
  };
}

/**
 * Reads that returned something other than the latest write acknowledged before the read began
 * (counting only reads answered by `until`). The initial value counts as acknowledged at time 0.
 */
export function staleReads(ops: readonly OpRecord[], until = Infinity): OpRecord[] {
  const acked = ops.filter((o) => o.kind === 'write' && o.outcome === 'ok' && o.response !== null);
  return ops.filter((r) => {
    if (r.kind !== 'read' || r.outcome !== 'ok' || r.response === null || r.response > until) return false;
    const before = acked.filter((w) => w.response! < r.invoke).sort((a, b) => a.response! - b.response!);
    const latest = before.length ? before[before.length - 1].value : INITIAL_VALUE;
    return r.value !== latest;
  });
}

/* ---------- the stories the lesson plays ---------- */

export type Net = 'partition' | 'healthy';
/** cp/ap during a partition; ec/el (PACELC "else") when healthy. */
export type Choice = 'cp' | 'ap' | 'ec' | 'el';
export const POLICY_OF: Record<Choice, Policy> = { cp: 'quorum', ap: 'local', ec: 'all', el: 'local' };

/**
 * The seed the AP story runs on. It is the lowest seed on which AP breaks the linearizability
 * check in the random fault search of `faultScenario` (a test pins this), so the "broken" choice
 * is shown on the schedule that provably breaks it. The CP choice holds on every seed.
 */
export const BROKEN_SEED = 0;

/** One-way message delay in the PACELC (healthy) story, ms (illustrative). */
export const HEALTHY_ONE_WAY_MS = 40;
/** One-way message delay in the partition story, ms (illustrative). */
export const PARTITION_ONE_WAY_MS = 10;
/** The scripted partition: N1 alone against N2 and N3. */
export const PARTITION = { from: 100, to: 500 } as const;
/** How far each story runs. */
export const STORY_END_MS = 800;

export const STORY_REQUESTS: Record<Net, Record<'cp' | 'ap' | 'ec' | 'el', readonly Request[]>> = {
  partition: {
    cp: [
      { at: 150, client: 'C1', node: 'N1', kind: 'write', value: 2 },
      { at: 250, client: 'C2', node: 'N2', kind: 'write', value: 3 },
      { at: 350, client: 'C1', node: 'N1', kind: 'read' },
      { at: 350, client: 'C2', node: 'N3', kind: 'read' },
    ],
    ap: [
      { at: 150, client: 'C1', node: 'N1', kind: 'write', value: 2 },
      { at: 250, client: 'C2', node: 'N2', kind: 'write', value: 3 },
      { at: 350, client: 'C1', node: 'N1', kind: 'read' },
      { at: 350, client: 'C2', node: 'N3', kind: 'read' },
    ],
    ec: [],
    el: [],
  },
  healthy: {
    cp: [],
    ap: [],
    ec: [
      { at: 0, client: 'C1', node: 'N1', kind: 'write', value: 2 },
      { at: 100, client: 'C2', node: 'N3', kind: 'read' },
    ],
    el: [
      { at: 0, client: 'C1', node: 'N1', kind: 'write', value: 2 },
      { at: 20, client: 'C2', node: 'N3', kind: 'read' },
      { at: 100, client: 'C2', node: 'N3', kind: 'read' },
    ],
  },
};

export interface Story {
  net: Net;
  choice: Choice;
  cluster: Cluster<Msg, NodeState>;
  /** The scripted requests, in the order of STORY_REQUESTS. */
  ops: OpRecord[];
  /** Each replica's value at time `t` (replays the run; the cluster is rebuilt from the seed). */
  valuesAt: (t: number) => Record<NodeId, number>;
  /** Stale reads answered by time `t`. */
  staleAt: (t: number) => number;
}

const buildStoryCluster = (net: Net, choice: Choice, seed: number): Cluster<Msg, NodeState> => {
  const policy = POLICY_OF[choice];
  const delay = net === 'partition' ? PARTITION_ONE_WAY_MS : HEALTHY_ONE_WAY_MS;
  const cluster = createCluster<Msg, NodeState>({
    seed,
    nodes: Object.fromEntries(NODE_IDS.map((id) => [id, registerNode(policy, id)])),
    latency: { min: delay, max: delay },
  });
  if (net === 'partition') cluster.partition(['N1'], ['N2', 'N3'], PARTITION.from, PARTITION.to);
  injectRequests(cluster, STORY_REQUESTS[net][choice]);
  return cluster;
};

/** Run one of the lesson's four stories on the replicas. Deterministic. */
export function runStory(net: Net, choice: Choice, seed = BROKEN_SEED): Story {
  const cluster = buildStoryCluster(net, choice, seed);
  cluster.run({ until: STORY_END_MS });
  const ops = allOps(cluster.snapshot().nodes).sort((a, b) => a.op - b.op);
  const valuesAt = (t: number) => {
    const replay = buildStoryCluster(net, choice, seed);
    replay.run({ until: t });
    const nodes = replay.snapshot().nodes;
    return Object.fromEntries(NODE_IDS.map((id) => [id, nodes[id].state?.value ?? INITIAL_VALUE])) as Record<NodeId, number>;
  };
  return { net, choice, cluster, ops, valuesAt, staleAt: (t) => staleReads(ops, t).length };
}

/* ---------- the random fault search the tests run ---------- */

/** Fault search: injected delay, loss, duplication, one partition, one crash and skewed clocks. */
export const FAULT_HORIZON_MS = 800;
const SEARCH_REQUESTS: readonly Request[] = [0, 1, 2, 3].flatMap((i): Request[] => [
  { at: 50 + 200 * i, client: 'C1', node: NODE_IDS[i % 3], kind: 'write', value: 2 + i },
  { at: 60 + 200 * i, client: 'C2', node: NODE_IDS[(i + 1) % 3], kind: 'read' },
  { at: 130 + 200 * i, client: 'C2', node: NODE_IDS[(i + 2) % 3], kind: 'read' },
]);

export const faultScenario = (policy: Policy, faults = true) => (seed: number): Cluster<Msg, NodeState> => {
  const cluster = createCluster<Msg, NodeState>({
    seed,
    nodes: Object.fromEntries(NODE_IDS.map((id) => [id, registerNode(policy, id)])),
    latency: { min: 1, max: 15 },
    ...(faults ? { loss: 0.1, duplicate: 0.15, clocks: [{ offsetMs: 40 }, { driftPpm: 5000 }, {}] } : {}),
  });
  if (faults) cluster.randomFaults({ horizonMs: FAULT_HORIZON_MS, partitions: 1, crashes: 1 });
  injectRequests(cluster, SEARCH_REQUESTS);
  return cluster;
};
/** Run bound for the fault search (the gossip timers never stop on their own). */
export const SEARCH_END_MS = 1500;

/** The choice that keeps the same side of the trade-off when the network setting changes (C stays C, A becomes L). */
export function choiceAfterNetSwitch(net: Net, choice: Choice): Choice {
  const favoursAvailability = choice === 'ap' || choice === 'el';
  if (net === 'healthy') return favoursAvailability ? 'el' : 'ec';
  return favoursAvailability ? 'ap' : 'cp';
}

/** How long the PACELC story's write took before the client was answered, ms. */
export function writeLatencyMs(choice: 'ec' | 'el'): number {
  const write = runStory('healthy', choice).ops[0];
  return (write.response ?? write.invoke) - write.invoke;
}
