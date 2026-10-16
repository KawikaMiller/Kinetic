/** What the scenes draw, as pure functions of the simulation, plus each scene's opening state. */
import type { LogRow } from '../../components/logRows';
import type { Snapshot, TraceRow } from '../../core/distSim';
import type { Tone } from '../../core/tone';
import {
  CONNECTOR, CONSUMERS, CONSUMER_LABEL, DB, END_MS, MAX_EVENTS_IN_FLIGHT, SAFE_FLAGS, buildCluster, totalOf, type CdcState, type ConsumerId, type Fault, type Flags, type LogRec, type Msg, type Row, type Scenario, type Stmt, type TimedTx, type Tx,
} from './cdc';

export { END_MS };
export const STEP_MS = 10;
export const MAX_OPS = 30;

export const TAIL_OPEN = { now: 0, key: 3, status: 'new', amount: 40, seed: 1 } as const;
export const REPLAY_OPEN = { now: 0, flags: SAFE_FLAGS, slow: null as ConsumerId | null };
export const SNAPSHOT_OPEN = { now: 0, from: 'snapshot' as const };
export const RETENTION_OPEN = { slot: true, lag: 100, deadAt: 30, now: 60 };

/** Scene 2's workload: six short transactions, one rolled back, then quiet. */
export const REPLAY_OPS: TimedTx[] = [
  { at: 5, tx: { txid: 1, outcome: 'commit', stmts: [{ op: 'insert', key: 1, row: { status: 'new', amount: 40 } }, { op: 'insert', key: 2, row: { status: 'new', amount: 25 } }] } },
  { at: 15, tx: { txid: 2, outcome: 'commit', stmts: [{ op: 'update', key: 1, row: { status: 'paid', amount: 40 } }] } },
  { at: 25, tx: { txid: 3, outcome: 'rollback', stmts: [{ op: 'update', key: 2, row: { status: 'shipped', amount: 99 } }] } },
  { at: 40, tx: { txid: 4, outcome: 'commit', stmts: [{ op: 'insert', key: 3, row: { status: 'new', amount: 70 } }] } },
  { at: 55, tx: { txid: 5, outcome: 'commit', stmts: [{ op: 'update', key: 3, row: { status: 'paid', amount: 75 } }, { op: 'delete', key: 2 }] } },
  { at: 70, tx: { txid: 6, outcome: 'commit', stmts: [{ op: 'update', key: 1, row: { status: 'shipped', amount: 45 } }] } },
];

export interface Replay {
  snap: Snapshot<CdcState>;
  trace: readonly TraceRow<Msg>[];
}

export function replay(s: Scenario, now: number): Replay {
  const cluster = buildCluster(s);
  cluster.run({ until: now });
  return { snap: cluster.snapshot(), trace: cluster.trace };
}

type Of<K extends CdcState['kind']> = Extract<CdcState, { kind: K }>;
export const dbOf = (snap: Snapshot<CdcState>) => snap.nodes[DB].state as Of<'db'>;
export const connOf = (snap: Snapshot<CdcState>) => snap.nodes[CONNECTOR].state as Of<'conn'>;
export const consOf = (snap: Snapshot<CdcState>, id: ConsumerId) => snap.nodes[id].state as Of<'cons'>;

export function inSync(snap: Snapshot<CdcState>, id: ConsumerId): boolean {
  const src = dbOf(snap).rows;
  const c = consOf(snap, id);
  const keys = new Set([...Object.keys(src).map(Number), ...Object.entries(c.rows).filter(([, r]) => !r.deleted).map(([k]) => Number(k))]);
  for (const k of keys) {
    const a = src[k];
    const b = c.rows[k] && !c.rows[k].deleted ? c.rows[k] : undefined;
    if (!a !== !b || (a && b && (a.status !== b.status || a.amount !== b.amount))) return false;
  }
  return c.counter === totalOf(src);
}

export const syncedCount = (snap: Snapshot<CdcState>) => CONSUMERS.filter((c) => inSync(snap, c)).length;

export interface CellLook {
  text: string;
  tone: Tone;
  fill: 'tint' | 'outline';
}

const LETTER: Record<string, string> = { new: 'N', paid: 'P', shipped: 'S' };
export const statusLetter = (s: string) => LETTER[s] ?? '?';

/** One cell of the source table: column 0 the status letter, column 1 the amount. Absent rows are an empty dim outline. */
export function sourceCell(rows: Record<number, Row>, key: number, col: number): CellLook {
  const r = rows[key];
  if (!r) return { text: '', tone: 'dim', fill: 'outline' };
  return { text: col === 0 ? statusLetter(r.status) : String(r.amount), tone: 'muted', fill: 'tint' };
}

/** A consumer's cell: green when it matches the source, yellow when it is behind or wrong, a dim outline when empty on both sides. */
export function consumerCell(snap: Snapshot<CdcState>, id: ConsumerId, key: number, col: number): CellLook {
  const src = dbOf(snap).rows[key];
  const raw = consOf(snap, id).rows[key];
  const mine = raw && !raw.deleted ? raw : undefined;
  if (!src && !mine) return { text: '', tone: 'dim', fill: 'outline' };
  const same = !!src && !!mine && src.status === mine.status && src.amount === mine.amount;
  const text = mine ? (col === 0 ? statusLetter(mine.status) : String(mine.amount)) : '';
  return { text, tone: same ? 'ok' : 'hi', fill: mine ? 'tint' : 'outline' };
}

