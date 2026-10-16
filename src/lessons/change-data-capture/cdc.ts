/**
 * The change-data-capture simulation on core/distSim: a source database with a log, a connector that reads the log
 * from a saved position, and three consumers. Faults, duplicates and delays come from the harness.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export const DB = 'db';
export const CONNECTOR = 'connector';
export const CONSUMERS = ['search', 'cache', 'warehouse'] as const;
export type ConsumerId = (typeof CONSUMERS)[number];
export const CONSUMER_LABEL: Record<ConsumerId, string> = { search: 'search index', cache: 'cache', warehouse: 'warehouse' };

export const STATUSES = ['new', 'paid', 'shipped'] as const;
export const MAX_KEY = 12;
export const MAX_AMOUNT = 999;
export const MAX_EVENTS_IN_FLIGHT = 64;

export interface Row {
  status: string;
  amount: number;
}

export type StmtOp = 'insert' | 'update' | 'delete';
export interface Stmt {
  op: StmtOp;
  key: number;
  row?: Row;
}
export interface Tx {
  txid: number;
  stmts: Stmt[];
  outcome: 'commit' | 'rollback';
}

export interface LogRec {
  lsn: number;
  txid: number;
  kind: 'change' | 'commit' | 'rollback' | 'ddl';
  op?: StmtOp;
  key?: number;
  before?: Row | null;
  after?: Row | null;
}

export interface Ev {
  op: StmtOp | 'ddl';
  key: number;
  before: Row | null;
  after: Row | null;
  lsn: number;
  txid: number;
}

export type Msg =
  | { type: 'tx'; tx: Tx }
  | { type: 'ddl' }
  | { type: 'read'; from: number }
  | { type: 'batch'; records: LogRec[]; upTo: number }
  | { type: 'event'; ev: Ev }
  | { type: 'ack'; lsn: number }
  | { type: 'dup' }
  | { type: 'scan'; key: number }
  | { type: 'row'; key: number; row: Row | null; lsn: number };

export const POLL_MS = 8;
export const RETRY_MS = 30;
export const APPLY_DELAY_MS = 6;
export const RESTART_MS = 30;
export const END_MS = 500;
export const SLOW_LINK_MS = 40;

export interface Flags {
  /** The consumer acknowledges an event before applying it (the broken order). */
  ackBeforeApply: boolean;
  /** A consumer applies an event only if its lsn is newer than what it holds for that key. */
  idempotent: boolean;
  /** One consumer's link is slow, so its events arrive late and out of step. */
  slowConsumer: ConsumerId | null;
}
export const SAFE_FLAGS: Flags = { ackBeforeApply: false, idempotent: true, slowConsumer: null };

export interface ConsRow extends Row {
  lsn: number;
  deleted: boolean;
}

export type CdcState =
  | { kind: 'db'; rows: Record<number, Row>; log: LogRec[]; rolledBack: number[] }
  | { kind: 'conn'; saved: number; cursor: number; inflight: number; emitted: number }
  | { kind: 'cons'; rows: Record<number, ConsRow>; counter: number; regressions: number; applied: number[]; schema: number; seen: number; pending: number[] };

// ── nodes ─────────────────────────────────────────────────────────────

export function dbNode(initial: Record<number, Row> = {}): DistNode<Msg, CdcState> {
  const rows: Record<number, Row> = { ...initial };
  const log: LogRec[] = [];
  const rolledBack: number[] = [];
  const append = (r: Omit<LogRec, 'lsn'>) => log.push({ ...r, lsn: log.length + 1 });
  return {
    init: () => undefined,
    onTimer: () => undefined,
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'tx') {
        const work: Record<number, Row | undefined> = {};
        for (const s of m.tx.stmts) {
          const before = (s.key in work ? work[s.key] : rows[s.key]) ?? null;
          const after = s.op === 'delete' ? null : s.row!;
          append({ txid: m.tx.txid, kind: 'change', op: s.op, key: s.key, before, after });
          work[s.key] = after ?? undefined;
        }
        if (m.tx.outcome === 'commit') {
          for (const [k, v] of Object.entries(work)) {
            if (v) rows[Number(k)] = v;
            else delete rows[Number(k)];
          }
          append({ txid: m.tx.txid, kind: 'commit' });
        } else {
          rolledBack.push(m.tx.txid);
          append({ txid: m.tx.txid, kind: 'rollback' });
        }
      } else if (m.type === 'ddl') {
        append({ txid: 0, kind: 'ddl' });
      } else if (m.type === 'scan') {
        ctx.send(msg.from, { type: 'row', key: m.key, row: rows[m.key] ?? null, lsn: log.length });
      } else if (m.type === 'read') {
        ctx.send(msg.from, { type: 'batch', records: log.filter((r) => r.lsn > m.from), upTo: log.length });
      }
    },
    snapshot: () => ({ kind: 'db', rows: { ...rows }, log: [...log], rolledBack: [...rolledBack] }),
  };
}

