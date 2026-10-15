/**
 * Isolation-levels model: a toy multi-version engine with a stated model for each level, two toy
 * transactions per anomaly, and an enumerator of every interleaving of the two.
 *
 * The stated model (the lesson shows it, a test enumerates it):
 * - Read Uncommitted (ru): a read sees the newest version that was not rolled back, committed or not.
 * - Read Committed (rc): a read sees the newest committed version at the moment of the read.
 * - Repeatable Read / Snapshot (si): a read sees the versions committed before the transaction's
 *   first statement (its snapshot) plus its own writes; a transaction that writes a row changed
 *   since its snapshot, or one another unfinished transaction has already written, is aborted
 *   (the toy does not wait for the other writer, it aborts at once).
 * - Serializable (ser): snapshot isolation, plus a committing transaction is aborted when it and a
 *   concurrent transaction each read something the other wrote (a cycle of read/write dependencies).
 * No locks, no waiting, no deadlocks: a toy, so what it says about a real database is limited to
 * what the lesson says about it.
 *
 * `deriveMatrix` regenerates the anomaly-by-level table by running every interleaving of the two
 * transactions of each anomaly at each level; `MATRIX` is the table the lesson shows, and a test
 * pins the two together.
 */

export type Level = 'ru' | 'rc' | 'si' | 'ser';
export type AnomalyId = 'dirty' | 'nonrepeat' | 'phantom' | 'lost' | 'skew';
export type Tx = 'T1' | 'T2';
export type Tone = 'ok' | 'bad' | 'hi' | 'info' | '';
/** What a level does about an anomaly: it happens in some interleaving, never happens, or is stopped by aborting a transaction. */
export type Outcome = 'happens' | 'prevented' | 'aborted';

export const LEVEL_IDS: readonly Level[] = ['ru', 'rc', 'si', 'ser'];
export const ANOMALY_IDS: readonly AnomalyId[] = ['dirty', 'nonrepeat', 'phantom', 'lost', 'skew'];

export const LEVELS: { id: Level; label: string; short: string; model: string }[] = [
  { id: 'ru', label: 'Read Uncommitted', short: 'RU', model: 'A read sees the newest version that was not rolled back, committed or not.' },
  { id: 'rc', label: 'Read Committed', short: 'RC', model: 'A read sees the newest committed version at the moment of the read.' },
  {
    id: 'si', label: 'Repeatable Read / Snapshot', short: 'RR / SI',
    model: "A read sees the snapshot taken at the transaction's first statement. Writing a row that changed since then aborts the writer.",
  },
  {
    id: 'ser', label: 'Serializable', short: 'SER',
    model: 'Snapshot reads, and a transaction is aborted at commit if it and another one each read something the other wrote.',
  },
];

export const ANOMALIES: { id: AnomalyId; label: string; blurb: string }[] = [
  { id: 'dirty', label: 'Dirty read', blurb: 'reading data another transaction never committed' },
  { id: 'nonrepeat', label: 'Non-repeatable read', blurb: 'the same row changes between two reads' },
  { id: 'phantom', label: 'Phantom read', blurb: 'new rows appear in a repeated query' },
  { id: 'lost', label: 'Lost update', blurb: 'two read-modify-writes, one silently overwritten' },
  { id: 'skew', label: 'Write skew', blurb: 'two valid decisions that together break a rule' },
];

/**
 * The table the lesson shows. A test regenerates it with `deriveMatrix` (every interleaving of the
 * two toy transactions, at each level) and compares: if the toy engine disagrees, the table is wrong
 * or the stated model is.
 */
export const MATRIX: Record<AnomalyId, Record<Level, Outcome>> = {
  dirty: { ru: 'happens', rc: 'prevented', si: 'prevented', ser: 'prevented' },
  nonrepeat: { ru: 'happens', rc: 'happens', si: 'prevented', ser: 'prevented' },
  phantom: { ru: 'happens', rc: 'happens', si: 'prevented', ser: 'prevented' },
  lost: { ru: 'happens', rc: 'happens', si: 'aborted', ser: 'aborted' },
  skew: { ru: 'happens', rc: 'happens', si: 'happens', ser: 'aborted' },
};

/* ---------- the engine ---------- */

export interface Version {
  v: string;
  by: 'T0' | Tx;
  /** c = committed, p = pending (uncommitted), x = rolled back or aborted */
  st: 'c' | 'p' | 'x';
  /** Commit order, once committed. */
  seq: number | null;
}

