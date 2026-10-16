/** Every number the lesson text quotes, computed from the model. */
import { boundedCounter, duel, firstDisagreement } from './duel';
import { CHECK_LENGTH, checkTable, parseTable } from './learner';
import { build, presetById } from './machines';
import { ANBN_TABLE, BUG_TABLE, OPENING, SOLUTION_TABLE } from './opening';
import { describeRejection, stepRun } from './stepper';

const table = (text: string) => {
  const r = parseTable(text);
  if (!r.ok) throw new Error(r.error);
  return r.pda;
};

const anbn = build(presetById('anbn'), 'final-state');
const anbnEmpty = build(presetById('anbn'), 'empty-stack');
const opening = stepRun(anbn.pda, OPENING.stepper.subject, anbn.accept);
const openingEmpty = stepRun(anbnEmpty.pda, OPENING.stepper.subject, anbnEmpty.accept);
const leftover = stepRun(anbn.pda, 'aab', anbn.accept);
const wwr = build(presetById('wwr'), 'final-state');
const wwrRun = stepRun(wwr.pda, presetById('wwr').samples[0], wwr.accept);

const asBuilt = checkTable(table(ANBN_TABLE));
const bug = checkTable(table(BUG_TABLE));
const solution = checkTable(table(SOLUTION_TABLE));

export const FACTS = {
  subject: OPENING.stepper.subject,
  moves: opening.frames.length - 1,
  emptyStackMoves: openingEmpty.frames.length - 1,
  peakStack: Math.max(...opening.frames.map((f) => f.configs[0].stack.length)),
  leftoverText: describeRejection('aab', leftover.frames.map((f) => f.configs), anbn.accept).text,
  wwrSample: presetById('wwr').samples[0],
  wwrPeak: Math.max(...wwrRun.frames.map((f) => f.configs.length)),
  k: OPENING.duel.k,
  n: OPENING.duel.n,
  dfaStates: boundedCounter(OPENING.duel.k).states.length,
  dfaAtN: duel(OPENING.duel.k, OPENING.duel.n).dfaAccepts,
  pdaAtN: duel(OPENING.duel.k, OPENING.duel.n).pdaAccepts,
  firstDisagreement: firstDisagreement(OPENING.duel.k)!,
  checkLength: CHECK_LENGTH,
  asBuiltInput: asBuilt.first!.input,
  asBuiltReason: asBuilt.first!.reason,
  bugInput: bug.first!.input,
  bugReason: bug.first!.reason,
  solutionChecked: solution.checked,
  solutionPasses: solution.first === null,
};
