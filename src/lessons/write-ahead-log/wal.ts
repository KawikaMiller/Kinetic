/** The toy database behind write-ahead-log: pages, a buffer pool, a log with a volatile tail, crash and recovery. Pure, immutable. */
import { mulberry32 } from '../../core/random';

export const PAGES = 8;
export const MAX_RECORDS = 64;
export const MAX_TXS = 32;
export const MIN_VALUE = 0;
export const MAX_VALUE = 99;

export type RecKind = 'update' | 'commit' | 'abort' | 'checkpoint' | 'undo';

export interface Rec {
  lsn: number;
  kind: RecKind;
  tx: number;
  page?: number;
  before?: number;
  after?: number;
  /** An undo record: the update it compensates. */
  undoOf?: number;
  /** A checkpoint: the transactions running then, and where redo must start. */
  active?: number[];
  redoStart?: number;
}

export interface Policy {
  /** A dirty page of an uncommitted transaction may reach disk before it commits. */
  steal: boolean;
  /** A commit flushes all of the transaction's pages. */
  force: boolean;
  /** A page reaches disk only once the log is durable up to its page LSN. */
  enforceWal: boolean;
  /** The commit is acknowledged before the commit record is fsynced. */
  ackBeforeFsync: boolean;
}

export const DEFAULT_POLICY: Policy = { steal: true, force: false, enforceWal: true, ackBeforeFsync: false };

export interface Frame {
  value: number;
  lsn: number;
  dirty: boolean;
}

export interface Machine {
  policy: Policy;
  disk: number[];
  diskLsn: number[];
  pool: Frame[];
  log: Rec[];
  /** Records 1..durable are on disk; the rest are the volatile tail. */
  durable: number;
  status: Record<number, 'active' | 'committed' | 'aborted'>;
  /** Page -> the active transaction that last wrote it (page-level lock, so no two uncommitted writers share a page). */
  owner: (number | null)[];
  acked: number[];
  pageWrites: number;
  fsyncs: number;
  /** Where redo starts after a crash: from the last checkpoint. */
  redoStart: number;
  events: string[];
}

export type Result = { m: Machine } | { refused: string };
const refuse = (refused: string): Result => ({ refused });

export function fresh(policy: Policy = DEFAULT_POLICY): Machine {
  return {
    policy: { ...policy },
    disk: Array<number>(PAGES).fill(0),
    diskLsn: Array<number>(PAGES).fill(0),
    pool: Array.from({ length: PAGES }, () => ({ value: 0, lsn: 0, dirty: false })),
    log: [],
    durable: 0,
    status: {},
    owner: Array<number | null>(PAGES).fill(null),
    acked: [],
    pageWrites: 0,
    fsyncs: 0,
    redoStart: 1,
    events: [],
  };
}

const copy = (m: Machine): Machine => ({
  ...m,
  policy: { ...m.policy },
  disk: [...m.disk],
  diskLsn: [...m.diskLsn],
  pool: m.pool.map((f) => ({ ...f })),
  log: [...m.log],
  status: { ...m.status },
  owner: [...m.owner],
  acked: [...m.acked],
  events: [...m.events],
});

const append = (m: Machine, r: Omit<Rec, 'lsn'>): Rec => {
  const rec: Rec = { ...r, lsn: m.log.length + 1 };
  m.log.push(rec);
  return rec;
};

export const withPolicy = (m: Machine, patch: Partial<Policy>): Machine => ({ ...m, policy: { ...m.policy, ...patch } });
export const txName = (tx: number) => `T${tx}`;

export function write(m0: Machine, tx: number, page: number, value: number): Result {
  if (m0.status[tx] !== undefined && m0.status[tx] !== 'active') return refuse(`${txName(tx)} already ${m0.status[tx]}`);
  if (m0.status[tx] === undefined && Object.keys(m0.status).length >= MAX_TXS) return refuse(`the toy database runs at most ${MAX_TXS} transactions, reset to start over`);
  if (m0.log.length >= MAX_RECORDS) return refuse(`the toy log holds ${MAX_RECORDS} records, checkpoint or reset`);
  const holder = m0.owner[page];
  if (holder !== null && holder !== tx) return refuse(`page ${page} holds an uncommitted write of ${txName(holder)}; this toy locks a page until its writer finishes`);
  const m = copy(m0);
  const rec = append(m, { kind: 'update', tx, page, before: m.pool[page].value, after: value });
  m.status[tx] = 'active';
  m.pool[page] = { value, lsn: rec.lsn, dirty: true };
  m.owner[page] = tx;
  m.events.push(`${txName(tx)} writes page ${page} = ${value} (LSN ${rec.lsn}, still in memory)`);
  return { m };
}