export interface Row {
  key: string;
  label: string;
  versions: Version[];
}

interface RowInit {
  key: string;
  label: string;
  v: string;
}

export interface Saw {
  key: string;
  idx: number;
  who: Tx;
}

export interface EngineOptions {
  /** Snapshot levels abort a writer of a row changed since its snapshot (default true). Tests switch it off to break the model. */
  firstWriterWins?: boolean;
  /** Serializable aborts on a read/write dependency cycle (default true). */
  cycleCheck?: boolean;
}

interface TxState {
  snapshot: number;
  status: 'active' | 'committed' | 'aborted';
  reads: Set<string>;
  scanned: boolean;
  writes: Set<string>;
  /** Commit order of this transaction, once committed. */
  commitSeq: number;
}

export type WriteResult = 'ok' | 'conflict';

export class Engine {
  rows: Row[];
  private seq = 0;
  private txs = new Map<Tx, TxState>();
  private engineAborts = new Set<Tx>();

  readonly level: Level;
  private opts: EngineOptions;

  constructor(level: Level, rows0: readonly RowInit[], opts: EngineOptions = {}) {
    this.level = level;
    this.opts = opts;
    this.rows = rows0.map((r) => ({ key: r.key, label: r.label, versions: [{ v: r.v, by: 'T0', st: 'c', seq: 0 }] }));
  }

  /** Start (or restart, after an abort) a transaction: its snapshot is the database as of now. */
  begin(id: Tx): void {
    this.txs.set(id, { snapshot: this.seq, status: 'active', reads: new Set(), scanned: false, writes: new Set(), commitSeq: Infinity });
  }

  /** The commit count the transaction's snapshot was taken at. */
  snapshotOf(id: Tx): number {
    return this.state(id).snapshot;
  }

  status(id: Tx): TxState['status'] | 'unstarted' {
    return this.txs.get(id)?.status ?? 'unstarted';
  }

  /** True when the engine itself aborted the transaction (a conflict, at any point of the run), as opposed to the program rolling it back. */
  wasAbortedByEngine(id: Tx): boolean {
    return this.engineAborts.has(id);
  }

  private state(id: Tx): TxState {
    if (!this.txs.has(id)) this.begin(id);
    return this.txs.get(id)!;
  }

  /** The version transaction `id` sees of a row, and where it sits in the row's version list. */
  visible(id: Tx, row: Row): { version: Version; idx: number } | null {
    const tx = this.state(id);
    const own = this.lastIndex(row, (v) => v.by === id && v.st === 'p');
    if (own >= 0) return { version: row.versions[own], idx: own };
    if (this.level === 'ru') {
      const idx = this.lastIndex(row, (v) => v.st !== 'x');
      return idx >= 0 ? { version: row.versions[idx], idx } : null;
    }
    const limit = this.level === 'rc' ? this.seq : tx.snapshot;
    let best = -1;
    row.versions.forEach((v, i) => {
      if (v.st === 'c' && (v.seq ?? Infinity) <= limit && (best < 0 || (v.seq ?? 0) >= (row.versions[best].seq ?? 0))) best = i;
    });
    return best >= 0 ? { version: row.versions[best], idx: best } : null;
  }

  private lastIndex(row: Row, pred: (v: Version) => boolean): number {
    for (let i = row.versions.length - 1; i >= 0; i--) if (pred(row.versions[i])) return i;
    return -1;
  }

  read(id: Tx, key: string): { value: string; idx: number; from: Version } {
    const tx = this.state(id);
    tx.reads.add(key);
    const seen = this.visible(id, this.rowOf(key));
    if (!seen) throw new Error(`${id} cannot see any version of ${key}`);
    return { value: seen.version.v, idx: seen.idx, from: seen.version };
  }

  /** Read every row of the table: what a `SELECT ... WHERE` over the whole table sees. */
  scan(id: Tx): { seen: { key: string; value: string; idx: number }[]; hidden: string[] } {
    const tx = this.state(id);
    tx.scanned = true;
    const seen: { key: string; value: string; idx: number }[] = [];
    const hidden: string[] = [];
    for (const row of this.rows) {
      const v = this.visible(id, row);
      if (v) seen.push({ key: row.key, value: v.version.v, idx: v.idx });
      else hidden.push(row.key);
    }
    return { seen, hidden };
  }