function connectorNode(): DistNode<Msg, CdcState> {
  let saved = 0;
  let cursor = 0;
  let emitted = 0;
  let inflight = new Map<number, { ev: Ev; waiting: Set<string>; sentAt: number }>();
  let lastEvent: Ev | null = null;
  const send = (ctx: NodeCtx<Msg>, ev: Ev, to: string) => ctx.send(to, { type: 'event', ev });
  return {
    init: (ctx) => {
      cursor = saved;
      inflight = new Map();
      ctx.setTimer('poll', POLL_MS);
      ctx.setTimer('retry', RETRY_MS);
    },
    onTimer: (ctx, id) => {
      if (id === 'poll') {
        ctx.send(DB, { type: 'read', from: cursor });
        ctx.setTimer('poll', POLL_MS);
      } else {
        for (const e of inflight.values()) {
          if (ctx.now() - e.sentAt < RETRY_MS) continue;
          e.sentAt = ctx.now();
          for (const c of e.waiting) send(ctx, e.ev, c);
        }
        ctx.setTimer('retry', RETRY_MS);
      }
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'batch') {
        const pending = new Map<number, LogRec[]>();
        for (const r of m.records) {
          if (r.lsn <= cursor) continue;
          if (r.kind === 'change') pending.set(r.txid, [...(pending.get(r.txid) ?? []), r]);
          else if (r.kind === 'rollback') pending.delete(r.txid);
          else if (r.kind === 'commit') {
            for (const c of pending.get(r.txid) ?? []) emit(ctx, { op: c.op!, key: c.key!, before: c.before ?? null, after: c.after ?? null, lsn: c.lsn, txid: c.txid });
            pending.delete(r.txid);
          } else emit(ctx, { op: 'ddl', key: 0, before: null, after: null, lsn: r.lsn, txid: 0 });
        }
        cursor = Math.max(cursor, m.upTo);
        moveSaved();
      } else if (m.type === 'ack') {
        const e = inflight.get(m.lsn);
        if (e) {
          e.waiting.delete(msg.from);
          if (e.waiting.size === 0) inflight.delete(m.lsn);
        }
        moveSaved();
      } else if (m.type === 'dup' && lastEvent) {
        for (const c of ctx.peers.filter((p) => (CONSUMERS as readonly string[]).includes(p))) send(ctx, lastEvent, c);
      }
    },
    snapshot: () => ({ kind: 'conn', saved, cursor, inflight: inflight.size, emitted }),
  };

  function emit(ctx: NodeCtx<Msg>, ev: Ev) {
    emitted += 1;
    lastEvent = ev;
    inflight.set(ev.lsn, { ev, waiting: new Set(CONSUMERS), sentAt: ctx.now() });
    for (const c of CONSUMERS) send(ctx, ev, c);
  }
  function moveSaved() {
    const lows = [...inflight.keys()];
    const next = lows.length ? Math.min(...lows) - 1 : cursor;
    saved = Math.max(saved, next);
  }
}