function flush(m: Machine, page: number): string | null {
  const f = m.pool[page];
  if (!f.dirty) return `page ${page} is clean`;
  const holder = m.owner[page];
  if (!m.policy.steal && holder !== null && m.status[holder] === 'active') return `no-steal: page ${page} holds an uncommitted write of ${txName(holder)}`;
  if (m.policy.enforceWal && m.durable < f.lsn) {
    m.durable = m.log.length;
    m.fsyncs += 1;
    m.events.push(`the WAL rule forces the log to disk first (durable up to LSN ${m.durable})`);
  }
  m.disk[page] = f.value;
  m.diskLsn[page] = f.lsn;
  m.pool[page] = { ...f, dirty: false };
  m.pageWrites += 1;
  m.events.push(`page ${page} flushed to disk (page LSN ${f.lsn})${m.durable < f.lsn ? ': its log record is NOT durable' : ''}`);
  return null;
}

export function flushPage(m0: Machine, page: number): Result {
  const m = copy(m0);
  const why = flush(m, page);
  return why ? refuse(why) : { m };
}

export function fsyncLog(m0: Machine): Result {
  if (m0.durable === m0.log.length) return refuse(m0.log.length === 0 ? 'the log is empty' : 'the log is already durable');
  const m = copy(m0);
  m.durable = m.log.length;
  m.fsyncs += 1;
  m.events.push(`log fsynced: durable up to LSN ${m.durable}`);
  return { m };
}

export function pagesOf(m: Machine, tx: number): number[] {
  return [...new Set(m.log.filter((r) => r.kind === 'update' && r.tx === tx).map((r) => r.page!))];
}

export function commit(m0: Machine, tx: number): Result {
  if (m0.status[tx] !== 'active') return refuse(m0.status[tx] === undefined ? `${txName(tx)} has not written anything` : `${txName(tx)} already ${m0.status[tx]}`);
  if (m0.log.length >= MAX_RECORDS) return refuse(`the toy log holds ${MAX_RECORDS} records, checkpoint or reset`);
  const m = copy(m0);
  const rec = append(m, { kind: 'commit', tx });
  m.status[tx] = 'committed';
  if (m.policy.force) for (const p of pagesOf(m, tx)) flush(m, p);
  m.owner = m.owner.map((o) => (o === tx ? null : o));
  if (m.policy.ackBeforeFsync) {
    m.acked.push(tx);
    m.events.push(`${txName(tx)} commits (LSN ${rec.lsn}) and is acknowledged at once: the commit record is only in memory`);
  } else {
    m.durable = m.log.length;
    m.fsyncs += 1;
    m.acked.push(tx);
    m.events.push(`${txName(tx)} commits (LSN ${rec.lsn}), log fsynced, then acknowledged`);
  }
  return { m };
}

export function abort(m0: Machine, tx: number): Result {
  if (m0.status[tx] !== 'active') return refuse(m0.status[tx] === undefined ? `${txName(tx)} has not written anything` : `${txName(tx)} already ${m0.status[tx]}`);
  const updates = m0.log.filter((r) => r.kind === 'update' && r.tx === tx).reverse();
  if (m0.log.length + updates.length + 1 > MAX_RECORDS) return refuse(`the toy log holds ${MAX_RECORDS} records, checkpoint or reset`);
  const m = copy(m0);
  for (const u of updates) {
    const rec = append(m, { kind: 'undo', tx, page: u.page, before: m.pool[u.page!].value, after: u.before, undoOf: u.lsn });
    m.pool[u.page!] = { value: u.before!, lsn: rec.lsn, dirty: true };
  }
  append(m, { kind: 'abort', tx });
  m.status[tx] = 'aborted';
  m.owner = m.owner.map((o) => (o === tx ? null : o));
  m.events.push(`${txName(tx)} aborts: ${updates.length} undo ${updates.length === 1 ? 'record' : 'records'} restore the before-images`);
  return { m };
}

