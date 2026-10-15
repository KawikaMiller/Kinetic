/**
 * A PostgreSQL-style MVCC toy, pure and immutable: every operation returns a new database.
 * A table of three keys holds row VERSIONS; each has `xmin` (the transaction that created it) and
 * `xmax` (the one that deleted or replaced it). A snapshot records the next transaction id and the
 * transactions still active when it was taken; a version is visible to a transaction when its creator is
 * that transaction or one that committed before the snapshot, and its deleter is not such a transaction.
 * Simplified: no hint bits, no frozen ids, no HOT updates, no wraparound.
 */

export const KEYS = ['A', 'B', 'C'] as const;
export type Key = (typeof KEYS)[number];

export const MAX_OPEN = 3;
export const MAX_VERSIONS = 200;
export const BOOT_XID = 1;
export const INITIAL_VALUES: Record<Key, number> = { A: 10, B: 20, C: 30 };

/** When a transaction takes its snapshot: at each statement, or once at its first statement. */
export type Timing = 'statement' | 'transaction';
export type TxStatus = 'active' | 'committed' | 'aborted';

export interface Version {
  vid: number;
  key: Key;
  value: number;
  xmin: number;
  xmax: number | null;
}

export interface Snapshot {
  /** The next transaction id when the snapshot was taken: ids at or above it are in the future. */
  xmax: number;
  /** Transactions that were running then. */
  active: readonly number[];
  /** How many commits had happened: orders snapshots by age (the oldest is the vacuum horizon). */
  seq: number;
}

export interface Tx {
  xid: number;
  /** 1 to MAX_OPEN while it is open; 0 for a bootstrap or autocommit transaction. */
  slot: number;
  status: TxStatus;
  timing: Timing;
  /** The snapshot held for the whole transaction (per-transaction timing, after its first statement). */
  snapshot: Snapshot | null;
}

export interface Db {
  nextXid: number;
  nextVid: number;
  /** Commits so far. */
  seq: number;
  timing: Timing;
  txs: Readonly<Record<number, Tx>>;
  versions: readonly Version[];
  /** The version ids the last write created or changed, for highlighting. */
  touched: readonly number[];
}

/** Who runs a statement: `auto` (its own one-statement transaction) or an open slot. */
export type Who = 'auto' | 1 | 2 | 3;

export type Op =
  | { kind: 'begin' }
  | { kind: 'select'; who: Who }
  | { kind: 'update'; who: Who; key: Key; value: number }
  | { kind: 'delete'; who: Who; key: Key }
  | { kind: 'insert'; who: Who; key: Key; value: number }
  | { kind: 'commit'; who: 1 | 2 | 3 }
  | { kind: 'rollback'; who: 1 | 2 | 3 }
  | { kind: 'vacuum'; broken?: boolean };

export type Outcome =
  | { status: 'ok'; message: string; rows?: Readonly<Partial<Record<Key, number>>>; removed?: number }
  /** A statement that did nothing because another transaction holds the row, or the table is full, or it does not apply. */
  | { status: 'refused'; message: string }
  /** A statement that failed and rolled its transaction back. */
  | { status: 'aborted'; message: string };

export interface Applied {
  db: Db;
  outcome: Outcome;
}

export function newDb(timing: Timing = 'transaction'): Db {
  const versions = KEYS.map((key, i): Version => ({ vid: i + 1, key, value: INITIAL_VALUES[key], xmin: BOOT_XID, xmax: null }));
  return {
    nextXid: BOOT_XID + 1,
    nextVid: versions.length + 1,
    seq: 1,
    timing,
    txs: { [BOOT_XID]: { xid: BOOT_XID, slot: 0, status: 'committed', timing, snapshot: null } },
    versions,
    touched: [],
  };
}

// ── Snapshots and visibility ──────────────────────────────────────────

/** The snapshot a statement takes now: the next id, and who is running (other than itself). */
export function takeSnapshot(db: Db, self: number | null = null): Snapshot {
  return {
    xmax: db.nextXid,
    active: Object.values(db.txs).filter((t) => t.status === 'active' && t.xid !== self).map((t) => t.xid),
    seq: db.seq,
  };
}

/** True when `xid` had committed before the snapshot was taken. */
export function committedBefore(db: Db, xid: number, snap: Snapshot): boolean {
  return db.txs[xid]?.status === 'committed' && xid < snap.xmax && !snap.active.includes(xid);
}

/** The visibility rule. `self` is the reader's own transaction id (its own writes are visible to it), or null. */
export function visible(db: Db, v: Version, self: number | null, snap: Snapshot): boolean {
  const created = v.xmin === self || committedBefore(db, v.xmin, snap);
  if (!created) return false;
  if (v.xmax === null) return true;
  return !(v.xmax === self || committedBefore(db, v.xmax, snap));
}