function consumerNode(flags: Flags, snapshotRows: Record<number, Row> = {}): DistNode<Msg, CdcState> {
  const rows: Record<number, ConsRow> = {};
  for (const [k, v] of Object.entries(snapshotRows)) rows[Number(k)] = { ...v, lsn: 0, deleted: false };
  let counter = Object.values(snapshotRows).reduce((a, r) => a + r.amount, 0);
  let regressions = 0;
  const applied: number[] = [];
  let schema = 0;
  let seen = 0;
  let queue = new Map<string, Ev>();
  let n = 0;
  const apply = (ev: Ev) => {
    if (ev.op === 'ddl') {
      schema = Math.max(schema, ev.lsn);
      return;
    }
    const cur = rows[ev.key];
    if (flags.idempotent && cur && cur.lsn >= ev.lsn) return;
    if (cur && cur.lsn > ev.lsn) regressions += 1;
    rows[ev.key] = ev.after ? { ...ev.after, lsn: ev.lsn, deleted: false } : { status: '', amount: 0, lsn: ev.lsn, deleted: true };
    // an idempotent consumer keeps its total as a function of its rows; a naive one adds each event's change
    counter = flags.idempotent ? Object.values(rows).reduce((a, r) => a + (r.deleted ? 0 : r.amount), 0) : counter + (ev.after?.amount ?? 0) - (ev.before?.amount ?? 0);
    applied.push(ev.txid);
    seen += 1;
  };
  return {
    init: () => {
      queue = new Map();
    },
    onTimer: (_ctx, id) => {
      const ev = queue.get(id);
      if (ev) {
        queue.delete(id);
        apply(ev);
      }
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type !== 'event') return;
      if (flags.ackBeforeApply) {
        ctx.send(msg.from, { type: 'ack', lsn: m.ev.lsn });
        n += 1;
        queue.set(`apply${n}`, m.ev);
        ctx.setTimer(`apply${n}`, APPLY_DELAY_MS);
      } else {
        apply(m.ev);
        ctx.send(msg.from, { type: 'ack', lsn: m.ev.lsn });
      }
    },
    snapshot: () => ({ kind: 'cons', rows: { ...rows }, counter, regressions, applied: [...applied], schema, seen, pending: [...queue.values()].map((e) => e.lsn) }),
  };
}

// ── scenario ──────────────────────────────────────────────────────────

export type TimedTx = { at: number; tx: Tx } | { at: number; ddl: true };
export interface Fault {
  kind: 'crash-connector' | 'crash-consumer' | 'dup';
  at: number;
  consumer?: ConsumerId;
}

export interface Scenario {
  seed: number;
  ops: TimedTx[];
  faults: Fault[];
  flags: Flags;
  /** Network loss and duplication, 0..1. */
  loss: number;
  duplicate: number;
}

/** The network of a seeded run: noisy (loss and duplication) or clean (duplicates then come only from a connector restart). */
export type Network = 'noisy' | 'clean';

export function buildCluster(s: Scenario): Cluster<Msg, CdcState> {
  const nodes: Record<string, DistNode<Msg, CdcState>> = { [DB]: dbNode(), [CONNECTOR]: connectorNode() };
  for (const c of CONSUMERS) nodes[c] = consumerNode(s.flags);
  const cluster = createCluster<Msg, CdcState>({
    seed: s.seed,
    nodes,
    latency: (rnd, from, to) => 1 + Math.floor(rnd() * 5) + (s.flags.slowConsumer !== null && (to === s.flags.slowConsumer || from === s.flags.slowConsumer) ? SLOW_LINK_MS : 0),
    loss: s.loss,
    duplicate: s.duplicate,
  });
  for (const o of s.ops) cluster.inject(o.at, DB, 'ddl' in o ? { type: 'ddl' } : { type: 'tx', tx: o.tx });
  for (const f of s.faults) {
    if (f.kind === 'crash-connector') {
      cluster.crash(CONNECTOR, f.at);
      cluster.restart(CONNECTOR, f.at + RESTART_MS);
    } else if (f.kind === 'crash-consumer') {
      cluster.crash(f.consumer!, f.at);
      cluster.restart(f.consumer!, f.at + RESTART_MS);
    } else cluster.inject(f.at, CONNECTOR, { type: 'dup' });
  }
  return cluster;
}

// ── invariants ────────────────────────────────────────────────────────