export function checkpoint(m0: Machine): Result {
  if (m0.log.length >= MAX_RECORDS) return refuse(`the toy log holds ${MAX_RECORDS} records, reset to start over`);
  const m = copy(m0);
  for (let p = 0; p < PAGES; p++) flush(m, p);
  const active = Object.entries(m.status).filter(([, s]) => s === 'active').map(([t]) => Number(t));
  const unflushed = m.log.filter((r) => r.kind === 'update' && m.pool[r.page!].dirty && m.pool[r.page!].lsn >= r.lsn).map((r) => r.lsn);
  const rec = append(m, { kind: 'checkpoint', tx: 0, active });
  rec.redoStart = Math.min(rec.lsn, ...unflushed);
  m.redoStart = rec.redoStart;
  m.durable = m.log.length;
  m.fsyncs += 1;
  m.events.push(`checkpoint (LSN ${rec.lsn}): every flushable dirty page written, redo now starts at LSN ${rec.redoStart}`);
  return { m };
}

// ── Crash and recovery ────────────────────────────────────────────────

export interface Image {
  disk: number[];
  diskLsn: number[];
  /** The durable log, plus undo and abort records recovery itself wrote. */
  log: Rec[];
  /** A record cut off mid-write at the end of the log: its checksum fails, so recovery ignores it. */
  torn: Rec | null;
}

export function crash(m: Machine, torn: boolean): Image {
  return {
    disk: [...m.disk],
    diskLsn: [...m.diskLsn],
    log: m.log.slice(0, m.durable),
    torn: torn && m.log.length > m.durable ? m.log[m.durable] : null,
  };
}

export type RecoveryEvent =
  | { kind: 'redo'; lsn: number; page: number; value: number }
  | { kind: 'skip'; lsn: number; page: number; pageLsn: number }
  | { kind: 'undo'; lsn: number; tx: number; page: number; value: number; undoOf: number }
  | { kind: 'end'; lsn: number; tx: number };

export const redoStartOf = (log: readonly Rec[]): number => [...log].reverse().find((r) => r.kind === 'checkpoint')?.redoStart ?? 1;

export const committedIn = (log: readonly Rec[]): number[] => log.filter((r) => r.kind === 'commit').map((r) => r.tx);

/** Transactions with updates in the log and neither a commit nor an abort record: the losers. */
export function losersIn(log: readonly Rec[]): number[] {
  const done = new Set(log.filter((r) => r.kind === 'commit' || r.kind === 'abort').map((r) => r.tx));
  return [...new Set(log.filter((r) => r.kind === 'update' && !done.has(r.tx)).map((r) => r.tx))].sort((a, b) => a - b);
}

