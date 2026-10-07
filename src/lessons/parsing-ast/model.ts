/**
 * A recursive-descent parser for the batch language's arithmetic: numbers, + - * / ^,
 * parentheses and unary minus (each T2-B5 lesson keeps its own copy of these rules).
 *
 *   expr   → term (("+" | "-") term)*        left-assoc, by a loop
 *   term   → unary (("*" | "/") unary)*      left-assoc, by a loop
 *   unary  → "-" unary | power               unary minus binds looser than ^, so -2 ^ 2 = -(2 ^ 2)
 *   power  → factor ("^" unary)?             right-assoc: the exponent is parsed again from unary
 *   factor → NUMBER | "(" expr ")"
 *
 * Learner input goes through this hand-written lexer and parser only (never eval).
 */

export type TokKind = 'num' | 'op' | 'lparen' | 'rparen' | 'end';

export interface Tok {
  kind: TokKind;
  text: string;
  /** 1-based column. */
  col: number;
}

export const MAX_CHARS = 40;
export const MAX_DIGITS = 9;

export type LexResult = { ok: true; tokens: Tok[] } | { ok: false; error: string; col: number };

export function lexExpr(src: string): LexResult {
  const tokens: Tok[] = [];
  const chars = Array.from(src);
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    const col = i + 1;
    if (c === ' ' || c === '\t') {
      i++;
    } else if (/[0-9]/.test(c)) {
      let j = i;
      while (j < chars.length && /[0-9]/.test(chars[j])) j++;
      if (chars[j] === '.' && /[0-9]/.test(chars[j + 1] ?? '')) {
        j++;
        while (j < chars.length && /[0-9]/.test(chars[j])) j++;
      }
      const text = chars.slice(i, j).join('');
      if (text.replace('.', '').length > MAX_DIGITS) return { ok: false, error: `Keep numbers to ${MAX_DIGITS} digits (column ${col}).`, col };
      tokens.push({ kind: 'num', text, col });
      i = j;
    } else if ('+-*/^'.includes(c)) {
      tokens.push({ kind: 'op', text: c, col });
      i++;
    } else if (c === '(' || c === ')') {
      tokens.push({ kind: c === '(' ? 'lparen' : 'rparen', text: c, col });
      i++;
    } else {
      return { ok: false, error: `Unexpected character ${JSON.stringify(c)} at column ${col}: this parser knows numbers, + - * / ^ and parentheses.`, col };
    }
  }
  tokens.push({ kind: 'end', text: 'end of input', col: chars.length + 1 });
  return { ok: true, tokens };
}

// ── The AST and the parse tree ───────────────────────────────────────

export type Ast = { id: string; kind: 'num'; value: number; text: string } | { id: string; kind: 'neg'; arg: Ast } | { id: string; kind: 'bin'; op: string; left: Ast; right: Ast };

export const astChildren = (n: Ast): Ast[] => (n.kind === 'num' ? [] : n.kind === 'neg' ? [n.arg] : [n.left, n.right]);
export const astLabel = (n: Ast) => (n.kind === 'num' ? n.text : n.kind === 'neg' ? '−' : n.op);

/** One node of the full parse tree: a function call, or a token it consumed. */
export interface PtNode {
  id: string;
  label: string;
  /** A token that became an AST node (numbers, operators, unary minus); everything else the AST drops. */
  kept: boolean;
  isCall: boolean;
  children: string[];
}

// ── The trace the frames replay ──────────────────────────────────────

export type Fn = 'parseExpr' | 'parseTerm' | 'parseUnary' | 'parsePower' | 'parseFactor';

export interface StackFrame {
  id: number;
  fn: Fn;
}

export type TraceEvent =
  | { kind: 'call'; fn: Fn; line: number; stack: StackFrame[]; cursor: number }
  | { kind: 'consume'; tok: Tok; line: number; stack: StackFrame[]; cursor: number }
  | { kind: 'create'; node: Ast; line: number; stack: StackFrame[]; cursor: number }
  | { kind: 'return'; fn: Fn; node: Ast; line: number; stack: StackFrame[]; cursor: number }
  | { kind: 'error'; message: string; line: number; stack: StackFrame[]; cursor: number }
  | { kind: 'overflow'; line: number; stack: StackFrame[]; cursor: number };

