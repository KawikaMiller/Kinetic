import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import {
  CMP_OPS, DB, PRESETS, REL_NAMES, TEACHERS, bin, eq, evaluate, intermediateRows, postOrder, proj, pushedPlan, rel, relabel, ren, resultOf,
  sameRows, schemaOf, sel, unpushedPlan, type Cond, type Expr, type Mode, type Relation, type Value,
} from './model';
import { toSql } from './sql';

// ── Real SQLite (node:sqlite), loaded without pulling Node's types into the app build ──
interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(): Record<string, Value>[] };
}
const SQLITE = 'node:sqlite';
let db: Db;
beforeAll(async () => {
  const { DatabaseSync } = (await import(/* @vite-ignore */ SQLITE)) as { DatabaseSync: new (path: string) => Db };
  db = new DatabaseSync(':memory:');
  for (const name of REL_NAMES) {
    const r = DB[name];
    db.exec(`CREATE TABLE ${name} (${r.cols.map((c, i) => `${c} ${r.types[i] === 'int' ? 'INTEGER' : 'TEXT'}`).join(', ')})`);
    for (const row of r.rows) db.exec(`INSERT INTO ${name} VALUES (${row.map((v) => (typeof v === 'number' ? v : `'${v}'`)).join(', ')})`);
  }
});

const sqlite = (e: Expr, mode: Mode): Relation => {
  const s = schemaOf(e);
  if (!s.ok) throw new Error(s.error);
  const rows = db.prepare(toSql(e, mode).join('\n')).all();
  return { ...s.schema, rows: rows.map((r) => s.schema.cols.map((c) => r[c])) };
};

// ── An independent reference: rows as objects, written without the evaluator's index maths ──
type Obj = Record<string, Value>;
const key = (o: Obj) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
const distinct = (xs: Obj[]) => xs.filter((x, i) => xs.findIndex((y) => key(y) === key(x)) === i);
const holds = (c: Cond, o: Obj) => {
  const a = o[c.col];
  const b = c.rhs.kind === 'value' ? c.rhs.value : o[c.rhs.col];
  const lt = typeof a === typeof b ? a < b : typeof a === 'number';
  return { '=': a === b, '<>': a !== b, '<': lt, '>': a !== b && !lt }[c.op];
};
function reference(e: Expr, mode: Mode): Obj[] {
  const fix = (xs: Obj[]) => (mode === 'set' ? distinct(xs) : xs);
  switch (e.op) {
    case 'rel':
      return DB[e.name].rows.map((r) => Object.fromEntries(DB[e.name].cols.map((c, i) => [c, r[i]])));
    case 'select':
      return reference(e.input, mode).filter((o) => holds(e.cond, o));
    case 'project':
      return fix(reference(e.input, mode).map((o) => Object.fromEntries(e.cols.map((c) => [c, o[c]]))));
    case 'rename':
      return reference(e.input, mode).map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === e.from ? e.to : k, v])));
    case 'join':
    case 'product': {
      const out: Obj[] = [];
      for (const l of reference(e.left, mode))
        for (const r of reference(e.right, mode))
          if (Object.keys(r).every((k) => !(k in l) || l[k] === r[k])) out.push({ ...l, ...r });
      return out;
    }
    case 'union':
      return fix([...reference(e.left, mode), ...reference(e.right, mode)]);
    case 'diff': {
      const right = reference(e.right, mode).map(key);
      const out: Obj[] = [];
      for (const l of reference(e.left, mode)) {
        const at = right.indexOf(key(l));
        if (at < 0) out.push(l);
        else if (mode === 'bag') right.splice(at, 1);
      }
      return fix(out);
    }
  }
}
const asRelation = (objs: Obj[], cols: readonly string[]): Relation => ({ cols, types: [], rows: objs.map((o) => cols.map((c) => o[c])) });

function ok(e: Expr, mode: Mode): Relation {
  const r = resultOf(e, mode);
  if (!r.ok) throw new Error(r.error);
  return r.out;
}
const names = (r: Relation) => r.rows.map((row) => row[r.cols.indexOf('name')]).sort();

