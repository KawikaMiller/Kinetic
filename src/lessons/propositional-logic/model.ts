// Pure logic for propositional-logic: parse formulas over p, q, r, evaluate them,
// compare two of them row by row, and trace JavaScript's short-circuit evaluation.
import { truthRows, type TruthRow } from '../../core/truth';

export const VARIABLES = ['p', 'q', 'r'] as const;
export type Variable = (typeof VARIABLES)[number];
export type BinaryOp = 'and' | 'or' | 'imp' | 'iff';

export type Formula =
  | { kind: 'var'; id: number; name: Variable }
  | { kind: 'not'; id: number; x: Formula }
  | { kind: 'bin'; id: number; op: BinaryOp; l: Formula; r: Formula };

export const OP_SYMBOL: Record<BinaryOp | 'not', string> = { not: '¬', and: '∧', or: '∨', imp: '→', iff: '↔' };

type Token =
  | { t: 'var'; name: Variable; at: number }
  | { t: 'not' | BinaryOp | '(' | ')'; at: number };

/** ASCII spellings people type, longest first so "->" wins over "-". */
const SPELLINGS: [string, Token['t']][] = [
  ['<->', 'iff'], ['<=>', 'iff'], ['==', 'iff'], ['->', 'imp'], ['=>', 'imp'], ['&&', 'and'], ['||', 'or'],
  ['¬', 'not'], ['!', 'not'], ['~', 'not'], ['∧', 'and'], ['&', 'and'], ['∨', 'or'], ['|', 'or'], ['→', 'imp'], ['↔', 'iff'],
  ['(', '('], [')', ')'],
];

export type ParseResult = { ok: true; formula: Formula } | { ok: false; error: string };

function tokenize(src: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ((VARIABLES as readonly string[]).includes(c)) {
      out.push({ t: 'var', name: c as Variable, at: i });
      i++;
      continue;
    }
    const hit = SPELLINGS.find(([s]) => src.startsWith(s, i));
    if (!hit) return `"${c}" isn't a variable or an operator (use p, q, r and ¬ ∧ ∨ → ↔)`;
    out.push({ t: hit[1], at: i } as Token);
    i += hit[0].length;
  }
  return out;
}

/**
 * Parse with the usual precedence, tightest first: ¬, ∧, ∨, →, ↔.
 * → groups to the right (p → q → r is p → (q → r)); the others to the left.
 */
