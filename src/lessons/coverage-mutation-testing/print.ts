/**
 * A pretty-printer for core/expr trees: it prints a Program as the JavaScript function it
 * stands for, one ternary branch per line so that coverage can colour branches, and marks the
 * tokens a mutation changed. Written here because this lesson is the second user of core/expr
 * and the first to print a tree; a third user should lift it into core/expr.
 */
import type { ExprNode } from '../../core/expr';
import { BASE_ROOT, RESULT_ROOT, type Program } from './program';

/** Binding power as in JavaScript's precedence table; a child binds looser than its parent when it needs parentheses. */
const PRECEDENCE: Record<string, number> = {
  '??': 1, '||': 2, '&&': 3, '===': 6, '!==': 6, '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};
const UNARY = 11;
const ATOM = 12;
const TERNARY = 0;

const precedenceOf = (n: ExprNode): number => (n.k === 'binary' ? PRECEDENCE[n.op] : n.k === 'unary' ? UNARY : n.k === 'ternary' ? TERNARY : ATOM);

export interface Segment {
  text: string;
  /** True when this token is what a mutation changed. */
  mutated: boolean;
}

/** A printed line, with the node whose execution makes it "executed" (none for the header and closing brace). */
export interface PrintedLine {
  segments: Segment[];
  anchor: string | null;
}

/** Marks: a plain path marks every token of that subtree; `path#op` marks only that node's operator token. */
export type Marks = ReadonlySet<string>;

const OPERATOR = '#op';
export const operatorMark = (path: string) => `${path}${OPERATOR}`;

/** Print an expression as segments. `inherited` is true inside a marked subtree. */
function printExpr(n: ExprNode, path: string, marks: Marks, inherited: boolean, out: Segment[]): void {
  const here = inherited || marks.has(path);
  const emit = (text: string, mutated = here) => out.push({ text, mutated });
  const child = (c: ExprNode, i: number, wrap: boolean) => {
    if (wrap) emit('(');
    printExpr(c, `${path}.${i}`, marks, here, out);
    if (wrap) emit(')');
  };
  switch (n.k) {
    case 'lit':
      emit(typeof n.v === 'string' ? JSON.stringify(n.v) : String(n.v));
      return;
    case 'name':
      emit(n.v);
      return;
    case 'unary':
      emit(n.op, here || marks.has(operatorMark(path)));
      child(n.arg, 0, precedenceOf(n.arg) < UNARY);
      return;
    case 'binary': {
      const p = PRECEDENCE[n.op];
      child(n.l, 0, precedenceOf(n.l) < p);
      emit(` ${n.op} `, here || marks.has(operatorMark(path)));
      child(n.r, 1, precedenceOf(n.r) <= p);
      return;
    }
    case 'ternary':
      child(n.test, 0, precedenceOf(n.test) <= TERNARY);
      emit(' ? ');
      child(n.then, 1, false);
      emit(' : ');
      child(n.else, 2, false);
      return;
    case 'member':
      child(n.obj, 0, precedenceOf(n.obj) < ATOM);
      if (typeof n.prop === 'string') emit(`.${n.prop}`);
      else {
        emit('[');
        child(n.prop, 1, false);
        emit(']');
      }
  }
}

const segments = (n: ExprNode, path: string, marks: Marks): Segment[] => {
  const out: Segment[] = [];
  printExpr(n, path, marks, false, out);
  return out;
};

const plain = (text: string): Segment => ({ text, mutated: false });

/** One expression as code, with no marks. */
export const exprText = (n: ExprNode): string => segments(n, '', new Set()).map((s) => s.text).join('');

/** The lines of one statement. A top-level ternary is printed test, `? then`, `: else`, each on its own line. */
function statement(prefix: string, suffix: string, n: ExprNode, root: string, marks: Marks): PrintedLine[] {
  if (n.k !== 'ternary') return [{ segments: [plain(prefix), ...segments(n, root, marks), plain(suffix)], anchor: root }];
  const branch = (lead: string, c: ExprNode, i: number, tail: string): PrintedLine => ({
    segments: [plain(lead), ...segments(c, `${root}.${i}`, marks), plain(tail)],
    anchor: `${root}.${i}`,
  });
  return [
    { segments: [plain(prefix), ...segments(n.test, `${root}.0`, marks)], anchor: `${root}.0` },
    branch('    ? ', n.then, 1, ''),
    branch('    : ', n.else, 2, suffix),
  ];
}

/** The whole function, as lines. */
export function printProgram(p: Program, marks: Marks = new Set()): PrintedLine[] {
  return [
    { segments: [plain('function cost(weight, express) {')], anchor: null },
    ...statement('  const base = ', ';', p.base, BASE_ROOT, marks),
    ...statement('  return ', ';', p.result, RESULT_ROOT, marks),
    { segments: [plain('}')], anchor: null },
  ];
}

/** The plain text of a printed program: valid JavaScript, which a test runs for real. */
export const programText = (lines: readonly PrintedLine[]): string => lines.map((l) => l.segments.map((s) => s.text).join('')).join('\n');

/** The text of one line. */
export const lineText = (line: PrintedLine): string => line.segments.map((s) => s.text).join('');
