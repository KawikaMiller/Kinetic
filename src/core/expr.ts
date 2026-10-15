// A safe expression evaluator. No eval: a tiny parser for a documented subset of JavaScript
// expressions, evaluated with JavaScript's own operators so the answers are real. Written for
// debugger-tools' watch / console / condition boxes and shared with coverage-mutation-testing,
// which builds mutants from the exposed tree.
//
// Supported: numbers, 'strings' and "strings", true false null undefined, variable names,
// a.b and a[expr] (including .length), unary ! - +, * / % + -, < <= > >=, === !== == !=,
// && || ??, and parentheses; with `{ ternary: true }` also `test ? a : b`. Anything else (calls,
// assignment, ++, =>, `templates`, new...) is reported as "not supported here" and never runs.

export type Value = number | string | boolean | null | undefined | readonly Value[] | { readonly [k: string]: Value };
export type Vars = Readonly<Record<string, Value>>;

/** Name lookup, innermost scope first (block, then local, then script). */
export type Scope = readonly Vars[];

export class Unsupported extends Error {}
/** A real JavaScript error the expression would throw (ReferenceError, TypeError). */
export class EvalError extends Error {}

/** What `parseExpr` and `evaluate` accept beyond the base subset. */
export interface ExprOptions {
  /** Allow `test ? a : b` (lowest precedence, right-associative, evaluates only the branch taken). */
  ternary?: boolean;
}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string };

const OPS = ['===', '!==', '??', '&&', '||', '==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '!', '.', '[', ']', '(', ')'];
const TERNARY_OPS = ['?', ':'];
const LITERALS: Record<string, Value> = { true: true, false: false, null: null, undefined: undefined };
const RESERVED = new Set(['new', 'typeof', 'delete', 'void', 'function', 'class', 'this', 'await', 'yield', 'import', 'in', 'instanceof']);

function lex(src: string, options: ExprOptions): Tok[] {
  const toks: Tok[] = [];
  const ops = options.ternary ? [...OPS, ...TERNARY_OPS] : OPS;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      toks.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Unsupported('unterminated string');
      const body = src.slice(i + 1, end);
      if (body.includes('\\')) throw new Unsupported('escapes in strings');
      toks.push({ t: 'str', v: body });
      i = end + 1;
      continue;
    }
    const name = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (name) {
      if (RESERVED.has(name[0])) throw new Unsupported(`"${name[0]}"`);
      toks.push({ t: 'name', v: name[0] });
      i += name[0].length;
      continue;
    }
    // Reject the operators we don't run before the shorter ones they start with match.
    const bad = ['=>', '++', '--', '**', '+=', '-=', '*=', '/=', '?.', '`', '=', '?', ',', ':', '{', '}', ';', '&', '|', '^', '~', '<<', '>>'].find(
      (o) => src.startsWith(o, i) && !ops.some((ok) => ok.length >= o.length && src.startsWith(ok, i)),
    );
    if (bad) throw new Unsupported(`"${bad}"`);
    const op = ops.find((o) => src.startsWith(o, i));
    if (!op) throw new Unsupported(`"${c}"`);
    toks.push({ t: 'op', v: op });
    i += op.length;
  }
  return toks;
}

/** The parse tree: a mutant is a copy of it with one node changed (a different operator, a literal off by one, swapped branches). */
export type ExprNode =
  | { k: 'lit'; v: Value }
  | { k: 'name'; v: string }
  | { k: 'member'; obj: ExprNode; prop: ExprNode | string }
  | { k: 'unary'; op: string; arg: ExprNode }
  | { k: 'binary'; op: string; l: ExprNode; r: ExprNode }
  | { k: 'ternary'; test: ExprNode; then: ExprNode; else: ExprNode };

/** Binding power of each binary operator, as in JavaScript's precedence table. */
const BP: Record<string, number> = {
  '??': 1, '||': 2, '&&': 3,
  '===': 6, '!==': 6, '==': 6, '!=': 6,
  '<': 7, '<=': 7, '>': 7, '>=': 7,
  '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};

export function parseExpr(src: string, options: ExprOptions = {}): ExprNode {
  const toks = lex(src, options);
  if (toks.length === 0) throw new Unsupported('an empty expression');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Unsupported(`expected "${v}"`);
    p++;
  };

  const primary = (): ExprNode => {
    const tok = toks[p++];
    if (!tok) throw new Unsupported('an unfinished expression');
    let node: ExprNode;
    if (tok.t === 'num' || tok.t === 'str') node = { k: 'lit', v: tok.v };
    else if (tok.t === 'name') node = Object.hasOwn(LITERALS, tok.v) ? { k: 'lit', v: LITERALS[tok.v] } : { k: 'name', v: tok.v };
    else if (tok.v === '(') {
      node = whole();
      expect(')');
    } else if (tok.v === '!' || tok.v === '-' || tok.v === '+') return { k: 'unary', op: tok.v, arg: unaryOperand() };
    else throw new Unsupported(`"${tok.v}" here`);
    for (;;) {
      if (isOp('.')) {
        p++;
        const prop = toks[p++];
        if (prop?.t !== 'name') throw new Unsupported('a property name after "."');
        node = { k: 'member', obj: node, prop: prop.v };
      } else if (isOp('[')) {
        p++;
        node = { k: 'member', obj: node, prop: whole() };
        expect(']');
      } else if (isOp('(')) throw new Unsupported('function calls');
      else return node;
    }
  };
  const unaryOperand = (): ExprNode => primary();

  const binary = (minBp: number): ExprNode => {
    let left = primary();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || !Object.hasOwn(BP, tok.v) || BP[tok.v] <= minBp) return left;
      p++;
      left = { k: 'binary', op: tok.v, l: left, r: binary(BP[tok.v]) };
    }
  };

  /** A whole expression: a binary expression, then (with `ternary`) an optional `? a : b`, right-associative. */
  const whole = (): ExprNode => {
    const test = binary(0);
    if (!isOp('?')) return test;
    p++;
    const then = whole();
    expect(':');
    return { k: 'ternary', test, then, else: whole() };
  };

  const tree = whole();
  if (p < toks.length) throw new Unsupported(`"${toks[p].t === 'op' || toks[p].t === 'name' ? toks[p].v : 'more'}" after the expression`);
  return tree;
}

