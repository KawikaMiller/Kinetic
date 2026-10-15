import type { ReactNode } from 'react';
import { dOnItself, dRow, firstDifference, GRID_SIZE, rowsEqualToD, type Cell, type Claims, type Stage } from './diagonal';
import type { AnalyserRow } from './analyser';
import { LIBRARY } from './machines';
import { answerPhrase, cutoffPhrase, truthPhrase } from './phrases';
import { KIND_LABEL, type DRun, type Predictor, type Scoreboard } from './predictors';
import { BIN_LABEL, isRight, type Placement } from './rice';

const word = (c: Cell) => (c === 'H' ? 'halts' : 'loops');

/** Scene 1, from the claims on screen. */
export function diagonalCaption(stage: Stage, claims: Claims, selected: number): ReactNode {
  const d = dRow(claims, GRID_SIZE);
  if (stage === 'table') {
    return (
      <>
        Each row is a program, each column an input, and a cell is what the decider <b>claims</b>: H halts, L loops. The ringed diagonal is each program run on its own number. Click cells to fill the table any way you like.
      </>
    );
  }
  if (stage === 'built') {
    const at = firstDifference(claims[selected].slice(0, GRID_SIZE), d) ?? -1;
    const equal = rowsEqualToD(claims, GRID_SIZE).length;
    return (
      <>
        D does the opposite of each diagonal claim: <span className="hl violet">{d.join(' ')}</span>. Row P{selected} and D first differ at input {at}, where the table claims {claims[selected][at]} and D {word(d[at])}. Rows equal to D: <b>{equal} of {GRID_SIZE}</b>, whatever you entered.
      </>
    );
  }
  const claim = claims[GRID_SIZE][GRID_SIZE];
  const { dDoes } = dOnItself(claim);
  return (
    <>
      D is a program too, so a complete table has a row for D and a column for the input D. The decider claims <b>{claim}</b> for D run on D, so D does the opposite and <span className="hl bad wrap">{word(dDoes)}</span>. The claim is wrong, and so is the other choice.
    </>
  );
}

/** Scene 2, from the scoreboard of the predictor on screen. */
export function predictorCaption(p: Predictor, sb: Scoreboard, d: DRun): ReactNode {
  const wrong = [...sb.rows, sb.d].find((r) => r.outcome === 'wrong');
  const label = p.kind === 'budget' ? `Run ${p.budget} steps` : KIND_LABEL[p.kind];
  return (
    <>
      {label}{p.allowUnknown ? ', UNKNOWN allowed' : ''}: <b>{sb.right} of {sb.total}</b> right, {sb.wrong} wrong, {sb.unanswered} unanswered.
      {wrong && wrong.id !== 'd' && <> It calls {wrong.name} {wrong.answer.verdict === 'HALTS' ? 'a halter' : 'a loop'} ({answerPhrase(wrong.answer)}), but it {truthPhrase(wrong.truth)}.</>}
      {' '}
      {dCaption(d)}
    </>
  );
}

/** What running D on D showed, said from the run. */
export function dCaption(d: DRun): ReactNode {
  const executed = d.truth.kind === 'halts' ? `halts after ${d.truth.steps} step${d.truth.steps === 1 ? '' : 's'}` : 'repeats a configuration, so it loops';
  if (d.verdict === 'UNKNOWN') {
    return <>D built from this predictor is told UNKNOWN, halts at once, and nothing is contradicted: UNKNOWN is no claim, and the price is the unanswered rows.</>;
  }
  return (
    <>
      D built from this predictor, run on itself: the predictor says <b>{d.verdict}</b>, D (really run) {executed}. <span className="hl bad wrap">They disagree.</span>
    </>
  );
}

/** Scene 3, from the sort so far. */
export function riceCaption(placements: readonly Placement[]): ReactNode {
  const sorted = placements.filter((p) => p.chosen !== null);
  const right = sorted.filter(isRight).length;
  if (sorted.length === 0) {
    return <>Sort each property into the class it belongs to. A wrong sort tells you why the property falls in a different class.</>;
  }
  return (
    <>
      Sorted {sorted.length} of {placements.length}: {right} in the right class{sorted.length - right > 0 ? `, ${sorted.length - right} to rethink` : ''}.
    </>
  );
}

export function limitsCaption(rows: readonly AnalyserRow[], limit: number): ReactNode {
  const count = (v: AnalyserRow['verdict']) => rows.filter((r) => r.verdict === v).length;
  const maybe = rows.find((r) => r.verdict === 'maybe');
  return (
    <>
      With a limit of {limit.toLocaleString('en-US')} steps the analyser says yes to {count('yes')}, no to {count('no')} and maybe to {count('maybe')} of the {LIBRARY.length} machines. In this lesson it is never wrong about the yes and no answers, because each rests on a run or a repeated configuration.
      {maybe && <> {maybe.name}: it {cutoffPhrase(limit)}, which is not an answer.</>}
    </>
  );
}

/** Used by the Rice scene's per-card feedback. */
export const binExplanation = (placement: Placement): string =>
  isRight(placement) ? 'Right.' : `Not quite: this one is in “${BIN_LABEL[placement.card.bin]}”.`;
