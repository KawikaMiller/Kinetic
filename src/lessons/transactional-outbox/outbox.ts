/**
 * transactional-outbox: a service, a toy database, a relay, a broker and a consumer, on distSim.
 *
 * "Place an order" touches two systems that cannot commit together: the database and the broker.
 * - `dbfirst`: insert the order, then publish `OrderPlaced`. A crash between the two leaves an order with no event.
 * - `pubfirst`: publish, then insert. A crash between the two leaves an event with no order (a ghost).
 * - `outbox`: one database write puts the order AND an outbox row in a single local transaction (one message to the toy
 *   database is one atomic step); a separate relay reads outbox rows and publishes them, then marks them sent. A crash
 *   between the publish and the mark makes the relay publish the row again: at-least-once.
 * The relay reads in one of four ways (`flag`, `cursor`, `rescan`, `log`), scene 3's subject. The consumer can keep an inbox
 * of event ids and skip a repeat. The database is a toy: commit order and ids are modelled, not a real engine's.
 *
 * Ground truth for the checks: the database's committed orders, the broker's log, and what the consumer handled.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { mulberry32, type Rnd } from '../../core/random';

export type Design = 'dbfirst' | 'pubfirst' | 'outbox';
export type RelayMode = 'flag' | 'cursor' | 'rescan' | 'log';
export const SVC = 'service';
export const DB = 'database';
export const RELAY = 'relay';
export const BROKER = 'broker';
export const CONSUMER = 'consumer';

/** The outbox ids start here, so the polling trap's two ids can be 41 and 42. */
export const FIRST_ID = 41;
export const FIXED_LATENCY_MS = 10;
export const RANDOM_LATENCY_MS = { min: 5, max: 20 } as const;
/** The wait between one step finishing and the next starting: the gap a crash can land in. */
export const STEP_GAP_MS = 5;
export const PLACE_AT_MS = 10;
export const PLACE_EVERY_MS = 60;
export const POLL_MS = 50;
/** The consumer handles an event this long after it arrives (it batches), which keeps a ghost from being an artefact of a race. */
export const CONSUMER_DELAY_MS = 100;
const GIVE_UP_MS = 200;
const INFLIGHT_MS = 200;
export const RESCAN_MARGIN = 10;
export const HORIZON_MS = 1_500;
export const RESTART_AFTER_MS = 100;
export const MAX_ORDERS = 30;
export const AMOUNT_RANGE = { min: 1, max: 500 } as const;

export type OMsg =
  | { type: 'place'; order: number; amount: number; hold: number }
  | { type: 'write'; order: number; amount: number; outbox: boolean; hold: number }
  | { type: 'committed'; order: number }
  | { type: 'publish'; order: number; id: number | null }
  | { type: 'published'; order: number; id: number | null }
  | { type: 'deliver'; order: number }
  | { type: 'poll'; mode: RelayMode; after: number }
  | { type: 'rows'; rows: { id: number; order: number; seq: number }[] }
  | { type: 'mark'; id: number };

export interface OutboxRow {
  id: number;
  order: number;
  /** When the row was inserted (inside a transaction that may still be open). */
  createdAt: number;
  committed: boolean;
  committedAt: number | null;
  /** Commit order among outbox rows (the log position); null until commit. */
  seq: number | null;
  sent: boolean;
  sentAt: number | null;
}
export interface OrderRow {
  order: number;
  amount: number;
  at: number;
}
/** One event the consumer handled: when, and whether it took effect (false: its inbox saw the id before). */
export interface Handled {
  order: number;
  at: number;
  applied: boolean;
}
export interface Published {
  order: number;
  id: number | null;
  at: number;
}
export type OState =
  | { role: 'service'; done: number[]; failed: number[] }
  | { role: 'db'; orders: OrderRow[]; outbox: OutboxRow[] }
  | { role: 'relay'; cursor: number }
  | { role: 'broker'; log: Published[] }
  | { role: 'consumer'; handled: Handled[]; effects: Record<number, number> };
export type OCluster = Cluster<OMsg, OState>;

export interface CrashSpec {
  at: number;
  /** ms after the crash when the node restarts (null: it stays down). */
  restartAfter: number | null;
}

