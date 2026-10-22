import { SAMPLE_COUNT, SAMPLE_SEED, formulaText, type Gadget, type Sweep, type Verdict } from './model';

/** Every sentence the stage prints from the model: pure, so the tests pin them and the try-this entries quote them. */

export const EXHAUSTIVE_SCOPE = 'exhaustive over all 793 formulas of 2 variables and 1 to 4 clauses';
export const SAMPLED_SCOPE = `sampled: ${SAMPLE_COUNT} seeded formulas of 3 variables and 1 to 4 clauses, seed ${SAMPLE_SEED}`;

export const buildCaption = (g: Gadget, placed: number): string =>
  `${placed} of ${g.edges.length} edges placed. The target is a cover of size K = n + 2m = ${g.n} + 2 x ${g.m} = ${g.K}.`;

export function sweepLine(label: string, s: Sweep, scope: string): string {
  const first = s.first ? ` The first of them is ${formulaText(s.first)}.` : '';
  return `${label}: the verdict is wrong on ${s.failures} of ${s.total} formulas (${scope}; ${s.unsatisfiable} of them unsatisfiable).${first}`;
}

export function verdictCaption(v: Verdict, variableEdges: boolean): string {
  const graph = variableEdges ? 'with its variable edges' : 'without its variable edges';
  const sat = v.satisfiable ? 'an assignment satisfies it' : 'no assignment satisfies it';
  const answer = v.coverSaysSatisfiable ? `a cover of size K = ${v.K} exists (the minimum is ${v.minimum})` : `no cover of size K = ${v.K} exists (the minimum is ${v.minimum})`;
  if (v.agrees) return `The graph ${graph} agrees with brute force: ${sat}, and ${answer}.`;
  return `Wrong verdict ${graph}: ${answer}, but ${sat}. It breaks the rule "${v.rule}".`;
}

export function unsatCaption(g: Gadget, minimum: number, atK: number, assignments: number, cheapest: number): string {
  return `No assignment satisfies this formula, and the graph has ${atK} covers of size K = ${g.K}: the minimum is ${minimum}. Each of the ${assignments} assignments falsifies a clause, and the cheapest costs ${cheapest} = K + ${cheapest - g.K}.`;
}
