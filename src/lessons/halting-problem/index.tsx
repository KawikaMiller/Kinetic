import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';
import { TRUTHS } from './machines';
import { DEFAULT_BUDGET, runD, scoreboard, type Predictor } from './predictors';

const budget = (n: number, allowUnknown = false): Predictor => ({ kind: 'budget', budget: n, allowUnknown });
const start = scoreboard(budget(DEFAULT_BUDGET));
const raised = scoreboard(budget(200));
const unsure = scoreboard(budget(DEFAULT_BUDGET, true));
const haltingCount = [...TRUTHS.values()].filter((t) => t.kind === 'halts').length;
const bb4Steps = (TRUTHS.get('bb4') as { steps: number }).steps;
const dAlwaysLoops = runD({ kind: 'alwaysLoops', budget: DEFAULT_BUDGET, allowUnknown: false });

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'No single program can say, for every program and input, whether the run halts: build the opposite of any claimed answer and it breaks.',
    what: 'You fill in a table of claims about which programs halt on which inputs, then build D, a program that does the opposite on the diagonal and so matches no row. Next you build a predictor from a menu, score it against eight real machines, and watch D, constructed from it and actually run, contradict it. A card sort covers Rice’s theorem, and the last scene shows what the result does not forbid: analysers that answer yes, no or maybe.',
    analogy: 'Like a referee who must call every game, handed a game whose result is "the opposite of whatever the referee calls": any call is wrong.',
    useCases: [
      'Judging a promise of a perfect checker for what arbitrary programs do, such as a perfect bug finder or a perfect equivalence checker',
      'Understanding why linters and static analysers answer "maybe" for some code',
      'Reading "did not halt within N steps" in a timeout or a test runner correctly',
      'Telling which questions about programs only need a bound, and so can be answered, from those that cannot',
    ],
    why: 'Engineers meet this as timeouts, as "maybe" from analysers, and as tools that promise too much. The theorem tells you which promises are impossible and which only need a bound.',
    watch: 'In the table, H cells are green and L cells orange; the diagonal is ringed yellow, D’s row is purple, and a red ring marks the cells where a row differs from D. In the scoreboard a right verdict is green, a wrong one red, and UNKNOWN or "did not halt within N steps" grey: grey means not proved either way. In the card sort, green marks the right class and red a wrong one.',
  },
  tryThis: [
    'On The diagonal table, press 2 Build D: D’s row appears in purple, every row differs from it at its own diagonal cell, and Rows equal to D reads 0 of 6, whatever the claims. Press Randomise and it still does.',
    'Press 3 Ask about D on D, then click the D, D cell: whichever of H or L it holds, D does the other, and the claim for D on D is wrong both ways.',
    `On Defeat your predictor, Run N steps starts at N = ${DEFAULT_BUDGET}: it scores ${start.right} of ${start.total}, because the 4-state busy beaver needs ${bb4Steps} steps and D beats it. Drag N up to 200: ${raised.right} of ${raised.total}, and D still wins.`,
    `Turn on May answer UNKNOWN with N = ${DEFAULT_BUDGET}: nothing is wrong now (${unsure.wrong} wrong), ${unsure.right} are right and ${unsure.unanswered} of ${unsure.total} go unanswered, D included.`,
    'On Rice’s theorem, sorted, put "The program halts within 1,000 steps on input 0" under Undecidable: the page says it is decidable by running, and why it is not semantic.',
  ],
  keyIdeas: [
    'The halting problem says no single program decides halting correctly for all programs and inputs; it does not say a given program’s halting cannot be shown.', // allow-absolute: states the theorem’s own quantifiers
    'Diagonalisation builds D, which differs from row i of any claimed table at input i, so D is in no row; asked about itself, any answer it is given is wrong.',
    'A budget run that stops proves nothing about later steps. A loop is shown by a certificate: a repeated configuration, or a recorded proof.',
    'Rice’s theorem: every non-trivial semantic property of programs is undecidable, while syntactic and bounded properties stay decidable.', // allow-absolute: states the theorem
  ],
  quiz: [
    {
      q: `A program was run for ${DEFAULT_BUDGET} steps and the budget stopped it. What did that run prove?`,
      options: [
        'That the program loops, so it will never halt on that input, however large the budget',
        'That it did not halt within those steps, and nothing about the later ones',
        'That the program halts, just more slowly than the budget allows',
        'That the program has a bug, since a correct one halts quickly',
      ],
      answer: 1,
      why: `The 4-state busy beaver halts at step ${bb4Steps}, so a ${DEFAULT_BUDGET}-step budget calls it a loop and is wrong. "Did not halt within ${DEFAULT_BUDGET} steps" is what the run shows.`,
    },
    {
      q: 'What does the halting-problem result say?',
      options: [
        'No program can ever be shown to halt, however simple it is',
        'Programs that run for a long time have entered a loop and will not stop',
        'No one program decides halting right for every program and input',
        'Computers are too slow to check whether most programs halt',
      ],
      answer: 2,
      why: `The result is about a single program having to be right across the whole space of programs and inputs, while many single programs can be settled. In this lesson ${haltingCount} of the ${TRUTHS.size} library machines halt after a number of steps found by running them, and the other ${TRUTHS.size - haltingCount} are shown to loop by certificates.`,
    },
    {
      q: 'Someone claims a decider answers every halting question. How does D defeat it?',
      options: [
        'D runs for longer than any step budget the decider could possibly be given',
        'D asks the decider about itself and does the opposite of the answer',
        'D feeds the decider an input that is too large for it to read',
        'D hides its own code so that the decider cannot analyse it',
      ],
      answer: 1,
      why: `D is itself a program, so the decider has to answer about D run on D. In this lesson, built from "always LOOPS", D halts at once (${dAlwaysLoops.truth.kind === 'halts' ? dAlwaysLoops.truth.steps : '?'} step); built from "always HALTS", it repeats a configuration. Either way the answer is wrong.`,
    },
    {
      q: 'Which of these can be decided just by reading a program’s text?',
      options: [
        'Whether the program outputs 7 on some input',
        'Whether the program halts on input 0',
        'Whether the program computes the constant-zero function',
        'Whether the program contains the word while',
      ],
      answer: 3,
      why: 'Containing a word is about the text. The other three depend on just the function the program computes and are true of some programs and not others, so Rice’s theorem makes them undecidable.',
    },
    {
      q: 'A predictor may answer UNKNOWN. Why is it still not a halting decider?',
      options: [
        'A decider must answer on every input, and this one leaves some unanswered',
        'The theorem counts every UNKNOWN as a wrong answer about the input',
        'D always contradicts an UNKNOWN answer by doing the opposite of it',
        'It must run for more than N steps before it is allowed to say UNKNOWN about an input',
      ],
      answer: 0,
      why: `With N = ${DEFAULT_BUDGET} and UNKNOWN allowed, ${unsure.unanswered} of ${unsure.total} inputs get no answer. UNKNOWN is no claim, so D has nothing to contradict, and the price is the unanswered inputs.`,
    },
  ],
};

export default lesson;
