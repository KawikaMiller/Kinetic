/** Every number the lesson text quotes, computed from the model. */
import { analyse, conflictCells, leftRecursive, parseGrammar, predictiveTable, removeLeftRecursion } from './grammar';
import { analyseLr } from './lr';
import { OPENING } from './opening';
import { CONFLICTS, choiceId, playGame, usualChoices, type Choices } from './precedence';
import { PRESETS, presetGrammar } from './presets';
import { RECURSION_BUDGET, longestExpansionRun, runBottomUp, runTopDown } from './runs';

const words = (s: string) => s.split(' ').filter(Boolean);

const layered = presetGrammar('layered');
const layeredAnalysis = analyse(layered);
const layeredLl = predictiveTable(layered, layeredAnalysis);
const layeredRun = runTopDown(layered, layeredLl, words(OPENING.topdown.tokens));
const rewritten = removeLeftRecursion(layered);
if (!rewritten.ok) throw new Error(rewritten.error);
const rewrittenParsed = parseGrammar(rewritten.text);
if (!rewrittenParsed.ok) throw new Error(rewrittenParsed.error);
const rewrittenAnalysis = analyse(rewrittenParsed.value);

const layeredLr = analyseLr(layered);
const ambiguousLr = analyseLr(presetGrammar('ambiguous'));

const ll = presetGrammar(OPENING.lockstep.preset);
const llLr = analyseLr(ll);
const lockTokens = words(OPENING.lockstep.tokens);
const lockTd = runTopDown(ll, predictiveTable(ll, analyse(ll)), lockTokens);
const lockBu = runBottomUp(llLr.automaton, llLr.table, lockTokens, (_c, a) => a[0]);
const layeredOnLockstep = runTopDown(layered, layeredLl, lockTokens);
const layeredBu = runBottomUp(layeredLr.automaton, layeredLr.table, lockTokens, (_c, a) => a[0]);

const opening: Choices = { '+*': 'reduce', '*+': 'reduce', '++': 'reduce', '**': 'reduce' };
const afterOne: Choices = { ...opening, '+*': 'shift' };

export const FACTS = {
  layeredConflictCells: conflictCells(layeredLl).length,
  layeredLeftRecursive: leftRecursive(layered, layeredAnalysis),
  budget: RECURSION_BUDGET,
  layeredBudgetStatus: layeredRun.status,
  layeredExpansions: longestExpansionRun(layeredRun.frames),
  rewrittenConflictCells: conflictCells(predictiveTable(rewrittenParsed.value, rewrittenAnalysis)).length,
  rewrittenIsLlPreset: rewritten.text === PRESETS.find((p) => p.id === 'll')!.text,
  layeredStates: layeredLr.automaton.states.length,
  layeredLrConflicts: [...layeredLr.table.actions.values()].filter((c) => c.length > 1).length,
  ambiguousStates: ambiguousLr.automaton.states.length,
  ambiguousLrConflicts: [...ambiguousLr.table.actions.values()].filter((c) => c.length > 1).length,
  lockTokens: OPENING.lockstep.tokens,
  lockTdSteps: lockTd.frames.length - 1,
  lockBuSteps: lockBu.frames.length - 1,
  lockTdStatus: lockTd.status,
  lockBuStatus: lockBu.status,
  layeredLockTd: layeredOnLockstep.status,
  layeredLockBu: layeredBu.status,
  openingValue: playGame(words(OPENING.precedence.tokens), opening).value!,
  oneClickValue: playGame(words(OPENING.precedence.tokens), afterOne).value!,
  usualValue: playGame(words(OPENING.precedence.tokens), usualChoices()).value!,
  oneClickIsUsual: CONFLICTS.every((c) => afterOne[choiceId(c)] === usualChoices()[choiceId(c)]),
  firstE: [...layeredAnalysis.first.get('E')!].sort().join(', '),
};
