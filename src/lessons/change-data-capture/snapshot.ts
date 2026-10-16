/** Scene 3: a new consumer takes a snapshot of 12 rows, then streams the log. Run on the same harness as the main simulation. */
import { createCluster, type Cluster, type DistNode, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import { DB, POLL_MS, STATUSES, dbNode, type CdcState, type LogRec, type Msg, type Row, type Stmt, type Tx } from './cdc';

export const NEWBIE = 'newbie';
export const SNAPSHOT_ROWS = 12;
export const SCAN_STEP_MS = 5;
export const SCAN_START_MS = 10;
export const SNAPSHOT_END_MS = 500;
export const WRITE_SPAN_MS = 110;

export type StartFrom = 'snapshot' | 'now';

/** The twelve rows that exist before the new consumer arrives. */
export const initialRows = (): Record<number, Row> =>
  Object.fromEntries(Array.from({ length: SNAPSHOT_ROWS }, (_, i) => [i + 1, { status: STATUSES[i % STATUSES.length], amount: 10 * (i + 1) }]));

/** A row the new consumer holds; a tombstone records that it saw the row deleted, and when. */
export interface NewbieRow extends Row {
  lsn: number;
  deleted?: boolean;
}

export interface NewbieState {
  phase: 'scanning' | 'streaming';
  rows: Record<number, NewbieRow>;
  /** Where streaming reads from. */
  cursor: number;
  /** The log position the snapshot started at, once known. */
  startLsn: number | null;
  scanned: number;
}

export type SnapState = CdcState | ({ kind: 'newbie' } & NewbieState);

function newbieNode(from: StartFrom): DistNode<Msg, SnapState> {
  const rows: Record<number, NewbieRow> = {};
  let phase: NewbieState['phase'] = 'scanning';
  let cursor = 0;
  let startLsn: number | null = null;
  let scanned = 0;
  let nextKey = 1;
  return {
    init: (ctx) => {
      ctx.setTimer('scan', SCAN_START_MS);
    },
    onTimer: (ctx, id) => {
      if (id === 'scan' && nextKey <= SNAPSHOT_ROWS) {
        ctx.send(DB, { type: 'scan', key: nextKey });
        nextKey += 1;
        ctx.setTimer('scan', SCAN_STEP_MS);
      } else if (id === 'poll') {
        ctx.send(DB, { type: 'read', from: cursor });
        ctx.setTimer('poll', POLL_MS);
      }
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'row') {
        if (startLsn === null) startLsn = m.lsn;
        rows[m.key] = m.row ? { ...m.row, lsn: m.lsn } : { status: '', amount: 0, lsn: m.lsn, deleted: true };
        scanned += 1;
        if (scanned === SNAPSHOT_ROWS) {
          // the learner's choice, and the whole lesson: stream from where the snapshot began, or from where the log is now
          cursor = from === 'snapshot' ? startLsn : m.lsn;
          phase = 'streaming';
          ctx.setTimer('poll', POLL_MS);
        }
      } else if (m.type === 'batch' && phase === 'streaming') {
        const pending = new Map<number, LogRec[]>();
        for (const r of m.records) {
          if (r.lsn <= cursor) continue;
          if (r.kind === 'change') pending.set(r.txid, [...(pending.get(r.txid) ?? []), r]);
          else if (r.kind === 'rollback') pending.delete(r.txid);
          else if (r.kind === 'commit') {
            for (const c of pending.get(r.txid) ?? []) {
              const cur = rows[c.key!];
              if (cur && cur.lsn >= c.lsn) continue;
              if (c.after) rows[c.key!] = { ...c.after, lsn: c.lsn };
              else rows[c.key!] = { status: '', amount: 0, lsn: c.lsn, deleted: true };
            }
            pending.delete(r.txid);
          }
        }
        cursor = Math.max(cursor, m.upTo);
      }
    },
    snapshot: () => ({ kind: 'newbie', phase, rows: { ...rows }, cursor, startLsn, scanned }),
  };
}

export interface SnapScenario {
  seed: number;
  from: StartFrom;
  /** Writes to the source while the snapshot runs: one update or delete per entry. */
  writes: { at: number; key: number; row: Row | null }[];
}