export function parseFormula(src: string): ParseResult {
  const tokens = tokenize(src);
  if (typeof tokens === 'string') return { ok: false, error: tokens };
  if (tokens.length === 0) return { ok: false, error: 'Empty formula' };
  let pos = 0;
  let nextId = 0;
  const peek = () => tokens[pos]?.t;
  const fail = (msg: string): never => {
    throw new Error(msg);
  };

  const atom = (): Formula => {
    const tok = tokens[pos];
    if (!tok) return fail('The formula ends too early');
    if (tok.t === 'var') {
      pos++;
      return { kind: 'var', id: nextId++, name: tok.name };
    }
    if (tok.t === '(') {
      pos++;
      const inner = iff();
      if (peek() !== ')') fail('A "(" is never closed');
      pos++;
      return inner;
    }
    return fail(`Expected a variable or "(" but found "${tok.t === ')' ? ')' : OP_SYMBOL[tok.t as BinaryOp | 'not']}"`);
  };
  const not = (): Formula => {
    if (peek() === 'not') {
      pos++;
      const id = nextId++;
      return { kind: 'not', id, x: not() };
    }
    return atom();
  };
  const leftAssoc = (op: BinaryOp, next: () => Formula) => (): Formula => {
    let l = next();
    while (peek() === op) {
      pos++;
      const id = nextId++;
      l = { kind: 'bin', id, op, l, r: next() };
    }
    return l;
  };
  const and = leftAssoc('and', not);
  const or = leftAssoc('or', and);
  const imp = (): Formula => {
    const l = or();
    if (peek() !== 'imp') return l;
    pos++;
    const id = nextId++;
    return { kind: 'bin', id, op: 'imp', l, r: imp() };
  };
  const iff = leftAssoc('iff', imp);

  try {
    const formula = iff();
    if (pos < tokens.length) fail(tokens[pos].t === ')' ? 'There\'s a ")" with no matching "("' : 'Two parts with no operator between them');
    return { ok: true, formula };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function evaluate(f: Formula, row: TruthRow): boolean {
  switch (f.kind) {
    case 'var':
      return row[f.name] ?? false;
    case 'not':
      return !evaluate(f.x, row);
    case 'bin': {
      const l = evaluate(f.l, row);
      const r = evaluate(f.r, row);
      return f.op === 'and' ? l && r : f.op === 'or' ? l || r : f.op === 'imp' ? !l || r : l === r;
    }
  }
}

/** Variables the formula mentions, in p, q, r order. */
export function variablesOf(...fs: Formula[]): Variable[] {
  const seen = new Set<Variable>();
  const walk = (f: Formula) => {
    if (f.kind === 'var') seen.add(f.name);
    else if (f.kind === 'not') walk(f.x);
    else {
      walk(f.l);
      walk(f.r);
    }
  };
  fs.forEach(walk);
  return VARIABLES.filter((v) => seen.has(v));
}

/** Rows (in truthRows order over `vars`) where the two formulas give different answers. */
export function mismatchRows(a: Formula, b: Formula, vars: readonly Variable[]): number[] {
  return truthRows(vars).flatMap((row, i) => (evaluate(a, row) !== evaluate(b, row) ? [i] : []));
}

// ── Printing ─────────────────────────────────────────────────────────

const LOGIC_PREC = { iff: 1, imp: 2, or: 3, and: 4, not: 5, var: 6 };
const precOf = (f: Formula) => (f.kind === 'bin' ? LOGIC_PREC[f.op] : LOGIC_PREC[f.kind]);

/** Canonical text with only the brackets the precedence needs. */
export function toText(f: Formula): string {
  if (f.kind === 'var') return f.name;
  if (f.kind === 'not') return `¬${precOf(f.x) < LOGIC_PREC.not ? `(${toText(f.x)})` : toText(f.x)}`;
  const p = LOGIC_PREC[f.op];
  // → groups right, so a → on its left needs brackets; the others group left, so the right side does.
  const lWrap = precOf(f.l) < p || (f.op === 'imp' && precOf(f.l) === p);
  const rWrap = precOf(f.r) < p || (f.op !== 'imp' && precOf(f.r) === p);
  const side = (x: Formula, wrap: boolean) => (wrap ? `(${toText(x)})` : toText(x));
  return `${side(f.l, lWrap)} ${OP_SYMBOL[f.op]} ${side(f.r, rWrap)}`;
}

/** A piece of the JavaScript rendering, tagged with the formula node that produced it. */
export interface JsPart {
  text: string;
  id: number;
}

// JavaScript binds === tighter than &&, and && tighter than ||.
const JS_PREC = { or: 3, and: 4, eq: 7, not: 9, atom: 10 };

/**
 * The formula as a JavaScript condition, in parts so each can be coloured.
 * p → q has no JS operator, so it's written the way JS evaluates it: !p || q.
 * p ↔ q is p === q.
 */
export function toJsParts(f: Formula, names: Partial<Record<Variable, string>> = {}): JsPart[] {
  const render = (x: Formula): { parts: JsPart[]; prec: number } => {
    const wrap = (inner: { parts: JsPart[]; prec: number }, min: number, id: number) =>
      inner.prec < min ? [{ text: '(', id }, ...inner.parts, { text: ')', id }] : inner.parts;
    if (x.kind === 'var') return { parts: [{ text: names[x.name] ?? x.name, id: x.id }], prec: JS_PREC.atom };
    if (x.kind === 'not') return { parts: [{ text: '!', id: x.id }, ...wrap(render(x.x), JS_PREC.not, x.id)], prec: JS_PREC.not };
    const l = render(x.l);
    const r = render(x.r);
    if (x.op === 'imp') {
      return { parts: [{ text: '!', id: x.id }, ...wrap(l, JS_PREC.not, x.id), { text: ' || ', id: x.id }, ...wrap(r, JS_PREC.or + 1, x.id)], prec: JS_PREC.or };
    }
    const prec = x.op === 'and' ? JS_PREC.and : x.op === 'or' ? JS_PREC.or : JS_PREC.eq;
    const op = x.op === 'and' ? ' && ' : x.op === 'or' ? ' || ' : ' === ';
    return { parts: [...wrap(l, prec, x.id), { text: op, id: x.id }, ...wrap(r, prec + 1, x.id)], prec };
  };
  return render(f).parts;
}

export const toJs = (f: Formula, names?: Partial<Record<Variable, string>>) =>
  toJsParts(f, names).map((p) => p.text).join('');

// ── Short-circuit trace ──────────────────────────────────────────────

export interface Trace {
  value: boolean;
  /** Formula nodes JavaScript never evaluates on this row (and everything inside them). */
  skipped: Set<number>;
}

/**
 * Evaluate the way JavaScript's && and || do: stop as soon as the answer is
 * known. `a && b` never looks at b when a is false; `a || b` never looks at b
 * when a is true; p → q (written !p || q) skips q when p is false.
 */
export function traceJs(f: Formula, row: TruthRow): Trace {
  const skipped = new Set<number>();
  const skip = (x: Formula) => {
    skipped.add(x.id);
    if (x.kind === 'not') skip(x.x);
    if (x.kind === 'bin') {
      skip(x.l);
      skip(x.r);
    }
  };
  const run = (x: Formula): boolean => {
    if (x.kind === 'var') return row[x.name] ?? false;
    if (x.kind === 'not') return !run(x.x);
    const l = run(x.l);
    // Does the left side already decide it? false && …, true || …, and !false || … all do.
    const decided = (x.op === 'and' && !l) || (x.op === 'or' && l) || (x.op === 'imp' && !l);
    if (decided) {
      skip(x.r);
      return x.op !== 'and';
    }
    const r = run(x.r);
    return x.op === 'and' ? l && r : x.op === 'or' ? l || r : x.op === 'imp' ? !l || r : l === r;
  };
  return { value: run(f), skipped };
}

// ── Presets ──────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  label: string;
  formulas: [string, string];
  /** What p, q, r stand for in the JavaScript pane. */
  names: Partial<Record<Variable, string>>;
  /** The row to open on, in truthRows order. */
  row: number;
}

export const PRESETS: readonly Preset[] = [
  { id: 'converse', label: 'p → q vs its converse', formulas: ['p → q', 'q → p'], names: { p: 'raining', q: 'streetIsWet' }, row: 1 },
  { id: 'contrapositive', label: 'p → q vs its contrapositive', formulas: ['p → q', '¬q → ¬p'], names: { p: 'raining', q: 'streetIsWet' }, row: 1 },
  { id: 'vacuous', label: 'Vacuous truth', formulas: ['p → q', ''], names: { p: 'isAdmin', q: 'canDeleteUsers' }, row: 1 },
  { id: 'refactor', label: 'Refactor: !(a && b)', formulas: ['¬(p ∧ q)', '¬p ∨ ¬q'], names: { p: 'a', q: 'b' }, row: 3 },
  { id: 'short-circuit', label: 'Short-circuit: user && user.name', formulas: ['p ∧ q', ''], names: { p: 'user', q: 'user.name' }, row: 0 },
];