function lookup(name: string, scope: Scope): Value {
  for (const vars of scope) if (Object.hasOwn(vars, name)) return vars[name];
  // Names a real console would find (Object, JSON, Math, window, inherited toString…) exist, so they're
  // "not supported" here rather than a ReferenceError that a real console would never show.
  if (name === 'window' || name in globalThis || name in {}) throw new Unsupported(`"${name}"`);
  throw new EvalError(`ReferenceError: ${name} is not defined`);
}

/** Run a parse tree (from `parseExpr`, or a mutant of one) against a scope; throws `Unsupported` or `EvalError`. */
export function runTree(n: ExprNode, scope: Scope): Value {
  switch (n.k) {
    case 'lit':
      return n.v;
    case 'name':
      return lookup(n.v, scope);
    case 'member': {
      const obj = runTree(n.obj, scope);
      const key = typeof n.prop === 'string' ? n.prop : runTree(n.prop, scope);
      if (obj === null || obj === undefined) throw new EvalError(`TypeError: Cannot read properties of ${obj} (reading '${String(key)}')`);
      if (typeof key !== 'string' && typeof key !== 'number') throw new Unsupported('that kind of property key');
      if (typeof obj === 'string' && key === 'length') return obj.length;
      if (Array.isArray(obj) && key === 'length') return obj.length;
      // Own data only: no prototype methods, so nothing callable ever comes back.
      const boxed: object = Object(obj);
      if (Object.hasOwn(boxed, key)) return (boxed as Record<string, Value>)[key];
      // Real JavaScript would find a method, constructor or __proto__ up the prototype chain: say so, don't fake undefined.
      if (key in boxed) throw new Unsupported(`"${String(key)}": methods and other inherited properties`);
      return undefined;
    }
    case 'unary': {
      const v = runTree(n.arg, scope);
      if (n.op === '!') return !v;
      if (typeof v === 'object' && v !== null) throw new Unsupported('arithmetic on objects');
      return n.op === '-' ? -(v as number) : +(v as number);
    }
    case 'ternary':
      return runTree(n.test, scope) ? runTree(n.then, scope) : runTree(n.else, scope);
    case 'binary': {
      if (n.op === '&&') return runTree(n.l, scope) && runTree(n.r, scope);
      if (n.op === '||') return runTree(n.l, scope) || runTree(n.r, scope);
      if (n.op === '??') return runTree(n.l, scope) ?? runTree(n.r, scope);
      const l = runTree(n.l, scope);
      const r = runTree(n.r, scope);
      if (n.op === '===') return l === r;
      if (n.op === '!==') return l !== r;
      if ((typeof l === 'object' && l !== null) || (typeof r === 'object' && r !== null)) throw new Unsupported('operators on objects');
      const a = l as number;
      const b = r as number;
      switch (n.op) {
        case '==': return a == b; // eslint-disable-line eqeqeq
        case '!=': return a != b; // eslint-disable-line eqeqeq
        case '<': return a < b;
        case '<=': return a <= b;
        case '>': return a > b;
        case '>=': return a >= b;
        case '+': return (a as unknown as string) + (b as unknown as string);
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        default: return a % b;
      }
    }
  }
}

export type EvalResult = { ok: true; value: Value } | { ok: false; error: string; unsupported: boolean };

export function evaluate(src: string, scope: Scope, options: ExprOptions = {}): EvalResult {
  try {
    return { ok: true, value: runTree(parseExpr(src, options), scope) };
  } catch (e) {
    if (e instanceof Unsupported) return { ok: false, error: `not supported here: ${e.message}`, unsupported: true };
    if (e instanceof EvalError) return { ok: false, error: e.message, unsupported: false };
    throw e;
  }
}

/** A value as the DevTools console previews it. Strings are quoted unless `bare`. */
export function preview(v: Value, bare = false, depth = 0): string {
  if (typeof v === 'string') return bare ? v : `'${v}'`;
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return String(v);
  if (depth > 0) return Array.isArray(v) ? `Array(${v.length})` : '{…}';
  if (Array.isArray(v)) return `(${v.length}) [${v.map((x) => preview(x, false, depth + 1)).join(', ')}]`;
  return `{${Object.entries(v).map(([k, x]) => `${k}: ${preview(x, false, depth + 1)}`).join(', ')}}`;
}
