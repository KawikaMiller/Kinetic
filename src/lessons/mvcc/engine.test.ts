import { describe, expect, it } from 'vitest';
import {
  BOOT_XID, INITIAL_VALUES, KEYS, MAX_VERSIONS, SERIALIZATION_ERROR, apply, applyAll, newDb, openSlots, readRows, removable, snapshotViolation, tally, txOf, viewOf, visible, openSnapshots,
  type Db, type Key, type Op, type Outcome, type Timing, type Who,
} from './engine';
import { IDLE_UPDATES, PRESETS, bloatPreset, idlePreset, readersPreset, writersPreset } from './presets';
import { BROKEN_SEED, SCHEDULE_LENGTH, counterexample, runSchedule } from './schedule';

// ── An independent oracle: a serial replay over a commit log ─────────────
// It shares nothing with engine.ts: no transaction ids, no snapshots, no versions. A transaction's view is "the
// committed transactions up to the point its snapshot was taken, replayed in commit order, then its own writes".

type Writes = Map<Key, number | null>;
interface OracleTx { slot: 1 | 2 | 3; xid: number; snapLen: number | null; writes: Writes }
type State = Partial<Record<Key, number>>;
type Expect = 'ok' | 'noop' | 'wait' | 'serialize' | 'duplicate' | 'disabled';

class Oracle {
  log: Writes[] = [];
  /** The engine's id of each committed transaction -> its position in the commit order (bootstrap is before everything). */
  commitIndex = new Map<number, number>([[BOOT_XID, -1]]);
  aborted = new Set<number>();
  open: OracleTx[] = [];
  readonly timing: Timing;
  /** A deliberately wrong oracle for the mutation test: reads see every commit made so far, snapshot or not. */
  readonly forgetsSnapshots: boolean;
  constructor(timing: Timing, forgetsSnapshots = false) {
    this.timing = timing;
    this.forgetsSnapshots = forgetsSnapshots;
  }

  state(len: number, own?: Writes): State {
    const s: State = { ...INITIAL_VALUES };
    const layer = (w: Writes) => w.forEach((v, k) => (v === null ? delete s[k] : (s[k] = v)));
    this.log.slice(0, len).forEach(layer);
    if (own) layer(own);
    return s;
  }

  tx(slot: number): OracleTx | undefined { return this.open.find((t) => t.slot === slot); }

  /** The snapshot position a statement by `who` uses (taking and holding one on a transaction's first statement). */
  snapLen(who: Who): number {
    if (who === 'auto') return this.log.length;
    const t = this.tx(who)!;
    if (this.timing === 'statement' || this.forgetsSnapshots) return this.log.length;
    t.snapLen ??= this.log.length;
    return t.snapLen;
  }

  private close(t: OracleTx) { this.open = this.open.filter((x) => x !== t); }

  commit(t: OracleTx) {
    this.commitIndex.set(t.xid, this.log.length);
    this.log.push(t.writes);
    this.close(t);
  }

  abort(t: OracleTx) {
    this.aborted.add(t.xid);
    this.close(t);
  }

  /** Predict a statement's outcome, then (when it succeeds) record it. `autoXid` is the engine's id for an autocommit write. */
  write(op: Extract<Op, { kind: 'update' | 'delete' | 'insert' }>, autoXid: number): Expect {
    if (op.who !== 'auto' && !this.tx(op.who)) return 'disabled';
    const len = this.snapLen(op.who);
    const me = op.who === 'auto' ? null : this.tx(op.who)!;
    const view = this.state(len, me?.writes);
    const others = this.open.filter((t) => t !== me);
    const heldByOther = others.some((t) => t.writes.has(op.key));
    const commitAutoOrKeep = (value: number | null): Expect => {
      if (me) me.writes.set(op.key, value);
      else {
        this.commitIndex.set(autoXid, this.log.length);
        this.log.push(new Map([[op.key, value]]));
      }
      return 'ok';
    };
    if (op.kind === 'insert') {
      if (view[op.key] !== undefined) return 'duplicate';
      if (heldByOther) return 'wait';
      if (this.state(this.log.length, me?.writes)[op.key] !== undefined) return 'duplicate';
      return commitAutoOrKeep(op.value);
    }
    if (view[op.key] === undefined) return 'noop';
    const committedAfterSnapshot = this.log.slice(len).some((w) => w.has(op.key));
    if (committedAfterSnapshot) {
      this.abort(me!);
      return 'serialize';
    }
    if (heldByOther) return 'wait';
    return commitAutoOrKeep(op.kind === 'update' ? op.value : null);
  }
}