export interface OutboxSetup {
  seed: number;
  design: Design;
  relay: RelayMode;
  dedupe: boolean;
  /** Orders placed (the scenes place 1 or 2; the sweeps 3). */
  orders: number;
  /** ms between one order's request and the next (1 puts two transactions in flight together). */
  placeEveryMs: number;
  /** Per order, how long its database transaction stays open before it commits (0: at once). Index 0 is order 1. */
  holds: readonly number[];
  amounts: readonly number[];
  crashService: CrashSpec | null;
  crashRelay: CrashSpec | null;
  /** The broker loses the first publish it is sent (it never reaches the broker). */
  dropPublish: boolean;
  fixedLatency: boolean;
  loss: number;
  duplicate: number;
}

export const DEFAULT_OUTBOX: OutboxSetup = {
  seed: 0,
  design: 'dbfirst',
  relay: 'flag',
  dedupe: false,
  orders: 1,
  placeEveryMs: PLACE_EVERY_MS,
  holds: [0],
  amounts: [120],
  crashService: null,
  crashRelay: null,
  dropPublish: false,
  fixedLatency: true,
  loss: 0,
  duplicate: 0,
};

/* ---------- nodes ---------- */

function serviceNode(s: OutboxSetup): DistNode<OMsg, OState> {
  const done: number[] = [];
  const failed: number[] = [];
  let progress = new Map<number, { amount: number; hold: number }>();
  const writeStep = (ctx: NodeCtx<OMsg>, order: number, p: { amount: number; hold: number }) =>
    ctx.send(DB, { type: 'write', order, amount: p.amount, outbox: s.design === 'outbox', hold: p.hold });
  const publishStep = (ctx: NodeCtx<OMsg>, order: number) => ctx.send(BROKER, { type: 'publish', order, id: null });
  const armGiveUp = (ctx: NodeCtx<OMsg>, order: number) => ctx.setTimer(`giveup:${order}`, GIVE_UP_MS);
  const finish = (order: number) => {
    progress.delete(order);
    done.push(order);
  };

  return {
    init: () => {
      progress = new Map();
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'place') {
        const p = { amount: m.amount, hold: m.hold };
        progress.set(m.order, p);
        armGiveUp(ctx, m.order);
        if (s.design === 'pubfirst') publishStep(ctx, m.order);
        else writeStep(ctx, m.order, p);
      } else if (m.type === 'committed') {
        if (!progress.has(m.order)) return;
        if (s.design === 'dbfirst') ctx.setTimer(`next:${m.order}`, STEP_GAP_MS);
        else finish(m.order);
      } else if (m.type === 'published') {
        if (!progress.has(m.order)) return;
        if (s.design === 'pubfirst') ctx.setTimer(`next:${m.order}`, STEP_GAP_MS);
        else finish(m.order);
      }
    },
    onTimer: (ctx, timerId) => {
      const [kind, id] = timerId.split(':');
      const order = Number(id);
      const p = progress.get(order);
      if (!p) return;
      if (kind === 'next') {
        if (s.design === 'dbfirst') publishStep(ctx, order);
        else writeStep(ctx, order, p);
      } else if (kind === 'giveup') {
        progress.delete(order);
        failed.push(order);
      }
    },
    snapshot: () => ({ role: 'service', done: [...done], failed: [...failed] }),
  };

}

