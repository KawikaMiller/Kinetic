// SQL's NULL, which the algebra doesn't have: three-valued logic and the traps it sets.
// Each query below is evaluated here with SQL's rules (a comparison with NULL is UNKNOWN,
// WHERE and ON keep only TRUE), and the tests run the same SQL through real SQLite.
import { DB } from './model';

export type Cell = string | number | null;
/** SQL's three truth values. */
export type Tri = 'TRUE' | 'FALSE' | 'UNKNOWN';

export function cmpEq(a: Cell, b: Cell): Tri {
  if (a === null || b === null) return 'UNKNOWN';
  return a === b ? 'TRUE' : 'FALSE';
}
export const not = (t: Tri): Tri => (t === 'TRUE' ? 'FALSE' : t === 'FALSE' ? 'TRUE' : 'UNKNOWN');
export function and(a: Tri, b: Tri): Tri {
  if (a === 'FALSE' || b === 'FALSE') return 'FALSE';
  return a === 'TRUE' && b === 'TRUE' ? 'TRUE' : 'UNKNOWN';
}
export function or(a: Tri, b: Tri): Tri {
  if (a === 'TRUE' || b === 'TRUE') return 'TRUE';
  return a === 'FALSE' && b === 'FALSE' ? 'FALSE' : 'UNKNOWN';
}
export const isNull = (a: Cell): Tri => (a === null ? 'TRUE' : 'FALSE');

/** x IN (list): TRUE on a match; otherwise UNKNOWN if x or anything in the list is NULL. */
export function inList(x: Cell, list: readonly Cell[]): Tri {
  return list.reduce<Tri>((acc, v) => or(acc, cmpEq(x, v)), 'FALSE');
}

// ── This scene's data: the algebra tables plus the NULLs real data grows ──

/** A course nobody has been assigned to teach yet. */
export const UNTAUGHT: Cell[] = ['SEC', 'Security', null];
/** An enrolment left behind when its course was deleted (no foreign key stopped it). */
export const ORPHAN: Cell[] = [2, 'OLD'];
/** An enrolment whose student wasn't recorded. */
export const UNKNOWN_STUDENT: Cell[] = [null, 'TYP'];

export const nullCourses = (): Cell[][] => [...DB.Courses.rows.map((r) => [...r]), UNTAUGHT];
export const nullEnrolments = (withUnknown: boolean): Cell[][] => [
  ...DB.Enrolments.rows.map((r) => [...r]), ORPHAN, ...(withUnknown ? [UNKNOWN_STUDENT] : []),
];
export const students = (): Cell[][] => DB.Students.rows.map((r) => [...r]);

export type NullQueryId = 'eq-null' | 'not-equal' | 'not-in' | 'on-where' | 'full';
export type Variant = 'trap' | 'fix';

export interface Table {
  cols: string[];
  rows: Cell[][];
}

export interface NullRun {
  sql: string[];
  /** The rows WHERE (or ON) looked at, with the truth value it got for each (none for a plain join). */
  tested?: Table & { verdict: Tri[]; testLabel: string };
  result: Table;
  /** Result rows that came from the outer side with no match (their other side is all NULL). */
  padded: boolean[];
}

export const NULL_QUERIES: { id: NullQueryId; label: string; trap: string; fix: string }[] = [
  { id: 'eq-null', label: '= NULL', trap: 'teacher = NULL', fix: 'teacher IS NULL' },
  { id: 'not-equal', label: "<> 'Hopper'", trap: "<> 'Hopper'", fix: '… OR teacher IS NULL' },
  { id: 'not-in', label: 'NOT IN', trap: 'NOT IN (subquery)', fix: 'NOT EXISTS' },
  { id: 'on-where', label: 'outer join: ON vs WHERE', trap: 'filter in WHERE', fix: 'filter in ON' },
  { id: 'full', label: 'LEFT vs FULL JOIN', trap: 'LEFT JOIN', fix: 'FULL JOIN' },
];

const where = (rows: Cell[][], test: (r: Cell[]) => Tri) => {
  const verdict = rows.map(test);
  return { verdict, kept: rows.filter((_, i) => verdict[i] === 'TRUE') };
};

