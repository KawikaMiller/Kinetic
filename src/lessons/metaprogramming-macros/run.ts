/** One macro call, expanded one way and evaluated: what the scene shows and what its captions are built from. */
import { plural } from '../../core/format';
import type { Tone } from '../../core/tone';
import { evaluate, expand, findProblems, marksOf, printTree, sourceText, type Evaluated, type Expanded, type PrintToken, type Problems, type Strategy } from './expand';
import type { MacroDef, MacroToken, Node } from './macroLang';

/** The caller's variables: `a` is the slider, `tmp` is always this. */
export const CALLER_TMP = 2;
export const A_MIN = 1;
export const A_MAX = 9;
export const varsFor = (a: number): Record<string, number> => ({ a, tmp: CALLER_TMP });

export interface RunResult {
  strategy: Strategy;
  expanded: Expanded;
  /** The expansion as source tokens with the node each belongs to (null when the expansion failed). */
  printed: PrintToken[] | null;
  source: string | null;
  evaluated: Evaluated | null;
  problems: Problems | null;
  marks: Map<number, Tone> | null;
}

export function runMacro(strategy: Strategy, def: MacroDef, callTokens: readonly MacroToken[], callTree: Node, a: number): RunResult {
  const expanded = expand(strategy, def, callTokens, callTree);
  if (!expanded.ok) return { strategy, expanded, printed: null, source: null, evaluated: null, problems: null, marks: null };
  const problems = findProblems(expanded.tree);
  const printed = printTree(expanded.tree);
  return {
    strategy,
    expanded,
    printed,
    source: sourceText(printed),
    evaluated: evaluate(expanded.tree, varsFor(a)),
    problems,
    marks: marksOf(expanded.tree, problems),
  };
}

/** Why a result may differ from what the caller meant, one sentence per kind of damage found in the tree. */
export function reasons(r: RunResult): string[] {
  if (!r.problems) return [];
  const out: string[] = [];
  if (r.problems.regrouped.length) out.push(`${plural(r.problems.regrouped.length, 'operator')} of the argument ${r.problems.regrouped.length === 1 ? 'was' : 'were'} regrouped by the template's own operators: the argument did not stay one expression (the value may still come out the same).`);
  if (r.problems.captured.length) out.push(`${plural(r.problems.captured.length, 'use')} of the caller's name ${r.problems.captured.length === 1 ? 'was' : 'were'} captured by a binder of the template with the same name.`);
  return out;
}

/** The value as the scene prints it. */
export const valueText = (e: Evaluated | null) => (e === null ? 'no value' : e.ok ? String(e.value) : e.error);
