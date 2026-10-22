import { bruteForce, clauseText, variableName, type Cnf, type DpllState, type DpllStats, type SatEvent } from '../../core/sat';
import { modelText, type SolverMode, type WindowSummary } from './model';

/** Every sentence the stage prints from the model: pure, so the tests pin them and the try-this entries quote them. */

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const statsLine = (s: DpllStats): string =>
  `${counted(s.branches, 'branch', 'branches')}, ${counted(s.propagations, 'propagation', 'propagations')}, ${counted(s.conflicts, 'conflict', 'conflicts')}`;

const val = (b: boolean) => (b ? 'T' : 'F');

export function describeEvent(cnf: Cnf, e: SatEvent): string {
  switch (e.kind) {
    case 'decide': return `${e.flipped ? 'flip' : 'decide'} ${variableName(cnf, e.var)} = ${val(e.value)}`;
    case 'propagate': return `clause ${e.clause + 1} ${clauseText(cnf, cnf.clauses[e.clause])} forces ${variableName(cnf, e.var)} = ${val(e.value)}`;
    case 'conflict': return `clause ${e.clause + 1} ${clauseText(cnf, cnf.clauses[e.clause])} is falsified`;
    case 'backtrack': return `backtrack to ${variableName(cnf, e.var)}`;
    case 'sat': return `satisfied: ${modelText(cnf, e.model)}`;
    case 'unsat': return 'unsatisfiable';
  }
}

/** The one sentence under the stage for a search state: what just happened, the counts, and what to do next. */
export function searchCaption(state: DpllState, mode: SolverMode): string {
  const { cnf } = state;
  const counts = statsLine(state.stats);
  if (state.outcome === 'sat') return `SAT: ${modelText(cnf, state.model!)}. ${counts}.`;
  if (state.outcome === 'unsat') {
    const truth = bruteForce(cnf);
    if (truth.satisfiable) {
      return `The ${mode} solver reports UNSAT, but brute force finds ${truth.count} model${truth.count === 1 ? '' : 's'}, for example ${modelText(cnf, truth.model!)}. It broke the rule "reports UNSAT but a model exists". ${counts}.`;
    }
    return `UNSAT: every branch failed, and brute force agrees that no assignment satisfies the formula. ${counts}.`;
  }
  if (state.conflict !== null) {
    const next = mode === 'broken' ? 'The broken solver will give up here.' : 'Press Backtrack to undo the latest decision and try its other value.';
    return `Clause ${state.conflict + 1} ${clauseText(cnf, cnf.clauses[state.conflict])} is falsified. ${next} ${counts}.`;
  }
  const last = state.trace[state.trace.length - 1];
  if (!last) return 'Nothing is decided yet. Decide a variable, or press Step to see whether anything is forced.';
  return `${describeEvent(cnf, last)}. ${counts}.`;
}

export function windowCaption(s: WindowSummary, mode: SolverMode, firstSeed: number): string {
  const share = `Both heuristics gave the right verdict on ${s.verdictsAgree} of ${s.size} formulas (${s.satisfiable} satisfiable).`;
  const means = `Mean branches: ${s.meanFirst.toFixed(2)} first unassigned, ${s.meanMost.toFixed(2)} most occurring.`;
  if (mode === 'correct') return `${share} ${means}`;
  const where = s.lowestBrokenSeed === null ? 'on none of these seeds' : `first at seed ${s.lowestBrokenSeed}`;
  return `The solver that never flips a decision calls a satisfiable formula UNSAT on ${s.brokenWrong} of ${s.size} formulas (${where}, window starting at seed ${firstSeed}).`;
}