/** Recovery in single steps: redo every record from the redo point whose page is behind it, then undo the losers newest first. */
export function recoverySteps(image: Image, limit = Infinity): { image: Image; events: RecoveryEvent[]; finished: boolean } {
  const disk = [...image.disk];
  const diskLsn = [...image.diskLsn];
  const log = [...image.log];
  const events: RecoveryEvent[] = [];
  const room = () => events.length < limit;
  const start = redoStartOf(image.log);
  for (const r of image.log) {
    if (r.lsn < start || (r.kind !== 'update' && r.kind !== 'undo')) continue;
    if (!room()) break;
    const page = r.page!;
    if (diskLsn[page] < r.lsn) {
      disk[page] = r.after!;
      diskLsn[page] = r.lsn;
      events.push({ kind: 'redo', lsn: r.lsn, page, value: r.after! });
    } else events.push({ kind: 'skip', lsn: r.lsn, page, pageLsn: diskLsn[page] });
  }
  const redoDone = events.length === image.log.filter((r) => r.lsn >= start && (r.kind === 'update' || r.kind === 'undo')).length;
  if (redoDone) {
    const undone = new Set(image.log.filter((r) => r.kind === 'undo').map((r) => r.undoOf));
    const todo = image.log.filter((r) => r.kind === 'update' && losersIn(image.log).includes(r.tx) && !undone.has(r.lsn)).reverse();
    const left = new Map<number, number>();
    for (const r of todo) left.set(r.tx, (left.get(r.tx) ?? 0) + 1);
    for (const tx of losersIn(image.log)) if (!left.has(tx)) left.set(tx, 0);
    const finish = (tx: number) => {
      if (!room()) return;
      const rec: Rec = { lsn: log.length + 1, kind: 'abort', tx };
      log.push(rec);
      events.push({ kind: 'end', lsn: rec.lsn, tx });
    };
    for (const [tx, n] of [...left]) if (n === 0 && room()) finish(tx);
    for (const u of todo) {
      if (!room()) break;
      const rec: Rec = { lsn: log.length + 1, kind: 'undo', tx: u.tx, page: u.page, before: disk[u.page!], after: u.before, undoOf: u.lsn };
      log.push(rec);
      disk[u.page!] = u.before!;
      diskLsn[u.page!] = rec.lsn;
      events.push({ kind: 'undo', lsn: rec.lsn, tx: u.tx, page: u.page!, value: u.before!, undoOf: u.lsn });
      left.set(u.tx, left.get(u.tx)! - 1);
      if (left.get(u.tx) === 0) finish(u.tx);
    }
  }
  const total = recoveryLength(image);
  return { image: { disk, diskLsn, log, torn: null }, events, finished: events.length >= total };
}

/** How many steps a complete recovery from this image takes. */
export function recoveryLength(image: Image): number {
  const start = redoStartOf(image.log);
  const redo = image.log.filter((r) => r.lsn >= start && (r.kind === 'update' || r.kind === 'undo')).length;
  const undone = new Set(image.log.filter((r) => r.kind === 'undo').map((r) => r.undoOf));
  const losers = losersIn(image.log);
  const undo = image.log.filter((r) => r.kind === 'update' && losers.includes(r.tx) && !undone.has(r.lsn)).length;
  return redo + undo + losers.length;
}

export const recoverAll = (image: Image) => recoverySteps(image);

// ── The oracle and the invariants ─────────────────────────────────────

/** Serial replay: the updates of exactly the transactions whose commit record is durable, in commit order, on an empty database. */
export function serialReplay(durableLog: readonly Rec[]): number[] {
  const db = Array<number>(PAGES).fill(0);
  for (const tx of committedIn(durableLog)) {
    for (const r of durableLog) if (r.kind === 'update' && r.tx === tx) db[r.page!] = r.after!;
  }
  return db;
}

export interface Violation {
  rule: 'D' | 'A' | 'equal';
  message: string;
}

/**
 * D: every acknowledged transaction has its commit durable and its writes present. A: no page holds a write of a transaction
 * that did not commit. Both against serial replay; `before` is the machine just before the crash (its whole log, volatile tail included).
 */
export function violations(before: Machine, image: Image, recovered: number[]): Violation[] {
  const out: Violation[] = [];
  const oracle = serialReplay(image.log);
  const committed = new Set(committedIn(image.log));
  for (const tx of before.acked) {
    if (!committed.has(tx)) out.push({ rule: 'D', message: `${txName(tx)} was acknowledged but its commit record never reached the disk` });
  }
  const touchedByLoser = (p: number) => before.log.some((r) => r.kind === 'update' && r.page === p && !committed.has(r.tx));
  for (let p = 0; p < PAGES; p++) {
    if (recovered[p] === oracle[p]) continue;
    if (touchedByLoser(p)) out.push({ rule: 'A', message: `page ${p} holds ${recovered[p]}, a write of a transaction that never committed (replay says ${oracle[p]})` });
    else out.push({ rule: 'D', message: `page ${p} holds ${recovered[p]} but committed work says ${oracle[p]}` });
  }
  return out;
}

// ── The seeded schedule ───────────────────────────────────────────────

export type Op =
  | { kind: 'write'; tx: number; page: number; value: number }
  | { kind: 'commit'; tx: number }
  | { kind: 'abort'; tx: number }
  | { kind: 'flush'; page: number }
  | { kind: 'fsync' }
  | { kind: 'checkpoint' };

