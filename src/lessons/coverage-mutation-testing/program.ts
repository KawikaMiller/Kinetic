/**
 * The function under test is data: two expression trees in the safe subset of core/expr (numbers,
 * booleans, names, comparison, + - *, !, ternary), parsed and run by its hand-written evaluator.
 * There is no eval and no new Function anywhere in the lesson.
 */
import { parseExpr, runTree, type ExprNode, type Value } from '../../core/expr';

const TERNARY = { ternary: true } as const;

/** `cost` is `const base = <base>; return <result>;` over `weight` and `express`. */
export interface Program {
  base: ExprNode;
  result: ExprNode;
}

export interface Input {
  weight: number;
  express: boolean;
}

/** The toy function is checked on this weight range only. */
export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 40;

/** Every input the lesson checks: weight 0 to 40, both values of `express`. Equivalence is decided over all of them. */
export const DOMAIN: readonly Input[] = Array.from({ length: WEIGHT_MAX - WEIGHT_MIN + 1 }, (_, w) => w + WEIGHT_MIN).flatMap((weight) => [
  { weight, express: false },
  { weight, express: true },
]);

export interface ProgramSource {
  base: string;
  result: string;
}

/** The function as it should be. */
export const COST_SOURCE: ProgramSource = { base: 'express ? 12 : 5', result: 'weight > 10 ? base + (weight - 10) * 2 : base' };
/** The same function with a seeded off-by-one: the extra weight is counted from 9, not 10. */
export const BUGGY_SOURCE: ProgramSource = { base: COST_SOURCE.base, result: 'weight > 10 ? base + (weight - 9) * 2 : base' };

export const parseProgram = (src: ProgramSource): Program => ({ base: parseExpr(src.base, TERNARY), result: parseExpr(src.result, TERNARY) });

export const COST = parseProgram(COST_SOURCE);
export const BUGGY = parseProgram(BUGGY_SOURCE);

/** Run the program on one input with the lesson's evaluator. */
export function runProgram(p: Program, input: Input): Value {
  const args = { weight: input.weight, express: input.express };
  const base = runTree(p.base, [args]);
  return runTree(p.result, [{ ...args, base }]);
}

/** What `cost` should return, written as real JavaScript: the lesson's definition of right. */
export function intendedCost(weight: number, express: boolean): number {
  const base = express ? 12 : 5;
  return weight > 10 ? base + (weight - 10) * 2 : base;
}

// ── Paths: every node of a program is addressed by a string ──────────────

/** The two roots of a program. A child's path is its parent's plus `.` and its index (binary: l 0, r 1; unary: arg 0; ternary: test 0, then 1, else 2). */
export const BASE_ROOT = 'b';
export const RESULT_ROOT = 'r';

export function childrenOf(n: ExprNode): ExprNode[] {
  switch (n.k) {
    case 'binary':
      return [n.l, n.r];
    case 'unary':
      return [n.arg];
    case 'ternary':
      return [n.test, n.then, n.else];
    case 'member':
      return typeof n.prop === 'string' ? [n.obj] : [n.obj, n.prop];
    default:
      return [];
  }
}

/** Every node with its path, parents before children. */
export function nodesOf(p: Program): { path: string; node: ExprNode }[] {
  const out: { path: string; node: ExprNode }[] = [];
  const walk = (node: ExprNode, path: string) => {
    out.push({ path, node });
    childrenOf(node).forEach((c, i) => walk(c, `${path}.${i}`));
  };
  walk(p.base, BASE_ROOT);
  walk(p.result, RESULT_ROOT);
  return out;
}

/** A copy of the program with the node at `path` replaced. The original is untouched. */
export function replaceAt(p: Program, path: string, replacement: ExprNode): Program {
  const [root, ...indices] = path.split('.');
  const swap = (node: ExprNode, rest: string[]): ExprNode => {
    if (rest.length === 0) return replacement;
    const [head, ...tail] = rest;
    const i = Number(head);
    switch (node.k) {
      case 'binary':
        return i === 0 ? { ...node, l: swap(node.l, tail) } : { ...node, r: swap(node.r, tail) };
      case 'unary':
        return { ...node, arg: swap(node.arg, tail) };
      case 'ternary':
        return i === 0 ? { ...node, test: swap(node.test, tail) } : i === 1 ? { ...node, then: swap(node.then, tail) } : { ...node, else: swap(node.else, tail) };
      default:
        throw new Error(`No child ${i} at ${path}`);
    }
  };
  return root === BASE_ROOT ? { ...p, base: swap(p.base, indices) } : { ...p, result: swap(p.result, indices) };
}
