/**
 * Hindley-Milner-style inference for a tiny ML-like slice of the batch language
 * (each T2-B5 lesson keeps its own copy of these rules):
 *
 *   program := "fn" name param* "=" expr  |  expr
 *   expr    := "if" expr "then" expr "else" expr  |  sum
 *   sum     := app (("+" | "-" | "*") app)*          integers only
 *   app     := atom atom*                             application by juxtaposition
 *   atom    := integer | true | false | "string" | name | "(" expr ")"
 *
 * There is no let and no recursion (the function's own name isn't in scope in its body).
 * Learner-typed programs go through this hand-written parser only, never eval.
 */

// ── Syntax ───────────────────────────────────────────────────────────

export type Expr =
  | { id: string; kind: 'int'; value: string }
  | { id: string; kind: 'bool'; value: boolean }
  | { id: string; kind: 'str'; value: string }
  | { id: string; kind: 'var'; name: string }
  | { id: string; kind: 'app'; fn: Expr; arg: Expr }
  | { id: string; kind: 'if'; cond: Expr; then: Expr; else: Expr }
  | { id: string; kind: 'op'; op: string; left: Expr; right: Expr };

export interface Program {
  /** Null for a bare expression. */
  name: string | null;
  params: string[];
  body: Expr;
}

const KEYWORDS = ['fn', 'if', 'then', 'else', 'true', 'false'];
export const MAX_CHARS = 60;
const MAX_NODES = 25;

type Tok = { t: 'num' | 'name' | 'str' | 'sym' | 'kw' | 'end'; text: string; col: number };

/** An Expr before its id is stamped on (Omit over each member of the union). */
type Bare = Expr extends infer E ? (E extends Expr ? Omit<E, 'id'> : never) : never;

export type ParseResult = { ok: true; program: Program } | { ok: false; error: string };

function lex(src: string): Tok[] | string {
  const out: Tok[] = [];
  const chars = Array.from(src);
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    const col = i + 1;
    if (/\s/.test(c)) i++;
    else if (/[0-9]/.test(c)) {
      let j = i;
      while (/[0-9]/.test(chars[j] ?? '')) j++;
      if (j - i > 9) return `Keep numbers to 9 digits (column ${col}).`;
      out.push({ t: 'num', text: chars.slice(i, j).join(''), col });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (/[A-Za-z0-9_]/.test(chars[j] ?? '')) j++;
      const text = chars.slice(i, j).join('');
      out.push({ t: KEYWORDS.includes(text) ? 'kw' : 'name', text, col });
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < chars.length && chars[j] !== '"') j++;
      if (j >= chars.length) return `The string at column ${col} is never closed.`;
      out.push({ t: 'str', text: chars.slice(i + 1, j).join(''), col });
      i = j + 1;
    } else if ('()=+-*'.includes(c)) {
      out.push({ t: 'sym', text: c, col });
      i++;
    } else return `Unexpected character ${JSON.stringify(c)} at column ${col}.`;
  }
  out.push({ t: 'end', text: 'end of input', col: chars.length + 1 });
  return out;
}