export interface Plan {
  ops: Op[];
  /** The crash falls after this many ops. */
  crashAfter: number;
  torn: boolean;
  /** A second crash during recovery, after this many recovery steps (null: none). */
  recrashAfter: number | null;
}

export const SEED_TXS = 4;
export const MIN_OPS = 8;
export const MAX_OPS = 24;

export function planFor(seed: number): Plan {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const n = MIN_OPS + pick(MAX_OPS - MIN_OPS + 1);
  const ops: Op[] = Array.from({ length: n }, (): Op => {
    const x = rnd();
    if (x < 0.42) return { kind: 'write', tx: 1 + pick(SEED_TXS), page: pick(PAGES), value: 1 + pick(MAX_VALUE) };
    if (x < 0.55) return { kind: 'commit', tx: 1 + pick(SEED_TXS) };
    if (x < 0.6) return { kind: 'abort', tx: 1 + pick(SEED_TXS) };
    if (x < 0.78) return { kind: 'flush', page: pick(PAGES) };
    if (x < 0.9) return { kind: 'fsync' };
    return { kind: 'checkpoint' };
  });
  return { ops, crashAfter: 1 + pick(n), torn: rnd() < 0.3, recrashAfter: rnd() < 0.4 ? pick(12) : null };
}

export function applyOp(m: Machine, op: Op): Machine {
  const r =
    op.kind === 'write' ? write(m, op.tx, op.page, op.value)
      : op.kind === 'commit' ? commit(m, op.tx)
        : op.kind === 'abort' ? abort(m, op.tx)
          : op.kind === 'flush' ? flushPage(m, op.page)
            : op.kind === 'fsync' ? fsyncLog(m)
              : checkpoint(m);
  return 'm' in r ? r.m : m;
}

export interface SeedRun {
  plan: Plan;
  before: Machine;
  image: Image;
  /** Events of the first recovery (up to its second crash, if any). */
  firstEvents: RecoveryEvent[];
  recovered: Image;
  violations: Violation[];
}

/** Runs the plan up to the crash, recovers (crashing again mid-recovery if the plan says so), and checks the invariants. */
export function runSeed(seed: number, policy: Partial<Policy> = {}, over: Partial<Pick<Plan, 'crashAfter' | 'torn' | 'recrashAfter'>> = {}): SeedRun {
  const base = planFor(seed);
  const plan: Plan = { ...base, ...over };
  let m = fresh({ ...DEFAULT_POLICY, ...policy });
  for (const op of plan.ops.slice(0, plan.crashAfter)) m = applyOp(m, op);
  const image = crash(m, plan.torn);
  const first = recoverySteps(image, plan.recrashAfter ?? Infinity);
  const final = plan.recrashAfter !== null && !first.finished ? recoverySteps(first.image) : first;
  return { plan, before: m, image, firstEvents: first.events, recovered: final.image, violations: violations(m, image, final.image.disk) };
}

/** The pages and log after every step of recovery, crash included: frame 0 is the image the crash left. */
export interface RecoveryFrame {
  disk: number[];
  diskLsn: number[];
  log: Rec[];
  /** The step that produced this frame (null for the start and for the second crash). */
  event: RecoveryEvent | null;
  /** True on the frame where recovery itself crashes. */
  crashed: boolean;
}

export function recoveryTimeline(image: Image, recrashAfter: number | null): RecoveryFrame[] {
  const frames: RecoveryFrame[] = [{ disk: image.disk, diskLsn: image.diskLsn, log: image.log, event: null, crashed: false }];
  const walk = (from: Image, limit: number) => {
    const all = recoverySteps(from).events;
    const n = Math.min(limit, all.length);
    for (let i = 1; i <= n; i++) {
      const s = recoverySteps(from, i);
      frames.push({ disk: s.image.disk, diskLsn: s.image.diskLsn, log: s.image.log, event: s.events[i - 1], crashed: false });
    }
    return n < all.length ? recoverySteps(from, n).image : null;
  };
  const leftover = walk(image, recrashAfter ?? Infinity);
  if (leftover) {
    const last = frames[frames.length - 1];
    frames.push({ ...last, event: null, crashed: true });
    walk(leftover, Infinity);
  }
  return frames;
}

export const SEEDS = Array.from({ length: 200 }, (_, i) => i);
