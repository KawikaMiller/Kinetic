/**
 * The lesson's tiny language, just enough for one function:
 *
 *   function sumSquares(n) { let s = 0; let i = 1; while (i <= n) { s = s + i * i; i = i + 1; } return s; }
 *
 * Values are numbers (doubles) or strings, with JavaScript's rules for the three operators it
 * has: `<=` compares two strings as text and anything else as numbers, `*` converts both sides to
 * numbers, and `+` joins text when either side is a string, else adds. So `sumSquares("3")` is 14,
 * as in JavaScript. The AST is lesson-authored (the parse step belongs to `parsing-ast`), and
 * `printFn` turns it back into the source shown on screen, which a test pins.
 * Nothing here runs learner text: the only program is this one.
 */

export type Value = number | string;
export type BinOp = '+' | '*' | '<=';

export type Expr =
  | { id: number; kind: 'num'; value: number }
  | { id: number; kind: 'var'; name: string }
  | { id: number; kind: 'bin'; op: BinOp; left: Expr; right: Expr };

export type Stmt =
  | { id: number; kind: 'let'; name: string; init: Expr }
  | { id: number; kind: 'assign'; name: string; value: Expr }
  | { id: number; kind: 'while'; cond: Expr; body: Stmt[] }
  | { id: number; kind: 'return'; value: Expr };

export interface Fn {
  id: number;
  kind: 'fn';
  name: string;
  param: string;
  body: Stmt[];
}

export type Node = Fn | Stmt | Expr;

let nextId = 0;
const num = (value: number): Expr => ({ id: nextId++, kind: 'num', value });
const v = (name: string): Expr => ({ id: nextId++, kind: 'var', name });
const bin = (op: BinOp, left: Expr, right: Expr): Expr => ({ id: nextId++, kind: 'bin', op, left, right });

/** Built in source order so ids read top to bottom, left to right. */
function buildSumSquares(): Fn {
  nextId = 0;
  const id = nextId++;
  const letS: Stmt = { id: nextId++, kind: 'let', name: 's', init: num(0) };
  const letI: Stmt = { id: nextId++, kind: 'let', name: 'i', init: num(1) };
  const whileId = nextId++;
  const cond = bin('<=', v('i'), v('n'));
  const assignSId = nextId++;
  const sValue = bin('+', v('s'), bin('*', v('i'), v('i')));
  const assignIId = nextId++;
  const iValue = bin('+', v('i'), num(1));
  const loop: Stmt = {
    id: whileId,
    kind: 'while',
    cond,
    body: [
      { id: assignSId, kind: 'assign', name: 's', value: sValue },
      { id: assignIId, kind: 'assign', name: 'i', value: iValue },
    ],
  };
  const ret: Stmt = { id: nextId++, kind: 'return', value: v('s') };
  return { id, kind: 'fn', name: 'sumSquares', param: 'n', body: [letS, letI, loop, ret] };
}

export const SUM_SQUARES: Fn = buildSumSquares();

/* ---------- reading the tree ---------- */

export function childrenOf(node: Node): Node[] {
  switch (node.kind) {
    case 'fn': return node.body;
    case 'let': return [node.init];
    case 'assign': return [node.value];
    case 'while': return [node.cond, ...node.body];
    case 'return': return [node.value];
    case 'bin': return [node.left, node.right];
    default: return [];
  }
}

export function allNodes(root: Node): Node[] {
  return [root, ...childrenOf(root).flatMap(allNodes)];
}

/** The short label a node wears in the drawn AST. */
export function nodeLabel(node: Node): string {
  switch (node.kind) {
    case 'fn': return 'function';
    case 'let': return `let ${node.name}`;
    case 'assign': return `${node.name} =`;
    case 'while': return 'while';
    case 'return': return 'return';
    case 'bin': return node.op;
    case 'var': return node.name;
    case 'num': return String(node.value);
  }
}

function printExpr(e: Expr): string {
  if (e.kind === 'num') return String(e.value);
  if (e.kind === 'var') return e.name;
  return `${printExpr(e.left)} ${e.op} ${printExpr(e.right)}`;
}

