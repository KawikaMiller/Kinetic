/**
 * The lesson's small source language (a subset of JavaScript: integers, the variables a to d,
 * + - * <, assignment, while and print) with a hand-written parser and two compilers: stack
 * code for the VM and three-operand register code for the comparison. Learner text only ever
 * reaches this parser; nothing is evaluated.
 */

export type Slot = 0 | 1 | 2 | 3;
export const SLOT_NAMES = ['a', 'b', 'c', 'd'] as const;

export type BinOp = '+' | '-' | '*' | '<';
export type Expr =
  | { k: 'num'; n: number }
  | { k: 'var'; slot: Slot }
  | { k: 'bin'; op: BinOp; l: Expr; r: Expr };
export type Stmt =
  | { k: 'assign'; slot: Slot; e: Expr }
  | { k: 'print'; e: Expr }
  | { k: 'while'; cond: Expr; body: Stmt[] };

export const LANG_LIMITS = { maxChars: 120, maxDepth: 12, maxNumber: 1_000_000, maxExprChars: 40 } as const;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

type Token = { t: 'num'; n: number; at: number } | { t: 'id'; name: string; at: number } | { t: 'op'; op: string; at: number };

class Refusal extends Error {}

function tokenise(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) i++;
    else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      if (/[A-Za-z]/.test(text[j] ?? '')) throw new Refusal(`A number can't run into a letter at position ${j + 1}.`);
      const n = Number(text.slice(i, j));
      if (n > LANG_LIMITS.maxNumber) throw new Refusal(`The number ${text.slice(i, j)} is over ${LANG_LIMITS.maxNumber.toLocaleString('en-US')}.`);
      out.push({ t: 'num', n, at: i });
      i = j;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
      out.push({ t: 'id', name: text.slice(i, j), at: i });
      i = j;
    } else if ('+-*<=(){};'.includes(ch)) {
      out.push({ t: 'op', op: ch, at: i++ });
    } else {
      throw new Refusal(`Unexpected character "${ch}" at position ${i + 1}.`);
    }
  }
  return out;
}

const PRECEDENCE: Record<BinOp, number> = { '<': 1, '+': 2, '-': 2, '*': 3 };
const isBinOp = (s: string): s is BinOp => s in PRECEDENCE;

class Reader {
  pos = 0;
  readonly tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }
  peek = () => this.tokens[this.pos];
  next = () => this.tokens[this.pos++];
  isOp = (op: string) => {
    const t = this.peek();
    return t?.t === 'op' && t.op === op;
  };
  where = (t: Token | undefined) => (t ? `position ${t.at + 1}` : 'the end');

  expectOp(op: string) {
    if (!this.isOp(op)) throw new Refusal(`Expected "${op}" at ${this.where(this.peek())}.`);
    this.pos++;
  }

  slotOf(t: Token & { t: 'id' }): Slot {
    const at = SLOT_NAMES.indexOf(t.name as (typeof SLOT_NAMES)[number]);
    if (at === -1) throw new Refusal(`"${t.name}" at position ${t.at + 1} is not a variable here: this machine has four slots, named a, b, c and d.`);
    return at as Slot;
  }

  expression(depth: number, minPrec = 1): Expr {
    if (depth > LANG_LIMITS.maxDepth) throw new Refusal(`The expression is nested more than ${LANG_LIMITS.maxDepth} levels deep.`);
    let left = this.operand(depth);
    for (;;) {
      const t = this.peek();
      if (t?.t !== 'op' || !isBinOp(t.op) || PRECEDENCE[t.op] < minPrec) return left;
      this.pos++;
      const right = this.expression(depth + 1, PRECEDENCE[t.op] + 1);
      left = { k: 'bin', op: t.op, l: left, r: right };
    }
  }

  operand(depth: number): Expr {
    const t = this.next();
    if (t?.t === 'num') return { k: 'num', n: t.n };
    if (t?.t === 'id') return { k: 'var', slot: this.slotOf(t) };
    if (t?.t === 'op' && t.op === '(') {
      const inner = this.expression(depth + 1);
      this.expectOp(')');
      return inner;
    }
    if (t?.t === 'op' && t.op === '-') throw new Refusal(`There is no unary minus: write 0 - x (position ${t.at + 1}).`);
    throw new Refusal(t ? `Expected a number, a variable or "(" at position ${t.at + 1}.` : 'The program ends too soon: an expression is missing.');
  }

  statement(depth: number): Stmt {
    if (depth > LANG_LIMITS.maxDepth) throw new Refusal(`The blocks are nested more than ${LANG_LIMITS.maxDepth} levels deep.`);
    const t = this.peek();
    if (t?.t === 'id' && t.name === 'print') {
      this.pos++;
      return { k: 'print', e: this.expression(depth + 1) };
    }
    if (t?.t === 'id' && t.name === 'while') {
      this.pos++;
      this.expectOp('(');
      const cond = this.expression(depth + 1);
      this.expectOp(')');
      this.expectOp('{');
      const body = this.statements(depth + 1, true);
      this.expectOp('}');
      return { k: 'while', cond, body };
    }
    if (t?.t === 'id') {
      this.pos++;
      const slot = this.slotOf(t);
      this.expectOp('=');
      return { k: 'assign', slot, e: this.expression(depth + 1) };
    }
    throw new Refusal(`Expected a statement (a = …, print …, while (…) {…}) at ${this.where(t)}.`);
  }

  statements(depth: number, inBlock: boolean): Stmt[] {
    const out: Stmt[] = [];
    for (;;) {
      while (this.isOp(';')) this.pos++;
      const t = this.peek();
      if (!t || (inBlock && this.isOp('}'))) return out;
      out.push(this.statement(depth));
    }
  }
}

