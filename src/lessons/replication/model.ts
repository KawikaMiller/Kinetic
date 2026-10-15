/**
 * Replication model: one leader and two followers on core/distSim, in two flavours.
 *
 * - `async`: the leader appends a write to its log, answers the client at once, and a background
 *   sender ships unconfirmed log entries to the followers every FLUSH_MS.
 * - `sync`: the leader ships the entry to the followers straight away and answers the client only
 *   when every follower has confirmed it.
 *
 * A small failover manager (node M, not drawn) asks the followers how long their logs are some
 * time after the leader crashes and promotes the longest. The lesson's two stories are scripted
 * runs of these nodes; what is lost, stale, acknowledged or promoted is read back from the run.
 * The crash, the reads and the manager's timing are scripted (the lesson says so).
 */
import {
  createCluster, latencyOf, settleOp, type Cluster, type DistNode, type NodeCtx, type OpRecord as ClientOp, type Safety, type TraceRow,
} from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export type Mode = 'async' | 'sync';
export type Scenario = 'stale' | 'failover';
export type NodeId = 'L' | 'F1' | 'F2';
export const NODE_IDS: readonly NodeId[] = ['L', 'F1', 'F2'];
const FOLLOWERS = ['F1', 'F2'] as const;
const MANAGER = 'M';

/** One-way latencies in ms (illustrative): the client and F1 are local, F2 is in another region. */
export const LAT = { client: 2, f1: 3, f2: 60 } as const;
/** How often the background sender ships the log (async), and re-sends what is unconfirmed (both modes). */
export const FLUSH_MS = 10;
/** How long after the leader crashes the failover manager acts (scripted). */
export const DETECT_MS = 15;
/** How long the manager waits for follower reports before promoting with what it has. */
const REPORT_WAIT_MS = 20;
const MANAGER_LINK_MS = 1;

export type Role = 'leader' | 'follower' | 'promoted' | 'manager';

/** One request as the client saw it; a write's `value` is its entry, a read's the entry it found (null: nothing found). */
export interface OpRecord extends ClientOp<string, NodeId> {
  /** For a read of one named entry ("is order #4 there?"): the entry it asked for. */
  asked?: string;
}

export interface NodeState {
  role: Role;
  log: string[];
  ops: OpRecord[];
  /** The manager only: the node it promoted. */
  promoted?: string;
}

type Msg =
  | { type: 'put'; op: number; entry: string }
  | { type: 'get'; op: number; entry?: string }
  | { type: 'append'; index: number; entry: string }
  | { type: 'matched'; upTo: number }
  | { type: 'report' }
  | { type: 'len'; n: number }
  | { type: 'promote' };

function dataNode(mode: Mode, id: string, initialLog: readonly string[], leader: boolean): DistNode<Msg, NodeState> {
  const log = [...initialLog];
  const records: OpRecord[] = [];
  let role: Role = leader ? 'leader' : 'follower';
  let matched: Record<string, number> = {};
  /** Writes waiting for every follower (sync): log index → the record to answer. */
  let waiting = new Map<number, OpRecord>();

  const isLeader = () => role === 'leader' || role === 'promoted';
  const followersOf = (peers: readonly string[]) => peers.filter((p) => (FOLLOWERS as readonly string[]).includes(p) && p !== id);

  const ship = (ctx: NodeCtx<Msg>) => {
    for (const f of followersOf(ctx.peers)) {
      for (let i = matched[f] ?? 0; i < log.length; i++) ctx.send(f, { type: 'append', index: i + 1, entry: log[i] });
    }
  };
  const answerReady = (now: number) => {
    const slowest = Math.min(...Object.values(matched));
    for (const [index, rec] of [...waiting]) {
      if (index <= slowest) {
        settleOp(rec, now + LAT.client, 'ok');
        waiting.delete(index);
      }
    }
  };

  return {
    init: (ctx) => {
      matched = {};
      waiting = new Map();
      if (isLeader()) {
        for (const f of followersOf(ctx.peers)) matched[f] = 0;
        ctx.setTimer('flush', FLUSH_MS);
      }
    },
    snapshot: () => ({ role, log: [...log], ops: records.map((r) => ({ ...r })) }),
    onTimer: (ctx) => {
      if (!isLeader()) return;
      ship(ctx);
      ctx.setTimer('flush', FLUSH_MS);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      switch (m.type) {
        case 'put': {
          const rec: OpRecord = {
            op: m.op, kind: 'write', client: msg.from, node: id as NodeId, invoke: ctx.trueNow - LAT.client, response: null, outcome: 'open', value: m.entry,
          };
          records.push(rec);
          log.push(m.entry);
          if (mode === 'async') {
            settleOp(rec, ctx.trueNow + LAT.client, 'ok');
          } else {
            waiting.set(log.length, rec);
            ship(ctx);
          }
          return;
        }
        case 'get': {
          const found = m.entry === undefined ? (log[log.length - 1] ?? null) : (log.includes(m.entry) ? m.entry : null);
          records.push({
            op: m.op, kind: 'read', client: msg.from, node: id as NodeId, invoke: ctx.trueNow - LAT.client, response: ctx.trueNow + LAT.client,
            outcome: 'ok', value: found, asked: m.entry,
          });
          return;
        }
        case 'append':
          if (m.index === log.length + 1) log.push(m.entry);
          ctx.send(msg.from, { type: 'matched', upTo: log.length });
          return;
        case 'matched':
          matched[msg.from] = Math.max(matched[msg.from] ?? 0, m.upTo);
          answerReady(ctx.trueNow);
          return;
        case 'report':
          ctx.send(msg.from, { type: 'len', n: log.length });
          return;
        case 'promote':
          role = 'promoted';
          for (const f of followersOf(ctx.peers)) matched[f] = 0;
          ctx.setTimer('flush', FLUSH_MS);
          return;
      }
    },
  };
}

