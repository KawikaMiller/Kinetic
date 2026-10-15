/**
 * kafka-partitioned-log, scene 3: one partition replicated over three brokers, on distSim.
 *
 * Followers pull from the leader (a fetch carries the ids the follower holds; the leader answers with what it lacks, or says where
 * to truncate when the logs diverge). The leader keeps the in-sync set (ISR) and the high watermark (HWM): the highest offset every
 * ISR member holds. A controller node watches heartbeats, elects a new leader from the ISR (or, with unclean election on, from any
 * live broker when no ISR member is left), and stores the ISR. The leader changes the ISR only through the controller, and counts a
 * follower it has asked to add as a member for the HWM until the answer comes back, so a replica elected from the stored ISR holds
 * everything the leader acknowledged under acks=all.
 *
 * Simplified on purpose (the lesson says so): one partition; the controller never fails; broker disks survive a crash; the producer
 * is idempotent (the leader ignores a record id it already has) and never retries; heartbeats stand in for sessions; timings are
 * milliseconds of simulated time. None of the names or numbers are Kafka's.
 */
import { createCluster, checkInvariants, type Cluster, type CheckResult, type DistNode, type Latency, type NodeCtx, type Safety, type Snapshot } from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export const BROKERS = ['b1', 'b2', 'b3'] as const;
export const CONTROLLER = 'ctl';
export const PRODUCER = 'producer';
export type Acks = 0 | 1 | 'all';
export type MinIsr = 1 | 2;

export interface ReplConfig {
  acks: Acks;
  /** Only the leader of an `acks=all` partition looks at this; the other acks levels ignore it. */
  minIsr: MinIsr;
  unclean: boolean;
}

export const FETCH_MS = 10;
export const HEARTBEAT_MS = 10;
export const CHECK_MS = 10;
/** The controller calls a broker dead after this long without a heartbeat. */
export const SESSION_MS = 30;
/** The leader drops a follower from the ISR after this long without it catching up. */
export const LAG_MS = 30;
export const PRODUCE_TIMEOUT_MS = 80;
export const FIXED_LATENCY_MS = 2;
export const SLOW_LATENCY_MS = 40;
export const HORIZON_MS = 200;
export const FIRST_LEADER = 'b1';

export type ReplMsg =
  | { type: 'send'; id: number }
  | { type: 'produce'; id: number }
  | { type: 'ack'; id: number; offset: number }
  | { type: 'refused'; id: number; reason: 'not-enough-replicas' | 'not-leader' }
  | { type: 'fetch'; epoch: number; ids: number[] }
  | { type: 'data'; epoch: number; from: number; ids: number[]; hwm: number }
  | { type: 'truncate'; epoch: number; to: number }
  | { type: 'hb' }
  | { type: 'meta'; leader: string | null; epoch: number; isr: string[]; ver: number }
  | { type: 'alterIsr'; epoch: number; isr: string[]; ver: number };

export type RecordFate = 'open' | 'acked' | 'refused' | 'failed' | 'sent';
export interface ProducerRecord {
  id: number;
  at: number;
  fate: RecordFate;
  offset?: number;
  ackedAt?: number;
  reason?: string;
}
export interface BrokerState {
  role: 'broker';
  log: number[];
  hwm: number;
  leader: string | null;
  epoch: number;
  isr: string[];
  /** Counts restarts, so a check can tell one run of a broker from the next. */
  incarnation: number;
}
export interface ControllerState {
  role: 'controller';
  leader: string | null;
  epoch: number;
  isr: string[];
}
export interface ProducerState {
  role: 'producer';
  records: ProducerRecord[];
}
export type ReplState = BrokerState | ControllerState | ProducerState;
export type ReplCluster = Cluster<ReplMsg, ReplState>;
export type ReplSnapshot = Snapshot<ReplState>;

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const inOrder = (xs: readonly string[]) => BROKERS.filter((b) => xs.includes(b));