function dbNode(): DistNode<OMsg, OState> {
  const orders: OrderRow[] = [];
  const outbox: OutboxRow[] = [];
  const pending = new Map<number, { from: string; amount: number; id: number | null }>();
  let nextId = FIRST_ID;
  let seq = 0;
  const commit = (ctx: NodeCtx<OMsg>, order: number) => {
    const p = pending.get(order);
    if (!p) return;
    pending.delete(order);
    orders.push({ order, amount: p.amount, at: ctx.trueNow });
    const row = outbox.find((r) => r.id === p.id);
    if (row) {
      row.committed = true;
      row.committedAt = ctx.trueNow;
      row.seq = ++seq;
    }
    ctx.send(p.from, { type: 'committed', order });
  };
  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'write') {
        if (pending.has(m.order) || orders.some((o) => o.order === m.order)) return;
        const id = m.outbox ? nextId++ : null;
        if (id !== null) outbox.push({ id, order: m.order, createdAt: ctx.trueNow, committed: false, committedAt: null, seq: null, sent: false, sentAt: null });
        pending.set(m.order, { from: msg.from, amount: m.amount, id });
        if (m.hold > 0) ctx.setTimer(`commit:${m.order}`, m.hold);
        else commit(ctx, m.order);
      } else if (m.type === 'poll') {
        const visible = outbox.filter((r) => r.committed);
        let rows: OutboxRow[];
        if (m.mode === 'log') rows = visible.filter((r) => r.seq! > m.after).sort((a, b) => a.seq! - b.seq!);
        else if (m.mode === 'cursor') rows = visible.filter((r) => r.id > m.after).sort((a, b) => a.id - b.id);
        else if (m.mode === 'rescan') rows = visible.filter((r) => r.id > m.after - RESCAN_MARGIN && !r.sent).sort((a, b) => a.id - b.id);
        else rows = visible.filter((r) => !r.sent).sort((a, b) => a.id - b.id);
        ctx.send(msg.from, { type: 'rows', rows: rows.map((r) => ({ id: r.id, order: r.order, seq: r.seq! })) });
      } else if (m.type === 'mark') {
        const row = outbox.find((r) => r.id === m.id);
        if (row && !row.sent) {
          row.sent = true;
          row.sentAt = ctx.trueNow;
        }
      }
    },
    onTimer: (ctx, timerId) => {
      if (timerId.startsWith('commit:')) commit(ctx, Number(timerId.slice(7)));
    },
    snapshot: () => ({ role: 'db', orders: orders.map((o) => ({ ...o })), outbox: outbox.map((r) => ({ ...r })) }),
  };
}

function relayNode(s: OutboxSetup): DistNode<OMsg, OState> {
  /** The stored cursor: the highest id (or log position) up to which every row has been published. It survives a restart, like a row in a table. */
  let cursor = 0;
  interface Sent {
    order: number;
    position: number;
    at: number;
    acked: boolean;
  }
  let inflight = new Map<number, Sent>();
  /** Move the cursor over the leading rows that are acknowledged; a row still waiting for its ack holds it back. */
  const advance = () => {
    const rows = [...inflight.values()].sort((x, y) => x.position - y.position);
    for (const row of rows) {
      if (row.position <= cursor) continue;
      if (!row.acked) return;
      cursor = row.position;
    }
  };
  return {
    init: (ctx) => {
      inflight = new Map();
      ctx.setTimer('poll', POLL_MS);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'rows') {
        for (const r of m.rows) {
          const sent = inflight.get(r.id);
          if (sent && (sent.acked || ctx.trueNow - sent.at < INFLIGHT_MS)) continue;
          inflight.set(r.id, { order: r.order, position: s.relay === 'log' ? r.seq : r.id, at: ctx.trueNow, acked: false });
          ctx.send(BROKER, { type: 'publish', order: r.order, id: r.id });
        }
      } else if (m.type === 'published' && m.id !== null) {
        const row = inflight.get(m.id);
        if (!row) return;
        row.acked = true;
        ctx.send(DB, { type: 'mark', id: m.id });
        advance();
      }
    },
    onTimer: (ctx) => {
      ctx.send(DB, { type: 'poll', mode: s.relay, after: cursor });
      ctx.setTimer('poll', POLL_MS);
    },
    snapshot: () => ({ role: 'relay', cursor }),
  };
}

function brokerNode(): DistNode<OMsg, OState> {
  const log: Published[] = [];
  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type !== 'publish') return;
      log.push({ order: m.order, id: m.id, at: ctx.trueNow });
      ctx.send(msg.from, { type: 'published', order: m.order, id: m.id });
      ctx.send(CONSUMER, { type: 'deliver', order: m.order });
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'broker', log: log.map((p) => ({ ...p })) }),
  };
}

function consumerNode(s: OutboxSetup): DistNode<OMsg, OState> {
  const handled: Handled[] = [];
  const effects: Record<number, number> = {};
  const queue: number[] = [];
  const inbox = new Set<number>();
  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      if (msg.payload.type !== 'deliver') return;
      queue.push(msg.payload.order);
      ctx.setTimer(`handle:${queue.length}`, CONSUMER_DELAY_MS);
    },
    onTimer: (ctx, timerId) => {
      const order = queue[Number(timerId.slice(7)) - 1];
      const applied = !(s.dedupe && inbox.has(order));
      handled.push({ order, at: ctx.trueNow, applied });
      if (!applied) return;
      inbox.add(order);
      effects[order] = (effects[order] ?? 0) + 1;
    },
    snapshot: () => ({ role: 'consumer', handled: handled.map((h) => ({ ...h })), effects: { ...effects } }),
  };
}