function guard<T>(f: () => T): Parsed<T> {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, error: e.message };
    throw e;
  }
}

/** Reads a program (statements separated by `;`, a newline or nothing after a block). Refuses, saying where. */
export function parseProgram(text: string): Parsed<Stmt[]> {
  return guard(() => {
    if (text.length > LANG_LIMITS.maxChars) throw new Refusal(`The source is ${text.length} characters; keep it to ${LANG_LIMITS.maxChars} or fewer.`);
    const reader = new Reader(tokenise(text));
    const program = reader.statements(0, false);
    if (program.length === 0) throw new Refusal('Type a program, for example: print 1 + 2 * 3');
    return program;
  });
}

/** Reads one expression (the register comparison's field). */
export function parseExpression(text: string): Parsed<Expr> {
  return guard(() => {
    if (text.length > LANG_LIMITS.maxExprChars) throw new Refusal(`The expression is ${text.length} characters; keep it to ${LANG_LIMITS.maxExprChars} or fewer.`);
    const reader = new Reader(tokenise(text));
    if (!reader.peek()) throw new Refusal('Type an expression, for example: (a + b) * (c - d)');
    const e = reader.expression(0);
    if (reader.peek()) throw new Refusal(`Unexpected input at ${reader.where(reader.peek())}.`);
    return e;
  });
}

// ---- stack code ----

export type Op = 'PUSH' | 'POP' | 'ADD' | 'SUB' | 'MUL' | 'LT' | 'LOAD' | 'STORE' | 'JMP' | 'JZ' | 'PRINT' | 'HALT';
export interface Instr {
  op: Op;
  arg?: number;
}

const BIN_OP: Record<BinOp, Op> = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '<': 'LT' };

export const MAX_PROGRAM = 60;

function emitExpr(e: Expr, out: Instr[]) {
  if (e.k === 'num') out.push({ op: 'PUSH', arg: e.n });
  else if (e.k === 'var') out.push({ op: 'LOAD', arg: e.slot });
  else {
    emitExpr(e.l, out);
    emitExpr(e.r, out);
    out.push({ op: BIN_OP[e.op] });
  }
}

function emitStmt(s: Stmt, out: Instr[]) {
  if (s.k === 'assign') {
    emitExpr(s.e, out);
    out.push({ op: 'STORE', arg: s.slot });
  } else if (s.k === 'print') {
    emitExpr(s.e, out);
    out.push({ op: 'PRINT' });
  } else {
    const start = out.length;
    emitExpr(s.cond, out);
    const jz = out.length;
    out.push({ op: 'JZ', arg: -1 });
    for (const inner of s.body) emitStmt(inner, out);
    out.push({ op: 'JMP', arg: start });
    out[jz] = { op: 'JZ', arg: out.length };
  }
}

/** Source to stack code, ending in HALT. Refuses a program that would not fit the listing. */
export function compileStack(program: Stmt[]): Parsed<Instr[]> {
  const out: Instr[] = [];
  for (const s of program) emitStmt(s, out);
  out.push({ op: 'HALT' });
  if (out.length > MAX_PROGRAM) return { ok: false, error: `This compiles to ${out.length} instructions; the listing holds ${MAX_PROGRAM}.` };
  return { ok: true, value: out };
}

export const compileSource = (text: string): Parsed<Instr[]> => {
  const p = parseProgram(text);
  return p.ok ? compileStack(p.value) : p;
};

export const formatInstr = (i: Instr) => (i.arg === undefined ? i.op : `${i.op} ${i.arg}`);

/** The stack code of `print <expr>` without the closing HALT. */
export function stackCodeFor(e: Expr): Instr[] {
  const out: Instr[] = [];
  emitExpr(e, out);
  out.push({ op: 'PRINT' });
  return out;
}

// ---- register code ----

/** `ADD t0, a, b`: a destination register and two operands that are registers (a to d, t0, t1, …) or numbers. */
export interface RegInstr {
  op: 'ADD' | 'SUB' | 'MUL' | 'LT' | 'PRINT';
  dest?: string;
  args: string[];
}

export function registerCodeFor(e: Expr): RegInstr[] {
  const out: RegInstr[] = [];
  let temps = 0;
  const gen = (x: Expr): string => {
    if (x.k === 'num') return String(x.n);
    if (x.k === 'var') return SLOT_NAMES[x.slot];
    const l = gen(x.l);
    const r = gen(x.r);
    const dest = `t${temps++}`;
    out.push({ op: BIN_OP[x.op] as RegInstr['op'], dest, args: [l, r] });
    return dest;
  };
  const result = gen(e);
  out.push({ op: 'PRINT', args: [result] });
  return out;
}

export const formatReg = (i: RegInstr) => (i.dest ? `${i.op} ${i.dest}, ${i.args.join(', ')}` : `${i.op} ${i.args.join(', ')}`);

/** Runs register code on the four slots and returns what it prints. */
export function runRegister(code: readonly RegInstr[], slots: readonly number[]): number[] {
  const regs = new Map<string, number>(SLOT_NAMES.map((n, i) => [n, slots[i]]));
  const val = (s: string) => (regs.has(s) ? regs.get(s)! : Number(s));
  const out: number[] = [];
  for (const i of code) {
    const [x, y] = i.args.map(val);
    if (i.op === 'PRINT') out.push(x);
    else regs.set(i.dest!, i.op === 'ADD' ? x + y : i.op === 'SUB' ? x - y : i.op === 'MUL' ? x * y : x < y ? 1 : 0);
  }
  return out;
}