const category = (o: Outcome): Expect | 'other' => {
  if (o.status === 'aborted') return o.message.includes(SERIALIZATION_ERROR) ? 'serialize' : 'other';
  if (o.status === 'refused') return o.message.includes('would wait for') ? 'wait' : o.message.includes('duplicate key') ? 'duplicate' : 'disabled';
  return o.message.startsWith('0 rows') ? 'noop' : 'ok';
};

/** The test-local statement of "removable": creator aborted, or the deleter committed before every open snapshot, in commit order. */
function oracleRemovable(db: Db, oracle: Oracle): number[] {
  const heldLens = oracle.open.filter((t) => t.snapLen !== null && oracle.timing === 'transaction').map((t) => t.snapLen!);
  return db.versions
    .filter((v) => {
      if (oracle.aborted.has(v.xmin)) return true;
      if (v.xmax === null || !oracle.commitIndex.has(v.xmax)) return false;
      const at = oracle.commitIndex.get(v.xmax)!;
      return heldLens.every((len) => at < len);
    })
    .map((v) => v.vid);
}

/** Replays a seeded engine trace on the oracle and checks every claim at every step. Returns the number of steps checked. */
function replay(seed: number, timing: Timing, mutant = false): number {
  const trace = runSchedule(seed, { timing });
  const oracle = new Oracle(timing, mutant);
  let checked = 0;
  trace.steps.forEach((step, i) => {
    const { op, before, db, outcome } = step;
    const label = `seed ${seed} ${timing} step ${i} ${JSON.stringify(op)}: ${outcome.message}`;
    switch (op.kind) {
      case 'begin': {
        const free = ([1, 2, 3] as const).find((s) => !oracle.tx(s));
        if (free === undefined) expect(category(outcome), label).toBe('disabled');
        else {
          expect(outcome.status, label).toBe('ok');
          oracle.open.push({ slot: free, xid: before.nextXid, snapLen: null, writes: new Map() });
        }
        break;
      }
      case 'select': {
        if (op.who !== 'auto' && !oracle.tx(op.who)) {
          expect(category(outcome), label).toBe('disabled');
          break;
        }
        const len = oracle.snapLen(op.who);
        const me = op.who === 'auto' ? undefined : oracle.tx(op.who)!;
        expect(outcome.status === 'ok' && outcome.rows, label).toEqual(oracle.state(len, me?.writes));
        break;
      }
      case 'update':
      case 'delete':
      case 'insert': {
        const want = oracle.write(op, before.nextXid);
        expect(category(outcome), label).toBe(want);
        break;
      }
      case 'commit':
      case 'rollback': {
        const t = oracle.tx(op.who);
        if (!t) expect(category(outcome), label).toBe('disabled');
        else {
          expect(outcome.status, label).toBe('ok');
          if (op.kind === 'commit') oracle.commit(t);
          else oracle.abort(t);
        }
        break;
      }
      case 'vacuum': {
        const want = oracleRemovable(before, oracle).sort((a, b) => a - b);
        const gone = before.versions.filter((v) => !db.versions.some((w) => w.vid === v.vid)).map((v) => v.vid).sort((a, b) => a - b);
        expect(gone, label).toEqual(want);
        expect(removable(before).map((v) => v.vid).sort((a, b) => a - b), label).toEqual(want);
        expect(step.violation, label).toBeNull();
        break;
      }
    }
    // The visibility function itself, for every snapshot a running transaction holds, after every step:
    for (const t of Object.values(db.txs)) {
      if (t.status !== 'active' || !t.snapshot) continue;
      const o = oracle.tx(t.slot)!;
      expect(o, label).toBeDefined();
      expect(readRows(db, t.xid, t.snapshot), `${label} (T${t.slot} reread)`).toEqual(oracle.state(o.snapLen!, o.writes));
    }
    // The engine and the oracle agree on who is still open.
    expect(openSlots(db), label).toEqual(oracle.open.map((t) => t.slot).sort());
    checked++;
  });
  return checked;
}