export function outboxCluster(s: OutboxSetup): OCluster {
  const c = createCluster<OMsg, OState>({
    seed: s.seed,
    nodes: { [SVC]: serviceNode(s), [DB]: dbNode(), [RELAY]: relayNode(s), [BROKER]: brokerNode(), [CONSUMER]: consumerNode(s) },
    latency: (rnd) => (s.fixedLatency ? FIXED_LATENCY_MS : Math.round(RANDOM_LATENCY_MS.min + rnd() * (RANDOM_LATENCY_MS.max - RANDOM_LATENCY_MS.min))),
    loss: s.loss,
    duplicate: s.duplicate,
  });
  for (let i = 0; i < s.orders; i++) {
    c.inject(PLACE_AT_MS + i * s.placeEveryMs, SVC, { type: 'place', order: i + 1, amount: s.amounts[i] ?? 100, hold: s.holds[i] ?? 0 });
  }
  const crash = (node: string, spec: CrashSpec | null) => {
    if (!spec) return;
    c.crash(node, spec.at);
    if (spec.restartAfter !== null) c.restart(node, spec.at + spec.restartAfter);
  };
  crash(SVC, s.crashService);
  crash(RELAY, s.crashRelay);
  if (s.dropPublish) {
    let dropped = false;
    c.dropNext((m) => {
      if (dropped || m.payload.type !== 'publish') return false;
      dropped = true;
      return true;
    });
  }
  return c;
}

/* ---------- scripted faults (scenes 1 and 2) ---------- */

export type Fault = 'none' | 'before' | 'between' | 'after' | 'publish-fails' | 'relay-mid' | 'after-commit';
export const FAULT_LABEL: Record<Fault, string> = {
  none: 'No crash',
  before: 'Before step 1',
  between: 'Between the steps',
  after: 'After step 2, before the response',
  'publish-fails': 'The publish fails',
  'after-commit': 'After the commit',
  'relay-mid': 'Relay: between publish and mark',
};
/**
 * With fixed 10 ms latency a placement runs: request at 10, first step lands at 20 and is acknowledged at 30, the next
 * step starts 5 ms later (35), lands at 45 and is acknowledged at 55. The crash instants sit in those windows (a test checks
 * each against the trace).
 */
export const CRASH_AT = { before: 5, between: 32, after: 56, afterCommit: 25, relayMid: 75 } as const;

export function faultSetup(base: OutboxSetup, fault: Fault): OutboxSetup {
  const down = (at: number): CrashSpec => ({ at, restartAfter: RESTART_AFTER_MS });
  const s = { ...base, crashService: null, crashRelay: null, dropPublish: false };
  switch (fault) {
    case 'before': return { ...s, crashService: down(CRASH_AT.before) };
    case 'between': return { ...s, crashService: down(CRASH_AT.between) };
    case 'after': return { ...s, crashService: down(CRASH_AT.after) };
    case 'after-commit': return { ...s, crashService: down(CRASH_AT.afterCommit) };
    case 'relay-mid': return { ...s, crashRelay: down(CRASH_AT.relayMid) };
    case 'publish-fails': return { ...s, dropPublish: true };
    case 'none': return s;
  }
}

/* ---------- reading a run ---------- */

type Snap = { nodes: Record<string, { state?: OState }> };
const stateOf = <R extends OState['role']>(snap: Snap, id: string, _role: R) => snap.nodes[id].state as Extract<OState, { role: R }>;

export type Outcome = 'consistent' | 'lost event' | 'ghost' | 'duplicate' | 'nothing';
export const OUTCOME_WORD: Record<Outcome, string> = {
  consistent: 'consistent: the order and its event both exist',
  'lost event': 'a lost event: the order exists, the event never came',
  ghost: 'a ghost: the event came, the order does not exist',
  duplicate: 'a duplicate: the event was published more than once',
  nothing: 'nothing happened: neither the order nor the event (consistent)',
};