/** The failover manager: after the crash it asks the followers for their log lengths and promotes the longest. */
function managerNode(crashAt: number): DistNode<Msg, NodeState> {
  const lengths = new Map<string, number>();
  let promoted: string | undefined;
  return {
    init: (ctx) => ctx.setTimer('detect', crashAt + DETECT_MS - ctx.now()),
    snapshot: () => ({ role: 'manager', log: [], ops: [], promoted }),
    onTimer: (ctx, timerId) => {
      if (timerId === 'detect') {
        for (const f of FOLLOWERS) ctx.send(f, { type: 'report' });
        ctx.setTimer('decide', REPORT_WAIT_MS);
        return;
      }
      if (promoted || lengths.size === 0) return;
      const best = [...lengths].reduce((a, b) => (b[1] > a[1] ? b : a));
      promoted = best[0];
      ctx.send(best[0], { type: 'promote' });
    },
    onMessage: (ctx, msg) => {
      if (msg.payload.type !== 'len') return;
      lengths.set(msg.from, msg.payload.n);
      if (lengths.size === FOLLOWERS.length && !promoted) {
        ctx.cancelTimer('decide');
        const best = [...lengths].reduce((a, b) => (b[1] > a[1] ? b : a));
        promoted = best[0];
        ctx.send(best[0], { type: 'promote' });
      }
    },
  };
}

/* ---------- scripted requests ---------- */

export interface Request {
  /** When the client sends it; it reaches the node LAT.client later. */
  sentAt: number;
  node: NodeId;
  kind: 'write' | 'read';
  entry?: string;
}

const HISTORY = ['order #1', 'order #2'];
const NAME_BEFORE = 'name=Ana';
const NAME_AFTER = 'name=Ada';
/** The leader crashes this long after the first write was sent in the failover story (scripted). */
const ASYNC_CRASH_AT = 17;
const SYNC_CRASH_AT = 255;

interface StoryScript {
  initialLog: readonly string[];
  requests: readonly Request[];
  crashAt: number | null;
  end: number;
}

const SCRIPTS: Record<Scenario, Record<Mode, StoryScript>> = {
  stale: {
    async: {
      initialLog: [NAME_BEFORE],
      requests: [
        { sentAt: 0, node: 'L', kind: 'write', entry: NAME_AFTER },
        { sentAt: 20, node: 'F2', kind: 'read' },
      ],
      crashAt: null,
      end: 300,
    },
    sync: {
      initialLog: [NAME_BEFORE],
      requests: [
        { sentAt: 0, node: 'L', kind: 'write', entry: NAME_AFTER },
        { sentAt: 130, node: 'F2', kind: 'read' },
      ],
      crashAt: null,
      end: 400,
    },
  },
  failover: {
    async: {
      initialLog: HISTORY,
      requests: [
        { sentAt: 0, node: 'L', kind: 'write', entry: 'order #3' },
        { sentAt: 12, node: 'L', kind: 'write', entry: 'order #4' },
        { sentAt: 75, node: 'F1', kind: 'read', entry: 'order #4' },
      ],
      crashAt: ASYNC_CRASH_AT,
      end: 300,
    },
    sync: {
      initialLog: HISTORY,
      requests: [
        { sentAt: 0, node: 'L', kind: 'write', entry: 'order #3' },
        { sentAt: 126, node: 'L', kind: 'write', entry: 'order #4' },
        { sentAt: 275, node: 'F1', kind: 'read', entry: 'order #4' },
      ],
      crashAt: SYNC_CRASH_AT,
      end: 500,
    },
  },
};

