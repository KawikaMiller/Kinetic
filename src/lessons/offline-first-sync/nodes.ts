/**
 * The sync protocol as distSim nodes: two devices that keep a local replica, an outbox and a cursor, and a server that
 * orders what it accepts. Every message goes through the simulated network (delay, loss, duplication, partitions,
 * crashes and clock skew), and every edit is a message injected from outside. Nothing here is a real client or API.
 *
 *   device  `edit` makes an operation, applies it locally (optimistic) and queues it in the outbox. A sync timer sends
 *           the outbox (`push`) and asks for what is new (`pull {since: cursor}`), retrying with exponential backoff and
 *           jitter while the server stays silent. `ack` takes an operation out of the outbox; `reject` rolls it back
 *           with a notice; `update` brings other devices' operations in.
 *   server  appends accepted operations to its log, acknowledges (again, if asked again), rejects invalid ones, forwards
 *           what is new to the other device and answers `pull` with the log since the cursor, minus the asker's own.
 * Airplane mode is a partition plus a flag the device reads from its environment, so its edits wait in the outbox, unsent.
 * A device's log, outbox and cursor live outside `init` (durable storage), so a crash loses only its timers.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx } from '../../core/distSim';
import { fnv1a } from '../../core/hash';
import { mulberry32, type Rnd } from '../../core/random';
import { DEVICES, applyNaive, emptyNaive, idsOf, naiveView, opText, viewOf, type DeviceId, type NaiveState, type Op, type Strategy, type View } from './ops';

export type Action =
  | { kind: 'add'; title: string }
  | { kind: 'rename'; pick: number; title: string }
  | { kind: 'tick'; pick: number }
  | { kind: 'delete'; pick: number }
  | { kind: 'inc' };

export type Msg =
  | { type: 'edit'; action: Action }
  | { type: 'push'; ops: Op[] }
  | { type: 'ack'; ids: string[] }
  | { type: 'reject'; id: string; reason: string }
  | { type: 'pull'; since: number }
  /** `upTo` is the server log length a pull reply covers; an update forwarded after a push has none and moves no cursor. */
  | { type: 'update'; ops: Op[]; upTo: number | null };

export const SYNC = { baseMs: 1000, capMs: 8000 } as const;
const BLANK_REASON = 'the title is blank';

export interface DeviceState {
  role: 'device';
  id: DeviceId;
  log: readonly Op[];
  ids: ReadonlySet<string>;
  outbox: readonly string[];
  /** Operations pushed and not yet acknowledged. */
  sent: ReadonlySet<string>;
  acked: ReadonlySet<string>;
  notices: readonly string[];
  rolledBack: readonly Op[];
  airplane: boolean;
  naive: NaiveState;
  /** Silent sync rounds in a row: the backoff exponent. */
  attempt: number;
  /** How far into the server's log this device has read, contiguously. */
  cursor: number;
}
export interface ServerState {
  role: 'server';
  log: readonly Op[];
  ids: ReadonlySet<string>;
  rejected: ReadonlyMap<string, string>;
  naive: NaiveState;
}
export type NodeState = DeviceState | ServerState;

/** Equal jitter: half the capped exponential delay, plus a random share of the other half. */
export function backoffDelay(attempt: number, rnd: Rnd, baseMs: number = SYNC.baseMs, capMs: number = SYNC.capMs): number {
  const raw = Math.min(capMs, baseMs * 2 ** attempt);
  return raw / 2 + rnd() * (raw / 2);
}

export interface NodeOptions {
  seed: number;
  strategy: Strategy;
  dedupe: boolean;
  /** When each device is in airplane mode: an input from the environment (the radio is off), not protocol knowledge. */
  airplane: readonly Airplane[];
  /** First retry delay and its cap, ms (default SYNC). */
  syncBaseMs?: number;
  syncCapMs?: number;
}

const localView = (strategy: Strategy, log: readonly Op[], naive: NaiveState): View => (strategy === 'arrival' ? naiveView(naive) : viewOf(log, strategy));