export interface OutboxRun {
  setup: OutboxSetup;
  cluster: OCluster;
  orders: OrderRow[];
  outbox: OutboxRow[];
  published: Published[];
  handled: Handled[];
  effects: Record<number, number>;
  done: number[];
  failed: number[];
  end: number;
}

export function runOutbox(setup: OutboxSetup, until = HORIZON_MS): OutboxRun {
  const cluster = outboxCluster(setup);
  cluster.run({ until });
  const snap = cluster.snapshot();
  const db = stateOf(snap, DB, 'db');
  const svc = stateOf(snap, SVC, 'service');
  const consumer = stateOf(snap, CONSUMER, 'consumer');
  const trace = cluster.trace;
  return {
    setup,
    cluster,
    orders: db.orders,
    outbox: db.outbox,
    published: stateOf(snap, BROKER, 'broker').log,
    handled: consumer.handled,
    effects: consumer.effects,
    done: svc.done,
    failed: svc.failed,
    end: trace.length ? trace[trace.length - 1].t : 0,
  };
}

/** What became of order `order`: read from the database and the broker, at the end of the run. */
export function outcomeOf(run: OutboxRun, order = 1): Outcome {
  const committed = run.orders.some((o) => o.order === order);
  const published = run.published.filter((p) => p.order === order).length;
  if (committed && published === 0) return 'lost event';
  if (!committed && published > 0) return 'ghost';
  if (committed && published > 1) return 'duplicate';
  return committed ? 'consistent' : 'nothing';
}

/** Orders committed whose event the broker never got. */
export const unpublishedOrders = (run: OutboxRun): number[] => run.orders.filter((o) => !run.published.some((p) => p.order === o.order)).map((o) => o.order);

/* ---------- invariants ---------- */

/** O1: every event the consumer has handled belongs to a committed order. */
export const o1NoGhost: Safety<OState> = (snap) => {
  const committed = new Set(stateOf(snap, DB, 'db').orders.map((o) => o.order));
  const ghost = stateOf(snap, CONSUMER, 'consumer').handled.find((h) => !committed.has(h.order))?.order;
  return ghost === undefined ? null : `the consumer handled an event for order ${ghost}, which is not in the database`;
};

/** O3: with the consumer's inbox, each order's effect is applied at most once. */
export const o3EffectOnce: Safety<OState> = (snap) => {
  const twice = Object.entries(stateOf(snap, CONSUMER, 'consumer').effects).find(([, n]) => n > 1);
  return twice ? `order ${twice[0]}'s effect was applied ${twice[1]} times` : null;
};
export const OUTBOX_SAFETY: readonly Safety<OState>[] = [o1NoGhost, o3EffectOnce];
export const OUTBOX_RULE = ['O1', 'O3'] as const;

/* ---------- seeded schedules ---------- */

const SWEEP_STREAM = 0x2545f491;
const CRASH_WINDOW_MS = 260;
const pickCrash = (rnd: Rnd): CrashSpec | null =>
  rnd() < 0.7 ? { at: Math.round(rnd() * CRASH_WINDOW_MS), restartAfter: 50 + Math.round(rnd() * 100) } : null;

/** The two-transaction interleaving of scene 3: order 1 gets id 41, order 2 gets id 42, and one of them commits first. */
export type Ordering = 't1-first' | 't2-first';
export const ORDERING_LABEL: Record<Ordering, string> = { 't1-first': 'id 41 commits first', 't2-first': 'id 42 commits first' };
const HOLD_FAST_MS = 20;
const HOLD_SLOW_MS = 60;
export function pollingSetup(relay: RelayMode, ordering: Ordering): OutboxSetup {
  return {
    ...DEFAULT_OUTBOX,
    design: 'outbox',
    relay,
    orders: 2,
    placeEveryMs: 1,
    holds: ordering === 't1-first' ? [HOLD_FAST_MS, HOLD_SLOW_MS] : [HOLD_SLOW_MS, HOLD_FAST_MS],
    amounts: [120, 80],
  };
}

/**
 * The family scene 4 compares every design on: two orders in flight together whose transactions stay open for random times (so which
 * commits first varies), plus the same random service and relay crashes as the other sweeps, and no message loss.
 */
