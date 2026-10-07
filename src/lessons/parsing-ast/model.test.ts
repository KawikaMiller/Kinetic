import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { parserFrames } from './frames';
import { NAIVE_CAP, PRESETS, evaluate, lexExpr, parse, readInput, type Tok } from './model';

/**
 * The reference: Dijkstra's shunting-yard over the same tokens, with the lesson's table.
 * + - : 1 left · * / : 2 left · unary - : 3 prefix · ^ : 4 right. No recursive descent involved.
 */
function shuntingYard(tokens: readonly Tok[]): number {
  type Op = { op: string; unary: boolean };
  const prec = (o: Op) => (o.unary ? 3 : o.op === '^' ? 4 : o.op === '*' || o.op === '/' ? 2 : 1);
  const out: number[] = [];
  const ops: (Op | '(')[] = [];
  const apply = (o: Op) => {
    if (o.unary) return out.push(-out.pop()!);
    const b = out.pop()!;
    const a = out.pop()!;
    out.push(o.op === '+' ? a + b : o.op === '-' ? a - b : o.op === '*' ? a * b : o.op === '/' ? a / b : a ** b);
  };
  let expectOperand = true;
  for (const t of tokens) {
    if (t.kind === 'num') {
      out.push(Number(t.text));
      expectOperand = false;
    } else if (t.kind === 'lparen') {
      ops.push('(');
      expectOperand = true;
    } else if (t.kind === 'rparen') {
      while (ops[ops.length - 1] !== '(') apply(ops.pop() as Op);
      ops.pop();
      expectOperand = false;
    } else if (t.kind === 'op') {
      const o: Op = { op: t.text, unary: expectOperand && t.text === '-' };
      if (!o.unary) {
        // Pop while the top binds at least as tightly (strictly, for right-associative ^).
        while (ops.length) {
          const top = ops[ops.length - 1];
          if (top === '(') break;
          if (prec(top) > prec(o) || (prec(top) === prec(o) && o.op !== '^')) apply(ops.pop() as Op);
          else break;
        }
      }
      ops.push(o);
      expectOperand = true;
    }
  }
  while (ops.length) apply(ops.pop() as Op);
  return out[0];
}

const toks = (s: string) => {
  const r = lexExpr(s);
  if (!r.ok) throw new Error(r.error);
  return r.tokens;
};
const value = (s: string) => {
  const r = parse(toks(s));
  if (!r.ast) throw new Error(r.error?.message ?? 'overflow');
  return evaluate(r.ast);
};

/** A random expression of depth ≤ 6 with brackets and unary minus. */
function randomExpr(rnd: () => number, depth: number): string {
  const r = rnd();
  if (depth === 0 || r < 0.25) return String(Math.floor(rnd() * 10));
  if (r < 0.35) return `(${randomExpr(rnd, depth - 1)})`;
  if (r < 0.45) return `-${randomExpr(rnd, depth - 1)}`;
  const op = '+-*/^'[Math.floor(rnd() * 5)];
  return `${randomExpr(rnd, depth - 1)} ${op} ${randomExpr(rnd, depth - 1)}`;
}

describe('the parser against the reference', () => {
  it('evaluating the AST equals shunting-yard on 1,000 seeded random expressions', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const src = randomExpr(rnd, 6);
      const tokens = toks(src);
      const r = parse(tokens);
      expect(r.error, src).toBeNull();
      expect(Object.is(evaluate(r.ast!), shuntingYard(tokens)) || evaluate(r.ast!) === shuntingYard(tokens), src).toBe(true);
    }
  });

  it('gets precedence and associativity right on the presets', () => {
    expect(value('8 - 3 - 2')).toBe(3);
    expect(value('2 ^ 3 ^ 2')).toBe(512);
    expect(value('-2 ^ 2')).toBe(-4);
    expect(value('1 + 2 * 3')).toBe(7);
    expect(value('(1 + 2) * 3')).toBe(9);
    expect(value('2 * -3')).toBe(-6);
    expect(value('2 ^ -1')).toBe(0.5);
    for (const p of PRESETS) expect(value(p.src)).toBe(shuntingYard(toks(p.src)));
  });
});

describe('left recursion', () => {
  it('the naive parser hits the stack cap without consuming a single token', () => {
    const r = parse(toks('1 + 2'), { naive: true });
    expect(r.overflow).toBe(true);
    expect(r.trace.some((e) => e.kind === 'consume')).toBe(false);
    expect(r.trace.every((e) => e.cursor === 0)).toBe(true);
    const last = r.trace[r.trace.length - 1];
    expect(last.kind).toBe('overflow');
    expect(last.stack).toHaveLength(NAIVE_CAP);
    expect(last.stack.every((f) => f.fn === 'parseExpr')).toBe(true);
  });
});

describe('errors', () => {
  it('names the unexpected token and its column', () => {
    expect(parse(toks('1 + * 2')).error).toEqual({ message: 'Expected a number or "(" but found "*" at column 5.', col: 5 });
    expect(parse(toks('(1 + 2')).error).toEqual({ message: 'Expected ")" but found end of input at column 7.', col: 7 });
    expect(parse(toks('1 2')).error).toEqual({ message: 'Unexpected "2" at column 3: the expression already ended.', col: 3 });
    expect(parse(toks(')')).error?.col).toBe(1);
  });

  it('the lexer refuses what the parser does not know, with a column', () => {
    expect(lexExpr('x + 1')).toMatchObject({ ok: false, col: 1 });
    expect(lexExpr('1e400')).toMatchObject({ ok: false, col: 2 });
    expect(lexExpr('2 + 😀')).toMatchObject({ ok: false, col: 5 });
    expect(lexExpr('<b>')).toMatchObject({ ok: false, col: 1 });
    expect(lexExpr('1,2')).toMatchObject({ ok: false, col: 2 });
    expect(lexExpr('12345678901234567890123')).toMatchObject({ ok: false });
    expect(readInput('')).toMatchObject({ ok: false });
    expect(readInput('   ')).toMatchObject({ ok: false });
    expect(readInput('1+'.repeat(30))).toMatchObject({ ok: false });
    expect(readInput('-1')).toMatchObject({ ok: true });
  });

  it('deep nesting is refused instead of overflowing the real stack', () => {
    const r = parse(toks('('.repeat(19) + '1' + ')'.repeat(19)));
    expect(r.error?.message).toMatch(/Nested too deeply/);
  });
});

describe('frames', () => {
  it('end on the evaluated value for every preset', () => {
    for (const p of PRESETS) {
      const frames = parserFrames(toks(p.src), false);
      const last = frames[frames.length - 1];
      expect(last.result).toBe(value(p.src));
    }
  });

  it('the naive frames end on the overflow', () => {
    const frames = parserFrames(toks('1 + 2'), true);
    expect(frames[frames.length - 1].overflow).toBe(true);
  });
});
