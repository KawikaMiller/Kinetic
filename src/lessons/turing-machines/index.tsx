import type { LessonModule } from '../../core/types';
import { tapeText } from '../../core/tm';
import { Stage } from './Stage';
import {
  DOUBLING_FROM, doublingRatio, INCREMENT_STARTER, mustParse, PLOT_LENGTHS, REFERENCE_MACHINES, runCase, STEP_BUDGET, stepsBySize,
  TASKS,
} from './model';

const starter = runCase('increment', mustParse(INCREMENT_STARTER), TASKS.increment.defaultInput);
const reference = runCase('increment', REFERENCE_MACHINES.increment, TASKS.increment.defaultInput);
const palindrome = runCase('palindrome', REFERENCE_MACHINES.palindrome, TASKS.palindrome.defaultInput);
const incrementPoints = stepsBySize('increment', REFERENCE_MACHINES.increment);
const palindromePoints = stepsBySize('palindrome', REFERENCE_MACHINES.palindrome);
const atEnd = (points: typeof incrementPoints) => points[points.length - 1].steps;
const ratio = (points: typeof incrementPoints) => (doublingRatio(points, DOUBLING_FROM) ?? 0).toFixed(2);
const budgetText = STEP_BUDGET.toLocaleString('en-US');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A Turing machine is a tape and a table of rules; with nothing else it can run any procedure a computer can, and here you write the table yourself.',
    what: 'You write a transition table for a one-tape machine: first binary increment, then a palindrome check. Play steps the head along the tape one rule at a time, and Check runs your table on a fixed list of inputs and compares each result with an oracle. A third scene runs both machines on inputs of growing length and plots the steps they take. The tape has no end, but a run is cut off after a step budget, and that cut-off is not a verdict.',
    analogy: 'Like a clerk with an endless ribbon of paper and a small rulebook: "if you are in this mood and see this symbol, write that one, step one square, and switch mood."',
    useCases: [
      'Reasoning about what any program could compute, before arguing about how fast',
      'Telling a machine that is stuck, one that is wrong and one that is simply slow apart',
      'Understanding why a finite table plus unbounded memory is enough for general computation',
      'Preparing for the next question: what a machine can and cannot decide about other machines',
    ],
    why: 'Claims about what software can and cannot do rest on a model of computation, and this is the simplest complete one. Its three ways of failing, stuck, wrong and out of budget, are the same three you debug in real programs.',
    watch: 'On the tape the head’s cell is lifted in yellow and a cell the last step changed is green; blank cells are faded grey. In the table the rule just applied is highlighted yellow, and the state name is purple. The Result reads green for a correct halt (accept is green too), red for reject or a wrong tape, orange for stuck (no rule matched, a different failure from a wrong answer), and grey for a run cut off at the budget. On the plot the increment machine is a blue line and the palindrome machine an amber one.',
  },
  tryThis: [
    `Press play on the starter table with the tape 1011: it ends stuck in q1 reading 1 after ${starter.run.steps} steps, shown in orange. No rule matches, which is a different failure from a wrong answer.`,
    `Press Check on the starter: the first failing input is the empty tape, stuck in q1 after 1 step. Then press Reveal the author’s table and play 1011: it halts with ${tapeText(reference.run.config)} after ${reference.run.steps} steps.`,
    'Press Break it: no carry rule, then Check: the input 1 ends stuck in q1 reading 1. Press Break it: wrong write, then Check: the input 0 halts with the tape 0 instead of 1.',
    `On Program a palindrome check, press Check once, then Reveal the author’s table and play the tape aba: it halts in accept after ${palindrome.run.steps} steps.`,
    `On Steps against size, the author’s tables take ${atEnd(incrementPoints)} steps for the increment and ${atEnd(palindromePoints)} for the palindrome check at length ${PLOT_LENGTHS.to}: doubling from ${DOUBLING_FROM} to ${DOUBLING_FROM * 2} multiplies the steps by ${ratio(incrementPoints)} for one and ${ratio(palindromePoints)} for the other.`,
  ],
  keyIdeas: [
    'A run ends in one of three ways: halted, stuck, or still going when the budget ran out. A cut-off run has not shown that the machine loops; it had just not halted yet.',
    'A transition table is a program: a few rules, applied one cell at a time, increment a number or check a palindrome.',
    'In this model the tape has no end, so there is no overflow; a real computer has finite memory, which is why this is a model for reasoning and not a design to build.',
    'The Church-Turing thesis is a claim, not a theorem: it says this model captures what a procedure can compute, and it cannot be proved because that notion is informal.',
  ],
  quiz: [
    {
      q: `A table has run for ${budgetText} steps and the machine has not stopped. What can you conclude?`,
      options: [
        'The machine is looping, so no budget would ever see it stop, whatever input it is given',
        'The machine is stuck, because no rule matched the symbol that was under the head at the end of the run',
        'Nothing about later steps: it did not halt within the budget, and may halt later',
        'The table has a mistake on the line whose number equals the step count',
      ],
      answer: 2,
      why: `The budget is ${budgetText} steps in this lesson, and a run that reaches it says "did not halt within ${budgetText} steps". A loop would need a proof, such as a repeated configuration.`,
    },
    {
      q: 'Your increment table ends "stuck in q1 reading 1". What does that mean?',
      options: [
        'The machine halted in q1 with the wrong number on the tape after finishing its rules',
        'The head is in q1 on a 1 and no rule covers that pair, so the machine stops without an answer',
        'The input was too long, so the tape ran out of cells before the carry finished',
        'The machine is in a loop and the step budget will end the run soon',
      ],
      answer: 1,
      why: 'Stuck means no rule matches the current state and symbol. It is not a wrong tape (that is a halt with the wrong content) and the tape cannot run out in this model.',
    },
    {
      q: 'In the reference increment table, what does the rule q1 1 -> 0 L q1 do?',
      options: [
        'It writes the final answer onto the tape and then halts the machine at once, as the last rule',
        'It walks right over the number to find the last digit of the input',
        'It erases the digit it reads and leaves a blank gap inside the number',
        'It carries: the 1 becomes 0 and the head moves left to the next digit',
      ],
      answer: 3,
      why: `Deleting that rule is the first named mutant: the input 1 then ends stuck in q1. With it, 1011 becomes 1100 in ${reference.run.steps} steps.`,
    },
    {
      q: 'Why does the palindrome machine need far more steps than the increment machine as the input grows?',
      options: [
        'The head walks back and forth across the whole tape for every pair of letters',
        'The palindrome table has more rules, and each rule takes longer to apply',
        'Palindromes are a harder problem than counting, for any machine or computer',
        'The tape gets longer as the machine writes, so each step moves further',
      ],
      answer: 0,
      why: `The increment machine makes one pass right and one back (${atEnd(incrementPoints)} steps at length ${PLOT_LENGTHS.to}); the palindrome machine makes a round trip per letter pair (${atEnd(palindromePoints)}). That is a fact about one tape, not about computers.`,
    },
    {
      q: 'Which statement about Turing machines is right?',
      options: [
        'They are the circuit layout used inside a modern processor',
        'Adding a stay move gives them extra power that a machine without it lacks',
        'They are a model for reasoning about computation, not a blueprint for computers',
        'The Church-Turing thesis is a theorem with a short and well-known proof from first principles',
      ],
      answer: 2,
      why: 'The model trades realism (random access, finite memory) for something simple to reason about. A stay move can be imitated with a move right and a move left, and the thesis is a claim about an informal notion.',
    },
  ],
};
export default lesson;