function deviceNode(me: DeviceId, o: NodeOptions): DistNode<Msg, NodeState> {
  const dedupe = o.dedupe && o.strategy !== 'arrival';
  const rnd = mulberry32(o.seed ^ fnv1a(me));
  const base = o.syncBaseMs ?? SYNC.baseMs;
  const cap = o.syncCapMs ?? SYNC.capMs;
  const delayFor = (attempt: number) => backoffDelay(attempt, rnd, base, cap);
  let log: Op[] = [];
  const ids = new Set<string>();
  let outbox: string[] = [];
  const sent = new Set<string>();
  const acked = new Set<string>();
  const notices: string[] = [];
  const rolledBack: Op[] = [];
  let naive = emptyNaive();
  let airplane = false;
  const offlineAt = (t: number) => o.airplane.some((a) => a.device === me && t >= a.from && t < a.to);
  let lamport = 0;
  let seq = 0;
  let cursor = 0;
  let attempt = 0;
  let heard = true;

  const take = (op: Op) => {
    lamport = Math.max(lamport, op.lamport);
    if (dedupe && ids.has(op.id)) return;
    ids.add(op.id);
    log.push(op);
    naive = applyNaive(naive, op);
  };
  const flush = (ctx: NodeCtx<Msg>) => {
    if (airplane) return;
    heard = false;
    if (outbox.length > 0) {
      const ops = outbox.map((id) => log.find((x) => x.id === id)).filter((x): x is Op => x !== undefined);
      ops.forEach((x) => sent.add(x.id));
      ctx.send('server', { type: 'push', ops });
    }
    ctx.send('server', { type: 'pull', since: cursor });
  };
  const makeOp = (action: Action, wall: number): Op => {
    seq++;
    lamport++;
    const visible = localView(o.strategy, log, naive).items.filter((i) => !i.deleted);
    const head = { id: `${me}:${seq}`, device: me, seq, lamport, wall, observed: idsOf(log) };
    if (action.kind === 'inc') return { ...head, kind: 'inc' };
    if (action.kind === 'add') return { ...head, kind: 'add', title: action.title };
    if (visible.length === 0) return { ...head, kind: 'add', title: `Item ${seq}` };
    const item = visible[action.pick % visible.length];
    if (action.kind === 'rename') return { ...head, kind: 'rename', item: item.id, title: action.title };
    if (action.kind === 'tick') return { ...head, kind: 'tick', item: item.id, done: !item.done };
    return { ...head, kind: 'delete', item: item.id };
  };

  return {
    init: (ctx) => ctx.setTimer('sync', delayFor(0)),
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'edit') {
        airplane = offlineAt(ctx.trueNow);
        const op = makeOp(m.action, ctx.now());
        take(op);
        outbox.push(op.id);
        flush(ctx);
      } else if (m.type === 'update') {
        heard = true;
        attempt = 0;
        for (const op of m.ops) take(op);
        // Only a pull reply covers the log contiguously from the cursor; a forwarded update may have skipped lost ones before it.
        if (m.upTo !== null) cursor = Math.max(cursor, m.upTo);
      } else if (m.type === 'ack') {
        heard = true;
        attempt = 0;
        for (const id of m.ids) {
          acked.add(id);
          sent.delete(id);
        }
        outbox = outbox.filter((id) => !m.ids.includes(id));
      } else if (m.type === 'reject') {
        heard = true;
        attempt = 0;
        const op = log.find((x) => x.id === m.id);
        if (op) {
          rolledBack.push(op);
          notices.push(`${opText(op)} was rejected by the server (${m.reason}) and rolled back`);
        }
        log = log.filter((x) => x.id !== m.id);
        ids.delete(m.id);
        outbox = outbox.filter((id) => id !== m.id);
        sent.delete(m.id);
        naive = log.reduce(applyNaive, emptyNaive());
      }
    },
    onTimer: (ctx) => {
      airplane = offlineAt(ctx.trueNow);
      if (!airplane) {
        attempt = heard ? 0 : attempt + 1;
        flush(ctx);
      }
      ctx.setTimer('sync', delayFor(airplane ? 0 : attempt));
    },
    snapshot: (): DeviceState => ({ role: 'device', id: me, log, ids, outbox, sent, acked, notices, rolledBack, airplane, naive, attempt, cursor }),
  };
}