export function compareSweep(seed: number, design: Design, relay: RelayMode, dedupe: boolean, network = false): OutboxSetup {
  const rnd = mulberry32(seed ^ SWEEP_STREAM);
  const hold = () => 20 + 10 * Math.floor(rnd() * 7);
  const holds = [hold(), hold()];
  const crashService = pickCrash(rnd);
  const crashRelay = pickCrash(rnd);
  const loss = 0.05 * Math.floor(rnd() * 4);
  const duplicate = 0.05 * Math.floor(rnd() * 4);
  return {
    ...pollingSetup(relay, 't1-first'),
    seed,
    design,
    dedupe,
    holds: design === 'outbox' ? holds : [0, 0],
    crashService,
    crashRelay,
    fixedLatency: false,
    loss: network ? loss : 0,
    duplicate: network ? duplicate : 0,
  };
}
/** With network, lost and duplicated messages are added to the draw. */
export const compareScenario = (design: Design, relay: RelayMode, dedupe: boolean, network = false) => (seed: number) => outboxCluster(compareSweep(seed, design, relay, dedupe, network));

export type RuleId = 'O1' | 'O2' | 'O3';
export type RulesBroken = Record<RuleId, number | null>;

/**
 * Run make for seeds 0..n-1 and report, for each rule, the lowest seed that breaks it (null: none does in n seeds).
 * O1 and O3 are checked after every event; O2 once the run has quiesced. The three rules are tracked independently, so one design
 * can be shown to break one and keep another.
 */
export function rulesBroken(make: (seed: number) => OCluster, n: number): RulesBroken {
  const broken: RulesBroken = { O1: null, O2: null, O3: null };
  for (let seed = 0; seed < n; seed++) {
    const c = make(seed);
    c.start();
    const check = () => {
      const snap = c.snapshot();
      if (broken.O1 === null && o1NoGhost(snap) !== null) broken.O1 = seed;
      if (broken.O3 === null && o3EffectOnce(snap) !== null) broken.O3 = seed;
    };
    check();
    while (c.queued > 0 && c.nextTime() <= HORIZON_MS) {
      c.step();
      check();
    }
    if (broken.O2 === null) {
      const snap = c.snapshot();
      const log = stateOf(snap, BROKER, 'broker').log;
      if (stateOf(snap, DB, 'db').orders.some((o) => !log.some((p) => p.order === o.order))) broken.O2 = seed;
    }
  }
  return broken;
}

/** The designs scene 4 puts side by side, each as a seeded scenario (with or without the consumer's inbox). */
export const DESIGNS: { id: string; label: string; make: (dedupe: boolean) => (seed: number) => OCluster }[] = [
  { id: 'dbfirst', label: 'Dual write, database first', make: (d) => compareScenario('dbfirst', 'flag', d) },
  { id: 'pubfirst', label: 'Dual write, publish first', make: (d) => compareScenario('pubfirst', 'flag', d) },
  { id: 'poll-flag', label: 'Outbox, polling for unsent rows', make: (d) => compareScenario('outbox', 'flag', d) },
  { id: 'poll-cursor', label: 'Outbox, polling by id cursor', make: (d) => compareScenario('outbox', 'cursor', d) },
  { id: 'cdc', label: 'Outbox, reading the commit log', make: (d) => compareScenario('outbox', 'log', d) },
];

/** Pinned: the lowest seed of forSeeds(0..199) on which a design breaks the named rule on the comparison family (a test recomputes each). */
export const PINNED: Record<string, { seed: number; rule: RuleId }> = {
  dbfirst: { seed: 28, rule: 'O2' },
  pubfirst: { seed: 28, rule: 'O1' },
  'poll-flag': { seed: 1, rule: 'O3' },
  'poll-cursor': { seed: 3, rule: 'O2' },
};

/** Scene 1's table: every crash point against both orders of the two steps, each cell the outcome of actually running it. */
export const CASE_FAULTS: readonly Fault[] = ['before', 'between', 'after', 'publish-fails'];
export type DualDesign = Extract<Design, 'dbfirst' | 'pubfirst'>;
export const DUAL_DESIGNS: readonly DualDesign[] = ['dbfirst', 'pubfirst'];
export function caseTable(): { fault: Fault; design: DualDesign; outcome: Outcome }[] {
  return CASE_FAULTS.flatMap((fault) =>
    DUAL_DESIGNS.map((design) => ({ fault, design, outcome: outcomeOf(runOutbox(faultSetup({ ...DEFAULT_OUTBOX, design }, fault))) })),
  );
}