export function parseProgram(src: string): ParseResult {
  if (Array.from(src).length > MAX_CHARS) return { ok: false, error: `Keep it to ${MAX_CHARS} characters.` };
  if (!src.trim()) return { ok: false, error: 'Type a function like fn twice f x = f (f x), or an expression.' };
  const lexed = lex(src);
  if (typeof lexed === 'string') return { ok: false, error: lexed };
  const toks: Tok[] = lexed;
  let pos = 0;
  let ids = 0;
  const peek = () => toks[pos];
  const is = (text: string) => peek().text === text && (peek().t === 'sym' || peek().t === 'kw');
  const fail = (what: string): never => {
    throw new SyntaxError(`Expected ${what} but found ${peek().t === 'end' ? 'end of input' : `"${peek().text}"`} at column ${peek().col}.`);
  };
  const expect = (text: string) => (is(text) ? toks[pos++] : fail(`"${text}"`));
  const node = (e: Bare): Expr => ({ ...e, id: `e${ids++}` }) as Expr;

  const startsAtom = () => ['num', 'name', 'str'].includes(peek().t) || is('(') || is('true') || is('false');
  function atom(): Expr {
    const t = peek();
    if (t.t === 'num') return pos++, node({ kind: 'int', value: t.text });
    if (t.t === 'str') return pos++, node({ kind: 'str', value: t.text });
    if (t.t === 'name') return pos++, node({ kind: 'var', name: t.text });
    if (is('true') || is('false')) return pos++, node({ kind: 'bool', value: t.text === 'true' });
    if (is('(')) {
      pos++;
      const e = expr();
      expect(')');
      return e;
    }
    return fail('a value, a name or "("');
  }
  function app(): Expr {
    let f = atom();
    while (startsAtom()) f = node({ kind: 'app', fn: f, arg: atom() });
    return f;
  }
  function sum(): Expr {
    let left = app();
    while (is('+') || is('-') || is('*')) {
      const op = toks[pos++].text;
      left = node({ kind: 'op', op, left, right: app() });
    }
    return left;
  }
  function expr(): Expr {
    if (is('if')) {
      pos++;
      const cond = expr();
      expect('then');
      const then = expr();
      expect('else');
      return node({ kind: 'if', cond, then, else: expr() });
    }
    return sum();
  }

  try {
    let program: Program;
    if (is('fn')) {
      pos++;
      if (peek().t !== 'name') fail('a function name');
      const name = toks[pos++].text;
      const params: string[] = [];
      while (peek().t === 'name') {
        const p = toks[pos++].text;
        if (params.includes(p)) throw new SyntaxError(`The parameter ${p} appears twice.`);
        params.push(p);
      }
      expect('=');
      program = { name, params, body: expr() };
    } else program = { name: null, params: [], body: expr() };
    if (peek().t !== 'end') fail('the end of the program');
    if (ids > MAX_NODES) return { ok: false, error: `Keep it to ${MAX_NODES} tree nodes; this one has ${ids}.` };
    const unbound = freeNames(program.body).find((n) => !program.params.includes(n));
    if (unbound) return { ok: false, error: `${unbound} isn't a parameter, and there are no other names in scope here.` };
    return { ok: true, program };
  } catch (e) {
    if (e instanceof SyntaxError) return { ok: false, error: e.message };
    throw e;
  }
}

export const children = (e: Expr): Expr[] =>
  e.kind === 'app' ? [e.fn, e.arg] : e.kind === 'if' ? [e.cond, e.then, e.else] : e.kind === 'op' ? [e.left, e.right] : [];

function freeNames(e: Expr): string[] {
  return e.kind === 'var' ? [e.name] : children(e).flatMap(freeNames);
}

// ── Types ────────────────────────────────────────────────────────────

export type Type = { tag: 'var'; name: string } | { tag: 'con'; name: 'int' | 'bool' | 'string' } | { tag: 'fn'; from: Type; to: Type };

export const tvar = (name: string): Type => ({ tag: 'var', name });
const con = (name: 'int' | 'bool' | 'string'): Type => ({ tag: 'con', name });
const fn = (from: Type, to: Type): Type => ({ tag: 'fn', from, to });

export function show(t: Type): string {
  if (t.tag !== 'fn') return t.name;
  const left = t.from.tag === 'fn' ? `(${show(t.from)})` : show(t.from);
  return `${left} → ${show(t.to)}`;
}

export const varsOf = (t: Type): string[] => (t.tag === 'var' ? [t.name] : t.tag === 'fn' ? [...varsOf(t.from), ...varsOf(t.to)] : []);
export const sameType = (a: Type, b: Type): boolean => show(a) === show(b);

export type Subst = Map<string, Type>;

export function apply(s: Subst, t: Type): Type {
  if (t.tag === 'var') {
    const b = s.get(t.name);
    return b ? apply(s, b) : t;
  }
  return t.tag === 'fn' ? fn(apply(s, t.from), apply(s, t.to)) : t;
}

/** Rename type variables a, b, c… in order of first appearance: types are equal up to this. */
export function canonical(t: Type): string {
  const names = new Map<string, string>();
  for (const v of varsOf(t)) if (!names.has(v)) names.set(v, String.fromCharCode(97 + names.size));
  const ren = (x: Type): Type => (x.tag === 'var' ? tvar(names.get(x.name)!) : x.tag === 'fn' ? fn(ren(x.from), ren(x.to)) : x);
  return show(ren(t));
}