function brokerNode(cfg: ReplConfig): DistNode<ReplMsg, ReplState> {
  // Durable: survive a crash.
  const log: number[] = [];
  let epoch = 0;
  let incarnation = 0;
  // Volatile: rebuilt after a restart.
  let ver = -1;
  let leader: string | null = null;
  let isr: string[] = [];
  let proposed: string[] | null = null;
  let hwm = 0;
  let fetched: Record<string, number> = {};
  let caughtUpAt: Record<string, number> = {};
  let pending: { id: number; offset: number }[] = [];
  let leaderSince = 0;

  const leads = (ctx: NodeCtx<ReplMsg>) => leader === ctx.id;

  const settlePending = (ctx: NodeCtx<ReplMsg>) => {
    pending = pending.filter((p) => {
      if (hwm <= p.offset) return true;
      // acks=all: the ISR may have shrunk below the minimum while the record waited, which Kafka reports as an error too.
      if (isr.length < cfg.minIsr) ctx.send(PRODUCER, { type: 'refused', id: p.id, reason: 'not-enough-replicas' });
      else ctx.send(PRODUCER, { type: 'ack', id: p.id, offset: p.offset });
      return false;
    });
  };

  const recomputeHwm = (ctx: NodeCtx<ReplMsg>) => {
    const members = new Set([...isr, ...(proposed ?? [])]);
    let low = log.length;
    for (const b of members) if (b !== ctx.id) low = Math.min(low, fetched[b] ?? 0);
    hwm = Math.max(hwm, Math.min(low, log.length));
    settlePending(ctx);
  };

  const checkIsr = (ctx: NodeCtx<ReplMsg>) => {
    const now = ctx.now();
    const lagging = isr.filter((b) => b !== ctx.id && now - (caughtUpAt[b] ?? leaderSince) > LAG_MS);
    const caught = BROKERS.filter((b) => b !== ctx.id && !isr.includes(b) && fetched[b] === log.length);
    const want = inOrder([...isr.filter((b) => !lagging.includes(b)), ...caught]);
    if (sameSet(want, proposed ?? isr)) return;
    proposed = want;
    ctx.send(CONTROLLER, { type: 'alterIsr', epoch, isr: want, ver });
  };

  const becomeLeader = (ctx: NodeCtx<ReplMsg>) => {
    fetched = {};
    caughtUpAt = {};
    pending = [];
    proposed = null;
    hwm = Math.min(hwm, log.length);
    leaderSince = ctx.now();
    ctx.setTimer('isr', CHECK_MS);
  };

  const stepDown = (ctx: NodeCtx<ReplMsg>) => {
    ctx.cancelTimer('isr');
    pending = [];
    proposed = null;
  };

  const onMeta = (ctx: NodeCtx<ReplMsg>, m: Extract<ReplMsg, { type: 'meta' }>) => {
    if (m.epoch < epoch || (m.epoch === epoch && m.ver <= ver)) return;
    const wasLeader = leads(ctx);
    epoch = m.epoch;
    ver = m.ver;
    leader = m.leader;
    isr = [...m.isr];
    const nowLeader = leads(ctx);
    if (nowLeader && !wasLeader) becomeLeader(ctx);
    else if (nowLeader) {
      proposed = null;
      recomputeHwm(ctx);
    } else if (wasLeader) stepDown(ctx);
  };

  const onProduce = (ctx: NodeCtx<ReplMsg>, m: Extract<ReplMsg, { type: 'produce' }>) => {
    if (!leads(ctx)) {
      ctx.send(PRODUCER, { type: 'refused', id: m.id, reason: 'not-leader' });
      return;
    }
    const seen = log.indexOf(m.id);
    if (seen < 0 && cfg.acks === 'all' && isr.length < cfg.minIsr) {
      ctx.send(PRODUCER, { type: 'refused', id: m.id, reason: 'not-enough-replicas' });
      return;
    }
    const offset = seen >= 0 ? seen : log.push(m.id) - 1;
    if (cfg.acks === 0) return;
    if (cfg.acks === 1) {
      ctx.send(PRODUCER, { type: 'ack', id: m.id, offset });
      return;
    }
    if (!pending.some((p) => p.id === m.id)) pending.push({ id: m.id, offset });
    recomputeHwm(ctx);
  };

  const onFetch = (ctx: NodeCtx<ReplMsg>, from: string, m: Extract<ReplMsg, { type: 'fetch' }>) => {
    if (!leads(ctx) || m.epoch !== epoch) return;
    let agree = 0;
    while (agree < Math.min(m.ids.length, log.length) && m.ids[agree] === log[agree]) agree++;
    if (agree < m.ids.length) {
      ctx.send(from, { type: 'truncate', epoch, to: agree });
      return;
    }
    fetched[from] = m.ids.length;
    if (m.ids.length === log.length) caughtUpAt[from] = ctx.now();
    recomputeHwm(ctx);
    checkIsr(ctx);
    ctx.send(from, { type: 'data', epoch, from: m.ids.length, ids: log.slice(m.ids.length), hwm });
  };

  return {
    init: (ctx) => {
      incarnation++;
      ver = -1;
      leader = null;
      isr = [];
      proposed = null;
      hwm = 0;
      fetched = {};
      caughtUpAt = {};
      pending = [];
      ctx.setTimer('hb', HEARTBEAT_MS);
      ctx.setTimer('fetch', FETCH_MS);
      ctx.send(CONTROLLER, { type: 'hb' });
    },
    onTimer: (ctx, id) => {
      if (id === 'hb') {
        ctx.send(CONTROLLER, { type: 'hb' });
        ctx.setTimer('hb', HEARTBEAT_MS);
      } else if (id === 'fetch') {
        if (leader !== null && !leads(ctx)) ctx.send(leader, { type: 'fetch', epoch, ids: [...log] });
        ctx.setTimer('fetch', FETCH_MS);
      } else if (id === 'isr' && leads(ctx)) {
        if (proposed) ctx.send(CONTROLLER, { type: 'alterIsr', epoch, isr: proposed, ver });
        checkIsr(ctx);
        ctx.setTimer('isr', CHECK_MS);
      }
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'meta') onMeta(ctx, m);
      else if (m.type === 'produce') onProduce(ctx, m);
      else if (m.type === 'fetch') onFetch(ctx, msg.from, m);
      else if (m.type === 'data') {
        if (m.epoch !== epoch || leader !== msg.from) return;
        if (m.from === log.length) log.push(...m.ids);
        hwm = Math.max(hwm, Math.min(m.hwm, log.length));
      } else if (m.type === 'truncate') {
        if (m.epoch !== epoch || leader !== msg.from) return;
        log.length = Math.min(log.length, m.to);
        hwm = Math.min(hwm, log.length);
      }
    },
    snapshot: () => ({ role: 'broker', log: [...log], hwm, leader, epoch, isr: [...isr], incarnation }),
  };
}