/** Runs one query variant. `unknownStudent` adds the enrolment with a NULL sid (it matters to NOT IN). */
export function runNullQuery(id: NullQueryId, v: Variant, unknownStudent: boolean): NullRun {
  const courses = nullCourses();
  const enrol = nullEnrolments(unknownStudent);
  switch (id) {
    case 'eq-null':
    case 'not-equal': {
      const test = id === 'eq-null'
        ? (r: Cell[]) => (v === 'trap' ? cmpEq(r[2], null) : isNull(r[2]))
        : (r: Cell[]) => (v === 'trap' ? not(cmpEq(r[2], 'Hopper')) : or(not(cmpEq(r[2], 'Hopper')), isNull(r[2])));
      const cond = id === 'eq-null'
        ? (v === 'trap' ? 'teacher = NULL' : 'teacher IS NULL')
        : (v === 'trap' ? "teacher <> 'Hopper'" : "teacher <> 'Hopper' OR teacher IS NULL");
      const { verdict, kept } = where(courses, test);
      return {
        sql: ['SELECT title, teacher', 'FROM Courses', `WHERE ${cond}`],
        tested: { cols: ['cid', 'title', 'teacher'], rows: courses, verdict, testLabel: cond },
        result: { cols: ['title', 'teacher'], rows: kept.map((r) => [r[1], r[2]]) },
        padded: kept.map(() => false),
      };
    }
    case 'not-in': {
      const sids = enrol.map((e) => e[0]);
      const test = (s: Cell[]) => (v === 'trap'
        ? not(inList(s[0], sids))
        // NOT EXISTS: TRUE when no enrolment row's sid = s.sid is TRUE (UNKNOWN isn't a match).
        : enrol.some((e) => cmpEq(e[0], s[0]) === 'TRUE') ? 'FALSE' : 'TRUE');
      const rows = students();
      const { verdict, kept } = where(rows, test);
      const sql = v === 'trap'
        ? ['SELECT name', 'FROM Students', 'WHERE sid NOT IN (SELECT sid FROM Enrolments)']
        : ['SELECT name', 'FROM Students s', 'WHERE NOT EXISTS (', '  SELECT 1 FROM Enrolments e WHERE e.sid = s.sid', ')'];
      return {
        sql,
        tested: { cols: ['sid', 'name', 'year'], rows, verdict, testLabel: v === 'trap' ? 'sid NOT IN (…)' : 'NOT EXISTS (…)' },
        result: { cols: ['name'], rows: kept.map((r) => [r[1]]) },
        padded: kept.map(() => false),
      };
    }
    case 'on-where': {
      const ADA = 1;
      if (v === 'fix') {
        // The sid test is part of the match: unmatched courses survive, padded with NULL.
        const out: Cell[][] = [];
        const padded: boolean[] = [];
        const verdict: Tri[] = [];
        const pairs: Cell[][] = [];
        for (const c of courses) {
          let matched = false;
          for (const e of enrol) {
            if (cmpEq(e[1], c[0]) !== 'TRUE') continue;
            // Only pairs whose cid matched are shown; the sid half of ON decides whether they join.
            const t = cmpEq(e[0], ADA);
            pairs.push([c[1], e[0], e[1]]);
            verdict.push(t);
            if (t === 'TRUE') {
              out.push([c[1], e[0]]);
              padded.push(false);
              matched = true;
            }
          }
          if (!matched) {
            out.push([c[1], null]);
            padded.push(true);
          }
        }
        return {
          sql: ['SELECT c.title, e.sid', 'FROM Courses c', '  LEFT JOIN Enrolments e', `    ON e.cid = c.cid AND e.sid = ${ADA}`],
          tested: { cols: ['title', 'e.sid', 'e.cid'], rows: pairs, verdict, testLabel: `… AND e.sid = ${ADA}` },
          result: { cols: ['title', 'sid'], rows: out },
          padded,
        };
      }
      const joined = leftJoin(courses, enrol);
      const { verdict, kept } = where(joined.rows, (r) => cmpEq(r[1], ADA));
      return {
        sql: ['SELECT c.title, e.sid', 'FROM Courses c', '  LEFT JOIN Enrolments e ON e.cid = c.cid', `WHERE e.sid = ${ADA}`],
        tested: { cols: ['title', 'e.sid', 'e.cid'], rows: joined.rows, verdict, testLabel: `e.sid = ${ADA}` },
        result: { cols: ['title', 'sid'], rows: kept.map((r) => [r[0], r[1]]) },
        padded: kept.map(() => false),
      };
    }
    case 'full': {
      const left = leftJoin(courses, enrol);
      const rows = left.rows.map((r) => [...r]);
      const padded = [...left.padded];
      if (v === 'fix') {
        for (const e of enrol) {
          if (!courses.some((c) => cmpEq(e[1], c[0]) === 'TRUE')) {
            rows.push([null, e[0], e[1]]);
            padded.push(true);
          }
        }
      }
      return {
        sql: ['SELECT c.title, e.sid, e.cid', 'FROM Courses c', `  ${v === 'trap' ? 'LEFT' : 'FULL'} JOIN Enrolments e ON e.cid = c.cid`],
        result: { cols: ['title', 'sid', 'cid'], rows },
        padded,
      };
    }
  }
}

/** Courses LEFT JOIN Enrolments ON e.cid = c.cid, as (title, sid, cid) rows. */
function leftJoin(courses: Cell[][], enrol: Cell[][]): { rows: Cell[][]; padded: boolean[] } {
  const rows: Cell[][] = [];
  const padded: boolean[] = [];
  for (const c of courses) {
    const hits = enrol.filter((e) => cmpEq(e[1], c[0]) === 'TRUE');
    if (hits.length === 0) {
      rows.push([c[1], null, null]);
      padded.push(true);
    }
    for (const e of hits) {
      rows.push([c[1], e[0], e[1]]);
      padded.push(false);
    }
  }
  return { rows, padded };
}
