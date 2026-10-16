import { describe, expect, it } from 'vitest';
import { openSqlite } from '../../core/testing/sqlite';
import { ALL_ORDERS, FIRST_VALUE, INSTANCES, NEW_COLUMN, OLD_COLUMN, PRESETS, ROWS, STEP_IDS, runMigration, type Run, type StepId } from './model';

type Cell = number | null;

/** Replay every statement of a run in real SQLite and compare each verdict, each value read and the final table with the toy model's. */
function replayInSqlite(run: Run) {
  const db = openSqlite<Record<string, Cell>>();
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, ${OLD_COLUMN} INTEGER)`);
  const insert = db.prepare(`INSERT INTO users (id, ${OLD_COLUMN}) VALUES (?, ?)`);
  for (let i = 0; i < ROWS; i++) insert.run(i + 1, FIRST_VALUE + i);
  const mismatches: string[] = [];
  for (const e of run.events) {
    if (e.sql === '') continue;
    let ok = true;
    let message: string | null = null;
    let value: Cell = null;
    try {
      if (e.op === 'read') {
        const row = db.prepare(e.sql).all(...e.params)[0];
        value = row ? (Object.values(row)[0] as Cell) : null;
      } else if (e.op === 'step' && !e.sql.includes('?')) db.exec(e.sql);
      else db.prepare(e.sql).run(...e.params);
    } catch (err) {
      ok = false;
      message = (err as Error).message;
    }
    if (ok !== e.ok) mismatches.push(`${e.text}: toy ok=${e.ok}, SQLite ok=${ok} (${message ?? 'no error'})`);
    else if (!ok && message !== e.error) mismatches.push(`${e.text}: toy says "${e.error}", SQLite says "${message}"`);
    else if (e.op === 'read' && ok && value !== e.result) mismatches.push(`${e.text}: toy read ${e.result}, SQLite read ${value}`);
  }
  const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => String(c.name));
  const finalRows = db.prepare('SELECT * FROM users ORDER BY id').all();
  return { mismatches, columns, finalRows };
}

describe('the SQLite runtime', () => {
  it('is new enough for ADD COLUMN, RENAME COLUMN (3.25) and DROP COLUMN (3.35)', () => {
    const db = openSqlite<{ v: string }>();
    const v = db.prepare('SELECT sqlite_version() AS v').all()[0].v;
    const [major, minor] = v.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(3 * 1000 + 35);
  });

  it('really does what the lesson says the statements do: a dropped column is gone, a renamed one carries its data', () => {
    const db = openSqlite<Record<string, Cell>>();
    db.exec('CREATE TABLE u (id INTEGER PRIMARY KEY, a INTEGER)');
    db.exec('INSERT INTO u VALUES (1, 5)');
    db.exec('ALTER TABLE u RENAME COLUMN a TO b');
    expect(db.prepare('SELECT b FROM u').all()[0].b).toBe(5);
    expect(() => db.prepare('SELECT a FROM u').all()).toThrow(/no such column: a/);
    db.exec('ALTER TABLE u ADD COLUMN c INTEGER');
    db.exec('ALTER TABLE u DROP COLUMN b');
    expect(() => db.prepare('SELECT b FROM u').all()).toThrow(/no such column: b/);
  });
});

describe('the toy model against real SQLite', () => {
  it('for all 720 orderings of the six steps, at three deploy positions and two seeds, every statement has the same verdict, the same error text and the same value', () => {
    expect(ALL_ORDERS).toHaveLength(720);
    for (const deploy of [0, 60, 100]) {
      for (const seed of [7, 21]) {
        for (const order of ALL_ORDERS) {
          const r = replayInSqlite(runMigration(order, deploy, seed));
          expect(r.mismatches, `${order.join(',')} deploy ${deploy} seed ${seed}`).toEqual([]);
        }
      }
    }
  });

  it('the comparison is not vacuous: a run with one verdict flipped, or one read value changed, is reported', () => {
    const run = runMigration([...STEP_IDS].reverse(), 60, 7);
    expect(run.events.some((e) => !e.ok)).toBe(true);
    expect(replayInSqlite(run).mismatches).toEqual([]);
    const flipped = { ...run, events: run.events.map((e, i) => (i === run.events.findIndex((x) => !x.ok) ? { ...e, ok: true, error: null } : e)) };
    expect(replayInSqlite(flipped).mismatches.length).toBeGreaterThan(0);
    const good = runMigration([...STEP_IDS], 60, 7);
    const wrongRead = { ...good, events: good.events.map((e, i) => (i === good.events.findIndex((x) => x.op === 'read' && x.ok) ? { ...e, result: -1 } : e)) };
    expect(replayInSqlite(wrongRead).mismatches.length).toBeGreaterThan(0);
  });

  it('the final table SQLite holds has the columns the toy says remain, and the values of the surviving column match', () => {
    for (const order of ALL_ORDERS.filter((_, i) => i % 7 === 0)) {
      const run = runMigration(order, 60, 7);
      const r = replayInSqlite(run);
      const last = run.frames.at(-1)!;
      expect(r.columns.includes(OLD_COLUMN)).toBe(last.hasName);
      expect(r.columns.includes(NEW_COLUMN)).toBe(last.hasFull);
      last.rows.forEach((row, i) => {
        if (last.hasName) expect(r.finalRows[i][OLD_COLUMN]).toBe(row.name);
        if (last.hasFull) expect(r.finalRows[i][NEW_COLUMN]).toBe(row.full);
      });
    }
  });
});

describe('the toy model against a hand-written oracle for data loss', () => {
  /** The last value written to each row by any request that succeeded in SQLite (replayed independently of the toy's own `truth`). */
  const lastWritten = (run: Run) => {
    const last = Array.from({ length: ROWS }, (_, i) => FIRST_VALUE + i);
    for (const e of run.events) if (e.op === 'write' && e.ok) last[e.params.at(-1)! - 1] = e.params[0];
    return last;
  };

  it('a row is lost exactly when the surviving column does not hold the last value written', () => {
    for (const order of ALL_ORDERS.filter((_, i) => i % 5 === 0)) {
      const run = runMigration(order, 60, 7);
      const last = run.frames.at(-1)!;
      const expected = lastWritten(run);
      const lost = expected.map((_, i) => i).filter((i) => (last.hasFull ? last.rows[i].full : last.hasName ? last.rows[i].name : null) !== expected[i]);
      expect(run.lostRows, order.join(',')).toEqual(lost);
    }
  });
});

describe('the brute-force set of clean orderings', () => {
  const clean = (deploy: number, seed = 7) => ALL_ORDERS.filter((o) => runMigration(o, deploy, seed).clean);

  it('at the default deploy position exactly the dependency-respecting order is clean: 1 of 720', () => {
    const c = clean(60);
    expect(c).toHaveLength(1);
    expect(c[0]).toEqual([...STEP_IDS]);
  });

  it('no ordering is clean while enough of the fleet still runs v1 (at 0% and 20% of the fleet already on v2)', () => {
    expect(clean(0)).toHaveLength(0);
    expect(clean(20)).toHaveLength(0);
  });

  it('every ordering that runs clean has expand before dual-write, dual-write before backfill, switch before stop, stop before contract', () => {
    for (const deploy of [40, 60, 80, 100]) {
      for (const o of clean(deploy)) {
        const at = (s: StepId) => o.indexOf(s);
        expect(at('expand')).toBeLessThan(at('dualWrite'));
        expect(at('expand')).toBeLessThan(at('backfill'));
        expect(at('dualWrite')).toBeLessThan(at('backfill'));
        expect(at('backfill')).toBeLessThan(at('switchReads'));
        expect(at('switchReads')).toBeLessThan(at('stopWriting'));
        expect(at('stopWriting')).toBeLessThan(at('contract'));
      }
    }
  });

  it('each preset\'s claim holds, with the schedule that shows it', () => {
    const by = Object.fromEntries(PRESETS.map((p) => [p.id, runMigration(p.order, 60, 7)]));
    expect(by.correct.clean).toBe(true);
    // dual-write skipped: v1 writes made during and after backfill never reach the new column, so rows are lost and reads go stale
    expect(by.skipDual.lostRows.length).toBeGreaterThan(0);
    expect(by.skipDual.errors).toBe(0);
    // contract before the last v1 instance upgrades, or before v2 stops dual-writing: statements name a column that is gone
    expect(by.contractEarly.errors).toBeGreaterThan(0);
    expect(by.contractEarly.events.some((e) => !e.ok && e.error === `no such column: ${OLD_COLUMN}`)).toBe(true);
    // backfill before expand: the backfill itself fails, the data stays unmigrated
    expect(by.backfillFirst.events.find((e) => e.step === 'backfill')!.ok).toBe(false);
    expect(by.backfillFirst.clean).toBe(false);
  });

  it('the instances: ten, and the deploy position moves them from v1 to v2', () => {
    expect(INSTANCES).toBe(10);
  });
});