/** The parser's source as the lesson shows it; the line numbers below index into it. */
export const SOURCE = [
  'function parseExpr() {',
  '  let left = parseTerm();',
  "  while (peek() is '+' or '-')",
  '    left = Binary(next(), left, parseTerm());',
  '  return left;',
  '}',
  'function parseTerm() {',
  '  let left = parseUnary();',
  "  while (peek() is '*' or '/')",
  '    left = Binary(next(), left, parseUnary());',
  '  return left;',
  '}',
  'function parseUnary() {',
  "  if (peek() is '-') return Neg(next(), parseUnary());",
  '  return parsePower();',
  '}',
  'function parsePower() {',
  '  const base = parseFactor();',
  "  if (peek() is '^') return Binary(next(), base, parseUnary());",
  '  return base;',
  '}',
  'function parseFactor() {',
  '  if (peek() is a number) return Num(next());',
  "  expect('('); const e = parseExpr(); expect(')');",
  '  return e;',
  '}',
];

/** The naive parseExpr, straight from expr → expr + term | term. It replaces lines 0-5. */
export const NAIVE_EXPR = [
  'function parseExpr() {',
  '  let left = parseExpr();   // left recursion',
  "  if (peek() is '+' or '-')",
  '    return Binary(next(), left, parseTerm());',
  '  return left;',
  '}',
];

export const LINE = {
  parseExpr: 0, exprFirst: 1, exprLoop: 2, exprOp: 3, exprBuild: 3, exprReturn: 4,
  parseTerm: 6, termFirst: 7, termLoop: 8, termOp: 9, termBuild: 9, termReturn: 10,
  parseUnary: 12, unaryMinus: 13, unaryElse: 14,
  parsePower: 16, powerBase: 17, powerCaret: 18, powerReturn: 19,
  parseFactor: 21, factorNum: 22, factorParen: 23, factorReturn: 24,
} as const;

/** The naive parser's stack cap: low on purpose, so the runaway is visible. */
export const NAIVE_CAP = 12;
/** The normal parser's depth limit (deeply nested brackets). */
export const DEPTH_CAP = 60;

class ParseError extends Error {}

/** A trace event before the stack and cursor are stamped on (Omit over each member of the union). */
type Bare = TraceEvent extends infer E ? (E extends TraceEvent ? Omit<E, 'stack' | 'cursor'> : never) : never;

export interface ParseResult {
  ast: Ast | null;
  trace: TraceEvent[];
  /** The parse tree: one node per call, with the tokens each call consumed. */
  tree: Record<string, PtNode>;
  treeRoot: string | null;
  error: { message: string; col: number } | null;
  overflow: boolean;
}

const tokName = (t: Tok) => (t.kind === 'end' ? 'end of input' : `"${t.text}"`);