  private rowOf(key: string): Row {
    const row = this.rows.find((r) => r.key === key);
    if (!row) throw new Error(`no row ${key}`);
    return row;
  }

  private snapshotLevel(): boolean {
    return this.level === 'si' || this.level === 'ser';
  }

  write(id: Tx, key: string, v: string): WriteResult {
    const tx = this.state(id);
    const row = this.rowOf(key);
    if (this.snapshotLevel() && (this.opts.firstWriterWins ?? true)) {
      const changedSince = row.versions.some((x) => x.st === 'c' && (x.seq ?? 0) > tx.snapshot);
      const otherPending = row.versions.some((x) => x.st === 'p' && x.by !== id);
      if (changedSince || otherPending) {
        this.abort(id, true);
        return 'conflict';
      }
    }
    row.versions.push({ v, by: id, st: 'p', seq: null });
    tx.writes.add(key);
    return 'ok';
  }

  /** Add a brand-new row (committed with the transaction). */
  insert(id: Tx, init: RowInit): void {
    const tx = this.state(id);
    this.rows.push({ key: init.key, label: init.label, versions: [{ v: init.v, by: id, st: 'p', seq: null }] });
    tx.writes.add(init.key);
  }

  commit(id: Tx): WriteResult {
    const tx = this.state(id);
    if (this.level === 'ser' && (this.opts.cycleCheck ?? true) && this.formsCycle(id)) {
      this.abort(id, true);
      return 'conflict';
    }
    this.seq += 1;
    for (const row of this.rows) for (const v of row.versions) if (v.by === id && v.st === 'p') Object.assign(v, { st: 'c', seq: this.seq });
    tx.status = 'committed';
    tx.commitSeq = this.seq;
    return 'ok';
  }

  rollback(id: Tx): void {
    this.abort(id, false);
  }

  private abort(id: Tx, conflict: boolean) {
    const tx = this.state(id);
    for (const row of this.rows) for (const v of row.versions) if (v.by === id && v.st === 'p') v.st = 'x';
    tx.status = 'aborted';
    if (conflict) this.engineAborts.add(id);
  }

  /**
   * Does committing `id` close a loop with another transaction that already committed? An edge
   * A→B means A read something B wrote that A's snapshot could not see.
   */
  private formsCycle(id: Tx): boolean {
    const me = this.state(id);
    for (const [otherId, other] of this.txs) {
      if (otherId === id || other.status !== 'committed') continue;
      // Their writes are invisible to me only if they committed after my snapshot.
      const myReadsHitTheirWrites = other.commitSeq > me.snapshot && [...other.writes].some((k) => me.scanned || me.reads.has(k));
      const theirReadsHitMyWrites = [...me.writes].some((k) => other.scanned || other.reads.has(k));
      if (myReadsHitTheirWrites && theirReadsHitMyWrites) return true;
    }
    return false;
  }

  /** The newest committed value of a row, or null if it has none. */
  committed(key: string): string | null {
    const row = this.rows.find((r) => r.key === key);
    if (!row) return null;
    let best: Version | null = null;
    for (const v of row.versions) if (v.st === 'c' && (!best || (v.seq ?? 0) >= (best.seq ?? 0))) best = v;
    return best?.v ?? null;
  }

  cloneRows(): Row[] {
    return this.rows.map((r) => ({ ...r, versions: r.versions.map((v) => ({ ...v })) }));
  }
}

/* ---------- the toy transactions ---------- */

export interface StepOutcome {
  result?: string;
  tone?: Tone;
  saw?: Saw[];
  hidden?: string[];
}


interface StepCtx {
  db: Engine;
  id: Tx;
  /** Per-transaction scratch values, kept between its steps. */
  mine: Record<string, string | number>;
  /** Versions this transaction has read, for the dirty-read check. */
  readFrom: Version[];
}

interface StepDef {
  sql: string | ((mine: Record<string, string | number>) => string);
  /** A step is skipped when its transaction is no longer active. */
  run: (c: StepCtx) => StepOutcome;
}

interface Program {
  rows0: RowInit[];
  T1: StepDef[];
  T2: StepDef[];
  /** The application retrying T2 after the engine aborted it (lost update). */
  retry?: StepDef;
  /** The anomaly, judged from the finished run alone. */
  present: (r: RunResult) => boolean;
}

const money = (v: string) => Number(v.replace('$', ''));
const sawOf = (who: Tx, key: string, idx: number): Saw => ({ key, idx, who });
const NOT_SERIALIZABLE = 'ERROR: could not serialize';