describe('the visibility rule against an independent serial-replay oracle', () => {
  it('every SELECT, every write outcome and every snapshot reread agrees, over 500 seeded schedules in each snapshot timing', () => {
    let steps = 0;
    for (const timing of ['transaction', 'statement'] as Timing[]) for (let seed = 1; seed <= 500; seed++) steps += replay(seed, timing);
    expect(steps).toBe(2 * 500 * SCHEDULE_LENGTH);
  });

  it('the schedules reach the interesting cases: waits, serialization errors, duplicates, deletes, inserts and open snapshots at VACUUM', () => {
    const seen = new Set<string>();
    let vacuumsWithOpenSnapshot = 0;
    for (let seed = 1; seed <= 500; seed++) {
      for (const step of runSchedule(seed).steps) {
        seen.add(category(step.outcome));
        if (step.op.kind === 'vacuum' && openSnapshots(step.before).length > 0) vacuumsWithOpenSnapshot++;
        if (step.op.kind === 'delete' && step.outcome.status === 'ok') seen.add('deleted');
        if (step.op.kind === 'insert' && step.outcome.status === 'ok' && !step.outcome.message.startsWith('0 rows')) seen.add('inserted');
      }
    }
    for (const c of ['ok', 'noop', 'wait', 'serialize', 'duplicate', 'deleted', 'inserted']) expect(seen.has(c), c).toBe(true);
    expect(vacuumsWithOpenSnapshot).toBeGreaterThan(50);
  });

  it('the oracle is sensitive: one that forgets the snapshot (reads see every commit so far) disagrees with the engine on some seed', () => {
    let caught = 0;
    for (let seed = 1; seed <= 50; seed++) {
      try {
        replay(seed, 'transaction', true);
      } catch {
        caught++;
      }
    }
    expect(caught).toBeGreaterThan(10);
    for (let seed = 1; seed <= 50; seed++) expect(() => replay(seed, 'transaction')).not.toThrow();
  });
});
describe('VACUUM', () => {
  it('never changes what a running transaction\'s snapshot reads, over 500 seeds in each timing (safety, checked after every VACUUM)', () => {
    let vacuums = 0;
    for (const timing of ['transaction', 'statement'] as Timing[]) {
      for (let seed = 1; seed <= 500; seed++) {
        for (const s of runSchedule(seed, { timing }).steps) {
          if (s.op.kind !== 'vacuum') continue;
          vacuums++;
          expect(snapshotViolation(s.before, s.db), `seed ${seed} ${timing}`).toBeNull();
        }
      }
    }
    expect(vacuums).toBeGreaterThan(1000);
  });

  it('removes exactly the versions nobody can see: a dead version is invisible to every snapshot, a kept one is not garbage', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const s of runSchedule(seed).steps) {
        if (s.op.kind !== 'vacuum') continue;
        const gone = new Set(removable(s.before).map((v) => v.vid));
        for (const v of s.before.versions) {
          const everyone = [null, ...openSnapshots(s.before).map(() => null)];
          expect(everyone.length).toBeGreaterThanOrEqual(1);
          if (gone.has(v.vid)) {
            for (const snap of openSnapshots(s.before)) for (const t of Object.values(s.before.txs)) if (t.snapshot === snap) expect(visible(s.before, v, t.xid, snap), `seed ${seed} version ${v.vid}`).toBe(false);
            expect(visible(s.before, v, null, viewOf(s.before, 'auto').snap), `seed ${seed} version ${v.vid} for a new snapshot`).toBe(false);
          }
        }
      }
    }
  });

  it('a broken VACUUM (horizon = the latest commit) violates the invariant; the lowest violating seed in 1 to 200 is the pinned one', () => {
    let lowest: number | null = null;
    for (let seed = 1; seed <= 200 && lowest === null; seed++) if (runSchedule(seed, { broken: true }).firstViolation !== null) lowest = seed;
    expect(lowest).not.toBeNull();
    expect(lowest).toBe(BROKEN_SEED);
    const c = counterexample();
    expect(c.steps.at(-1)!.violation).toMatch(/^T\d's snapshot read .* before VACUUM and .* after$/);
    expect(c.steps.at(-1)!.op).toMatchObject({ kind: 'vacuum', broken: true });
    expect(runSchedule(BROKEN_SEED).firstViolation).toBeNull();
  });

  it('the correct VACUUM never violates it on the same seeds the broken one fails', () => {
    for (let seed = 1; seed <= 200; seed++) if (runSchedule(seed, { broken: true }).firstViolation !== null) expect(runSchedule(seed).firstViolation, `${seed}`).toBeNull();
  });

  it('the broken VACUUM is detected by the same check, and the check passes the real one (a mutation test of the oracle)', () => {
    const violating = counterexample();
    const step = violating.steps.at(-1)!;
    expect(snapshotViolation(step.before, step.db)).not.toBeNull();
    const fixed = apply(step.before, { kind: 'vacuum' });
    expect(snapshotViolation(step.before, fixed.db)).toBeNull();
  });
});

