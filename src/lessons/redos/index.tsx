import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A backtracking regex engine can take exponentially many steps on a short, ordinary-looking input when parts of the pattern can claim the same text; the fixes are a pattern with no overlap, a linear-time engine, and limits at the boundary.',
    what: `When a match fails, a backtracking engine tries every other way to split the text between the pattern's parts before it gives up. For ${F.counterPattern} on ${F.counterLetters} letters and a final !, that is ${F.counterVisits.toLocaleString('en-US')} visits in this lesson's matcher, and each extra letter multiplies it by ${F.counterRatio}; a linear-time engine needs ${F.counterNfa}. Four textbook patterns grow as linear, polynomial and exponential, read from the measured numbers, and the scenes end on what a defender does and what each fix costs.`,
    analogy: 'It is a delivery driver told to find a house by trying every turn at every junction, then starting over from the first junction each time the last street is a dead end.',
    useCases: [
      'Reviewing a validation pattern that runs on user-supplied text before it ships',
      'Explaining a production slowdown that follows one unusual request, not a traffic spike',
      'Choosing a linear-time regex engine, or a timeout, for patterns that come from users',
      'Reading an engine\'s documentation when it says "no back-references, linear time"',
    ],
    why: 'One pattern that is correct on every test can still hold a CPU for an unbounded stretch on a short input, and the same pattern in a different engine behaves differently. Knowing which shapes grow, and which defences change the growth rather than hide it, lets you review patterns and set limits with evidence.',
    watch: 'In the plots the red line is the backtracking engine, the costly side of the comparison, and the green line the linear-time engine. The orange dashed line is the step budget and an orange dot marks a run the budget cut off. In the shapes plot each pattern has its own line: green linear, amber quadratic, orange Fibonacci-like and red doubling. In the tree the blue dots are the ways the outer + can cut the letters. In the fixes scene green means the service answered, orange that it cut the request off at the budget and violet that the cap refused it; the blue bar is the visits spent.',
  },
  tryThis: [
    `The step counter, on the defaults (${F.counterPattern} on ${F.counterLetters} letters and a !): backtracking makes ${F.counterVisits.toLocaleString('en-US')} visits against ${F.counterNfa} for the linear-time engine, and one more letter multiplies the first by ${F.counterRatio}. Move the slider to ${F.gaveUpAt} letters: the stage says it gave up at the step budget of ${F.budget}, and the linear-time engine still finishes in ${F.gaveUpNfa}.`,
    `Which shapes grow, on the defaults (${F.ownLength - 1} letters and a ! in "your text"): the growth readout calls ^a+$ ${F.kinds.linear}, ^a*a*b$ ${F.kinds.quadratic}, ^(a|aa)+$ ${F.kinds.fibonacci} (about ${F.fibRatio} per letter) and ^(a+)+$ ${F.kinds.exponential} (${F.expRatio} per letter). On your text the last pattern takes ${F.own.exponential.toLocaleString('en-US')} visits and the first ${F.own.linear}.`,
    `Fixes, on the defaults (${F.fixesLetters} letters, backtracking, budget ${F.budget}): the service cuts the request off at the budget. Turn Rewrite on (${F.rewriteShown}): answered after ${F.rewriteVisits} visits. Turn it off again and pick Linear-time NFA: ${F.nfaVisits} visits. Pick Backtracking again and turn the cap on (${F.cap} characters): the input is refused with 0 visits.`,
  ],
  keyIdeas: [
    `Work can grow with the number of ways to split the text, not with its length: ${F.counterPattern} on ${F.counterLetters} letters costs ${F.counterVisits.toLocaleString('en-US')} visits in this model, and each extra letter multiplies it by ${F.counterRatio}.`,
    `Overlap is the cause, not nesting alone: in this model ^(a|aa)+$ is ${F.kinds.fibonacci} (${F.fibRatio} per letter) with no nested +, and ^a*a*b$ is ${F.kinds.quadratic}.`,
    `A rewrite that leaves no overlap changes the growth: ${F.rewriteShown} accepts the same strings as the original in this lesson and answers after ${F.rewriteVisits} visits where the original is cut off at the budget.`,
    `A cap or a budget limits the damage but leaves the pattern as it was, so in this model the cap refuses a ${F.fixesLetters + 1}-character input while a pattern that still overlaps stays exponential for inputs within the cap.`,
  ],
  quiz: [
    {
      q: 'A short pattern with no obvious flaw takes a very long time on a 20-character ordinary string. What best explains it?',
      options: [
        'The string is too long for any regex engine to handle quickly, so every pattern slows down once it gets that long',
        'The pattern is too complicated, and only long, many-part patterns can ever be slow in practice',
        'Two parts of the pattern can claim the same letters, so a failure sends the engine through many splits',
        'Regex engines slow down on letters that repeat, whatever the pattern is that they are running',
      ],
      answer: 2,
      why: `In this model the simple ${F.counterPattern} makes ${F.counterVisits.toLocaleString('en-US')} visits on ${F.counterLetters} letters and gives up at the budget by ${F.gaveUpAt}, while the linear-time engine stays at ${F.gaveUpNfa} there. Length and pattern size are not the cause.`,
    },
    {
      q: 'Which statement about ^(a|aa)+$ is right?',
      options: [
        'It is safe, because it has no + inside another + and so no repeat to nest',
        'Its overlapping alternatives make it grow exponentially, though more slowly than a doubling pattern',
        'It doubles with each letter, exactly like ^(a+)+$, since both use the same repeat',
        'It grows linearly, because each alternative reads only one or two letters at a time',
      ],
      answer: 1,
      why: `Its measured growth over n = ${F.from} to ${F.to} is ${F.kinds.fibonacci} at about ${F.fibRatio} per letter, against ${F.expRatio} for ^(a+)+$. Overlap between alternatives is enough; nesting is not required.`,
    },
    {
      q: 'What kind of input made ^(a+)+$ give up at the step budget in this lesson?',
      options: [
        'A plain run of letters then one character that cannot match, so each split is tried and fails',
        'A binary blob made by a special tool, so the engine meets bytes that it was never meant to read at all',
        'A string far longer than the engine accepts, so it overflows its memory before it can answer',
        'Any input at all, because the pattern is exponential on every text it is given to match',
      ],
      answer: 0,
      why: `${F.gaveUpAt} ordinary letters and a final ! were enough: ${F.budget} visits and no answer. No special tool was involved, and the pattern is quick on text that matches.`,
    },
    {
      q: 'A service keeps ^(a+)+$ but refuses inputs over 16 characters. What does that change?',
      options: [
        'It makes the pattern linear, because shorter inputs have fewer ways to be split in this model',
        'It removes the need for a budget, because refused inputs never reach the matcher at all',
        'It changes the language the pattern accepts, so the rewritten pattern is no longer needed',
        'It bounds the cost of inputs it accepts, but the pattern is still exponential under the cap',
      ],
      answer: 3,
      why: `The cap refuses the ${F.fixesLetters + 1}-character input with 0 visits, but a 15-letter input within the cap still costs ${F.capUnderVisits.toLocaleString('en-US')} visits. The rewrite ${F.rewriteShown} or a linear-time engine changes the growth.`,
    },
  ],
};

export default lesson;