// ── Random schema-valid trees ──
function randomCond(cols: readonly string[], types: readonly string[], rnd: Rnd): Cond {
  const i = randInt(0, cols.length - 1, rnd);
  const same = cols.filter((_, j) => j !== i && types[j] === types[i]);
  if (same.length && rnd() < 0.25) return { col: cols[i], op: pick(CMP_OPS, rnd), rhs: { kind: 'col', col: pick(same, rnd) } };
  const values = REL_NAMES.flatMap((n) => DB[n].rows.map((r) => r[DB[n].cols.indexOf(cols[i])]).filter((v) => v !== undefined));
  const value: Value = values.length ? pick(values, rnd) : types[i] === 'int' ? randInt(0, 6, rnd) : 'Hopper';
  return { col: cols[i], op: pick(CMP_OPS, rnd), rhs: { kind: 'value', value } };
}
function randomTree(depth: number, rnd: Rnd): Expr {
  if (depth === 0 || rnd() < 0.2) return rel(pick(REL_NAMES, rnd));
  const kind = pick(['select', 'project', 'rename', 'join', 'product', 'union', 'diff'] as const, rnd);
  const a = randomTree(depth - 1, rnd);
  const sa = schemaOf(a);
  if (!sa.ok) return a;
  const { cols, types } = sa.schema;
  switch (kind) {
    case 'select':
      return sel(randomCond(cols, types, rnd), a);
    case 'project': {
      const keep = cols.filter(() => rnd() < 0.5);
      return proj(keep.length ? keep : [cols[0]], a);
    }
    case 'rename':
      return ren(pick(cols, rnd), `${pick(cols, rnd)}_${randInt(1, 3, rnd)}`, a);
    case 'union':
    case 'diff': {
      // Pair it with a projection of something that has these columns, so it's usually compatible.
      const b = randomTree(depth - 1, rnd);
      const sb = schemaOf(b);
      const bb = sb.ok && cols.every((c) => sb.schema.cols.includes(c)) ? proj(cols, b) : proj(cols, a);
      return bin(kind, a, rnd() < 0.5 ? bb : sel(randomCond(cols, types, rnd), a));
    }
    default:
      return bin(kind, a, randomTree(depth - 1, rnd));
  }
}

describe('presets', () => {
  it('teacher: Ada and Grace, Ada once as a set and twice as a bag', () => {
    const e = PRESETS.find((p) => p.id === 'teacher')!.expr;
    expect(names(ok(e, 'set'))).toEqual(['Ada', 'Grace']);
    expect(names(ok(e, 'bag'))).toEqual(['Ada', 'Ada', 'Grace']);
  });

  it('no course: only Barbara, by difference', () => {
    expect(names(ok(PRESETS.find((p) => p.id === 'nocourse')!.expr, 'set'))).toEqual(['Barbara']);
  });

  it('explosion: every student paired with every course', () => {
    const r = ok(PRESETS.find((p) => p.id === 'explosion')!.expr, 'set');
    expect(r.rows.length).toBe(DB.Students.rows.length * DB.Courses.rows.length);
  });

  for (const p of PRESETS)
    for (const mode of ['set', 'bag'] as const) {
      it(`${p.id} (${mode}) equals real SQLite running the generated SQL`, () => {
        const ours = ok(p.expr, mode);
        const hasBagDiff = mode === 'bag' && postOrder(p.expr).some((n) => n.op === 'diff');
        // SQLite has no EXCEPT ALL, so bag difference is checked against the reference instead.
        const truth = hasBagDiff ? asRelation(reference(p.expr, mode), ours.cols) : sqlite(p.expr, mode);
        expect(sameRows(ours, truth)).toBe(true);
      });
    }
});