function controllerNode(cfg: ReplConfig): DistNode<ReplMsg, ReplState> {
  let epoch = 1;
  let ver = 0;
  let leader: string | null = FIRST_LEADER;
  let isr: string[] = [...BROKERS];
  const seen: Record<string, number> = Object.fromEntries(BROKERS.map((b) => [b, 0]));

  const alive = (ctx: NodeCtx<ReplMsg>, b: string) => ctx.now() - seen[b] <= SESSION_MS;
  const broadcast = (ctx: NodeCtx<ReplMsg>) => {
    for (const to of [...BROKERS, PRODUCER]) ctx.send(to, { type: 'meta', leader, epoch, isr: [...isr], ver });
  };
  const elect = (ctx: NodeCtx<ReplMsg>) => {
    if (leader !== null && alive(ctx, leader)) return;
    const live = BROKERS.filter((b) => alive(ctx, b) && b !== leader);
    const fromIsr = live.filter((b) => isr.includes(b));
    let next: string | null = null;
    let nextIsr = isr;
    if (fromIsr.length > 0) {
      next = fromIsr[0];
      nextIsr = isr.filter((b) => alive(ctx, b));
    } else if (cfg.unclean && live.length > 0) {
      next = live[0];
      nextIsr = [next];
    }
    if (next === leader) return;
    leader = next;
    isr = nextIsr;
    epoch++;
    ver++;
  };

  return {
    init: (ctx) => {
      ctx.setTimer('check', CHECK_MS);
      broadcast(ctx);
    },
    onTimer: (ctx) => {
      elect(ctx);
      broadcast(ctx);
      ctx.setTimer('check', CHECK_MS);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'hb') seen[msg.from] = ctx.now();
      else if (m.type === 'alterIsr' && m.epoch === epoch && msg.from === leader && m.ver === ver && m.isr.includes(msg.from)) {
        isr = inOrder(m.isr);
        ver++;
        broadcast(ctx);
      }
    },
    snapshot: () => ({ role: 'controller', leader, epoch, isr: [...isr] }),
  };
}