/** Per-link one-way delay: the leader's link to F2 is the slow cross-region one. */
const linkDelay = (from: string, to: string): number => {
  if (from === MANAGER || to === MANAGER) return MANAGER_LINK_MS;
  const pair = [from, to].sort().join('-');
  return pair === 'F1-L' ? LAT.f1 : LAT.f2;
};

export interface BuildOptions {
  seed: number;
  mode: Mode;
  initialLog: readonly string[];
  requests: readonly Request[];
  crashAt: number | null;
  /** Fault search only: jitter, loss, duplication. */
  faults?: { jitterMs: number; loss: number; duplicate: number };
}

export function buildCluster(o: BuildOptions): Cluster<Msg, NodeState> {
  const nodes: Record<string, DistNode<Msg, NodeState>> = {
    L: dataNode(o.mode, 'L', o.initialLog, true),
    F1: dataNode(o.mode, 'F1', o.initialLog, false),
    F2: dataNode(o.mode, 'F2', o.initialLog, false),
  };
  if (o.crashAt !== null) nodes[MANAGER] = managerNode(o.crashAt);
  const cluster = createCluster<Msg, NodeState>({
    seed: o.seed,
    nodes,
    latency: (rnd, from, to) => linkDelay(from, to) + (o.faults ? rnd() * o.faults.jitterMs : 0),
    ...(o.faults ? { loss: o.faults.loss, duplicate: o.faults.duplicate } : {}),
  });
  if (o.crashAt !== null) cluster.crash('L', o.crashAt);
  o.requests.forEach((r, op) => {
    const at = r.sentAt + LAT.client;
    cluster.inject(at, r.node, r.kind === 'write' ? { type: 'put', op, entry: r.entry ?? '' } : { type: 'get', op, entry: r.entry }, 'client');
  });
  return cluster;
}

/* ---------- reading the run ---------- */

/** Every request the nodes have seen, in the order the story sent them. */
export function allOps(nodes: Record<string, { state?: NodeState | undefined }>): OpRecord[] {
  return Object.values(nodes).flatMap((n) => n.state?.ops ?? []).sort((a, b) => a.op - b.op);
}

/** The writes a client has been told succeeded. */
export const acknowledged = (ops: readonly OpRecord[], until = Infinity): OpRecord[] =>
  ops.filter((o) => o.kind === 'write' && o.response !== null && o.response <= until);

/**
 * Reads that returned something other than the latest write acknowledged before the read was sent
 * (counting reads answered by `until`): the read-your-writes failure. A read of a named entry
 * is not a freshness test and is skipped.
 */
export function staleReads(ops: readonly OpRecord[], initial: string, until = Infinity): OpRecord[] {
  const acked = acknowledged(ops);
  return ops.filter((r) => {
    if (r.kind !== 'read' || r.asked !== undefined || r.response === null || r.response > until) return false;
    const before = acked.filter((w) => w.response! < r.invoke).sort((a, b) => a.response! - b.response!);
    const latest = before.length ? before[before.length - 1].value : initial;
    return r.value !== latest;
  });
}

export interface NodeView {
  role: 'leader' | 'follower' | 'dead' | 'promoted';
  log: string[];
}

export interface Story {
  scenario: Scenario;
  mode: Mode;
  /** The requests as the nodes recorded them, in script order. */
  ops: OpRecord[];
  /** What each replica looks like at time `t` (replays the run from the seed). */
  at: (t: number) => Record<NodeId, NodeView>;
  /** Acknowledged writes (answered by `t`) that no node still alive holds at `t`. */
  missingAt: (t: number) => string[];
  staleAt: (t: number) => number;
  /** When the manager's promotion took effect, or null. */
  promotedAt: number | null;
  /** Every message and fault of the full run. */
  trace: readonly TraceRow<unknown>[];
  script: StoryScript;
}

const isAppend = (payload: unknown, entry: string) => {
  const m = payload as Msg | undefined;
  return m?.type === 'append' && m.entry === entry;
};

/**
 * The broken mode's pinned seed: the lowest on which async loses an acknowledged write in the fault
 * search below (a test pins it). It names the counterexample the search found. The stories do not
 * run on that schedule: they are scripted (hand-placed crash, fixed link delays, no loss), so they
 * play the same on every seed and the seed changes nothing on screen.
 */
export const BROKEN_SEED = 1;
/** The seed the scripted stories run on; any seed gives the same run. */
export const STORY_SEED = 0;

const viewOf = (cluster: Cluster<Msg, NodeState>): Record<NodeId, NodeView> => {
  const nodes = cluster.snapshot().nodes;
  return Object.fromEntries(
    NODE_IDS.map((id) => {
      const n = nodes[id];
      const held = n.state?.role;
      const role = !n.up ? 'dead' : held === 'leader' || held === 'promoted' ? held : 'follower';
      return [id, { role, log: n.state?.log ?? [] }];
    }),
  ) as Record<NodeId, NodeView>;
};