describe('the presets, with the numbers the lesson prints', () => {
  const versionsOfA = (db: Db) => db.versions.filter((v) => v.key === 'A').length;

  it('idle in transaction: 51 versions of the hot row, VACUUM removes none; commit, and VACUUM removes 50', () => {
    const { db } = applyAll(newDb('transaction'), idlePreset());
    expect(versionsOfA(db)).toBe(IDLE_UPDATES + 1);
    expect(db.versions).toHaveLength(IDLE_UPDATES + 1 + 2);
    const first = apply(db, { kind: 'vacuum' });
    expect(first.outcome).toMatchObject({ status: 'ok', removed: 0 });
    expect(first.db.versions).toHaveLength(db.versions.length);
    const committed = apply(first.db, { kind: 'commit', who: 1 });
    const second = apply(committed.db, { kind: 'vacuum' });
    expect(second.outcome).toMatchObject({ status: 'ok', removed: IDLE_UPDATES });
    expect(versionsOfA(second.db)).toBe(1);
  });

  it('idle in transaction: T1 still reads the original A = 10 after all 50 updates, and a new reader reads the last value', () => {
    const { db } = applyAll(newDb('transaction'), idlePreset());
    const t1 = viewOf(db, 1);
    expect(readRows(db, txOf(db, 1)!.xid, t1.snap).A).toBe(INITIAL_VALUES.A);
    expect(readRows(db, null, viewOf(db, 'auto').snap).A).toBe(41 + IDLE_UPDATES - 1);
  });

  it('bloat from updates: every update leaves a dead version, VACUUM brings the table back to three live rows', () => {
    const { db } = applyAll(newDb(), bloatPreset());
    expect(tally(db)).toMatchObject({ live: 3, dead: 30, pinned: 0, total: 33 });
    const cleaned = apply(db, { kind: 'vacuum' });
    expect(cleaned.db.versions).toHaveLength(3);
    expect(tally(cleaned.db)).toMatchObject({ live: 3, dead: 0, total: 3 });
  });

  it('two readers, two answers, and nothing waits', () => {
    const { db, outcomes } = applyAll(newDb('transaction'), readersPreset());
    expect(outcomes.every((o) => o.status === 'ok')).toBe(true);
    const reads = outcomes.flatMap((o) => (o.status === 'ok' && o.rows ? [o.rows.A] : []));
    expect(reads).toEqual([10, 40, 10]);
    expect(db.versions.filter((v) => v.key === 'A')).toHaveLength(2);
  });

  it('a writer meeting an uncommitted writer waits; after the first commits, per-transaction timing aborts the second, per-statement updates the newest version', () => {
    for (const timing of ['transaction', 'statement'] as Timing[]) {
      const { db, outcomes } = applyAll(newDb(timing), writersPreset());
      expect(outcomes.at(-1)).toEqual({ status: 'refused', message: 'T2 would wait for T1 (row locked): finish T1 first' });
      const committed = apply(db, { kind: 'commit', who: 1 }).db;
      const retry = apply(committed, { kind: 'update', who: 2, key: 'A', value: 42 });
      if (timing === 'transaction') {
        expect(retry.outcome).toEqual({ status: 'aborted', message: `ERROR: ${SERIALIZATION_ERROR}: T2 is rolled back` });
        expect(txOf(retry.db, 2)).toBeUndefined();
      } else {
        expect(retry.outcome.status).toBe('ok');
        expect(readRows(retry.db, txOf(retry.db, 2)!.xid, viewOf(retry.db, 2).snap).A).toBe(42);
        expect(retry.db.versions.filter((v) => v.key === 'A' && v.xmax === null)).toHaveLength(1);
      }
    }
  });

  it('every preset runs without a refused step except the one that is meant to wait', () => {
    for (const id of ['idle', 'bloat', 'readers'] as const) expect(applyAll(newDb(), PRESETS[id]()).outcomes.every((o) => o.status === 'ok'), id).toBe(true);
  });
});