const rollbackStep: StepDef = { sql: 'ROLLBACK', run: (c) => { c.db.rollback(c.id); return { tone: 'hi' }; } };

/** "Read the counter, add one, write and commit": the app-level read-modify-write behind the lost update. */
const readStep = (key: string): StepDef => ({
  sql: `SELECT ${key}`,
  run: (c) => {
    const r = c.db.read(c.id, key);
    c.mine.n = Number(r.value);
    return { result: r.value, saw: [sawOf(c.id, key, r.idx)] };
  },
});

const incrementStep = (retry: boolean): StepDef => ({
  sql: (m) => (retry ? `retry: read ${m.n}, write ${Number(m.n) + 1}; COMMIT` : `UPDATE likes = ${Number(m.n) + 1}; COMMIT`),
  run: (c) => {
    if (retry) {
      c.db.begin(c.id);
      c.mine.n = Number(c.db.read(c.id, 'likes').value);
    }
    const row = c.db.rows.find((r) => r.key === 'likes')!;
    const unseen = row.versions.some((v) => v.st === 'c' && (v.seq ?? 0) > c.db.snapshotOf(c.id));
    if (c.db.write(c.id, 'likes', String(Number(c.mine.n) + 1)) === 'conflict') return { result: NOT_SERIALIZABLE, tone: 'hi' };
    c.db.commit(c.id);
    if (retry) return { result: 'ok', tone: 'ok' };
    return unseen ? { result: 'ok', tone: 'bad' } : { tone: 'info' };
  },
});

const countStep = (who: Tx): StepDef => ({
  sql: 'count on_call',
  run: (c) => {
    const { seen } = c.db.scan(c.id);
    const n = seen.filter((s) => s.value === 'true').length;
    c.mine.n = n;
    return { result: `${n} → ${n >= 2 ? 'ok to leave' : 'must stay'}`, tone: 'ok', saw: seen.map((s) => sawOf(who, s.key, s.idx)) };
  },
});

const leaveStep = (key: string, name: string): StepDef => ({
  sql: `UPDATE ${name} on_call = false`,
  run: (c) => {
    if (Number(c.mine.n) >= 2) c.db.write(c.id, key, 'false');
    return {};
  },
});

const commitSkewStep = (): StepDef => ({
  sql: 'COMMIT',
  run: (c) => {
    if (c.db.commit(c.id) === 'conflict') return { result: NOT_SERIALIZABLE, tone: 'hi' };
    const onCall = c.db.rows.filter((r) => c.db.committed(r.key) === 'true').length;
    return { result: 'ok', tone: onCall === 0 ? 'bad' : 'ok' };
  },
});