function producerNode(cfg: ReplConfig): DistNode<ReplMsg, ReplState> {
  const records: ProducerRecord[] = [];
  let epoch = 0;
  let ver = -1;
  let leader: string | null = null;
  const find = (id: number) => records.find((r) => r.id === id);
  const settle = (r: ProducerRecord | undefined, patch: Partial<ProducerRecord>) => {
    if (r && r.fate === 'open') Object.assign(r, patch);
  };
  return {
    init: () => {},
    onTimer: (_ctx, timerId) => {
      if (timerId.startsWith('timeout:')) settle(find(Number(timerId.slice('timeout:'.length))), { fate: 'failed', reason: `no reply in ${PRODUCE_TIMEOUT_MS} ms` });
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'send') {
        const rec: ProducerRecord = { id: m.id, at: ctx.trueNow, fate: 'open' };
        records.push(rec);
        if (leader === null) {
          rec.fate = 'failed';
          rec.reason = 'no leader known';
          return;
        }
        ctx.send(leader, { type: 'produce', id: m.id });
        if (cfg.acks === 0) rec.fate = 'sent';
        else ctx.setTimer(`timeout:${m.id}`, PRODUCE_TIMEOUT_MS);
      } else if (m.type === 'ack') settle(find(m.id), { fate: 'acked', offset: m.offset, ackedAt: ctx.trueNow });
      else if (m.type === 'refused') settle(find(m.id), { fate: 'refused', reason: m.reason === 'not-leader' ? 'not the leader' : 'not enough in-sync replicas' });
      else if (m.type === 'meta' && (m.epoch > epoch || (m.epoch === epoch && m.ver > ver))) {
        epoch = m.epoch;
        ver = m.ver;
        leader = m.leader;
      }
    },
    snapshot: () => ({ role: 'producer', records: records.map((r) => ({ ...r })) }),
  };
}

export type ReplFault =
  | { kind: 'crash'; node: string; at: number; restartAt: number | null }
  | { kind: 'stall'; node: string; from: number; to: number }
  | { kind: 'cut'; node: string; from: number; to: number };

export interface ReplSetup {
  seed: number;
  config: ReplConfig;
  produceAt: readonly number[];
  latency: Latency;
  loss: number;
  duplicate: number;
  faults: readonly ReplFault[];
}

/** A cluster set up and scheduled; run it with `checkInvariants` or `cluster.run`. */
export function replCluster(setup: ReplSetup): ReplCluster {
  const nodes: Record<string, DistNode<ReplMsg, ReplState>> = { [CONTROLLER]: controllerNode(setup.config), [PRODUCER]: producerNode(setup.config) };
  for (const b of BROKERS) nodes[b] = brokerNode(setup.config);
  const c = createCluster<ReplMsg, ReplState>({ seed: setup.seed, nodes, latency: setup.latency, loss: setup.loss, duplicate: setup.duplicate });
  setup.produceAt.forEach((at, i) => c.inject(at, PRODUCER, { type: 'send', id: i + 1 }));
  for (const f of setup.faults) {
    if (f.kind === 'crash') {
      c.crash(f.node, f.at);
      if (f.restartAt !== null) c.restart(f.node, f.restartAt);
    } else if (f.kind === 'stall') c.pause(f.node, f.from, f.to);
    else c.partition([f.node], [...BROKERS, CONTROLLER, PRODUCER].filter((n) => n !== f.node), f.from, f.to);
  }
  return c;
}

/* ---------- the schedules ---------- */

export type ScriptedFault = 'crash-leader' | 'slow-b2' | 'slow-b3';
export const SCRIPTED_PRODUCE_AT = [20, 35, 50, 65, 110, 140] as const;
/** The leader crashes 3 ms after the fourth record is acknowledged and 2 ms before the followers' next fetch of it. */
export const SCRIPTED_CRASH_AT = 68;
export const SCRIPTED_RESTART_AT = 150;
export const SLOW_FOLLOWERS: Record<'slow-b2' | 'slow-b3', string> = { 'slow-b2': 'b2', 'slow-b3': 'b3' };

