/**
 * Mutants: copies of the program with one node changed. Each is a real alternative tree that
 * the evaluator runs; whether one is "equivalent" is decided by running it against the original
 * over the whole domain, never by a flag typed in. The class names echo common tools and are
 * written from memory; the operator sets here are small on purpose.
 */
import type { ExprNode } from '../../core/expr';
import { DOMAIN, nodesOf, replaceAt, runProgram, type Input, type Program } from './program';
import { exprText, operatorMark, type Marks } from './print';

export type MutantClass = 'relational' | 'arithmetic' | 'constant' | 'negation' | 'swap';

export const CLASS_LABEL: Record<MutantClass, string> = {
  relational: 'comparison changed',
  arithmetic: 'arithmetic operator changed',
  constant: 'constant off by one',
  negation: 'condition negated',
  swap: 'ternary branches swapped',
};

const RELATIONAL = ['>', '>=', '<', '<='] as const;
const ARITHMETIC: Record<string, readonly string[]> = { '+': ['-', '*'], '-': ['+', '*'], '*': ['/', '+'] };

export interface Mutant {
  id: string;
  cls: MutantClass;
  /** The node that was changed. */
  path: string;
  program: Program;
  /** Which printed tokens the change touched. */
  marks: Marks;
  /** The changed expression before and after, as printed code. */
  before: string;
  after: string;
}

/** A copy of `parent` with its child number `i` replaced (binary and ternary parents, the only ones that hold a literal here). */
function withChild(parent: ExprNode, i: number, child: ExprNode): ExprNode {
  if (parent.k === 'binary') return i === 0 ? { ...parent, l: child } : { ...parent, r: child };
  if (parent.k === 'ternary') return i === 0 ? { ...parent, test: child } : i === 1 ? { ...parent, then: child } : { ...parent, else: child };
  return parent;
}

/** Every mutant of a program, in node order. */
export function generateMutants(original: Program): Mutant[] {
  const out: Mutant[] = [];
  const nodes = nodesOf(original);
  const byPath = new Map(nodes.map((x) => [x.path, x.node]));
  const add = (cls: MutantClass, path: string, program: Program, marks: Marks, before: string, after: string) => {
    out.push({ id: `M${out.length + 1}`, cls, path, program, marks, before, after });
  };

  for (const { path, node } of nodes) {
    if (node.k === 'binary' && (RELATIONAL as readonly string[]).includes(node.op)) {
      for (const op of RELATIONAL.filter((o) => o !== node.op)) {
        const changed: ExprNode = { ...node, op };
        add('relational', path, replaceAt(original, path, changed), new Set([operatorMark(path)]), exprText(node), exprText(changed));
      }
    }
    if (node.k === 'binary' && ARITHMETIC[node.op]) {
      for (const op of ARITHMETIC[node.op]) {
        const changed: ExprNode = { ...node, op };
        add('arithmetic', path, replaceAt(original, path, changed), new Set([operatorMark(path)]), exprText(node), exprText(changed));
      }
    }
    if (node.k === 'lit' && typeof node.v === 'number') {
      const cut = path.lastIndexOf('.');
      const parent = cut > 0 ? byPath.get(path.slice(0, cut)) : undefined;
      const index = Number(path.slice(cut + 1));
      for (const delta of [1, -1]) {
        const changed: ExprNode = { k: 'lit', v: node.v + delta };
        const before = parent ? exprText(parent) : exprText(node);
        const after = parent ? exprText(withChild(parent, index, changed)) : exprText(changed);
        add('constant', path, replaceAt(original, path, changed), new Set([path]), before, after);
      }
    }
    if (node.k === 'ternary') {
      const testPath = `${path}.0`;
      const negated: ExprNode = { k: 'unary', op: '!', arg: node.test };
      add('negation', testPath, replaceAt(original, testPath, negated), new Set([operatorMark(testPath)]), exprText(node.test), exprText(negated));
      const swapped: ExprNode = { ...node, then: node.else, else: node.then };
      add(
        'swap', path, replaceAt(original, path, swapped), new Set([`${path}.1`, `${path}.2`]),
        `? ${exprText(node.then)} : ${exprText(node.else)}`, `? ${exprText(swapped.then)} : ${exprText(swapped.else)}`,
      );
    }
  }
  return out;
}

/** The first input in the domain on which the mutant and the original disagree, or null when they never do. */
export function killingInput(original: Program, mutant: Program, domain: readonly Input[] = DOMAIN): Input | null {
  return domain.find((input) => runProgram(mutant, input) !== runProgram(original, input)) ?? null;
}

/** Equivalent over the domain: no input tells the mutant from the original. */
export const isEquivalent = (original: Program, mutant: Program, domain: readonly Input[] = DOMAIN): boolean => killingInput(original, mutant, domain) === null;