/** The AST printed back as source lines, with the statement each line came from. */
export function printFn(fn: Fn): { lines: string[]; stmtOfLine: (number | null)[] } {
  const lines: string[] = [`function ${fn.name}(${fn.param}) {`];
  const stmtOfLine: (number | null)[] = [fn.id];
  const walk = (stmts: Stmt[], indent: string) => {
    for (const s of stmts) {
      stmtOfLine.push(s.id);
      if (s.kind === 'let') lines.push(`${indent}let ${s.name} = ${printExpr(s.init)};`);
      else if (s.kind === 'assign') lines.push(`${indent}${s.name} = ${printExpr(s.value)};`);
      else if (s.kind === 'return') lines.push(`${indent}return ${printExpr(s.value)};`);
      else {
        lines.push(`${indent}while (${printExpr(s.cond)}) {`);
        walk(s.body, `${indent}  `);
        lines.push(`${indent}}`);
        stmtOfLine.push(null);
      }
    }
  };
  walk(fn.body, '  ');
  lines.push('}');
  stmtOfLine.push(null);
  return { lines, stmtOfLine };
}

/* ---------- the operators, with JavaScript's conversions ---------- */

const toNumber = (x: Value): number => (typeof x === 'number' ? x : Number(x));

export function applyOp(op: BinOp, a: Value, b: Value): Value {
  if (op === '*') return toNumber(a) * toNumber(b);
  if (op === '+') return typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : a + b;
  if (typeof a === 'string' && typeof b === 'string') return a <= b ? 1 : 0;
  return toNumber(a) <= toNumber(b) ? 1 : 0;
}

/** `<=` yields 1 or 0 in this language; `while` loops while its condition is not 0. */
export const truthy = (x: Value) => x !== 0 && x !== '';

/* ---------- the tree-walking interpreter ---------- */

export type Env = Record<string, Value>;

export interface WalkStep {
  /** The node being visited. */
  node: number;
  /** Locals right after this visit. */
  env: Env;
  /** The value an expression node produced, once it has one. */
  value?: Value;
  /** True on the loop's condition check: the hotness counter's back-edge. */
  loopCheck?: boolean;
}

export interface WalkResult {
  result: Value;
  /** One per node visited: every expression evaluated and every statement executed. */
  visits: number;
  steps?: WalkStep[];
}

/** Hard stop for a runaway loop; sumSquares never gets near it with the lesson's inputs. */
export const MAX_VISITS = 50_000_000;

/**
 * Runs the function by walking its tree: every operation, every iteration, visits the nodes
 * again. Counts each visit; with `trace`, records them for the step-through.
 */
export function treeWalk(fn: Fn, arg: Value, { trace = false } = {}): WalkResult {
  const env: Env = { [fn.param]: arg };
  const steps: WalkStep[] | undefined = trace ? [] : undefined;
  let visits = 0;
  const visit = (node: number, value?: Value, loopCheck?: boolean) => {
    visits++;
    if (visits > MAX_VISITS) throw new Error('treeWalk: visit limit reached');
    steps?.push({ node, env: { ...env }, value, loopCheck });
  };

  const evalExpr = (e: Expr): Value => {
    if (e.kind === 'num') {
      visit(e.id, e.value);
      return e.value;
    }
    if (e.kind === 'var') {
      const val = env[e.name];
      visit(e.id, val);
      return val;
    }
    const a = evalExpr(e.left);
    const b = evalExpr(e.right);
    const r = applyOp(e.op, a, b);
    visit(e.id, r);
    return r;
  };

  const exec = (s: Stmt): { returned: Value } | null => {
    switch (s.kind) {
      case 'let':
      case 'assign': {
        const val = evalExpr(s.kind === 'let' ? s.init : s.value);
        env[s.name] = val;
        visit(s.id);
        return null;
      }
      case 'return': {
        const val = evalExpr(s.value);
        visit(s.id, val);
        return { returned: val };
      }
      case 'while': {
        visit(s.id);
        for (;;) {
          const c = evalExpr(s.cond);
          if (steps) steps[steps.length - 1].loopCheck = true;
          if (!truthy(c)) return null;
          for (const inner of s.body) {
            const r = exec(inner);
            if (r) return r;
          }
        }
      }
    }
  };

  visit(fn.id);
  for (const s of fn.body) {
    const r = exec(s);
    if (r) return { result: r.returned, visits, steps };
  }
  return { result: 0, visits, steps };
}