/** The hand-built schedule: fixed delays, no loss, no randomness at all, so it behaves the same under every seed. */
export function scriptedSetup(config: ReplConfig, faults: readonly ScriptedFault[]): ReplSetup {
  const slow = (['slow-b2', 'slow-b3'] as const).filter((f) => faults.includes(f)).map((f) => SLOW_FOLLOWERS[f]);
  const latency: Latency = (_rnd, from, to) => {
    const follower = slow.find((b) => (from === b && BROKERS.includes(to as (typeof BROKERS)[number])) || (to === b && BROKERS.includes(from as (typeof BROKERS)[number])));
    return follower ? SLOW_LATENCY_MS : FIXED_LATENCY_MS;
  };
  return {
    seed: 0,
    config,
    produceAt: SCRIPTED_PRODUCE_AT,
    latency,
    loss: 0,
    duplicate: 0,
    faults: faults.includes('crash-leader') ? [{ kind: 'crash', node: FIRST_LEADER, at: SCRIPTED_CRASH_AT, restartAt: SCRIPTED_RESTART_AT }] : [],
  };
}

const SCHEDULE_STREAM = 0x6a09e667;
export const SEEDED_RECORDS = 8;
const SEEDED_LATENCY: Latency = { min: 1, max: 6 };
export const SEEDED_LOSS = 0.05;
export const SEEDED_DUPLICATE = 0.1;

/**
 * A seeded schedule: eight records at seeded times and, with `faults` on, loss, duplication and a seeded handful of broker
 * crashes (with restarts), a stalled broker and a broker cut off from the rest. With `faults` off only the delays are random.
 */
export function seededSetup(seed: number, config: ReplConfig, faults: boolean): ReplSetup {
  const rnd = mulberry32(seed ^ SCHEDULE_STREAM);
  const between = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
  const pickBroker = () => BROKERS[Math.floor(rnd() * BROKERS.length)];
  const produceAt = Array.from({ length: SEEDED_RECORDS }, () => between(15, 120)).sort((a, b) => a - b);
  const list: ReplFault[] = [];
  if (faults) {
    const crashes = 1 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < crashes; i++) {
      const at = between(20, 100);
      list.push({ kind: 'crash', node: pickBroker(), at, restartAt: rnd() < 0.8 ? at + between(30, 80) : null });
    }
    const from = between(10, 80);
    list.push({ kind: 'stall', node: pickBroker(), from, to: from + between(20, 50) });
    if (rnd() < 0.5) {
      const cutFrom = between(20, 80);
      list.push({ kind: 'cut', node: pickBroker(), from: cutFrom, to: cutFrom + between(20, 50) });
    }
  }
  return { seed, config, produceAt, latency: SEEDED_LATENCY, loss: faults ? SEEDED_LOSS : 0, duplicate: faults ? SEEDED_DUPLICATE : 0, faults: list };
}

/* ---------- what the model says, from a snapshot ---------- */

const brokerOf = (snap: ReplSnapshot, id: string): BrokerState | null => {
  const s = snap.nodes[id]?.state;
  return s && s.role === 'broker' ? s : null;
};
export const controllerOf = (snap: ReplSnapshot): ControllerState => snap.nodes[CONTROLLER].state as ControllerState;
export const producerOf = (snap: ReplSnapshot): ProducerState => snap.nodes[PRODUCER].state as ProducerState;
export const brokersOf = (snap: ReplSnapshot): Record<string, BrokerState> =>
  Object.fromEntries(BROKERS.map((b) => [b, brokerOf(snap, b)!]));

export interface LostRecord {
  id: number;
  /** Where the leader put it when it answered, or -1 for an acks=0 record that was never confirmed. */
  offset: number;
  /** Who leads now, and does not hold it. */
  leader: string;
}

/** An acks=0 record gets this long to arrive before its absence from the leader counts: a produce is on the wire for a few ms. */
export const SENT_SETTLE_MS = 10;