const dbOf = (snap: Parameters<Safety<CdcState>>[0]) => snap.nodes[DB].state as Extract<CdcState, { kind: 'db' }>;
const connOf = (snap: Parameters<Safety<CdcState>>[0]) => snap.nodes[CONNECTOR].state as Extract<CdcState, { kind: 'conn' }>;
const consOf = (snap: Parameters<Safety<CdcState>>[0], id: string) => snap.nodes[id].state as Extract<CdcState, { kind: 'cons' }>;

/**
 * S1: the saved position never passes a committed change that some consumer has neither applied nor still holds to apply.
 * It is state-based (a row at or past the change's LSN counts as having it), so a loss that a later write to the same key covers is not
 * reported once covered; the spec's S1, "reaches every consumer at least once", is the stricter delivery rule this approximates.
 */
export const s1NoLoss: Safety<CdcState> = (snap) => {
  const saved = connOf(snap).saved;
  const log = dbOf(snap).log;
  const committed = new Set(log.filter((r) => r.kind === 'commit').map((r) => r.txid));
  for (const r of log) {
    if (r.kind !== 'change' || r.lsn > saved || !committed.has(r.txid)) continue;
    for (const c of CONSUMERS) {
      const have = consOf(snap, c).rows[r.key!];
      if ((!have || have.lsn < r.lsn) && !consOf(snap, c).pending.includes(r.lsn)) return `the saved position is LSN ${saved}, past the committed change at LSN ${r.lsn} (key ${r.key}), and ${CONSUMER_LABEL[c]} has not applied it`;
    }
  }
  return null;
};

/** S2: no consumer ever applies an event older than what it holds for that key. */
export const s2InOrder: Safety<CdcState> = (snap) => {
  for (const c of CONSUMERS) if (consOf(snap, c).regressions > 0) return `${CONSUMER_LABEL[c]} applied an event older than the one it held for its key`;
  return null;
};

/** A rolled-back transaction never appears in a consumer's history. */
export const noRolledBack: Safety<CdcState> = (snap) => {
  const rolled = new Set(dbOf(snap).rolledBack);
  for (const c of CONSUMERS) {
    const bad = consOf(snap, c).applied.find((t) => rolled.has(t));
    if (bad !== undefined) return `${CONSUMER_LABEL[c]} applied a change of rolled-back transaction ${bad}`;
  }
  return null;
};

export const SAFETY: Safety<CdcState>[] = [s1NoLoss, s2InOrder, noRolledBack];
export const RULE_NAMES = ['S1', 'S2', 'S1'] as const;

/** The source table's final state, folded independently from the committed transactions in order. */
export function oracleRows(ops: readonly TimedTx[]): Record<number, Row> {
  const rows: Record<number, Row> = {};
  const txs = ops.filter((o): o is { at: number; tx: Tx } => 'tx' in o).sort((a, b) => a.at - b.at);
  for (const { tx } of txs) {
    if (tx.outcome !== 'commit') continue;
    for (const s of tx.stmts) {
      if (s.op === 'delete') delete rows[s.key];
      else rows[s.key] = s.row!;
    }
  }
  return rows;
}

export const totalOf = (rows: Record<number, Row>) => Object.values(rows).reduce((a, r) => a + r.amount, 0);

/** S3 after the stream drains: every consumer's live rows and counter equal the source table. */
export function convergence(snap: Parameters<Safety<CdcState>>[0]): string | null {
  const src = dbOf(snap).rows;
  for (const c of CONSUMERS) {
    const st = consOf(snap, c);
    const live = Object.entries(st.rows).filter(([, r]) => !r.deleted);
    const keys = new Set([...Object.keys(src), ...live.map(([k]) => k)]);
    for (const k of keys) {
      const a = src[Number(k)];
      const b = st.rows[Number(k)];
      const have = b && !b.deleted ? b : undefined;
      if (!a !== !have || (a && have && (a.status !== have.status || a.amount !== have.amount))) return `${CONSUMER_LABEL[c]} differs from the source at key ${k}`;
    }
    if (st.counter !== totalOf(src)) return `${CONSUMER_LABEL[c]} counts a total of ${st.counter}, the source holds ${totalOf(src)}`;
  }
  return null;
}