const PROGRAMS: Record<AnomalyId, Program> = {
  dirty: {
    rows0: [{ key: 'acct', label: 'balance', v: '$100' }],
    T1: [
      { sql: 'UPDATE balance = 200', run: (c) => { c.db.write(c.id, 'acct', '$200'); return {}; } },
      rollbackStep,
    ],
    T2: [
      {
        sql: 'SELECT balance',
        run: (c) => {
          const r = c.db.read(c.id, 'acct');
          c.mine.balance = money(r.value);
          c.readFrom.push(r.from);
          return { result: r.value, tone: r.from.st === 'p' ? 'bad' : 'ok', saw: [sawOf(c.id, 'acct', r.idx)] };
        },
      },
      {
        sql: 'approve loan if balance ≥ 150',
        run: (c) => {
          const approved = Number(c.mine.balance) >= 150;
          const source = c.readFrom[c.readFrom.length - 1];
          return { result: approved ? 'approved' : 'denied', tone: approved && source.st !== 'c' ? 'bad' : 'ok' };
        },
      },
    ],
    present: (r) => r.readFrom.T2.some((v) => v.st === 'x'),
  },
  nonrepeat: {
    rows0: [{ key: 'acct', label: 'balance', v: '$100' }],
    T1: [
      {
        sql: 'SELECT balance',
        run: (c) => {
          const r = c.db.read(c.id, 'acct');
          c.mine.first = r.value;
          return { result: r.value, tone: 'ok', saw: [sawOf(c.id, 'acct', r.idx)] };
        },
      },
      {
        sql: 'SELECT balance',
        run: (c) => {
          const r = c.db.read(c.id, 'acct');
          c.mine.second = r.value;
          return { result: r.value, tone: r.value === c.mine.first ? 'ok' : 'bad', saw: [sawOf(c.id, 'acct', r.idx)] };
        },
      },
    ],
    T2: [{ sql: 'UPDATE balance = 200; COMMIT', run: (c) => { c.db.write(c.id, 'acct', '$200'); c.db.commit(c.id); return { tone: 'info' }; } }],
    present: (r) => r.mine.T1.second !== undefined && r.mine.T1.first !== r.mine.T1.second,
  },
  phantom: {
    rows0: [
      { key: 'alice', label: 'Alice on_call', v: 'true' },
      { key: 'bob', label: 'Bob on_call', v: 'true' },
    ],
    T1: [1, 2].map((): StepDef => ({
      sql: 'SELECT count(*) WHERE on_call',
      run: (c) => {
        const { seen, hidden } = c.db.scan(c.id);
        const n = seen.filter((s) => s.value === 'true').length;
        const previous = c.mine.counted;
        c.mine[previous === undefined ? 'counted' : 'recounted'] = n;
        return { result: String(n), tone: previous === undefined || previous === n ? 'ok' : 'bad', saw: seen.map((s) => sawOf(c.id, s.key, s.idx)), hidden };
      },
    })),
    T2: [{
      sql: 'INSERT Carol on_call; COMMIT',
      run: (c) => { c.db.insert(c.id, { key: 'carol', label: 'Carol on_call', v: 'true' }); c.db.commit(c.id); return { tone: 'info' }; },
    }],
    present: (r) => r.mine.T1.recounted !== undefined && r.mine.T1.counted !== r.mine.T1.recounted,
  },
  lost: {
    rows0: [{ key: 'likes', label: 'likes', v: '10' }],
    T1: [readStep('likes'), incrementStep(false)],
    T2: [readStep('likes'), incrementStep(false)],
    retry: incrementStep(true),
    present: (r) => r.status.T1 === 'committed' && r.status.T2 === 'committed' && r.db.committed('likes') !== '12',
  },
  skew: {
    rows0: [
      { key: 'alice', label: 'Alice on_call', v: 'true' },
      { key: 'bob', label: 'Bob on_call', v: 'true' },
    ],
    T1: [countStep('T1'), leaveStep('alice', 'Alice'), commitSkewStep()],
    T2: [countStep('T2'), leaveStep('bob', 'Bob'), commitSkewStep()],
    present: (r) => r.status.T1 === 'committed' && r.status.T2 === 'committed' && !['alice', 'bob'].some((k) => r.db.committed(k) === 'true'),
  },
};

/* ---------- running a schedule ---------- */

export interface StepRun {
  who: Tx;
  sql: string;
  result?: string;
  tone?: Tone;
  saw: Saw[];
  hidden: string[];
  /** The engine aborted the transaction at this step. */
  aborted: boolean;
  rows: Row[];
}

export interface RunResult {
  steps: StepRun[];
  db: Engine;
  status: Record<Tx, ReturnType<Engine['status']>>;
  mine: Record<Tx, Record<string, string | number>>;
  readFrom: Record<Tx, Version[]>;
  /** The anomaly showed up in this run. */
  present: boolean;
  /** The engine aborted a transaction in this run. */
  engineAborted: boolean;
}

const resolveSql = (sql: StepDef['sql'], mine: Record<string, string | number>) => (typeof sql === 'function' ? sql(mine) : sql);

/** Run the two toy transactions in the given order of steps (one 'T1' or 'T2' per step), then judge the result. */
export function runSchedule(anomaly: AnomalyId, level: Level, schedule: readonly Tx[], opts?: EngineOptions, withRetry = false): RunResult {
  const program = PROGRAMS[anomaly];
  const db = new Engine(level, program.rows0, opts);
  const mine: RunResult['mine'] = { T1: {}, T2: {} };
  const readFrom: RunResult['readFrom'] = { T1: [], T2: [] };
  const next: Record<Tx, number> = { T1: 0, T2: 0 };
  const steps: StepRun[] = [];

  const exec = (id: Tx, def: StepDef) => {
    const ctx: StepCtx = { db, id, mine: mine[id], readFrom: readFrom[id] };
    const before = db.status(id);
    const out = def.run(ctx);
    steps.push({
      who: id, sql: resolveSql(def.sql, mine[id]), result: out.result, tone: out.tone, saw: out.saw ?? [], hidden: out.hidden ?? [],
      aborted: before !== 'aborted' && db.status(id) === 'aborted' && db.wasAbortedByEngine(id), rows: db.cloneRows(),
    });
  };

  for (const id of schedule) {
    const def = program[id][next[id]++];
    if (!def) throw new Error(`${id} has no step ${next[id]}`);
    if (db.status(id) === 'aborted' || db.status(id) === 'committed') continue;
    exec(id, def);
  }
  if (withRetry && program.retry && db.status('T2') === 'aborted' && db.wasAbortedByEngine('T2')) exec('T2', program.retry);

  const result: RunResult = {
    steps, db, mine, readFrom, present: false, engineAborted: false,
    status: { T1: db.status('T1'), T2: db.status('T2') },
  };
  result.present = program.present(result);
  result.engineAborted = db.wasAbortedByEngine('T1') || db.wasAbortedByEngine('T2');
  return result;
}