/** Run one of the lesson's four stories. Deterministic: latencies are the constants above. */
export function runStory(scenario: Scenario, mode: Mode, seed = STORY_SEED): Story {
  const script = SCRIPTS[scenario][mode];
  const build = () => buildCluster({ seed, mode, ...script });
  const full = build();
  full.run({ until: script.end });
  const ops = allOps(full.snapshot().nodes);
  const promoteRow = full.trace.find((r) => r.kind === 'deliver' && r.from === MANAGER && (r.payload as Msg | undefined)?.type === 'promote');
  const at = (t: number) => {
    const replay = build();
    replay.run({ until: t });
    return viewOf(replay);
  };
  const missingAt = (t: number) => {
    const live = Object.values(at(t)).filter((n) => n.role !== 'dead');
    return acknowledged(ops, t).map((w) => w.value ?? '').filter((entry) => !live.some((n) => n.log.includes(entry)));
  };
  return {
    scenario, mode, ops, at, missingAt, script,
    staleAt: (t) => staleReads(ops, script.initialLog[script.initialLog.length - 1], t).length,
    promotedAt: promoteRow?.t ?? null,
    trace: full.trace,
  };
}

/** Entries each follower is behind the longest log held by a node that is still alive. */
export function lagOf(nodes: Record<NodeId, NodeView>): Record<'F1' | 'F2', number> {
  const alive = Object.values(nodes).filter((n) => n.role !== 'dead');
  const longest = Math.max(...alive.map((n) => n.log.length));
  return { F1: longest - nodes.F1.log.length, F2: longest - nodes.F2.log.length };
}

/** When `entry` first reached `node` over the wire (an append that was delivered), or null. */
export function landedAt(story: Story, node: NodeId, entry: string): number | null {
  const row = story.trace.find((r) => r.kind === 'deliver' && r.to === node && isAppend(r.payload, entry));
  return row?.t ?? null;
}

/** True when the leader ever put `entry` on the wire towards a follower. */
export function everSent(story: Story, entry: string): boolean {
  return story.trace.some((r) => r.kind === 'send' && r.from === 'L' && isAppend(r.payload, entry));
}

/** The write latency a mode gives in the "stale read" story (first write). */
export const writeMs = (mode: Mode): number => latencyOf(runStory('stale', mode).ops[0]) ?? NaN;

/* ---------- the fault search the tests run ---------- */

const SEARCH_WRITES = 6;
const SEARCH_WRITE_GAP_MS = 25;
const SEARCH_JITTER_MS = 2;
const CRASH_WINDOW = { from: 30, to: 200 } as const;
export const SEARCH_END_MS = 700;

/**
 * Failover under faults: six writes to the leader 25 ms apart, jittery links, 5% loss and 10%
 * duplication, and the leader crashing at a seeded moment. The manager then promotes the
 * longest follower log.
 */
export const failoverScenario = (mode: Mode) => (seed: number): Cluster<Msg, NodeState> => {
  const crashAt = CRASH_WINDOW.from + mulberry32(seed)() * (CRASH_WINDOW.to - CRASH_WINDOW.from);
  return buildCluster({
    seed, mode, initialLog: HISTORY, crashAt,
    requests: Array.from({ length: SEARCH_WRITES }, (_, i) => ({ sentAt: 5 + i * SEARCH_WRITE_GAP_MS, node: 'L' as const, kind: 'write' as const, entry: `order #${i + 3}` })),
    faults: { jitterMs: SEARCH_JITTER_MS, loss: 0.05, duplicate: 0.1 },
  });
};

/** Safety: once a follower has been promoted, it holds every write a client was told succeeded. */
export const noAcknowledgedWriteLost: Safety<NodeState> = (snap) => {
  const nodes = Object.values(snap.nodes);
  const promoted = nodes.find((n) => n.state?.role === 'promoted')?.state;
  if (!promoted) return null;
  const lost = acknowledged(allOps(snap.nodes)).filter((w) => !promoted.log.includes(w.value ?? ''));
  return lost.length ? `the new leader lacks ${lost.map((w) => w.value).join(', ')}, which the client was told succeeded` : null;
};

/** A follower's log is always a prefix of the leader's, so replicas only ever fall behind, never diverge. */
export const followersArePrefixes: Safety<NodeState> = (snap) => {
  const leader = snap.nodes.L.state?.log ?? [];
  for (const id of FOLLOWERS) {
    const log = snap.nodes[id].state?.log ?? [];
    if (snap.nodes[id].state?.role === 'promoted') continue;
    if (log.some((entry, i) => entry !== leader[i])) return `${id} holds an entry the leader does not have at that position`;
  }
  return null;
};
