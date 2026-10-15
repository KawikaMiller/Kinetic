/**
 * A coverage tracer for the lesson's expression trees. It walks a tree the way the evaluator runs
 * it (a ternary runs its test and then only the branch taken; `&&`, `||` and `??` run the right
 * side only when they must) and records every node that ran. Line coverage and branch coverage
 * are read off that set.
 */
import { runTree, type ExprNode, type Scope } from '../../core/expr';
import { printProgram } from './print';
import { BASE_ROOT, RESULT_ROOT, childrenOf, nodesOf, type Input, type Program } from './program';

const SHORT_CIRCUIT = new Set(['&&', '||', '??']);

function walk(n: ExprNode, path: string, scope: Scope, hit: Set<string>): void {
  hit.add(path);
  switch (n.k) {
    case 'ternary': {
      walk(n.test, `${path}.0`, scope, hit);
      const taken = runTree(n.test, scope) ? 1 : 2;
      walk(taken === 1 ? n.then : n.else, `${path}.${taken}`, scope, hit);
      return;
    }
    case 'binary': {
      walk(n.l, `${path}.0`, scope, hit);
      if (SHORT_CIRCUIT.has(n.op)) {
        const left = runTree(n.l, scope);
        const runsRight = n.op === '&&' ? !!left : n.op === '||' ? !left : left === null || left === undefined;
        if (!runsRight) return;
      }
      walk(n.r, `${path}.1`, scope, hit);
      return;
    }
    default:
      childrenOf(n).forEach((c, i) => walk(c, `${path}.${i}`, scope, hit));
  }
}

/** Every node of the program that runs on this input. */
export function trace(p: Program, input: Input): Set<string> {
  const hit = new Set<string>();
  const args = { weight: input.weight, express: input.express };
  walk(p.base, BASE_ROOT, [args], hit);
  walk(p.result, RESULT_ROOT, [{ ...args, base: runTree(p.base, [args]) }], hit);
  return hit;
}

export interface Coverage {
  /** Per printed line: whether it counts, and whether any input ran it. Header and closing brace do not count. */
  lines: { counts: boolean; covered: boolean }[];
  linesCovered: number;
  lineCount: number;
  branchesCovered: number;
  branchCount: number;
}

/** What a set of inputs covers in a program. */
export function coverageOf(p: Program, inputs: readonly Input[]): Coverage {
  const hit = new Set<string>();
  for (const input of inputs) for (const path of trace(p, input)) hit.add(path);
  const lines = printProgram(p).map((line) => ({ counts: line.anchor !== null, covered: line.anchor !== null && hit.has(line.anchor) }));
  const branches = nodesOf(p).filter((x) => x.node.k === 'ternary').flatMap((x) => [`${x.path}.1`, `${x.path}.2`]);
  return {
    lines,
    linesCovered: lines.filter((l) => l.covered).length,
    lineCount: lines.filter((l) => l.counts).length,
    branchesCovered: branches.filter((b) => hit.has(b)).length,
    branchCount: branches.length,
  };
}
