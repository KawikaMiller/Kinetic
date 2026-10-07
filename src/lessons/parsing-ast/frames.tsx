import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { LINE, NAIVE_CAP, astLabel, evaluate, formatValue, parse, postOrder, type Ast, type Fn, type StackFrame, type Tok } from './model';

export interface ParserFrame extends Frame {
  line: number | null;
  stack: StackFrame[];
  /** Index of the next token to read. */
  cursor: number;
  /** AST nodes built so far. */
  created: string[];
  /** The node built this step (one frame only). */
  fresh: string | null;
  /** Evaluated values, filled in by the post-order walk. */
  values: Record<string, number>;
  /** The node being evaluated now. */
  evaluating: string | null;
  error: string | null;
  overflow: boolean;
  /** The final value, once the walk reaches the root. */
  result: number | null;
}

const RULE: Record<Fn, string> = {
  parseExpr: 'expr → term (("+"|"-") term)*',
  parseTerm: 'term → unary (("*"|"/") unary)*',
  parseUnary: 'unary → "-" unary | power',
  parsePower: 'power → factor ("^" unary)?',
  parseFactor: 'factor → NUMBER | "(" expr ")"',
};

const NAIVE_RULE = 'expr → expr ("+"|"-") term | term';

/** A short readable form of an AST node: "Binary(+)", "Num 2", "Neg". */
export function nodeName(n: Ast): string {
  return n.kind === 'num' ? `Num ${n.text}` : n.kind === 'neg' ? 'Neg' : `Binary(${n.op})`;
}

function consumeSay(tok: Tok, line: number): ReactNode {
  const t = <code>{tok.text}</code>;
  switch (line) {
    case LINE.exprOp:
    case LINE.termOp:
      return <>The loop sees {t}, an operator it handles: consume it, then parse the right-hand side. A loop, so a chain like 8 - 3 - 2 groups to the left.</>;
    case LINE.unaryMinus:
      return <>A leading {t} is unary minus: consume it and parse the rest as another unary.</>;
    case LINE.powerCaret:
      return <>{t} follows the base: consume it and parse the exponent from parseUnary, so a second ^ nests inside the exponent. That makes ^ right-associative.</>;
    case LINE.factorNum:
      return <>A number: consume {t}.</>;
    default:
      return <>Consume {t}. Brackets only group: they won't become AST nodes.</>;
  }
}

export function parserFrames(tokens: readonly Tok[], naive: boolean): ParserFrame[] {
  const result = parse(tokens, { naive });
  const rec = createRecorder<ParserFrame>(
    { line: null, stack: [], cursor: 0, created: [], fresh: null, values: {}, evaluating: null, error: null, overflow: false, result: null },
    { transient: { fresh: null } },
  );
  rec.snap(
    naive
      ? <>The naive parseExpr follows <code>{NAIVE_RULE}</code> literally: its first act is to call itself. Step to watch what happens.</>
      : <>Recursive descent: one function per grammar rule, each calling the next for tighter-binding parts. The cursor starts at the first token.</>,
  );
  for (const e of result.trace) {
    const base = { line: e.line, stack: e.stack, cursor: e.cursor };
    if (e.kind === 'call') {
      const depth = e.stack.length;
      rec.snap(
        naive && e.fn === 'parseExpr' && depth > 1
          ? <>parseExpr calls parseExpr again (depth {depth}). The cursor hasn't moved: it's still on <code>{tokens[e.cursor].text}</code>.</>
          : <>Call <b>{e.fn}()</b>: <code>{naive && e.fn === 'parseExpr' ? NAIVE_RULE : RULE[e.fn]}</code>.</>,
        undefined,
        base,
      );
    } else if (e.kind === 'consume') {
      rec.snap(consumeSay(e.tok, e.line), undefined, base);
    } else if (e.kind === 'create') {
      const kids = e.node.kind === 'bin' ? <> joining {nodeName(e.node.left)} and {nodeName(e.node.right)}</> : e.node.kind === 'neg' ? <> around {nodeName(e.node.arg)}</> : null;
      rec.snap(<>New AST node: <b>{nodeName(e.node)}</b>{kids}.</>, undefined, { ...base, created: [...rec.get().created, e.node.id], fresh: e.node.id });
    } else if (e.kind === 'return') {
      const caller = e.stack[1];
      rec.snap(
        <>{e.fn} returns {nodeName(e.node)}{caller ? <> to {caller.fn}</> : <>: that's the whole expression</>}.</>,
        undefined,
        { ...base, stack: e.stack.slice(1) },
      );
    } else if (e.kind === 'error') {
      rec.snap(<><span className="hl bad">Syntax error.</span> {e.message}</>, 2, { ...base, error: e.message });
    } else {
      rec.snap(
        <>
          <span className="hl bad">Stack cap hit:</span> {NAIVE_CAP} calls of parseExpr and the cursor never left token 1. Left recursion calls itself before consuming anything, so
          it can never make progress. That's why parseExpr is written as a loop instead. (The cap is set low, {NAIVE_CAP} frames, so the runaway is visible.)
        </>,
        2,
        { ...base, overflow: true },
      );
    }
  }
  if (!result.ast) return rec.frames;

  rec.snap(<>Parsed. Now evaluate the AST with a post-order walk: children first, then the node that combines them.</>, undefined, { line: null, stack: [] });
  const values: Record<string, number> = {};
  for (const n of postOrder(result.ast)) {
    values[n.id] = evaluate(n);
    const v = formatValue(values[n.id]);
    const say =
      n.kind === 'num'
        ? <>{n.text} is a leaf: its value is {v}.</>
        : n.kind === 'neg'
          ? <>Neg: −({formatValue(values[n.arg.id])}) = {v}.</>
          : <>{astLabel(n)}: {formatValue(values[n.left.id])} {n.op} {formatValue(values[n.right.id])} = {v}.</>;
    rec.snap(say, 0.7, { values: { ...values }, evaluating: n.id });
  }
  const total = evaluate(result.ast);
  rec.set({ evaluating: null, result: total });
  rec.close(
    Number.isFinite(total)
      ? <>The root's value is the answer: <b>{formatValue(total)}</b>.</>
      : <>The walk finished, but the result is <span className="hl bad">{formatValue(total)}</span>: a division by zero or a number too big for a double.</>,
    2,
  );
  return rec.frames;
}