/** What a reader sees: the visible version of each key. */
export function readRows(db: Db, self: number | null, snap: Snapshot): Partial<Record<Key, number>> {
  const rows: Partial<Record<Key, number>> = {};
  for (const v of db.versions) if (visible(db, v, self, snap)) rows[v.key] = v.value;
  return rows;
}

export const txOf = (db: Db, who: 1 | 2 | 3): Tx | undefined => Object.values(db.txs).find((t) => t.status === 'active' && t.slot === who);
export const openSlots = (db: Db): (1 | 2 | 3)[] => ([1, 2, 3] as const).filter((s) => txOf(db, s) !== undefined);
export const nameOf = (db: Db, xid: number): string => {
  const t = db.txs[xid];
  return t && t.slot > 0 && t.status === 'active' ? `T${t.slot}` : `x${xid}`;
};

/** The snapshot a viewer holds, or the one a statement run now would take (for showing what a transaction would see). */
export function viewOf(db: Db, who: Who): { self: number | null; snap: Snapshot; held: boolean } {
  if (who === 'auto') return { self: null, snap: takeSnapshot(db), held: false };
  const tx = txOf(db, who);
  if (!tx) return { self: null, snap: takeSnapshot(db), held: false };
  return tx.snapshot ? { self: tx.xid, snap: tx.snapshot, held: true } : { self: tx.xid, snap: takeSnapshot(db, tx.xid), held: false };
}

// ── Garbage: what VACUUM may remove ──────────────────────────────────

/** Snapshots held open by running transactions. */
export const openSnapshots = (db: Db): Snapshot[] =>
  Object.values(db.txs).flatMap((t) => (t.status === 'active' && t.snapshot ? [t.snapshot] : []));

/** The oldest open snapshot, or null when none is held: the vacuum horizon. */
export const horizon = (db: Db): Snapshot | null => openSnapshots(db).reduce<Snapshot | null>((old, s) => (old === null || s.seq < old.seq ? s : old), null);

/**
 * Versions no open or future snapshot can see: the creator aborted, or the deleter committed before the
 * oldest open snapshot (a later snapshot sees at least what an earlier one does). With `broken`, the horizon is
 * the latest commit instead, which ignores open snapshots (the bug the lesson shows).
 */
export function removable(db: Db, broken = false): Version[] {
  const oldest = broken ? null : horizon(db);
  return db.versions.filter((v) => {
    if (db.txs[v.xmin]?.status === 'aborted') return true;
    if (v.xmax === null || db.txs[v.xmax]?.status !== 'committed') return false;
    return oldest === null || committedBefore(db, v.xmax, oldest);
  });
}

/**
 * Counts for the table-size readout: `live` is what a new snapshot sees, `dead` what VACUUM may remove now,
 * `pending` what a running transaction has not committed yet, and `pinned` the rest: replaced or deleted for new
 * snapshots but kept because an older open snapshot may still see it.
 */
export function tally(db: Db): { live: number; dead: number; pending: number; pinned: number; total: number } {
  const fresh = takeSnapshot(db);
  const gone = new Set(removable(db).map((v) => v.vid));
  let live = 0;
  let pending = 0;
  for (const v of db.versions) {
    if (visible(db, v, null, fresh)) live++;
    else if (!gone.has(v.vid) && db.txs[v.xmin]?.status === 'active') pending++;
  }
  return { live, dead: gone.size, pending, pinned: db.versions.length - live - gone.size - pending, total: db.versions.length };
}
/** Every running transaction whose repeated SELECT would now return something else: the safety invariant of VACUUM. */
export function snapshotViolations(before: Db, after: Db): { slot: number; message: string }[] {
  const show = (r: Partial<Record<Key, number>>) => KEYS.map((k) => (r[k] === undefined ? `${k} gone` : `${k}=${r[k]}`)).join(', ');
  return Object.values(before.txs).flatMap((t) => {
    if (t.status !== 'active' || !t.snapshot) return [];
    const was = show(readRows(before, t.xid, t.snapshot));
    const now = show(readRows(after, t.xid, t.snapshot));
    return was === now ? [] : [{ slot: t.slot, message: `T${t.slot}'s snapshot read ${was} before VACUUM and ${now} after` }];
  });
}

/** The first such violation's message, or null. */
export const snapshotViolation = (before: Db, after: Db): string | null => snapshotViolations(before, after)[0]?.message ?? null;
// ── Applying an operation ────────────────────────────────────────────