/** How the consumers differ from the source once the scenario has run to `until` with no early stop at a violation; null when they all match. */
export function endDivergence(s: Scenario, until = END_MS): string | null {
  const cluster = buildCluster(s);
  cluster.run({ until });
  return convergence(cluster.snapshot());
}

/** Runs a scenario to its end: the first safety violation, else a failed convergence, else none. */
export function evaluate(s: Scenario, until = END_MS): { rule: 'S1' | 'S2' | 'S3' | null; message: string | null; cluster: Cluster<Msg, CdcState>; step: number | null } {
  const cluster = buildCluster(s);
  cluster.start();
  const verify = () => {
    const snap = cluster.snapshot();
    for (let i = 0; i < SAFETY.length; i++) {
      const msg = SAFETY[i](snap);
      if (msg) return { rule: RULE_NAMES[i], message: msg, step: snap.step };
    }
    return null;
  };
  let bad = verify();
  while (!bad && cluster.queued > 0 && cluster.nextTime() <= until) {
    cluster.step();
    bad = verify();
  }
  if (bad) return { ...bad, cluster };
  const conv = convergence(cluster.snapshot());
  return conv ? { rule: 'S3', message: conv, cluster, step: null } : { rule: null, message: null, cluster, step: null };
}

// ── seeded workloads ──────────────────────────────────────────────────

export const WORK_KEYS = 6;
export const MIN_TXS = 6;
export const MAX_TXS_SEEDED = 12;
export const LOSS = 0.08;
export const DUPLICATE = 0.15;
export const WORK_SPAN_MS = 120;

export function seededScenario(seed: number, flags: Flags, network: Network = 'noisy'): Scenario {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const exists = new Set<number>();
  const n = MIN_TXS + pick(MAX_TXS_SEEDED - MIN_TXS + 1);
  const ops: TimedTx[] = [];
  const times = Array.from({ length: n }, () => 5 + pick(WORK_SPAN_MS)).sort((a, b) => a - b);
  times.forEach((at, i) => {
    const stmts: Stmt[] = [];
    const count = 1 + pick(2);
    const shadow = new Set(exists);
    for (let j = 0; j < count; j++) {
      const key = 1 + pick(WORK_KEYS);
      const row = { status: STATUSES[pick(STATUSES.length)], amount: 1 + pick(99) };
      if (!shadow.has(key)) {
        stmts.push({ op: 'insert', key, row });
        shadow.add(key);
      } else if (rnd() < 0.3) {
        stmts.push({ op: 'delete', key });
        shadow.delete(key);
      } else stmts.push({ op: 'update', key, row });
    }
    const outcome = rnd() < 0.2 ? 'rollback' : 'commit';
    if (outcome === 'commit') {
      exists.clear();
      shadow.forEach((k) => exists.add(k));
    }
    ops.push({ at, tx: { txid: i + 1, stmts, outcome } });
  });
  const faults: Fault[] = [];
  if (rnd() < 0.7) faults.push({ kind: 'crash-connector', at: 10 + pick(WORK_SPAN_MS) });
  if (rnd() < 0.7) faults.push({ kind: 'crash-consumer', at: 10 + pick(WORK_SPAN_MS), consumer: CONSUMERS[pick(CONSUMERS.length)] });
  return { seed, ops, faults, flags, loss: network === 'noisy' ? LOSS : 0, duplicate: network === 'noisy' ? DUPLICATE : 0 };
}

export const SEEDS = Array.from({ length: 200 }, (_, i) => i);
export const lowestFailing = (flags: Flags, network: Network = 'noisy'): number | undefined => SEEDS.find((seed) => evaluate(seededScenario(seed, flags, network)).rule !== null);
/** The first seed whose first broken rule is this one (blind apply on a clean network: S2 from seed 0, but S3 alone, the counter, only from seed 7). */
export const lowestFailingAt = (flags: Flags, network: Network, rule: 'S1' | 'S2' | 'S3'): number | undefined => SEEDS.find((seed) => evaluate(seededScenario(seed, flags, network)).rule === rule);