describe('the evaluator against SQLite and an independent reference', () => {
  it('agrees on 1,500 random schema-valid trees in both modes', () => {
    const rnd = mulberry32(2026);
    let checked = 0;
    let viaSqlite = 0;
    for (let k = 0; k < 1500; k++) {
      const e = relabel(randomTree(3, rnd));
      if (!schemaOf(e).ok) continue;
      for (const mode of ['set', 'bag'] as const) {
        const ours = ok(e, mode);
        expect(sameRows(ours, asRelation(reference(e, mode), ours.cols)), `${mode}: ${toSql(e, mode).join(' ')}`).toBe(true);
        if (!(mode === 'bag' && postOrder(e).some((n) => n.op === 'diff'))) {
          expect(sameRows(ours, sqlite(e, mode)), `${mode}: ${toSql(e, mode).join(' ')}`).toBe(true);
          viaSqlite++;
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1500);
    expect(viaSqlite).toBeGreaterThan(1000);
  });

  it('set mode never holds a duplicate row; bag mode keeps SELECT duplicates', () => {
    const e = relabel(proj(['sid'], rel('Enrolments')));
    const set = ok(e, 'set');
    expect(new Set(set.rows.map((r) => r[0])).size).toBe(set.rows.length);
    expect(ok(e, 'bag').rows.length).toBe(DB.Enrolments.rows.length);
  });
});

describe('algebraic laws (property tests)', () => {
  const rnd = mulberry32(7);
  it('σ commutes with σ', () => {
    for (let k = 0; k < 300; k++) {
      const base = relabel(randomTree(2, rnd));
      const s = schemaOf(base);
      if (!s.ok) continue;
      const c1 = randomCond(s.schema.cols, s.schema.types, rnd);
      const c2 = randomCond(s.schema.cols, s.schema.types, rnd);
      for (const mode of ['set', 'bag'] as const)
        expect(sameRows(ok(relabel(sel(c1, sel(c2, base))), mode), ok(relabel(sel(c2, sel(c1, base))), mode))).toBe(true);
    }
  });

  it('π of π equals the outer π', () => {
    for (let k = 0; k < 300; k++) {
      const base = relabel(randomTree(2, rnd));
      const s = schemaOf(base);
      if (!s.ok) continue;
      const inner = s.schema.cols.filter(() => rnd() < 0.7);
      if (!inner.length) continue;
      const outer = inner.filter(() => rnd() < 0.6);
      if (!outer.length) continue;
      for (const mode of ['set', 'bag'] as const)
        expect(sameRows(ok(relabel(proj(outer, proj(inner, base))), mode), ok(relabel(proj(outer, base)), mode))).toBe(true);
    }
  });
});

describe('pushdown', () => {
  for (const t of TEACHERS)
    it(`σ below ⋈ gives the same rows with fewer intermediate rows (${t})`, () => {
      for (const mode of ['set', 'bag'] as const) {
        expect(sameRows(ok(unpushedPlan(t), mode), ok(pushedPlan(t), mode))).toBe(true);
        expect(sameRows(ok(unpushedPlan(t), mode), sqlite(unpushedPlan(t), mode))).toBe(true);
        expect(sameRows(ok(pushedPlan(t), mode), sqlite(pushedPlan(t), mode))).toBe(true);
        expect(intermediateRows(pushedPlan(t), mode)).toBeLessThan(intermediateRows(unpushedPlan(t), mode));
      }
    });

  it('counts intermediates by hand for Hopper: 7 + 7 + 3 against 2 + 3 + 3', () => {
    expect(intermediateRows(unpushedPlan('Hopper'), 'set')).toBe(17);
    expect(intermediateRows(pushedPlan('Hopper'), 'set')).toBe(8);
  });
});

describe('schema errors', () => {
  it('× refuses clashing names until one side is renamed', () => {
    const clash = relabel(bin('product', rel('Students'), rel('Enrolments')));
    const r = resultOf(clash, 'set');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sid/);
    const fixed = relabel(bin('product', rel('Students'), ren('sid', 'esid', rel('Enrolments'))));
    expect(ok(fixed, 'set').rows.length).toBe(DB.Students.rows.length * DB.Enrolments.rows.length);
  });

  it('∪ and − refuse inputs with different columns, and the parent reports the input error', () => {
    const e = relabel(proj(['name'], bin('union', rel('Students'), rel('Courses'))));
    const ev = evaluate(e, 'set');
    const u = postOrder(e).find((n) => n.op === 'union')!;
    expect(ev.get(u.id)).toMatchObject({ ok: false, own: true });
    expect(ev.get(e.id)).toMatchObject({ ok: false, own: false });
  });

  it('σ refuses a column its input lost to π', () => {
    const e = relabel(sel(eq('year', 2), proj(['name'], rel('Students'))));
    expect(resultOf(e, 'set').ok).toBe(false);
  });
});

describe('generated SQL', () => {
  it('folds the teacher preset into one SELECT DISTINCT with two natural joins', () => {
    expect(toSql(PRESETS[0].expr, 'set')).toEqual([
      'SELECT DISTINCT name',
      'FROM Students',
      '  NATURAL JOIN Enrolments',
      '  NATURAL JOIN Courses',
      "WHERE teacher = 'Hopper'",
    ]);
    expect(toSql(PRESETS[0].expr, 'bag')[0]).toBe('SELECT name');
  });

  it('uses EXCEPT for set difference and EXCEPT ALL for bags', () => {
    const e = PRESETS.find((p) => p.id === 'nocourse')!.expr;
    expect(toSql(e, 'set').map((l) => l.trim())).toContain('EXCEPT');
    expect(toSql(e, 'bag').map((l) => l.trim())).toContain('EXCEPT ALL');
  });

  it('keeps every row of a bag ∪ (UNION ALL) and none twice in a set ∪', () => {
    const e = relabel(bin('union', proj(['sid'], rel('Students')), proj(['sid'], rel('Enrolments'))));
    expect(ok(e, 'bag').rows.length).toBe(DB.Students.rows.length + DB.Enrolments.rows.length);
    expect(ok(e, 'set').rows.length).toBe(DB.Students.rows.length);
    expect(sameRows(ok(e, 'bag'), sqlite(e, 'bag'))).toBe(true);
  });
});
