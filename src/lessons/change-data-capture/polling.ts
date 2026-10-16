/** The comparison in scene 3: polling an updated_at column, and what it can never see. Pure. */
import { mulberry32 } from '../../core/random';
import { STATUSES, seededScenario, SAFE_FLAGS, type Row } from './cdc';

export interface PollStmt {
  op: 'insert' | 'update' | 'delete';
  key: number;
  row?: Row;
}
export interface PollTx {
  txid: number;
  /** The statement time: what updated_at is set to. */
  begin: number;
  /** When the transaction commits and its rows become visible to others. */
  commit: number;
  stmts: PollStmt[];
}

export interface PollRow extends Row {
  updatedAt: number;
}

export type PollMiss = 'delete' | 'late';
export interface PollResult {
  /** What the source table holds at the end. */
  source: Record<number, PollRow>;
  /** What the poller's copy holds at the end. */
  copy: Record<number, PollRow>;
  /** Keys where the copy is wrong, and why. */
  misses: { key: number; why: PollMiss }[];
  lastSeen: number;
}

const byCommit = (txs: readonly PollTx[]) => [...txs].sort((a, b) => a.commit - b.commit || a.txid - b.txid);

/** The table as committed by `time`: hard deletes remove the row, every write stamps updated_at with its transaction's statement time. */
export function tableAt(txs: readonly PollTx[], time: number): Record<number, PollRow> {
  const rows: Record<number, PollRow> = {};
  for (const tx of byCommit(txs)) {
    if (tx.commit > time) break;
    for (const s of tx.stmts) {
      if (s.op === 'delete') delete rows[s.key];
      else rows[s.key] = { ...s.row!, updatedAt: tx.begin };
    }
  }
  return rows;
}

/** Poll at each time: `SELECT * WHERE updated_at > last_seen`, then last_seen = the largest updated_at returned. */
export function pollingRun(txs: readonly PollTx[], pollTimes: readonly number[], end: number): PollResult {
  const copy: Record<number, PollRow> = {};
  let lastSeen = 0;
  for (const p of pollTimes) {
    const rows = tableAt(txs, p);
    const fresh = Object.entries(rows).filter(([, r]) => r.updatedAt > lastSeen);
    for (const [k, r] of fresh) copy[Number(k)] = r;
    if (fresh.length) lastSeen = Math.max(...fresh.map(([, r]) => r.updatedAt));
  }
  const source = tableAt(txs, end);
  const misses: PollResult['misses'] = [];
  for (const k of new Set([...Object.keys(source), ...Object.keys(copy)].map(Number))) {
    const a = source[k];
    const b = copy[k];
    if (!a && b) misses.push({ key: k, why: 'delete' });
    else if (a && (!b || b.updatedAt !== a.updatedAt || b.status !== a.status || b.amount !== a.amount)) misses.push({ key: k, why: 'late' });
  }
  return { source, copy, misses: misses.sort((x, y) => x.key - y.key), lastSeen };
}

export const POLL_EVERY_MS = 10;
export const POLL_END_MS = 200;
export const pollTimesEvery = (every: number, end: number) => Array.from({ length: Math.floor(end / every) }, (_, i) => (i + 1) * every);

/** The two interleaved transactions of the scene: a fast one that commits first, and a slow one that began earlier. */
export const FAST_BEGIN = 12;
export const FAST_COMMIT = 14;
export const SLOW_BEGIN = 10;
export const SLOW_COMMIT_DEFAULT = 25;
export const twoInterleaved = (slowCommit: number): PollTx[] => [
  { txid: 1, begin: SLOW_BEGIN, commit: slowCommit, stmts: [{ op: 'insert', key: 1, row: { status: 'new', amount: 50 } }] },
  { txid: 2, begin: FAST_BEGIN, commit: FAST_COMMIT, stmts: [{ op: 'insert', key: 2, row: { status: 'new', amount: 20 } }] },
];

/** A seeded workload with deletes: the committed transactions of the CDC scenario of that seed, each committing 3 ms after it begins. */
export function seededPollTxs(seed: number): PollTx[] {
  return seededScenario(seed, SAFE_FLAGS).ops
    .filter((o): o is Extract<typeof o, { tx: unknown }> => 'tx' in o && o.tx.outcome === 'commit')
    .map((o) => ({ txid: o.tx.txid, begin: o.at, commit: o.at + 3, stmts: o.tx.stmts.map((s) => ({ op: s.op, key: s.key, row: s.row })) }));
}

/** A seeded workload with no deletes and slow transactions: inserts and updates whose commit trails their statement by up to 40 ms. */
export function seededLateTxs(seed: number): PollTx[] {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const n = 4 + pick(5);
  return Array.from({ length: n }, (_, i) => {
    const begin = 5 + pick(100);
    return { txid: i + 1, begin, commit: begin + 1 + pick(40), stmts: [{ op: 'update' as const, key: 1 + pick(4), row: { status: STATUSES[pick(STATUSES.length)], amount: 1 + pick(99) } }] };
  });
}

export const POLL_SEEDS = Array.from({ length: 200 }, (_, i) => i);
const polled = (txs: PollTx[]) => pollingRun(txs, pollTimesEvery(POLL_EVERY_MS, POLL_END_MS), POLL_END_MS);
export const lowestPollingDeleteMiss = () => POLL_SEEDS.find((s) => polled(seededPollTxs(s)).misses.some((m) => m.why === 'delete'));
export const lowestPollingLateMiss = () => POLL_SEEDS.find((s) => polled(seededLateTxs(s)).misses.length > 0);
export const pollSeeded = (seed: number, kind: 'delete' | 'late') => polled(kind === 'delete' ? seededPollTxs(seed) : seededLateTxs(seed));