const validate = (op: Op): string | null => (op.kind === 'rename' && (op.title ?? '').trim() === '' ? BLANK_REASON : null);

function serverNode(o: NodeOptions): DistNode<Msg, NodeState> {
  const dedupe = o.dedupe && o.strategy !== 'arrival';
  const log: Op[] = [];
  const ids = new Set<string>();
  const rejected = new Map<string, string>();
  let naive = emptyNaive();
  return {
    init: () => {},
    onTimer: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'push') {
        const fresh: Op[] = [];
        const okIds: string[] = [];
        for (const op of m.ops) {
          const known = rejected.get(op.id);
          if (known !== undefined) {
            ctx.send(msg.from, { type: 'reject', id: op.id, reason: known });
            continue;
          }
          const bad = validate(op);
          if (bad !== null) {
            rejected.set(op.id, bad);
            ctx.send(msg.from, { type: 'reject', id: op.id, reason: bad });
            continue;
          }
          okIds.push(op.id);
          if (dedupe && ids.has(op.id)) continue;
          ids.add(op.id);
          log.push(op);
          naive = applyNaive(naive, op);
          fresh.push(op);
        }
        if (okIds.length > 0) ctx.send(msg.from, { type: 'ack', ids: okIds });
        if (fresh.length > 0) for (const d of DEVICES) if (d !== msg.from) ctx.send(d, { type: 'update', ops: fresh, upTo: null });
      } else if (m.type === 'pull') {
        ctx.send(msg.from, { type: 'update', ops: log.slice(m.since).filter((x) => x.device !== msg.from), upTo: log.length });
      }
    },
    snapshot: (): ServerState => ({ role: 'server', log, ids, rejected, naive }),
  };
}

// ---- scenarios ---------------------------------------------------------------------------------

export interface Timed {
  at: number;
  device: DeviceId;
  action: Action;
}
export interface Airplane {
  device: DeviceId;
  from: number;
  /** Infinity while the device is still in airplane mode. */
  to: number;
}
export interface ScenarioConfig extends NodeOptions {
  latency: { min: number; max: number };
  loss: number;
  duplicate: number;
  /** The laptop's clock runs this far ahead of true time, ms. */
  skewMs: number;
  script: readonly Timed[];
  /** Network outages the device does not know about (it keeps retrying). */
  outage?: readonly Airplane[];
  /** Add seeded random partitions, a crash and a pause. */
  randomFaults: boolean;
}

export const FAULT_HORIZON_MS = 25_000;
/** A partition that never heals: far beyond any run. */
const FOREVER = 1e12;

export function buildCluster(cfg: ScenarioConfig): Cluster<Msg, NodeState> {
  const c = createCluster<Msg, NodeState>({
    seed: cfg.seed,
    nodes: { phone: deviceNode('phone', cfg), laptop: deviceNode('laptop', cfg), server: serverNode(cfg) },
    latency: cfg.latency,
    loss: cfg.loss,
    duplicate: cfg.duplicate,
    clocks: [{}, { offsetMs: cfg.skewMs }, {}],
  });
  for (const t of cfg.script) c.inject(t.at, t.device, { type: 'edit', action: t.action });
  for (const a of [...cfg.airplane, ...(cfg.outage ?? [])]) c.partition(a.device, 'server', a.from, Number.isFinite(a.to) ? a.to : FOREVER);
  if (cfg.randomFaults) c.randomFaults({ horizonMs: FAULT_HORIZON_MS, partitions: 2, crashes: 1, pauses: 1 });
  return c;
}
