/** Every number the lesson text quotes, computed from the model once (the try-this entries, key ideas and quiz explanations read these). */
import { matchAt, runNfa, countParts, parsePattern, type ParsedRegex, constructionOf, epsilonCount } from '../../core/regex';
import { STEP_BUDGET, growthTable, workSeries, whichAnswer } from './engines';
import { OPENING, NESTED_REPEAT } from './opening';
import { realResultFor } from './realExamples';

const parse = (p: string): ParsedRegex => {
  const r = parsePattern(p);
  if (!r.ok) throw new Error(`${p}: ${r.error}`);
  return r.value;
};

const build = parse(OPENING.build.pattern);
const buildMachine = constructionOf(build);
const buildParts = countParts(build.root);

const run = parse(OPENING.run.pattern);
const runMachine = constructionOf(run);
const runSubject = [...OPENING.run.subject];
const runResult = runNfa(runMachine, runSubject, 'full');

const growth = growthTable();
const growthRow = growth[3];

const which = parse(OPENING.which.pattern);
const whichSubject = [...OPENING.which.subject];
const whichMachine = constructionOf(which);
const whichResult = whichAnswer(whichMachine, which, whichSubject);

const nested = parse(NESTED_REPEAT.pattern);
const nestedMachine = constructionOf(nested);
const nestedSubject = [...NESTED_REPEAT.subject];
const nestedSeries = workSeries(nested, nestedMachine, [...'a'.repeat(24)]);
const nestedAt = (n: number) => nestedSeries[n];
const budgetLength = nestedSeries.find((p) => p.exhausted)!.n;
const defaultBt = matchAt(nested.root, nestedSubject, 0, { budget: STEP_BUDGET, mustEnd: true });

export const FACTS = {
  buildPattern: OPENING.build.pattern,
  buildStates: buildMachine.nfa.states.length,
  buildEpsilons: epsilonCount(buildMachine.nfa),
  buildBound: 2 * (buildParts.atoms + buildParts.operators),
  buildAtoms: buildParts.atoms,
  buildOperators: buildParts.operators,
  runSubject: OPENING.run.subject,
  runWork: runResult.work,
  runBound: runSubject.length * runMachine.nfa.states.length,
  runLength: runSubject.length,
  runStates: runMachine.nfa.states.length,
  growthPattern: growthRow.pattern,
  growthNfa: growthRow.nfaStates,
  growthDfa: growthRow.dfaStates,
  growthDfas: growth.map((g) => g.dfaStates),
  whichFirst: whichSubject.slice(whichResult.first!.start, whichResult.first!.end).join(''),
  whichLongest: whichSubject.slice(whichResult.longest!.start, whichResult.longest!.end).join(''),
  whichReal: realResultFor(OPENING.which.pattern, OPENING.which.subject)?.text ?? '',
  nestedPattern: NESTED_REPEAT.pattern,
  nestedLength: nestedSubject.length,
  nestedSteps: defaultBt.steps,
  nestedNfaWork: nestedAt(nestedSubject.length).nfa as number,
  nestedBudgetLength: budgetLength,
  nestedStates: nestedMachine.nfa.states.length,
  budget: STEP_BUDGET,
};

export const num = (v: number) => v.toLocaleString('en-US');