export type TxFate = 'committed' | 'rolled-back' | 'open';
export const fateOf = (log: readonly LogRec[], txid: number): TxFate => (log.some((r) => r.txid === txid && r.kind === 'commit') ? 'committed' : log.some((r) => r.txid === txid && r.kind === 'rollback') ? 'rolled-back' : 'open');

export function recText(r: LogRec): string {
  if (r.kind === 'commit') return `tx ${r.txid} commit`;
  if (r.kind === 'rollback') return `tx ${r.txid} rollback`;
  if (r.kind === 'ddl') return 'schema change: add a column';
  const row = (x: Row | null | undefined) => (x ? `${x.status} ${x.amount}` : 'none');
  return `tx ${r.txid} ${r.op} key ${r.key}: ${row(r.before)} to ${row(r.after)}`;
}

/** The source's log as rows: committed changes green, rolled-back ones dim and marked never emitted, plus a violet marker where the connector saved its position. */
export function logRows(snap: Snapshot<CdcState>): LogRow[] {
  const log = dbOf(snap).log;
  const saved = connOf(snap).saved;
  const rows: LogRow[] = [];
  let marked = saved === 0;
  if (marked) rows.push({ id: 'saved', tone: 'violet', text: 'connector saved position: the start of the log' });
  for (const r of log) {
    const fate = r.txid === 0 ? 'committed' : fateOf(log, r.txid);
    const tone: Tone | undefined = r.kind === 'ddl' ? 'info' : fate === 'rolled-back' ? 'dim' : fate === 'committed' ? 'ok' : undefined;
    rows.push({ id: `l${r.lsn}`, source: `LSN ${r.lsn}`, tone, text: `${recText(r)}${fate === 'rolled-back' && r.kind === 'change' ? ' (rolled back: never emitted)' : ''}` });
    if (!marked && r.lsn === saved) {
      rows.push({ id: 'saved', tone: 'violet', text: `connector saved position: LSN ${saved}` });
      marked = true;
    }
  }
  return rows;
}

/** How many times each consumer was handed an event it had already been handed (a retry, a restart or a duplicate). */
export function redeliveries(trace: readonly TraceRow<Msg>[]): number {
  const seen = new Set<string>();
  let again = 0;
  for (const row of trace) {
    if (row.kind !== 'deliver' || !row.payload || row.payload.type !== 'event') continue;
    const key = `${row.to}:${row.payload.ev.lsn}`;
    if (seen.has(key)) again += 1;
    seen.add(key);
  }
  return again;
}

/** First deliveries that arrived after a newer event for the same consumer: the network reordered them (a repeat of an old event is counted by `redeliveries`). */
export function reorderedArrivals(trace: readonly TraceRow<Msg>[]): number {
  const seen = new Set<string>();
  const newest = new Map<string, number>();
  let late = 0;
  for (const row of trace) {
    if (row.kind !== 'deliver' || !row.payload || row.payload.type !== 'event') continue;
    const { lsn } = row.payload.ev;
    const key = `${row.to}:${lsn}`;
    if (!seen.has(key) && lsn < (newest.get(row.to!) ?? 0)) late += 1;
    seen.add(key);
    newest.set(row.to!, Math.max(lsn, newest.get(row.to!) ?? 0));
  }
  return late;
}

export const labelOf = (p: Msg): string => {
  switch (p.type) {
    case 'event': return p.ev.op === 'ddl' ? `event: schema change (LSN ${p.ev.lsn})` : `event ${p.ev.op} key ${p.ev.key} (LSN ${p.ev.lsn})`;
    case 'ack': return `ack LSN ${p.lsn}`;
    case 'dup': return 'duplicate the last event';
    case 'tx': return `tx ${p.tx.txid}`;
    case 'ddl': return 'add a column';
    case 'read': return `read from LSN ${p.from}`;
    case 'batch': return `batch up to LSN ${p.upTo}`;
    case 'scan': return `scan key ${p.key}`;
    default: return `row ${p.key}`;
  }
};

// ── operations the learner can press ──────────────────────────────────

export interface Refusal {
  refused: string;
}

/** A transaction from the form, or why not: no statements, a key out of range, a row that is missing or already there. */
export function makeTx(stmts: Stmt[], outcome: Tx['outcome'], txid: number, rows: Record<number, Row>, maxKey: number): Tx | Refusal {
  if (stmts.length === 0) return { refused: 'a transaction with no statements does nothing, add at least one' };
  const shadow = new Set(Object.keys(rows).map(Number));
  for (const s of stmts) {
    if (!Number.isInteger(s.key) || s.key < 1 || s.key > maxKey) return { refused: `row ids go from 1 to ${maxKey}` };
    if (s.op === 'insert' && shadow.has(s.key)) return { refused: `row ${s.key} already exists, update it instead` };
    if (s.op !== 'insert' && !shadow.has(s.key)) return { refused: `row ${s.key} does not exist yet, insert it first` };
    if (s.op === 'insert') shadow.add(s.key);
    if (s.op === 'delete') shadow.delete(s.key);
  }
  return { txid, stmts, outcome };
}

export const isRefusal = (x: Tx | Refusal): x is Refusal => 'refused' in x;

/** The producer buttons pause when too many events are in flight. */
export const producerPaused = (snap: Snapshot<CdcState>) => connOf(snap).inflight >= MAX_EVENTS_IN_FLIGHT;

export const consumerName = (id: ConsumerId) => CONSUMER_LABEL[id];
export type { Fault, Flags };