const setTx = (db: Db, tx: Tx): Db => ({ ...db, txs: { ...db.txs, [tx.xid]: tx } });
const setVersions = (db: Db, versions: Version[], touched: number[]): Db => ({ ...db, versions, touched });
const ok = (db: Db, message: string, extra: Partial<Extract<Outcome, { status: 'ok' }>> = {}): Applied => ({ db, outcome: { status: 'ok', message, ...extra } });
const refused = (db: Db, message: string): Applied => ({ db, outcome: { status: 'refused', message } });

/** Why an operation cannot be pressed right now, or null. Used to disable buttons with a stated reason. */
export function disabledReason(db: Db, op: Op): string | null {
  switch (op.kind) {
    case 'begin':
      return openSlots(db).length >= MAX_OPEN ? `at most ${MAX_OPEN} transactions can be open: commit or roll one back first` : null;
    case 'commit':
    case 'rollback':
      return txOf(db, op.who) ? null : `T${op.who} is not open: nothing to ${op.kind}`;
    case 'select':
      return op.who !== 'auto' && !txOf(db, op.who) ? `T${op.who} is not open: press BEGIN first` : null;
    case 'update':
    case 'delete':
    case 'insert':
      return op.who !== 'auto' && !txOf(db, op.who) ? `T${op.who} is not open: press BEGIN first` : null;
    case 'vacuum':
      return null;
  }
}

interface Context {
  db: Db;
  xid: number | null;
  snap: Snapshot;
  tx: Tx | null;
}

/** The transaction and snapshot a statement runs with; a held snapshot is kept, a missing one is taken now. */
function startStatement(db: Db, who: Who): Context {
  if (who === 'auto') return { db, xid: null, snap: takeSnapshot(db), tx: null };
  const tx = txOf(db, who)!;
  if (tx.timing === 'transaction') {
    if (tx.snapshot) return { db, xid: tx.xid, snap: tx.snapshot, tx };
    const held = { ...tx, snapshot: takeSnapshot(db, tx.xid) };
    return { db: setTx(db, held), xid: tx.xid, snap: held.snapshot!, tx: held };
  }
  return { db, xid: tx.xid, snap: takeSnapshot(db, tx.xid), tx };
}

/** The newest version of a key whose creator did not abort. */
const newestVersion = (db: Db, key: Key): Version | undefined => db.versions.filter((v) => v.key === key && db.txs[v.xmin]?.status !== 'aborted').at(-1);

const waitMessage = (db: Db, asker: Who, holder: number): string => {
  const who = asker === 'auto' ? 'the autocommit statement' : `T${asker}`;
  return `${who} would wait for ${nameOf(db, holder)} (row locked): finish ${nameOf(db, holder)} first`;
};

export const SERIALIZATION_ERROR = 'could not serialize access due to concurrent update';
export const TABLE_FULL = `table full: run VACUUM (the table holds ${MAX_VERSIONS} versions)`;

/** The deleter that counts: a transaction that aborted never deleted anything. */
const effectiveDeleter = (db: Db, v: Version): number | null => (v.xmax !== null && db.txs[v.xmax].status !== 'aborted' ? v.xmax : null);

/** One write statement by transaction `xid` under `snap`. */
function write(start: Db, xid: number, snap: Snapshot, who: Who, op: Extract<Op, { kind: 'update' | 'delete' | 'insert' }>): Applied {
  const cur: Db = start.touched.length ? { ...start, touched: [] } : start;
  const seen = cur.versions.find((v) => v.key === op.key && visible(cur, v, xid, snap));
  const pending = (holder: number): Applied => refused(cur, waitMessage(cur, who, holder));
  const full = (extra: number) => cur.versions.length + extra > MAX_VERSIONS;
  const append = (versions: Version[], touched: number[]): Db => setVersions({ ...cur, nextVid: cur.nextVid + 1 }, [...versions, { vid: cur.nextVid, key: op.key, value: 'value' in op ? op.value : 0, xmin: xid, xmax: null }], [...touched, cur.nextVid]);

  if (op.kind === 'insert') {
    if (seen) return refused(cur, `duplicate key: ${op.key} already exists`);
    const newest = newestVersion(cur, op.key);
    if (newest) {
      const deleter = effectiveDeleter(cur, newest);
      if (deleter === null) {
        return cur.txs[newest.xmin].status === 'active' ? pending(newest.xmin) : refused(cur, `duplicate key: ${op.key} was committed after your snapshot`);
      }
      if (deleter !== xid && cur.txs[deleter].status === 'active') return pending(deleter);
    }
    if (full(1)) return refused(cur, TABLE_FULL);
    return ok(append([...cur.versions], []), `inserted ${op.key} = ${op.value}`);
  }

  if (!seen) return ok(cur, `0 rows: no version of ${op.key} is visible to this snapshot`);
  const holder = seen.xmax !== null && seen.xmax !== xid ? cur.txs[seen.xmax] : null;
  if (holder?.status === 'active') return pending(holder.xid);
  if (holder?.status === 'committed') {
    return { db: setTx(cur, { ...cur.txs[xid], status: 'aborted' }), outcome: { status: 'aborted', message: `ERROR: ${SERIALIZATION_ERROR}: ${nameOf(cur, xid)} is rolled back` } };
  }
  if (op.kind === 'update' && full(1)) return refused(cur, TABLE_FULL);
  const marked = cur.versions.map((v) => (v.vid === seen.vid ? { ...v, xmax: xid } : v));
  if (op.kind === 'delete') return ok(setVersions(cur, marked, [seen.vid]), `deleted ${op.key}: version ${seen.vid} gets xmax = x${xid}`);
  return ok(append(marked, [seen.vid]), `updated ${op.key} to ${op.value}: a new version is appended and the old one gets xmax = x${xid}`);
}