export function parse(tokens: readonly Tok[], opts: { naive?: boolean } = {}): ParseResult {
  let pos = 0;
  let ids = 0;
  let frameIds = 0;
  const stack: StackFrame[] = [];
  const trace: TraceEvent[] = [];
  const tree: Record<string, PtNode> = {};
  const treeStack: string[] = [];
  const snap = () => stack.map((f) => ({ ...f }));
  const peek = () => tokens[pos];
  const add = (e: Bare) => trace.push({ ...e, stack: snap(), cursor: pos } as TraceEvent);
  const treeAdd = (label: string, kept: boolean, isCall: boolean) => {
    const id = `p${Object.keys(tree).length}`;
    tree[id] = { id, label, kept, isCall, children: [] };
    if (treeStack.length) tree[treeStack[treeStack.length - 1]].children.push(id);
    return id;
  };

  const enter = (fn: Fn) => {
    stack.unshift({ id: frameIds++, fn });
    treeStack.push(treeAdd(fn.replace('parse', ''), false, true));
    add({ kind: 'call', fn, line: LINE[fn] });
    if (opts.naive && stack.length >= NAIVE_CAP) {
      add({ kind: 'overflow', line: LINE.exprFirst });
      throw new ParseError('overflow');
    }
    if (stack.length > DEPTH_CAP) {
      add({ kind: 'error', message: `Nested too deeply for this demo (over ${DEPTH_CAP} calls).`, line: LINE[fn] });
      throw new ParseError(`Nested too deeply for this demo (over ${DEPTH_CAP} calls).`);
    }
  };
  const leave = (fn: Fn, node: Ast, line: number) => {
    add({ kind: 'return', fn, node, line });
    stack.shift();
    treeStack.pop();
    return node;
  };
  const consume = (line: number, kept: boolean) => {
    const t = tokens[pos++];
    treeAdd(t.text, kept, false);
    add({ kind: 'consume', tok: t, line });
    return t;
  };
  const create = (node: Ast, line: number) => {
    add({ kind: 'create', node, line });
    return node;
  };
  const fail = (message: string, line: number) => {
    add({ kind: 'error', message, line });
    throw new ParseError(message);
  };
  const id = () => `a${ids++}`;
  const isOp = (...ops: string[]) => peek().kind === 'op' && ops.includes(peek().text);

  function parseExpr(): Ast {
    enter('parseExpr');
    if (opts.naive) {
      const left = parseExpr();
      return leave('parseExpr', left, LINE.exprReturn);
    }
    let left = parseTerm();
    while (isOp('+', '-')) {
      const op = consume(LINE.exprOp, true);
      const right = parseTerm();
      left = create({ id: id(), kind: 'bin', op: op.text, left, right }, LINE.exprBuild);
    }
    return leave('parseExpr', left, LINE.exprReturn);
  }
  function parseTerm(): Ast {
    enter('parseTerm');
    let left = parseUnary();
    while (isOp('*', '/')) {
      const op = consume(LINE.termOp, true);
      const right = parseUnary();
      left = create({ id: id(), kind: 'bin', op: op.text, left, right }, LINE.termBuild);
    }
    return leave('parseTerm', left, LINE.termReturn);
  }
  function parseUnary(): Ast {
    enter('parseUnary');
    if (isOp('-')) {
      consume(LINE.unaryMinus, true);
      const arg = parseUnary();
      return leave('parseUnary', create({ id: id(), kind: 'neg', arg }, LINE.unaryMinus), LINE.unaryMinus);
    }
    return leave('parseUnary', parsePower(), LINE.unaryElse);
  }
  function parsePower(): Ast {
    enter('parsePower');
    const base = parseFactor();
    if (isOp('^')) {
      const op = consume(LINE.powerCaret, true);
      const right = parseUnary();
      return leave('parsePower', create({ id: id(), kind: 'bin', op: op.text, left: base, right }, LINE.powerCaret), LINE.powerCaret);
    }
    return leave('parsePower', base, LINE.powerReturn);
  }
  function parseFactor(): Ast {
    enter('parseFactor');
    const t = peek();
    if (t.kind === 'num') {
      consume(LINE.factorNum, true);
      return leave('parseFactor', create({ id: id(), kind: 'num', value: Number(t.text), text: t.text }, LINE.factorNum), LINE.factorNum);
    }
    if (t.kind !== 'lparen') fail(`Expected a number or "(" but found ${tokName(t)} at column ${t.col}.`, LINE.factorNum);
    consume(LINE.factorParen, false);
    const e = parseExpr();
    if (peek().kind !== 'rparen') fail(`Expected ")" but found ${tokName(peek())} at column ${peek().col}.`, LINE.factorParen);
    consume(LINE.factorParen, false);
    return leave('parseFactor', e, LINE.factorReturn);
  }

  try {
    const ast = parseExpr();
    if (peek().kind !== 'end') {
      const t = peek();
      fail(`Unexpected ${tokName(t)} at column ${t.col}: the expression already ended.`, LINE.exprReturn);
    }
    return { ast, trace, tree, treeRoot: 'p0', error: null, overflow: false };
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    const last = trace[trace.length - 1];
    const overflow = last.kind === 'overflow';
    return {
      ast: null, trace, tree, treeRoot: Object.keys(tree).length ? 'p0' : null,
      error: overflow ? null : { message: e.message, col: tokens[Math.min(pos, tokens.length - 1)].col },
      overflow,
    };
  }
}

// ── Evaluation: a post-order walk ────────────────────────────────────

export function evaluate(n: Ast): number {
  if (n.kind === 'num') return n.value;
  if (n.kind === 'neg') return -evaluate(n.arg);
  const a = evaluate(n.left);
  const b = evaluate(n.right);
  switch (n.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    default: return a ** b;
  }
}

/** Nodes in the order a post-order walk finishes them: children first, then the parent. */
export function postOrder(n: Ast): Ast[] {
  return [...astChildren(n).flatMap(postOrder), n];
}

export function formatValue(v: number): string {
  if (Number.isNaN(v)) return 'not a number';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  return Number.isInteger(v) ? v.toLocaleString('en') : String(Number(v.toPrecision(10)));
}

export const PRESETS = [
  { id: 'prec', label: '1 + 2 * 3', src: '1 + 2 * 3' },
  { id: 'left', label: '8 - 3 - 2', src: '8 - 3 - 2' },
  { id: 'right', label: '2 ^ 3 ^ 2', src: '2 ^ 3 ^ 2' },
  { id: 'paren', label: '(1 + 2) * 3', src: '(1 + 2) * 3' },
  { id: 'neg', label: '-2 ^ 2', src: '-2 ^ 2' },
] as const;

/** Read a learner's line: the lexer's error, an empty-line note, or tokens. */
export function readInput(src: string): LexResult | { ok: false; error: string; col: number } {
  if (Array.from(src).length > MAX_CHARS) return { ok: false, error: `Keep it to ${MAX_CHARS} characters.`, col: MAX_CHARS + 1 };
  if (!src.trim()) return { ok: false, error: 'Type an expression, like 1 + 2 * 3.', col: 1 };
  return lexExpr(src);
}