/** The leader of the moment, when it is up and has itself learned it was elected: a leader that has not heard the news is not judged. */
function leaderInOffice(snap: ReplSnapshot): { id: string; log: number[] } | null {
  const ctl = controllerOf(snap);
  if (ctl.leader === null || !snap.nodes[ctl.leader].up) return null;
  const leader = brokerOf(snap, ctl.leader)!;
  if (leader.leader !== ctl.leader || leader.epoch !== ctl.epoch) return null;
  return { id: ctl.leader, log: leader.log };
}

/**
 * Acknowledged records the current leader does not hold. The leader counts once it is up and has itself learned it was elected:
 * a record that sits only on a dead leader is unavailable, not lost, and a leader that has not heard the news yet is not judged.
 */
export function lostRecords(snap: ReplSnapshot): LostRecord[] {
  const leader = leaderInOffice(snap);
  if (!leader) return [];
  return producerOf(snap).records
    .filter((r) => r.fate === 'acked' && !leader.log.includes(r.id))
    .map((r) => ({ id: r.id, offset: r.offset ?? -1, leader: leader.id }));
}

/**
 * acks=0 records (sent, never confirmed) the leader in office does not hold at time `now`. Nothing is acknowledged at acks=0, so the
 * safety invariant cannot see them; this is what the producer cannot know.
 */
export function missingSentRecords(snap: ReplSnapshot, now: number): LostRecord[] {
  const leader = leaderInOffice(snap);
  if (!leader) return [];
  return producerOf(snap).records
    .filter((r) => r.fate === 'sent' && now - r.at >= SENT_SETTLE_MS && !leader.log.includes(r.id))
    .map((r) => ({ id: r.id, offset: -1, leader: leader.id }));
}

/** Safety: a record the producer was told is stored is never missing from the leader in office. */
export const acknowledgedNeverLost: Safety<ReplState> = (snap) => {
  const lost = lostRecords(snap)[0];
  return lost ? `record r${lost.id} was acknowledged at offset ${lost.offset} and is missing from leader ${lost.leader}` : null;
};

/** A fresh check per run: a live leader's high watermark never goes down within one run of one broker under one epoch. */
export const highWatermarkMonotone = (): Safety<ReplState> => {
  const last = new Map<string, { hwm: number; incarnation: number; epoch: number }>();
  return (snap) => {
    for (const b of BROKERS) {
      const s = brokerOf(snap, b);
      const node = snap.nodes[b];
      if (!s || !node.up || s.leader !== b) {
        last.delete(b);
        continue;
      }
      const before = last.get(b);
      if (before && before.incarnation === s.incarnation && before.epoch === s.epoch && s.hwm < before.hwm) {
        return `the high watermark of leader ${b} fell from ${before.hwm} to ${s.hwm}`;
      }
      last.set(b, { hwm: s.hwm, incarnation: s.incarnation, epoch: s.epoch });
    }
    return null;
  };
};

export type ReplVerdict = CheckResult<ReplMsg>;

export const runChecked = (setup: ReplSetup, until = HORIZON_MS): ReplVerdict =>
  checkInvariants(replCluster(setup), [acknowledgedNeverLost, highWatermarkMonotone()], { until });

/** The lowest seed below `limit` on which the seeded schedule breaks safety for this config, or null. */
export function lowestViolatingSeed(config: ReplConfig, faults: boolean, limit: number): number | null {
  for (let seed = 0; seed < limit; seed++) if (!runChecked(seededSetup(seed, config, faults)).ok) return seed;
  return null;
}

/** The broken mode: the leader acknowledges before any follower has the record, and any live replica can be elected. */
export const BROKEN_CONFIG: ReplConfig = { acks: 1, minIsr: 1, unclean: true };
/** The lowest seed of the seeded schedule that breaks `BROKEN_CONFIG` (replication.test.ts proves nothing lower does). */
export const BROKEN_SEED = 0;
/** acks=all, min.insync.replicas=2 and clean election only: the settings the invariant is claimed for. */
export const SAFE_CONFIG: ReplConfig = { acks: 'all', minIsr: 2, unclean: false };
/** acks=all with min.insync.replicas=1 and unclean election: committed data lost, on this lowest seed (the test proves it). */
export const UNCLEAN_CONFIG: ReplConfig = { acks: 'all', minIsr: 1, unclean: true };
export const UNCLEAN_SEED = 4;
/** How many seeds the lesson searches and its tests run at least. */
export const SEED_COUNT = 200;