/** A write by `who`. An autocommit write is a one-statement transaction with a fresh id, committed at once; if it changes nothing the id is not used. */
function writeRow(db: Db, who: Who, op: Extract<Op, { kind: 'update' | 'delete' | 'insert' }>): Applied {
  if (who === 'auto') {
    const xid = db.nextXid;
    const opened = setTx({ ...db, nextXid: xid + 1 }, { xid, slot: 0, status: 'active', timing: 'statement', snapshot: null });
    const done = write(opened, xid, takeSnapshot(opened, xid), who, op);
    if (done.outcome.status !== 'ok' || done.db.touched.length === 0) return { db: db.touched.length ? { ...db, touched: [] } : db, outcome: done.outcome };
    return { db: setTx({ ...done.db, seq: done.db.seq + 1 }, { ...done.db.txs[xid], status: 'committed' }), outcome: done.outcome };
  }
  const c = startStatement(db, who);
  return write(c.db, c.xid!, c.snap, who, op);
}
/** Apply one operation. Refused and disabled operations leave the database as it was. */
export function apply(start: Db, op: Op): Applied {
  const db: Db = start.touched.length ? { ...start, touched: [] } : start;
  const blocked = disabledReason(db, op);
  if (blocked) return refused(db, blocked);
  switch (op.kind) {
    case 'begin': {
      const slot = ([1, 2, 3] as const).find((s) => !txOf(db, s))!;
      const xid = db.nextXid;
      const next = setTx({ ...db, nextXid: xid + 1 }, { xid, slot, status: 'active', timing: db.timing, snapshot: null });
      return ok(next, `T${slot} began as x${xid} (${db.timing === 'transaction' ? 'its snapshot is taken at its first statement' : 'each statement takes a new snapshot'})`);
    }
    case 'select': {
      const c = startStatement(db, op.who);
      const rows = readRows(c.db, c.xid, c.snap);
      return ok(c.db, `${op.who === 'auto' ? 'autocommit' : `T${op.who}`} read ${KEYS.map((k) => (rows[k] === undefined ? `${k} (none)` : `${k} = ${rows[k]}`)).join(', ')}`, { rows });
    }
    case 'update':
    case 'delete':
    case 'insert':
      return writeRow(db, op.who, op);
    case 'commit': {
      const tx = txOf(db, op.who)!;
      return ok(setTx({ ...db, seq: db.seq + 1 }, { ...tx, status: 'committed' }), `T${op.who} committed (x${tx.xid})`);
    }
    case 'rollback': {
      const tx = txOf(db, op.who)!;
      return ok(setTx(db, { ...tx, status: 'aborted' }), `T${op.who} rolled back (x${tx.xid}): its versions are dead`);
    }
    case 'vacuum': {
      const gone = new Set(removable(db, op.broken).map((v) => v.vid));
      const next: Db = { ...db, versions: db.versions.filter((v) => !gone.has(v.vid)), touched: [] };
      return ok(next, `VACUUM removed ${gone.size} ${gone.size === 1 ? 'version' : 'versions'}`, { removed: gone.size });
    }
  }
}

/** Apply a list of operations in order, keeping the last outcome of each. */
export function applyAll(db: Db, ops: readonly Op[]): { db: Db; outcomes: Outcome[] } {
  const outcomes: Outcome[] = [];
  let cur = db;
  for (const op of ops) {
    const r = apply(cur, op);
    cur = r.db;
    outcomes.push(r.outcome);
  }
  return { db: cur, outcomes };
}