describe('limits and refusals', () => {
  it('at most three transactions are open, and BEGIN is refused with the reason', () => {
    const { db } = applyAll(newDb(), [{ kind: 'begin' }, { kind: 'begin' }, { kind: 'begin' }]);
    expect(openSlots(db)).toEqual([1, 2, 3]);
    expect(apply(db, { kind: 'begin' }).outcome).toMatchObject({ status: 'refused', message: expect.stringContaining('at most 3') });
  });

  it('past 200 versions the table refuses new versions with "table full: run VACUUM", and VACUUM makes room', () => {
    let db = newDb();
    let n = 0;
    while (db.versions.length < MAX_VERSIONS) db = apply(db, { kind: 'update', who: 'auto', key: 'A', value: 40 + (n++ % 50) }).db;
    expect(db.versions).toHaveLength(MAX_VERSIONS);
    const refused = apply(db, { kind: 'update', who: 'auto', key: 'B', value: 99 });
    expect(refused.outcome).toMatchObject({ status: 'refused', message: expect.stringContaining('table full: run VACUUM') });
    expect(refused.db.versions).toHaveLength(MAX_VERSIONS);
    expect(apply(apply(db, { kind: 'vacuum' }).db, { kind: 'update', who: 'auto', key: 'B', value: 99 }).outcome.status).toBe('ok');
  });

  it('operations that do not apply are disabled with a reason and change nothing', () => {
    const db = newDb();
    for (const op of [{ kind: 'select', who: 1 }, { kind: 'commit', who: 2 }, { kind: 'rollback', who: 3 }, { kind: 'update', who: 1, key: 'A', value: 50 }] as Op[]) {
      const r = apply(db, op);
      expect(r.outcome.status).toBe('refused');
      expect(r.db).toEqual(db);
    }
  });

  it('a version is visible to at most one reader per key at a time, and a fresh database shows A, B and C', () => {
    const db = newDb();
    expect(readRows(db, null, viewOf(db, 'auto').snap)).toEqual(INITIAL_VALUES);
    for (let seed = 1; seed <= 100; seed++) {
      for (const s of runSchedule(seed).steps) {
        const snap = viewOf(s.db, 'auto').snap;
        for (const k of KEYS) expect(s.db.versions.filter((v) => v.key === k && visible(s.db, v, null, snap)).length).toBeLessThanOrEqual(1);
      }
    }
  });
});
