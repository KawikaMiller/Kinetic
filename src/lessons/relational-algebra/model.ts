// The relational algebra the lesson evaluates: three small relations, an expression tree
// over σ π ρ ⋈ × ∪ −, an evaluator that keeps enough detail to animate every operator,
// and a generator for the equivalent SQL (checked against real SQLite in the tests).

export type Value = string | number;
export type Row = readonly Value[];
export type ColType = 'int' | 'text';

export interface Relation {
  cols: readonly string[];
  types: readonly ColType[];
  rows: readonly Row[];
}

/** set = the algebra (no duplicates ever); bag = SQL's default (SELECT keeps duplicates). */
export type Mode = 'set' | 'bag';

export type RelName = 'Students' | 'Courses' | 'Enrolments';

export const DB: Record<RelName, Relation> = {
  Students: {
    cols: ['sid', 'name', 'year'],
    types: ['int', 'text', 'int'],
    rows: [
      [1, 'Ada', 2],
      [2, 'Linus', 1],
      [3, 'Grace', 3],
      [4, 'Alan', 2],
      [5, 'Barbara', 1],
    ],
  },
  Courses: {
    cols: ['cid', 'title', 'teacher'],
    types: ['text', 'text', 'text'],
    rows: [
      ['DB', 'Databases', 'Hopper'],
      ['ALG', 'Algorithms', 'Knuth'],
      ['CMP', 'Compilers', 'Hopper'],
      ['TYP', 'Types', 'Liskov'],
    ],
  },
  Enrolments: {
    cols: ['sid', 'cid'],
    types: ['int', 'text'],
    rows: [
      [1, 'DB'],
      [1, 'CMP'],
      [2, 'ALG'],
      [3, 'DB'],
      [3, 'ALG'],
      [4, 'TYP'],
      [1, 'ALG'],
    ],
  },
};

export const REL_NAMES: readonly RelName[] = ['Students', 'Courses', 'Enrolments'];

export type CmpOp = '=' | '<>' | '<' | '>';
export const CMP_OPS: readonly CmpOp[] = ['=', '<>', '<', '>'];

export type Rhs = { kind: 'value'; value: Value } | { kind: 'col'; col: string };

export interface Cond {
  col: string;
  op: CmpOp;
  rhs: Rhs;
}

export type BinaryOp = 'join' | 'product' | 'union' | 'diff';

export type Expr =
  | { id: string; op: 'rel'; name: RelName }
  | { id: string; op: 'select'; cond: Cond; input: Expr }
  | { id: string; op: 'project'; cols: readonly string[]; input: Expr }
  | { id: string; op: 'rename'; from: string; to: string; input: Expr }
  | { id: string; op: BinaryOp; left: Expr; right: Expr };

export type OpName = Expr['op'];

export const GLYPH: Record<OpName, string> = {
  rel: '',
  select: 'σ',
  project: 'π',
  rename: 'ρ',
  join: '⋈',
  product: '×',
  union: '∪',
  diff: '−',
};

export const OP_NAME: Record<OpName, string> = {
  rel: 'relation',
  select: 'select',
  project: 'project',
  rename: 'rename',
  join: 'natural join',
  product: 'product',
  union: 'union',
  diff: 'difference',
};

export function children(e: Expr): Expr[] {
  switch (e.op) {
    case 'rel':
      return [];
    case 'select':
    case 'project':
    case 'rename':
      return [e.input];
    default:
      return [e.left, e.right];
  }
}

/** Every node, children before parents: the order the evaluator (and the animation) visits them. */
export function postOrder(e: Expr): Expr[] {
  return [...children(e).flatMap(postOrder), e];
}