// ── Constraints ──────────────────────────────────────────────────────

export interface Constraint {
  left: Type;
  right: Type;
  /** The AST node the constraint comes from. */
  origin: string;
  why: string;
}

const GREEK = 'αβγδεζηθικλμνξοπρστυφχψω';

export interface Collected {
  /** Each node's type before solving: a type variable or a known type. */
  typeOf: Map<string, Type>;
  /** Each parameter's type variable. */
  params: Map<string, Type>;
  constraints: Constraint[];
  root: Type;
}

export function collect(p: Program): Collected {
  let n = 0;
  const fresh = () => tvar(GREEK[n++ % GREEK.length] + (n > GREEK.length ? String(Math.floor((n - 1) / GREEK.length)) : ''));
  const params = new Map(p.params.map((x) => [x, fresh()]));
  const typeOf = new Map<string, Type>();
  const constraints: Constraint[] = [];
  const walk = (e: Expr): Type => {
    let t: Type;
    switch (e.kind) {
      case 'int': t = con('int'); break;
      case 'bool': t = con('bool'); break;
      case 'str': t = con('string'); break;
      case 'var': t = params.get(e.name)!; break;
      case 'app': {
        const f = walk(e.fn);
        const a = walk(e.arg);
        t = fresh();
        constraints.push({ left: f, right: fn(a, t), origin: e.id, why: 'applying a function: its type must be argument → result' });
        break;
      }
      case 'if': {
        const c = walk(e.cond);
        const th = walk(e.then);
        const el = walk(e.else);
        t = fresh();
        constraints.push({ left: c, right: con('bool'), origin: e.cond.id, why: 'an if condition must be a bool' });
        constraints.push({ left: th, right: t, origin: e.then.id, why: 'the then branch is the if’s result' });
        constraints.push({ left: el, right: t, origin: e.else.id, why: 'the else branch is the if’s result too' });
        break;
      }
      case 'op': {
        const l = walk(e.left);
        const r = walk(e.right);
        t = con('int');
        constraints.push({ left: l, right: con('int'), origin: e.left.id, why: `${e.op} works on ints` });
        constraints.push({ left: r, right: con('int'), origin: e.right.id, why: `${e.op} works on ints` });
        break;
      }
    }
    typeOf.set(e.id, t);
    return t;
  };
  const body = walk(p.body);
  const root = p.params.reduceRight<Type>((acc, x) => fn(params.get(x)!, acc), body);
  return { typeOf, params, constraints, root };
}

// ── Unification, one step at a time ──────────────────────────────────

export type StepAction = 'same' | 'bind' | 'split' | 'occurs' | 'mismatch';

export interface UnifyStep {
  /** Index into the collected constraints this step works on (split parts keep their parent's). */
  constraint: number;
  left: Type;
  right: Type;
  action: StepAction;
  /** For bind: the variable and what it becomes. */
  bound?: { name: string; to: Type };
  /** The substitution after this step. */
  subst: Subst;
}

export type Solution =
  | { ok: true; steps: UnifyStep[]; subst: Subst; type: Type }
  | { ok: false; steps: UnifyStep[]; subst: Subst; kind: 'occurs' | 'mismatch'; message: string; conflict: number[] };