/** The step counts of the two toy transactions of an anomaly. */
export const programLengths = (anomaly: AnomalyId): [number, number] => [PROGRAMS[anomaly].T1.length, PROGRAMS[anomaly].T2.length];

/** The interleaving the lesson plays for each anomaly (a scripted choice among all of them). */
export const SCRIPTED_SCHEDULE: Record<AnomalyId, readonly Tx[]> = {
  dirty: ['T1', 'T2', 'T1', 'T2'],
  nonrepeat: ['T1', 'T2', 'T1'],
  phantom: ['T1', 'T2', 'T1'],
  lost: ['T1', 'T2', 'T1', 'T2'],
  skew: ['T1', 'T2', 'T1', 'T2', 'T1', 'T2'],
};

/** Every way to interleave `a` steps of T1 with `b` steps of T2, each keeping its own order. */
export function interleavings(a: number, b: number): Tx[][] {
  if (a === 0) return [Array<Tx>(b).fill('T2')];
  if (b === 0) return [Array<Tx>(a).fill('T1')];
  return [...interleavings(a - 1, b).map((s) => ['T1' as Tx, ...s]), ...interleavings(a, b - 1).map((s) => ['T2' as Tx, ...s])];
}

export function allRuns(anomaly: AnomalyId, level: Level, opts?: EngineOptions): RunResult[] {
  const [a, b] = programLengths(anomaly);
  return interleavings(a, b).map((s) => runSchedule(anomaly, level, s, opts));
}

/**
 * The outcome of one cell, from every interleaving: it happens if some interleaving shows the
 * anomaly; otherwise it is prevented by aborting if the engine aborted a transaction in some
 * interleaving, and prevented outright if it never had to.
 */
export function outcomeOf(anomaly: AnomalyId, level: Level, opts?: EngineOptions): Outcome {
  const runs = allRuns(anomaly, level, opts);
  if (runs.some((r) => r.present)) return 'happens';
  return runs.some((r) => r.engineAborted) ? 'aborted' : 'prevented';
}

export function deriveMatrix(opts?: EngineOptions): Record<AnomalyId, Record<Level, Outcome>> {
  return Object.fromEntries(
    ANOMALY_IDS.map((a) => [a, Object.fromEntries(LEVEL_IDS.map((l) => [l, outcomeOf(a, l, opts)]))]),
  ) as Record<AnomalyId, Record<Level, Outcome>>;
}

/** How many interleavings each anomaly's cells were checked against. */
export const interleavingCounts = (): Record<AnomalyId, number> =>
  Object.fromEntries(ANOMALY_IDS.map((a) => [a, interleavings(...programLengths(a)).length])) as Record<AnomalyId, number>;

/** The lesson's scripted run of an anomaly at a level (with the application's retry after an abort). */
export const scriptedRun = (anomaly: AnomalyId, level: Level): RunResult => runSchedule(anomaly, level, SCRIPTED_SCHEDULE[anomaly], undefined, true);

/** Does this run show the anomaly itself, or an abort that stopped it? */
export const verdictOf = (anomaly: AnomalyId, level: Level): 'anomaly' | 'aborted' | 'prevented' => {
  const run = scriptedRun(anomaly, level);
  if (run.present) return 'anomaly';
  return run.engineAborted ? 'aborted' : 'prevented';
};

export const rowsOf = (anomaly: AnomalyId): Row[] =>
  PROGRAMS[anomaly].rows0.map((r) => ({ key: r.key, label: r.label, versions: [{ v: r.v, by: 'T0', st: 'c', seq: 0 }] }));