export function buildSnapshotCluster(s: SnapScenario): Cluster<Msg, SnapState> {
  const cluster = createCluster<Msg, SnapState>({
    seed: s.seed,
    nodes: { [DB]: dbNode(initialRows()) as DistNode<Msg, SnapState>, [NEWBIE]: newbieNode(s.from) },
    latency: { min: 1, max: 1 },
  });
  s.writes.forEach((w, i) => {
    const stmt: Stmt = w.row ? { op: 'update', key: w.key, row: w.row } : { op: 'delete', key: w.key };
    const tx: Tx = { txid: i + 1, stmts: [stmt], outcome: 'commit' };
    cluster.inject(w.at, DB, { type: 'tx', tx });
  });
  return cluster;
}

const dbState = (snap: Parameters<Safety<SnapState>>[0]) => snap.nodes[DB].state as Extract<CdcState, { kind: 'db' }>;
const newbieState = (snap: Parameters<Safety<SnapState>>[0]) => snap.nodes[NEWBIE].state as Extract<SnapState, { kind: 'newbie' }>;

/** S1 for the new consumer: once streaming has passed a committed change, the consumer holds it (or something newer for that key). */
export const newbieNoLoss: Safety<SnapState> = (snap) => {
  const n = newbieState(snap);
  if (n.phase !== 'streaming') return null;
  const log = dbState(snap).log;
  const committed = new Set(log.filter((r) => r.kind === 'commit').map((r) => r.txid));
  const latest = new Map<number, LogRec>();
  for (const r of log) if (r.kind === 'change' && r.lsn <= n.cursor && committed.has(r.txid)) latest.set(r.key!, r);
  for (const r of latest.values()) {
    const have = n.rows[r.key!];
    const ok = !!have && have.lsn >= r.lsn;
    if (!ok) return `streaming has passed LSN ${r.lsn} (key ${r.key}) but the new consumer never received that change`;
  }
  return null;
};

export interface SnapshotEvaluation {
  ok: boolean;
  /** The first failure: the loss when there is one, else the divergence at the end. */
  message: string | null;
  /** The first moment streaming passed a change the new consumer never received. Evaluation stops there, and a later write can cover the loss. */
  loss: string | null;
  /** How the new consumer differs from the source at SNAPSHOT_END_MS, from a run that does not stop at the loss; null when equal. */
  end: string | null;
  /** The cluster where evaluation stopped: at the loss, or at the end of the run. */
  cluster: Cluster<Msg, SnapState>;
}

export function evaluateSnapshot(s: SnapScenario): SnapshotEvaluation {
  const cluster = buildSnapshotCluster(s);
  cluster.start();
  let loss = newbieNoLoss(cluster.snapshot());
  while (!loss && cluster.queued > 0 && cluster.nextTime() <= SNAPSHOT_END_MS) {
    cluster.step();
    loss = newbieNoLoss(cluster.snapshot());
  }
  const atEnd = buildSnapshotCluster(s);
  atEnd.run({ until: SNAPSHOT_END_MS });
  const end = snapshotDivergence(atEnd.snapshot());
  const message = loss ?? end;
  return { ok: message === null, message, loss, end, cluster };
}

export function snapshotDivergence(snap: Parameters<Safety<SnapState>>[0]): string | null {
  const src = dbState(snap).rows;
  const n = newbieState(snap).rows;
  for (let k = 1; k <= SNAPSHOT_ROWS; k++) {
    const a = src[k];
    const b = n[k] && !n[k].deleted ? n[k] : undefined;
    if (!a !== !b || (a && b && (a.status !== b.status || a.amount !== b.amount))) return `the new consumer differs from the source at key ${k}`;
  }
  return null;
}

/** A seeded workload: a few updates and deletes spread over the snapshot, to keys 1 to 12. */
export function seededWrites(seed: number): SnapScenario['writes'] {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const n = 3 + pick(5);
  const deleted = new Set<number>();
  const writes: SnapScenario['writes'] = [];
  for (let i = 0; i < n; i++) {
    const key = 1 + pick(SNAPSHOT_ROWS);
    if (deleted.has(key)) continue;
    const del = rnd() < 0.2;
    if (del) deleted.add(key);
    writes.push({ at: 5 + pick(WRITE_SPAN_MS), key, row: del ? null : { status: STATUSES[pick(STATUSES.length)], amount: 1 + pick(99) } });
  }
  return writes.sort((a, b) => a.at - b.at);
}

export const SNAP_SEEDS = Array.from({ length: 200 }, (_, i) => i);
export const lowestSnapshotFailure = (from: StartFrom): number | undefined =>
  SNAP_SEEDS.find((seed) => !evaluateSnapshot({ seed, from, writes: seededWrites(seed) }).ok);

/** When row `key` is read by the scan, in ms. */
export const scanTimeOf = (key: number) => SCAN_START_MS + (key - 1) * SCAN_STEP_MS + 1;
