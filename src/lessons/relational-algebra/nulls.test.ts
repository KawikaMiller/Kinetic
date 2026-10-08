import { describe, expect, it } from 'vitest';
import {
  NULL_QUERIES, and, cmpEq, inList, not, nullCourses, nullEnrolments, or, runNullQuery, students, type Cell, type Tri,
} from './nulls';

interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(): Record<string, Cell>[] };
}
const SQLITE = 'node:sqlite';
const open = async (): Promise<Db> => {
  const { DatabaseSync } = (await import(/* @vite-ignore */ SQLITE)) as { DatabaseSync: new (path: string) => Db };
  return new DatabaseSync(':memory:');
};
const lit = (v: Cell) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v}'`);
const tri = (v: Cell): Tri => (v === null ? 'UNKNOWN' : v ? 'TRUE' : 'FALSE');
const TRIS: Tri[] = ['TRUE', 'FALSE', 'UNKNOWN'];
const sqlOf = (t: Tri) => ({ TRUE: '1', FALSE: '0', UNKNOWN: 'NULL' })[t];

async function dbWith(unknownStudent: boolean): Promise<Db> {
  const db = await open();
  db.exec('CREATE TABLE Students (sid INTEGER, name TEXT, year INTEGER)');
  db.exec('CREATE TABLE Courses (cid TEXT, title TEXT, teacher TEXT)');
  db.exec('CREATE TABLE Enrolments (sid INTEGER, cid TEXT)');
  const fill = (t: string, rows: Cell[][]) => rows.forEach((r) => db.exec(`INSERT INTO ${t} VALUES (${r.map(lit).join(', ')})`));
  fill('Students', students());
  fill('Courses', nullCourses());
  fill('Enrolments', nullEnrolments(unknownStudent));
  return db;
}

const sorted = (rows: Cell[][]) => rows.map((r) => JSON.stringify(r)).sort();

describe('three-valued logic matches SQLite', () => {
  it('NOT, AND and OR over TRUE, FALSE and UNKNOWN', async () => {
    const db = await open();
    for (const a of TRIS) {
      expect(not(a)).toBe(tri(db.prepare(`SELECT NOT ${sqlOf(a)} AS v`).all()[0].v));
      for (const b of TRIS) {
        expect(and(a, b)).toBe(tri(db.prepare(`SELECT (${sqlOf(a)} AND ${sqlOf(b)}) AS v`).all()[0].v));
        expect(or(a, b)).toBe(tri(db.prepare(`SELECT (${sqlOf(a)} OR ${sqlOf(b)}) AS v`).all()[0].v));
      }
    }
  });

  it('= and IN, for every value and list drawn from {1, 2, NULL} (lists up to 3 long)', async () => {
    const db = await open();
    const vals: Cell[] = [1, 2, null];
    const lists: Cell[][] = [[]];
    for (let len = 1; len <= 3; len++) for (const l of lists.filter((x) => x.length === len - 1)) for (const v of vals) lists.push([...l, v]);
    for (const x of vals) {
      for (const y of vals) expect(cmpEq(x, y)).toBe(tri(db.prepare(`SELECT (${lit(x)} = ${lit(y)}) AS v`).all()[0].v));
      for (const l of lists.filter((xs) => xs.length > 0)) {
        expect(inList(x, l)).toBe(tri(db.prepare(`SELECT (${lit(x)} IN (${l.map(lit).join(', ')})) AS v`).all()[0].v));
        expect(not(inList(x, l))).toBe(tri(db.prepare(`SELECT (${lit(x)} NOT IN (${l.map(lit).join(', ')})) AS v`).all()[0].v));
      }
    }
  });

  it('NULL = NULL is UNKNOWN, not TRUE', () => {
    expect(cmpEq(null, null)).toBe('UNKNOWN');
  });
});

describe('every NULL query, both variants, with and without the unknown student', () => {
  for (const q of NULL_QUERIES)
    for (const v of ['trap', 'fix'] as const)
      for (const unknown of [false, true])
        it(`${q.id} ${v}${unknown ? ' (+ NULL sid)' : ''} returns what SQLite returns`, async () => {
          const db = await dbWith(unknown);
          const run = runNullQuery(q.id, v, unknown);
          const got = db.prepare(run.sql.join('\n')).all().map((r) => Object.values(r));
          expect(sorted(run.result.rows)).toEqual(sorted(got));
          expect(run.padded.length).toBe(run.result.rows.length);
          if (run.tested) expect(run.tested.verdict.length).toBe(run.tested.rows.length);
        });
});

describe('the traps, worked by hand', () => {
  const titles = (r: ReturnType<typeof runNullQuery>) => r.result.rows.map((x) => x[0]);
  it('= NULL keeps nothing; IS NULL finds the untaught course', () => {
    expect(runNullQuery('eq-null', 'trap', false).result.rows).toEqual([]);
    expect(runNullQuery('eq-null', 'trap', false).tested!.verdict.every((t) => t === 'UNKNOWN')).toBe(true);
    expect(titles(runNullQuery('eq-null', 'fix', false))).toEqual(['Security']);
  });

  it("<> 'Hopper' silently drops the course with no teacher", () => {
    expect(titles(runNullQuery('not-equal', 'trap', false))).toEqual(['Algorithms', 'Types']);
    expect(titles(runNullQuery('not-equal', 'fix', false))).toEqual(['Algorithms', 'Types', 'Security']);
  });

  it('NOT IN returns nobody once the subquery holds a NULL; NOT EXISTS still finds Barbara', () => {
    expect(titles(runNullQuery('not-in', 'trap', false))).toEqual(['Barbara']);
    expect(titles(runNullQuery('not-in', 'trap', true))).toEqual([]);
    expect(runNullQuery('not-in', 'trap', true).tested!.verdict.filter((t) => t === 'UNKNOWN').length).toBe(1);
    expect(titles(runNullQuery('not-in', 'fix', true))).toEqual(['Barbara']);
  });

  it("a WHERE on the outer table's column turns LEFT JOIN into an inner join", () => {
    const trap = runNullQuery('on-where', 'trap', false);
    const fix = runNullQuery('on-where', 'fix', false);
    expect(titles(trap)).toEqual(['Databases', 'Algorithms', 'Compilers']);
    expect(titles(fix)).toEqual(['Databases', 'Algorithms', 'Compilers', 'Types', 'Security']);
    expect(fix.padded.filter(Boolean).length).toBe(2);
  });

  it('FULL JOIN adds the orphaned enrolment that LEFT JOIN drops', () => {
    const left = runNullQuery('full', 'trap', false);
    const full = runNullQuery('full', 'fix', false);
    expect(full.result.rows.length).toBe(left.result.rows.length + 1);
    expect(full.result.rows.at(-1)).toEqual([null, 2, 'OLD']);
  });
});