export function solve(c: Collected): Solution {
  const subst: Subst = new Map();
  /** Which constraint created each binding, for explaining a conflict. */
  const source = new Map<string, number>();
  const steps: UnifyStep[] = [];
  const queue = c.constraints.map((k, i) => ({ left: k.left, right: k.right, at: i }));
  const snap = () => new Map(subst);
  while (queue.length) {
    const { left, right, at } = queue.shift()!;
    const a = apply(subst, left);
    const b = apply(subst, right);
    if (sameType(a, b)) {
      steps.push({ constraint: at, left: a, right: b, action: 'same', subst: snap() });
      continue;
    }
    if (a.tag === 'var' || b.tag === 'var') {
      const [v, t] = a.tag === 'var' ? [a, b] : [b as Extract<Type, { tag: 'var' }>, a];
      if (varsOf(t).includes(v.name)) {
        steps.push({ constraint: at, left: a, right: b, action: 'occurs', subst: snap() });
        return { ok: false, steps, subst, kind: 'occurs', message: `${v.name} occurs inside ${show(t)}: it would have to be an infinite type.`, conflict: [at] };
      }
      subst.set(v.name, t);
      source.set(v.name, at);
      steps.push({ constraint: at, left: a, right: b, action: 'bind', bound: { name: v.name, to: t }, subst: snap() });
      continue;
    }
    if (a.tag === 'fn' && b.tag === 'fn') {
      steps.push({ constraint: at, left: a, right: b, action: 'split', subst: snap() });
      queue.unshift({ left: a.from, right: b.from, at }, { left: a.to, right: b.to, at });
      continue;
    }
    steps.push({ constraint: at, left: a, right: b, action: 'mismatch', subst: snap() });
    // The conflict: this constraint, plus every constraint whose binding fed its two sides.
    const blamed = new Set([at]);
    const pending = [...varsOf(left), ...varsOf(right)];
    while (pending.length) {
      const v = pending.pop()!;
      const from = source.get(v);
      if (from === undefined || blamed.has(from)) continue;
      blamed.add(from);
      pending.push(...varsOf(subst.get(v)!));
    }
    return { ok: false, steps, subst, kind: 'mismatch', message: `${show(a)} can't equal ${show(b)}.`, conflict: [...blamed].sort((x, y) => x - y) };
  }
  return { ok: true, steps, subst, type: apply(subst, c.root) };
}

export interface Preset {
  id: string;
  label: string;
  src: string;
  /** The documented principal type (variables named in order of appearance), or null for a type error. */
  expect: string | null;
}

export const PRESETS: Preset[] = [
  { id: 'id', label: 'id', src: 'fn id x = x', expect: 'a → a' },
  { id: 'twice', label: 'twice', src: 'fn twice f x = f (f x)', expect: '(a → a) → a → a' },
  { id: 'compose', label: 'compose', src: 'fn compose f g x = f (g x)', expect: '(a → b) → (c → a) → c → b' },
  { id: 'inc', label: 'x + 1', src: 'fn inc x = x + 1', expect: 'int → int' },
  { id: 'self', label: 'f f', src: 'fn self f = f f', expect: null },
  { id: 'ifmix', label: 'if … "a"', src: 'if true then 1 else "a"', expect: null },
];

// ── Scene 1 and 2: fixed, lesson-authored facts ──────────────────────

/** Where languages sit on the two axes (a rough placement: strictness is a spectrum). */
export const GRID = {
  rows: ['static', 'dynamic'] as const,
  cols: ['strict', 'loose'] as const,
  cells: {
    'static strict': ['Haskell', 'Java'],
    'static loose': ['TypeScript', 'C'],
    'dynamic strict': ['Python'],
    'dynamic loose': ['JavaScript'],
  } as Record<string, string[]>,
};

/** Coercion examples. JavaScript results are checked against real JavaScript in the tests. */
export const COERCIONS = [
  { id: 'js-mul', lang: 'JavaScript', code: '"5" * 2', result: '10', error: false },
  { id: 'js-add', lang: 'JavaScript', code: '"5" + 2', result: '"52"', error: false },
  { id: 'py-add', lang: 'Python', code: '"5" + 2', result: 'TypeError: can only concatenate str (not "int") to str', error: true },
] as const;

/** The same function twice: untyped, and with a TypeScript type. Line 3 is the bug in both. */
export const SNIPPET_JS = [
  '// user: { isAdmin, id, name } (id is a number)',
  'function shout(user) {',
  '  if (user.isAdmin) {',
  '    return user.id.toUpperCase();',
  '  }',
  '  return user.name.toUpperCase();',
  '}',
];
export const SNIPPET_TS = [
  'type User = { isAdmin: boolean; id: number; name: string };',
  'function shout(user: User) {',
  '  if (user.isAdmin) {',
  '    return user.id.toUpperCase();',
  '  }',
  '  return user.name.toUpperCase();',
  '}',
];
export const BUG_LINE = 3;
/** Lines a test with a non-admin user runs (0-based), so the coverage strip can mark the rest untested. */
export const COVERED_BY_TESTS = [1, 2, 5];
export const JS_CRASH = 'TypeError: user.id.toUpperCase is not a function';
export const TS_ERROR = "error TS2339: Property 'toUpperCase' does not exist on type 'number'.";