export function findNode(e: Expr, id: string): Expr | null {
  if (e.id === id) return e;
  for (const c of children(e)) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

/** Replace the node `id` with `next` (pure: returns a new tree). */
export function replaceNode(e: Expr, id: string, next: Expr): Expr {
  if (e.id === id) return next;
  switch (e.op) {
    case 'rel':
      return e;
    case 'select':
    case 'project':
    case 'rename':
      return { ...e, input: replaceNode(e.input, id, next) };
    default:
      return { ...e, left: replaceNode(e.left, id, next), right: replaceNode(e.right, id, next) };
  }
}

// ── Values and comparison (SQLite's rules for the two types used here) ─────

/** SQLite orders numbers before text and compares text byte-wise; every value here is ASCII. */
export function compareValues(a: Value, b: Value): number {
  const ta = typeof a === 'number';
  const tb = typeof b === 'number';
  if (ta !== tb) return ta ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function testCond(cond: Cond, row: Row, cols: readonly string[]): boolean {
  const a = row[cols.indexOf(cond.col)];
  const b = cond.rhs.kind === 'value' ? cond.rhs.value : row[cols.indexOf(cond.rhs.col)];
  const c = compareValues(a, b);
  switch (cond.op) {
    case '=':
      return c === 0;
    case '<>':
      return c !== 0;
    case '<':
      return c < 0;
    case '>':
      return c > 0;
  }
}

export const rowKey = (r: Row) => JSON.stringify(r);

export function formatValue(v: Value): string {
  return typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;
}

export function condText(c: Cond): string {
  const rhs = c.rhs.kind === 'value' ? formatValue(c.rhs.value) : c.rhs.col;
  return `${c.col} ${c.op} ${rhs}`;
}

// ── Schemas ────────────────────────────────────────────────────────────

export interface Schema {
  cols: readonly string[];
  types: readonly ColType[];
}

export type SchemaResult = { ok: true; schema: Schema } | { ok: false; error: string; at: string };

/** The columns an expression produces, or the first schema error (innermost first). */
export function schemaOf(e: Expr): SchemaResult {
  if (e.op === 'rel') return { ok: true, schema: DB[e.name] };
  const kids = children(e).map(schemaOf);
  const failed = kids.find((k) => !k.ok);
  if (failed) return failed;
  const [a, b] = kids.map((k) => (k as { ok: true; schema: Schema }).schema);
  const fail = (error: string): SchemaResult => ({ ok: false, error, at: e.id });
  switch (e.op) {
    case 'select': {
      const i = a.cols.indexOf(e.cond.col);
      if (i < 0) return fail(`σ tests ${e.cond.col}, but its input has no such column`);
      if (e.cond.rhs.kind === 'col') {
        const j = a.cols.indexOf(e.cond.rhs.col);
        if (j < 0) return fail(`σ tests ${e.cond.rhs.col}, but its input has no such column`);
        if (a.types[i] !== a.types[j]) return fail(`σ compares ${e.cond.col} with ${e.cond.rhs.col}, which hold different kinds of value`);
      } else if ((typeof e.cond.rhs.value === 'number') !== (a.types[i] === 'int')) {
        return fail(`σ compares ${e.cond.col} with a value of a different kind`);
      }
      return { ok: true, schema: a };
    }
    case 'project': {
      if (e.cols.length === 0) return fail('π needs at least one column');
      const missing = e.cols.find((c) => !a.cols.includes(c));
      if (missing) return fail(`π keeps ${missing}, but its input has no such column`);
      return { ok: true, schema: { cols: e.cols, types: e.cols.map((c) => a.types[a.cols.indexOf(c)]) } };
    }
    case 'rename': {
      if (!a.cols.includes(e.from)) return fail(`ρ renames ${e.from}, but its input has no such column`);
      if (a.cols.includes(e.to)) return fail(`ρ can't rename ${e.from} to ${e.to}: that name is taken`);
      return { ok: true, schema: { cols: a.cols.map((c) => (c === e.from ? e.to : c)), types: a.types } };
    }
    case 'join': {
      const common = a.cols.filter((c) => b.cols.includes(c));
      for (const c of common) {
        if (a.types[a.cols.indexOf(c)] !== b.types[b.cols.indexOf(c)]) return fail(`⋈ matches on ${c}, which holds different kinds of value on each side`);
      }
      const extra = b.cols.map((c, i) => [c, b.types[i]] as const).filter(([c]) => !a.cols.includes(c));
      return { ok: true, schema: { cols: [...a.cols, ...extra.map(([c]) => c)], types: [...a.types, ...extra.map(([, t]) => t)] } };
    }
    case 'product': {
      const clash = a.cols.find((c) => b.cols.includes(c));
      if (clash) return fail(`× needs different column names, but both sides have ${clash}: rename one with ρ first`);
      return { ok: true, schema: { cols: [...a.cols, ...b.cols], types: [...a.types, ...b.types] } };
    }
    case 'union':
    case 'diff': {
      const sym = e.op === 'union' ? '∪' : '−';
      const same = a.cols.length === b.cols.length && a.cols.every((c) => b.cols.includes(c));
      if (!same) return fail(`${sym} needs both sides to have the same columns: (${a.cols.join(', ')}) vs (${b.cols.join(', ')})`);
      const typesMatch = a.cols.every((c, i) => a.types[i] === b.types[b.cols.indexOf(c)]);
      if (!typesMatch) return fail(`${sym} needs matching column kinds on both sides`);
      return { ok: true, schema: a };
    }
  }
}

// ── Evaluation, with per-operator detail for the animation ─────────────────

/** What one operator did, so the stage can show rows passing, dropping and merging. */
export type Detail =
  | { op: 'rel' }
  | { op: 'select'; kept: boolean[] }
  /** projected: every input row cut down to the kept columns; dupOf[i] = the earlier identical row, or -1. */
  | { op: 'project'; projected: Row[]; dupOf: number[] }
  | { op: 'rename' }
  /** pairs: [left row, right row] for every output row; unmatched rows of each side. */
  | { op: 'join' | 'product'; pairs: [number, number][]; leftUnmatched: number[]; rightUnmatched: number[] }
  /** union: stacked = left rows then right rows; dupOf as for project (set mode only). */
  | { op: 'union'; stacked: Row[]; fromLeft: number; dupOf: number[] }
  /** removed[i]: left row i is cancelled by a row on the right. */
  | { op: 'diff'; removed: boolean[] };

export type NodeResult =
  | { ok: true; out: Relation; detail: Detail }
  | { ok: false; error: string; own: boolean };

export type Evaluation = Map<string, NodeResult>;

/** Evaluates every node of the tree; a node whose input failed fails too (own: false). */
export function evaluate(e: Expr, mode: Mode): Evaluation {
  const out: Evaluation = new Map();
  visit(e, mode, out);
  return out;
}

export function resultOf(e: Expr, mode: Mode): NodeResult {
  return evaluate(e, mode).get(e.id)!;
}

function visit(e: Expr, mode: Mode, acc: Evaluation): NodeResult {
  const kids = children(e).map((c) => visit(c, mode, acc));
  let r: NodeResult;
  if (kids.some((k) => !k.ok)) {
    r = { ok: false, error: 'its input has an error', own: false };
  } else {
    const s = schemaOf(e);
    if (!s.ok) r = { ok: false, error: s.error, own: true };
    else r = apply(e, s.schema, kids.map((k) => (k as { ok: true; out: Relation }).out), mode);
  }
  acc.set(e.id, r);
  return r;
}

function dedupe(rows: readonly Row[]): { dupOf: number[]; unique: Row[] } {
  const first = new Map<string, number>();
  const dupOf = rows.map((r, i) => {
    const k = rowKey(r);
    const seen = first.get(k);
    if (seen === undefined) {
      first.set(k, i);
      return -1;
    }
    return seen;
  });
  return { dupOf, unique: rows.filter((_, i) => dupOf[i] === -1) };
}

function apply(e: Expr, schema: Schema, ins: Relation[], mode: Mode): NodeResult {
  const rel = (rows: readonly Row[]): Relation => ({ cols: schema.cols, types: schema.types, rows });
  const [a, b] = ins;
  switch (e.op) {
    case 'rel':
      return { ok: true, out: DB[e.name], detail: { op: 'rel' } };
    case 'select': {
      const kept = a.rows.map((r) => testCond(e.cond, r, a.cols));
      return { ok: true, out: rel(a.rows.filter((_, i) => kept[i])), detail: { op: 'select', kept } };
    }
    case 'project': {
      const idx = e.cols.map((c) => a.cols.indexOf(c));
      const projected = a.rows.map((r) => idx.map((i) => r[i]));
      const { dupOf, unique } = dedupe(projected);
      const shownDup = mode === 'set' ? dupOf : projected.map(() => -1);
      return { ok: true, out: rel(mode === 'set' ? unique : projected), detail: { op: 'project', projected, dupOf: shownDup } };
    }
    case 'rename':
      return { ok: true, out: rel(a.rows), detail: { op: 'rename' } };
    case 'join':
    case 'product': {
      const common = e.op === 'join' ? a.cols.filter((c) => b.cols.includes(c)) : [];
      const li = common.map((c) => a.cols.indexOf(c));
      const ri = common.map((c) => b.cols.indexOf(c));
      const keepRight = b.cols.map((c, i) => (common.includes(c) ? -1 : i)).filter((i) => i >= 0);
      const pairs: [number, number][] = [];
      const rows: Row[] = [];
      a.rows.forEach((lr, i) => {
        b.rows.forEach((rr, j) => {
          if (li.every((x, k) => compareValues(lr[x], rr[ri[k]]) === 0)) {
            pairs.push([i, j]);
            rows.push([...lr, ...keepRight.map((x) => rr[x])]);
          }
        });
      });
      const leftUnmatched = a.rows.map((_, i) => i).filter((i) => !pairs.some(([l]) => l === i));
      const rightUnmatched = b.rows.map((_, j) => j).filter((j) => !pairs.some(([, r]) => r === j));
      return { ok: true, out: rel(rows), detail: { op: e.op, pairs, leftUnmatched, rightUnmatched } };
    }
    case 'union': {
      const order = a.cols.map((c) => b.cols.indexOf(c));
      const stacked = [...a.rows, ...b.rows.map((r) => order.map((i) => r[i]))];
      const { dupOf, unique } = dedupe(stacked);
      const shownDup = mode === 'set' ? dupOf : stacked.map(() => -1);
      return { ok: true, out: rel(mode === 'set' ? unique : stacked), detail: { op: 'union', stacked, fromLeft: a.rows.length, dupOf: shownDup } };
    }
    case 'diff': {
      const order = a.cols.map((c) => b.cols.indexOf(c));
      const right = new Map<string, number>();
      for (const r of b.rows) {
        const k = rowKey(order.map((i) => r[i]));
        right.set(k, (right.get(k) ?? 0) + 1);
      }
      // set: a row goes if the right side has it at all. bag (EXCEPT ALL): each right copy cancels one left copy.
      const removed = a.rows.map((r) => {
        const k = rowKey(r);
        const n = right.get(k) ?? 0;
        if (n === 0) return false;
        if (mode === 'bag') right.set(k, n - 1);
        return true;
      });
      const kept = a.rows.filter((_, i) => !removed[i]);
      return { ok: true, out: rel(mode === 'set' ? dedupe(kept).unique : kept), detail: { op: 'diff', removed } };
    }
  }
}

// ── Building trees ─────────────────────────────────────────────────────

/** Placeholder id: `relabel` gives the finished tree its real ids. */
const id = () => '';
export const rel = (name: RelName): Expr => ({ id: id(), op: 'rel', name });
export const sel = (cond: Cond, input: Expr): Expr => ({ id: id(), op: 'select', cond, input });
export const proj = (cols: readonly string[], input: Expr): Expr => ({ id: id(), op: 'project', cols, input });
export const ren = (from: string, to: string, input: Expr): Expr => ({ id: id(), op: 'rename', from, to, input });
export const bin = (op: BinaryOp, left: Expr, right: Expr): Expr => ({ id: id(), op, left, right });
export const eq = (col: string, value: Value): Cond => ({ col, op: '=', rhs: { kind: 'value', value } });

/** Gives every node a stable id in post-order, so presets and edits never collide. */
export function relabel(e: Expr, prefix = 'n'): Expr {
  let k = 0;
  const walk = (x: Expr): Expr => {
    switch (x.op) {
      case 'rel':
        return { ...x, id: `${prefix}${k++}` };
      case 'select':
      case 'project':
      case 'rename': {
        const input = walk(x.input);
        return { ...x, input, id: `${prefix}${k++}` };
      }
      default: {
        const left = walk(x.left);
        const right = walk(x.right);
        return { ...x, left, right, id: `${prefix}${k++}` };
      }
    }
  };
  return walk(e);
}

export type PresetId = 'teacher' | 'nocourse' | 'explosion';

export const TEACHER = 'Hopper';

export const PRESETS: { id: PresetId; label: string; expr: Expr }[] = [
  {
    id: 'teacher',
    label: `students taught by ${TEACHER}`,
    expr: relabel(proj(['name'], sel(eq('teacher', TEACHER), bin('join', bin('join', rel('Students'), rel('Enrolments')), rel('Courses'))))),
  },
  {
    id: 'nocourse',
    label: 'students in no course',
    expr: relabel(proj(['name'], bin('join', rel('Students'), bin('diff', proj(['sid'], rel('Students')), proj(['sid'], rel('Enrolments')))))),
  },
  {
    id: 'explosion',
    label: 'cross product explosion',
    expr: relabel(bin('product', rel('Students'), rel('Courses'))),
  },
];

// ── Pushdown: the same question, two plans ─────────────────────────────

export const TEACHERS = [...new Set(DB.Courses.rows.map((r) => r[2] as string))];

export function unpushedPlan(teacher: string): Expr {
  return relabel(proj(['name'], sel(eq('teacher', teacher), bin('join', bin('join', rel('Students'), rel('Enrolments')), rel('Courses')))), 'u');
}

export function pushedPlan(teacher: string): Expr {
  return relabel(proj(['name'], bin('join', rel('Students'), bin('join', rel('Enrolments'), sel(eq('teacher', teacher), rel('Courses'))))), 'p');
}

/** Rows produced by every operator below the root (base relations are read, not produced). */
export function intermediateRows(e: Expr, mode: Mode): number {
  const ev = evaluate(e, mode);
  return postOrder(e)
    .filter((n) => n.op !== 'rel' && n.id !== e.id)
    .reduce((sum, n) => {
      const r = ev.get(n.id)!;
      return sum + (r.ok ? r.out.rows.length : 0);
    }, 0);
}

/** Two relations hold the same rows, as multisets, regardless of column order. */
export function sameRows(a: Relation, b: Relation): boolean {
  if (a.cols.length !== b.cols.length || !a.cols.every((c) => b.cols.includes(c))) return false;
  const order = a.cols.map((c) => b.cols.indexOf(c));
  const count = (rows: readonly Row[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(rowKey(r), (m.get(rowKey(r)) ?? 0) + 1);
    return m;
  };
  const ca = count(a.rows);
  const cb = count(b.rows.map((r) => order.map((i) => r[i])));
  return ca.size === cb.size && [...ca].every(([k, n]) => cb.get(k) === n);
}
